# Spec: AI Summary Pipeline (`ai-summary`)

> **ASR hiện thực hóa:** ASR-7 (Async Processing — xử lý nặng không chặn UX)
>
> **ADR tham chiếu:** ADR-14 (AI Summary Pipeline), ADR-10 (BullMQ), ADR-02 (Schema — workshops.summary_status)
>
> **Trade-off chủ đạo:** Async enrichment over Synchronous guarantee. AI summary là feature tùy chọn — workshop vẫn hoạt động đầy đủ khi không có summary. Provider down chỉ ảnh hưởng feature này, không ảnh hưởng registration hoặc check-in.
>
> **Boundary:** Không xử lý PDF scan (image-only PDF, không có text layer). Không verify nội dung AI summary — BTC review trước khi publish. Không lưu PII trong prompt nếu có thể.

---

## 1. Mô tả

Khi BTC upload PDF cho workshop, hệ thống trả về 202 Accepted ngay lập tức, và xử lý async: extract text từ PDF → gọi AI provider để tóm tắt → lưu kết quả. Frontend polling để biết khi nào có kết quả.

Ba stage: (1) Upload và queue, (2) Worker xử lý async, (3) Frontend polling hiển thị.

---

## 2. Luồng chính

### Stage 1 — Upload và Queue

```
Request:
  POST /admin/workshops/:id/summary
  Auth: Bearer <token> (role = 'BTC')
  Body: multipart/form-data, file field = 'pdf'
  Max file size: 10MB (configurable)

Validation upload:
  Content-Type phải là application/pdf
  File size ≤ 10MB (nếu > 10MB → 413)
  Workshop phải tồn tại và status != 'CANCELLED'

Xử lý:
  1. Upload file: PutObject đến Cloudflare R2
     Key: workshops/{workshop_id}/{uuid}-{sanitizedName}.pdf

  2. INSERT workshop_documents (file_url, original_name, file_size_bytes, upload_status='UPLOADED')
     UPSERT ai_summaries (status='QUEUED')

  3. addJob Queue: ai-summary { documentId, workshopId, fileUrl }

  4. Trả ngay:
     202 Accepted {
       "workshopId": "...",
       "documentId": "..."
     }
```

### Stage 2 — Worker (Async)

```
@Processor(AI_SUMMARY_QUEUE) { concurrency: 1 }

FOR EACH job { documentId, workshopId, fileUrl }:

  TRY:
    -- Promise.race wrapper: outer timeout 40s
    
    -- Stage 1: Upsert record
    UPDATE ai_summaries SET status='PENDING' WHERE document_id=:documentId
    
    -- Stage 2: Extract text từ PDF
    buffer = fetchFile(fileUrl)  -- Cloudflare R2 GetObject
    text = extractTextFromPdf(buffer)  -- pdf-parse library

    IF text.length < 100:
      -- PDF là image scan, không có text layer
      THROW Error('PDF_NO_TEXT')

    -- Stage 3: Clean text
    IF text.length > 8_000:
      text = text.substring(0, 8_000)  -- truncate
      LOG WARNING: "PDF truncated: {documentId}"
    
    cleanedText = normalizeWhitespace(text)

    -- Stage 4: Gọi AI provider via Anthropic SDK
    -- SDK timeout: 35s (< outer 40s)
    -- baseURL: https://api.deepseek.com/anthropic
    -- model: deepseek-v4-flash (env AI_SUMMARY_MODEL)
    -- System prompt: tiếng Việt (academic style, 3-5 sentences)
    
    message = anthropic.messages.create({
      model: AI_SUMMARY_MODEL,
      max_tokens: 8192,
      system: "Bạn là công cụ tóm tắt nội dung workshop cho nền tảng quản lý sự kiện đại học...",
      messages: [{ role: "user", content: `Hãy tóm tắt tài liệu workshop sau:\n\n${cleanedText}` }]
    })
    
    summary = extractTextBlock(message.content)

    -- Stage 5: Lưu kết quả
    UPDATE ai_summaries
      SET status='DONE', summary_text=:summary, model_used='deepseek-v4-flash', generated_at=now()
    WHERE document_id=:documentId;

    auto-ack job

  CATCH Error('PDF_NO_TEXT'):
    UPDATE ai_summaries
      SET status='FAILED', error_message='pdf_no_text'
    WHERE document_id=:documentId;
    auto-ack job (không retry — vấn đề data)

  CATCH LLM_TIMEOUT (outer Promise.race 40s timeout):
    UPDATE ai_summaries
      SET status='FAILED', error_message='LLM_TIMEOUT'
    WHERE document_id=:documentId;
    auto-ack job (không retry — terminal failure)

  CATCH timeout/network/provider_error (non-timeout):
    -- BullMQ auto-retry: 3 attempts với exponential backoff
    -- Backoff: 10s, 20s, 40s (configured in queue defaultJobOptions)
    IF retry_count < 3:
      Worker throws error → BullMQ re-queue với backoff
    ELSE:
      UPDATE ai_summaries SET status='FAILED', error_message=err.message WHERE document_id=:documentId
      addJob Queue: notification { event_type: 'ai_summary_failed', ... }
```
```

### Stage 3 — Frontend Polling

```
Endpoint: GET /workshops/:id
Response includes:
  {
    "id": "...",
    "title": "...",
    ...
    "summary": {
      "status": "none" | "queued" | "processing" | "done" | "failed",
      "text": "..." | null,  -- only if status='done'
      "updatedAt": "...",
      "errorDetail": "..." | null  -- only if status='failed'
    }
  }

