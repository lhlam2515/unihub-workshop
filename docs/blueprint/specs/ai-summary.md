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
  1. Lưu file: /uploads/workshops/{workshop_id}.pdf
     (Overwrite nếu đã có — BTC re-upload khi cần update)

  2. UPDATE workshops
       SET pdf_url        = '/uploads/workshops/{workshop_id}.pdf',
           summary_status = 'QUEUED',
           summary_text   = NULL   -- reset summary cũ nếu có
     WHERE id = :workshop_id;

  3. addJob Queue: ai-summary * { workshop_id: :workshop_id }

  4. Trả ngay:
     202 Accepted {
       "message": "PDF đã được upload. Tóm tắt đang được xử lý.",
       "polling_url": "/workshops/:id",
       "expected_wait_seconds": 60
     }
```

### Stage 2 — Worker (Async)

```
Consumer group: ai-workers
Consumer name:  ai-summary-worker-1

@Processor GROUP ai-workers ai-summary-worker-1
  COUNT 1 BLOCK 5000
  STREAMS Queue: ai-summary >

FOR EACH message { workshop_id }:

  -- Fetch workshop info (fresh read)
  SELECT id, pdf_url, summary_status FROM workshops WHERE id = :workshop_id;

  IF summary_status NOT IN ('QUEUED'):
    -- Đã được xử lý bởi run trước hoặc bị cancel
    auto-ack + CONTINUE

  -- Mark processing
  UPDATE workshops
    SET summary_status = 'PROCESSING'
  WHERE id = :workshop_id;

  TRY:
    -- Step A: Extract text từ PDF
    text = parsePDF('/uploads/workshops/{workshop_id}.pdf')
             -- Timeout 30 giây
             -- Dùng: pdf-parse (Node.js) hoặc PyPDF2 (Python)

    IF text.length < 100:
      -- PDF là image scan, không có text layer
      THROW Error('PDF_NO_TEXT')

    IF text.length > 50_000:
      text = text.substring(0, 50_000)  -- truncate, log warning
      LOG WARNING: "PDF truncated: {workshop_id}, original length: {text.length}"

    -- Step B: Gọi AI provider
    summary = aiProvider.summarize(text, maxTokens=300)
                -- Timeout 2 phút
                -- Provider: OpenAI GPT-4o-mini (hoặc swap qua AIProvider interface)
                -- Prompt: "Tóm tắt ngắn gọn nội dung sau trong 3-5 câu, bằng tiếng Việt: {text}"

    -- Step C: Lưu kết quả
    UPDATE workshops
      SET summary_text   = :summary,
          summary_status = 'DONE',
          updated_at     = now()
    WHERE id = :workshop_id;

    auto-ack Queue: ai-summary ai-workers {message_id}

  CATCH Error('PDF_NO_TEXT'):
    UPDATE workshops
      SET summary_status = 'FAILED',
          summary_text   = NULL
    WHERE id = :workshop_id;
    -- Lưu failure reason cho frontend display
    addJob Queue: ai-summary-dlq * {
      workshop_id:   :workshop_id,
      failure_reason: 'pdf_no_text',
      timestamp:      now()
    }
    auto-ack Queue: ai-summary ai-workers {message_id}

  CATCH timeout/network/provider_error:
    retry_count = getRetryCount(message) + 1
    
    IF retry_count < 3:
      -- Re-queue với exponential backoff
      backoff = 30 * (2 ^ (retry_count - 1))   -- 30s, 60s, 120s
      addJob Queue: ai-summary * {
        workshop_id:  :workshop_id,
        retry_count:  retry_count,
        retry_after:  now() + backoff
      }
      UPDATE workshops SET summary_status = 'QUEUED' WHERE id = :workshop_id;
    ELSE:
      -- 3 lần đều fail — DLQ
      UPDATE workshops
        SET summary_status = 'FAILED'
      WHERE id = :workshop_id;
      addJob Queue: ai-summary-dlq * {
        workshop_id:   :workshop_id,
        failure_reason: 'max_retries_exceeded',
        last_error:     err.message,
        timestamp:      now()
      }
      addJob Queue: notification * {
        event_type: 'ai_summary_failed',
        user_id:    <btc_users>,
        payload:    { workshop_id, workshop_title }
      }

    auto-ack Queue: ai-summary ai-workers {message_id}
```

### Stage 3 — Frontend Polling

```
Endpoint: GET /workshops/:id
Response includes:
  {
    "id": "...",
    "title": "...",
    ...
    "summary_status": "none" | "queued" | "processing" | "done" | "failed",
    "summary_text":   "..." | null
  }