Frontend polling logic:
  IF summary.status IN ('QUEUED', 'PROCESSING'):
    Poll GET /workshops/:id mỗi 5 giây
    Hiển thị: "⏳ Đang tạo tóm tắt tự động..."

  IF summary.status = 'DONE':
    Dừng polling
    Hiển thị: summary.text

  IF summary.status = 'FAILED':
    Dừng polling
    Hiển thị: "⚠️ Không thể tạo tóm tắt tự động"
    Nếu user là BTC: Hiển thị button "Thử lại"
                      POST /admin/workshops/:id/summary/retry → re-queue vào AI_SUMMARY_QUEUE

  IF summary.status = 'NONE':
    Không hiển thị gì (PDF chưa được upload)

Max polling duration: 10 phút (600s / 5s interval = 120 polls)
Sau 10 phút polling không có kết quả → hiển thị "Xử lý mất nhiều thời gian hơn dự kiến"
```

---

## 3. Kịch bản lỗi

### E-01: PDF là image scan (không có text layer)

```
Điều kiện: pdf-parse trả text.length < 100
Hành vi: summary_status = 'FAILED'. DLQ với reason='pdf_no_text'
         auto-ack ngay (không retry — vấn đề là data, không phải transient)
UI: "⚠️ PDF không chứa văn bản có thể đọc. Vui lòng upload PDF với text layer."
```

### E-02: LLM call exceeds 40 giây timeout

```
Điều kiện: Anthropic SDK call không trả response sau 35s, hoặc outer Promise.race timeout 40s
Hành vi: Update ai_summaries status='FAILED', error_message='LLM_TIMEOUT'
         Auto-ack job (không retry — timeout là terminal failure)
         Lý do: LLM timeout thường không phải transient — service đang overloaded hoặc fail
```

### E-03: AI provider down hoàn toàn (3 retries đều fail)

```
Điều kiện: OpenAI outage, 3 lần timeout
Hành vi: summary_status = 'FAILED'. BTC nhận notification.
         BTC có thể retry thủ công qua admin button khi provider phục hồi.
         Workshop vẫn hoạt động đầy đủ — chỉ không có AI summary.
```

### E-04: PDF quá dài (> 8,000 chars sau extract)

```
Điều kiện: text.length > 8,000
Hành vi: Truncate input, log warning, tiếp tục gọi AI với 8,000 chars đầu
         Summary được tạo từ phần đầu PDF (thường là phần quan trọng nhất)
         Không phải lỗi — là expected truncation
```

### E-05: Worker crash sau job accept, trước auto-ack

```
Điều kiện: Process crash khi đang gọi LLM API (Stage 4)
Hành vi: Job ở lại active pool
         BullMQ stalled detection (default 30s) → worker reclaim job
         Re-process: pipeline chạy lại từ đầu
         Nếu LLM call đã thành công nhưng UPDATE chưa commit → LLM gọi lại
         Acceptable: AI summary là idempotent — cùng text → cùng summary
```

### E-06: Redis crash, pending jobs bị mất (nếu AOF không được config)

```
Điều kiện: Redis crash và restart không có AOF
Hành vi: Queue: ai-summary bị xóa → pending jobs mất
         Workshops có summary_status = 'QUEUED'/'PROCESSING' sẽ kẹt mãi
Recovery: BTC phải trigger lại thủ công qua admin UI cho từng workshop
          Hoặc: cron job đêm check workshops WHERE summary_status IN ('QUEUED','PROCESSING')
                AND updated_at < now() - interval '1 hour' → re-queue
Note: Production cần Redis AOF appendfsync=everysec để tránh case này
```

### E-07: Concurrent uploads — BTC upload document mới khi đang processing

```
Điều điều kiện: BTC upload document mới khi ai_summary.status = 'PROCESSING'
Hành vi: Stage 1 insert workshop_documents mới, upsert ai_summaries status='QUEUED'
         Worker đang processing old document sẽ:
           - Hoàn thành với document cũ → UPDATE ai_summaries status='DONE' của cũ
           - Job mới xử lý document mới → tạo ai_summary mới
         Không có race: ai_summaries có unique constraint trên document_id
Note: Tách bảng giải quyết race — mỗi document có summary record riêng.
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — Non-blocking Upload:**
Stage 1 (POST /pdf) LUÔN trả về trong < 1 giây (sau khi save file).
KHÔNG bao giờ block waiting for AI provider.

**INV-02 — Workshop Functional Without Summary:**
`summary_text = NULL` và `summary_status = 'NONE'/'FAILED'` KHÔNG ảnh hưởng đến registration, check-in, hoặc bất kỳ luồng nghiệp vụ nào.

**INV-03 — Anthropic SDK qua DeepSeek Endpoint:**
LlmSummaryFilter dùng `@anthropic-ai/sdk` với baseURL `https://api.deepseek.com/anthropic`.
Configurable qua env: `AI_SUMMARY_MODEL`, `DEEPSEEK_API_KEY`.

**INV-04 — Max 8192 Output Tokens:**
`max_tokens = 8192` cho LLM call. Input truncate ở 8,000 chars ≈ 2,000 tokens — vừa context window, timeout 40s, output 8192 tokens.

**INV-05 — summary_status Enum:**
Chỉ 5 giá trị hợp lệ: `none`, `queued`, `processing`, `done`, `failed`.
Frontend dựa vào enum này để quyết định polling/display — không được thêm giá trị mới mà không update frontend.

**INV-06 — DLQ Chỉ Lưu, Không Tự Xử Lý:**
Khi job vào `Queue: ai-summary-dlq`, worker KHÔNG tự retry thêm.
Admin phải can thiệp thủ công.

---

## 5. Tiêu chí chấp nhận

**AC-01 — Upload returns 202 immediately:**
POST /admin/workshops/:id/summary với file 5MB.
Then: Response 202 trong < 1 giây. workshops.summary_status = 'QUEUED'.

**AC-02 — Happy path — summary generated:**
Worker nhận message, AI provider trả summary.
Then: workshops.summary_status = 'DONE', summary_text populated.
GET /workshops/:id returns summary_text.

**AC-03 — Frontend polling lifecycle:**
After upload: GET /workshops/:id → summary_status='QUEUED' → poll.
After worker done: GET /workshops/:id → summary_status='DONE' → stop poll, show summary.

**AC-04 — Retry on transient errors:**
AI provider network error (non-timeout) trên attempt 1 và 2.
Then: After attempt 1: job re-queued with 10s delay.
After attempt 2: job re-queued with 20s delay.
After attempt 3 (success): status='DONE'.

**AC-05 — Max retries exceeded → FAILED + notification:**
AI provider network error 3 lần (không timeout).
Then: status='FAILED', error_message set. BTC nhận notification.
Workshop vẫn accessible, không có summary.

**AC-06 — PDF no text → immediate fail:**
Upload PDF image scan (no text layer).
Then: status='FAILED', reason='pdf_no_text'. Không retry (auto-ack ngay).

**AC-07 — Non-blocking for other features:**
Khi worker đang gọi AI (mất 2 phút), các request registration và check-in vẫn trả 200.

**AC-08 — BTC manual retry:**
BTC click "Thử lại" sau khi status='FAILED'.
Then: summary_status = 'QUEUED', re-queue vào stream. Worker xử lý lại.