Frontend polling logic:
  IF summary_status IN ('QUEUED', 'PROCESSING'):
    Poll GET /workshops/:id mỗi 5 giây
    Hiển thị: "⏳ Đang tạo tóm tắt tự động..."

  IF summary_status = 'DONE':
    Dừng polling
    Hiển thị: summary_text

  IF summary_status = 'FAILED':
    Dừng polling
    Hiển thị: "⚠️ Không thể tạo tóm tắt tự động"
    Nếu user là BTC: Hiển thị button "Thử lại"
                      POST /admin/workshops/:id/summary/retry → re-queue vào stream

  IF summary_status = 'NONE':
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

### E-02: AI provider timeout (> 2 phút)

```
Điều kiện: OpenAI API không trả response sau 120 giây
Hành vi: retry_count += 1
         Nếu < 3: re-queue với backoff 30s/60s/120s, status = 'QUEUED'
         Nếu = 3: status = 'FAILED', DLQ, BTC notification
```

### E-03: AI provider down hoàn toàn (3 retries đều fail)

```
Điều kiện: OpenAI outage, 3 lần timeout
Hành vi: summary_status = 'FAILED'. BTC nhận notification.
         BTC có thể retry thủ công qua admin button khi provider phục hồi.
         Workshop vẫn hoạt động đầy đủ — chỉ không có AI summary.
```

### E-04: PDF quá dài (> 50,000 chars sau extract)

```
Điều kiện: text.length > 50,000
Hành vi: Truncate input, log warning, tiếp tục gọi AI với 50,000 chars đầu
         Summary được tạo từ phần đầu PDF (thường là phần quan trọng nhất)
         Không phải lỗi — là expected truncation
```

### E-05: Worker crash sau @Processor, trước auto-ack

```
Điều kiện: Process crash khi đang gọi AI API (Step B)
Hành vi: Message ở lại pending jobs
         stalled job detection sau 10 phút → worker reclaim message
         Re-process: UPDATE summary_status = 'PROCESSING' lại
         Nếu AI call đã thành công nhưng UPDATE chưa commit → AI gọi lại
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

### E-07: Concurrent uploads — BTC upload PDF mới khi đang processing

```
Điều kiện: BTC upload PDF mới khi summary_status = 'PROCESSING'
Hành vi: Stage 1 overwrite file, set summary_status = 'QUEUED', addJob mới
         Worker đang processing sẽ:
           - Hoàn thành với PDF cũ → UPDATE summary_text với summary cũ
           - Worker mới sẽ process PDF mới → overwrite summary_text với summary mới
         Có thể race condition: last writer wins
Note: Acceptable cho đồ án. Production cần version lock (workshop.pdf_version counter).
```

---

## 4. Ràng buộc (Invariants)

**INV-01 — Non-blocking Upload:**
Stage 1 (POST /pdf) LUÔN trả về trong < 1 giây (sau khi save file).
KHÔNG bao giờ block waiting for AI provider.

**INV-02 — Workshop Functional Without Summary:**
`summary_text = NULL` và `summary_status = 'NONE'/'FAILED'` KHÔNG ảnh hưởng đến registration, check-in, hoặc bất kỳ luồng nghiệp vụ nào.

**INV-03 — AIProvider Interface:**
Code chỉ gọi `aiProvider.summarize(text, maxTokens)`.
Không gọi OpenAI SDK trực tiếp trong worker — phải qua interface.
Swap provider = swap implementation, không sửa worker logic.

**INV-04 — Max 300 Output Tokens:**
`maxTokens = 300` không được thay đổi mà không có cost review.
Input truncate ở 50,000 chars ≈ 12,000 tokens — vừa context window model rẻ.

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

**AC-04 — Retry on provider timeout:**
AI provider timeout 2 lần.
Then: After attempt 1: status='QUEUED', re-queued with 30s delay.
After attempt 2: status='QUEUED', re-queued with 60s delay.
After attempt 3 (success): status='DONE'.

**AC-05 — Max retries exceeded → DLQ + notification:**
AI provider timeout 3 lần.
Then: status='FAILED'. DLQ có 1 message. BTC nhận notification.
Workshop vẫn accessible, không có summary.

**AC-06 — PDF no text → immediate fail:**
Upload PDF image scan (no text layer).
Then: status='FAILED', reason='pdf_no_text'. Không retry (auto-ack ngay).

**AC-07 — Non-blocking for other features:**
Khi worker đang gọi AI (mất 2 phút), các request registration và check-in vẫn trả 200.

**AC-08 — BTC manual retry:**
BTC click "Thử lại" sau khi status='FAILED'.
Then: summary_status = 'QUEUED', re-queue vào stream. Worker xử lý lại.
