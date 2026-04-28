# Background Module — Implementation Guide

**Version:** 1.0 | **Created:** April 28, 2026

---

## 📋 Overview

The Background Module handles all asynchronous and scheduled tasks in UniHub Workshop:

1. **Notifications** — Send notifications via Email/Telegram with retry logic
2. **AI Summarization** — Process documents through Claude API (Pipe-and-Filter)
3. **Student Synchronization** — Bulk CSV import with error tracking
4. **Payment Timeouts** — Cron job to expire pending payments
5. **Reconciliation** — Seat counter consistency checks
6. **System Monitoring** — Job health and circuit breaker status

---

## 📁 File Structure (24 files)

```
src/modules/background/
├── controllers/                 (3 files)
│   ├── notifications-admin.controller.ts
│   ├── student-sync-admin.controller.ts
│   └── system-admin.controller.ts
│
├── services/                    (5 files)
│   ├── notifications.service.ts
│   ├── notification-dispatch.service.ts
│   ├── ai-summary.service.ts
│   ├── student-sync.service.ts
│   └── system-monitor.service.ts
│
├── workers/                     (3 files)
│   ├── notification.worker.ts
│   ├── ai-summary.worker.ts
│   └── student-sync.worker.ts
│
├── cron/                        (2 files)
│   ├── payment-timeout.cron.ts
│   └── reconciliation.cron.ts
│
├── repositories/                (5 files)
│   ├── notification-logs.repository.ts
│   ├── notification-channel-configs.repository.ts
│   ├── ai-summaries.repository.ts (shared with Catalog)
│   ├── student-sync-jobs.repository.ts
│   └── student-sync-errors.repository.ts
│
├── dto/                         (5 files)
│   ├── notification-response.dto.ts
│   ├── update-channel-config.dto.ts
│   ├── trigger-student-sync.dto.ts
│   ├── student-sync-response.dto.ts
│   └── system-monitor-response.dto.ts
│
└── background.module.ts         (1 file)
```

---

## 🔧 Core Components

### Controllers (3)

#### NotificationsAdminController

- **Routes:** `/admin/notifications/*`
- **Role:** ORGANIZER only
- **Endpoints:**
  - `GET /admin/notifications/logs` — List notification logs
  - `GET /admin/notifications/logs/{id}` — Get single log
  - `GET /admin/notifications/channels` — List channel configs
  - `PATCH /admin/notifications/channels/{channel_type}` — Update config

#### StudentSyncAdminController

- **Routes:** `/admin/student-sync/*`
- **Role:** ORGANIZER only
- **Endpoints:**
  - `POST /admin/student-sync` — Trigger CSV import (202 Accepted)
  - `GET /admin/student-sync` — List all jobs
  - `GET /admin/student-sync/{job_id}` — Get job status
  - `GET /admin/student-sync/{job_id}/errors` — Get job errors

#### SystemAdminController

- **Routes:** `/admin/system/*`
- **Role:** ORGANIZER only
- **Endpoints:**
  - `GET /admin/system/jobs/payment-timeout` — Payment timeout job status
  - `GET /admin/system/jobs/reconciliation` — Reconciliation job status
  - `GET /admin/system/circuit-breaker` — Circuit breaker states
  - `POST /admin/system/circuit-breaker/{gateway}/reset` — Force reset

### Services (5)

#### NotificationsService

- **Responsibility:** Audit logs & channel configuration management
- **Methods:**
  - `listLogs(filters, pagination)` — Query logs with filters
  - `getLogById(id)` — Get single log
  - `listChannelConfigs()` — List all configs (cacheable)
  - `updateChannelConfig(channelType, dto)` — Update config

#### NotificationDispatchService

- **Responsibility:** Actual notification sending (Channel Adapters)
- **Channels:**
  - EMAIL (via SMTP)
  - TELEGRAM (via Bot API)
- **Methods:**
  - `dispatch(notificationId)` — Send notification via appropriate channel
  - `sendEmail()` — Email provider adapter
  - `sendTelegram()` — Telegram provider adapter

#### AiSummaryService

- **Responsibility:** AI-powered document summarization pipeline
- **Pipeline Stages:**
  1. Extract text from PDF
  2. Clean & normalize text
  3. Call Claude API (sonnet-4-20250514)
  4. Save summary to database
- **Methods:**
  - `processDocument(documentId)` — Run full pipeline

#### StudentSyncService

- **Responsibility:** Bulk student data import (Batch-Sequential)
- **Methods:**
  - `triggerSync(sourceFileName)` — Create async job (202 Accepted)
  - `processJob(jobId)` — Process CSV row by row
  - `getJob(jobId)` — Get job status
  - `getJobErrors(jobId, pagination)` — Get sync errors

#### SystemMonitorService

- **Responsibility:** System health & background job monitoring
- **Methods:**
  - `getPaymentTimeoutJobStatus()` — Payment timeout cron status
  - `getReconciliationJobStatus()` — Reconciliation status
  - `getCircuitBreakerStatus()` — Circuit breaker states
  - `resetCircuitBreaker(gateway)` — Force reset breaker

### Workers (3) — Queue Consumers

#### NotificationWorker

- **Queue:** `notification`
- **Job Format:**
  ```json
  {
    "notification_id": "uuid",
    "type": "REGISTRATION_CONFIRMED|PAYMENT_SUCCESS|WORKSHOP_CANCELLED",
    "retry_count": 0,
    "max_retries": 5
  }
  ```
- **Retry Logic:**
  - Exponential backoff: 5s, 10s, 20s, 40s, 80s (max 300s)
  - Updates `notification_logs.status` after each attempt

#### AiSummaryWorker

- **Queue:** `ai-summary`
- **Job Format:**
  ```json
  {
    "document_id": "uuid",
    "workshop_id": "uuid",
    "retry_count": 0,
    "max_retries": 3
  }
  ```
- **Timeout Handling:**
  - LLM timeout: 30s (with 10s buffer = 40s total)
  - Timeout is fatal → no retry
  - Other errors: retry with 10s, 20s, 40s backoff

#### StudentSyncWorker

- **Queue:** `student-sync`
- **Job Format:**
  ```json
  {
    "job_id": "uuid",
    "source_file_name": "path/to/file.csv"
  }
  ```
- **Concurrency Control:**
  - Distributed lock (Redis SET NX) prevents parallel processing
  - Lock TTL = estimated job duration
  - Supports deduplication

### Cron Jobs (2) — Scheduled Tasks

#### PaymentTimeoutCron

- **Schedule:** Every 1 minute (`*/1 * * * *`)
- **Responsibility:**
  1. Find PENDING payments with `timeout_at < NOW()`
  2. Mark them as TIMEOUT
  3. Release seat locks: `INCR seat:available:{workshopId}`
  4. Mark registrations as CANCELLED
  5. Log statistics

#### ReconciliationCron

- **Schedule:** Every 10 minutes (`*/10 * * * *`)
- **Responsibility:**
  1. Compare Redis seat counters with PostgreSQL
  2. Detect discrepancies (threshold: >5 seats)
  3. Log warnings and alert if needed
  4. Not a source of truth — just safety net

### Repositories (5)

#### NotificationLogsRepository

- `findMany(filters, pagination)` — List logs (index: `idx_notif_status`)
- `findById(id)` — Get single log
- `create(data)` — Insert new log
- `updateStatus(id, status, sentAt?, errorMsg?)` — Update after attempt

#### NotificationChannelConfigsRepository

- `findAll()` — List all configs (cacheable in memory)
- `findByChannelType(type)` — Get single config
- `update(channelType, data)` — Update config

#### StudentSyncJobsRepository

- `create(data)` — Insert new job
- `updateStatus(id, status, counts?)` — Update progress
- `findById(id)` — Get single job
- `findMany(pagination)` — List jobs

#### StudentSyncErrorsRepository

- `createBatch(errors[])` — Batch insert errors
- `findByJobId(jobId, pagination)` — Get job errors

#### AiSummariesRepository

- **Note:** Shared with Catalog module to avoid duplication
- Import from CatalogModule in background.module.ts

---

## 🔄 Key Workflows

### 1. Notification System

**Trigger Points:**

- Registration confirmed → REGISTRATION_CONFIRMED event
- Payment successful → PAYMENT_SUCCESS event
- Workshop cancelled → WORKSHOP_CANCELLED event

**Flow:**

```
1. Event triggered → Create notification_logs record (PENDING)
2. Queue notification job to 'notification' queue
3. NotificationWorker picks up job
4. NotificationDispatchService routes to channel adapter
5. Send notification (EMAIL or TELEGRAM)
6. On success: Update status = SENT
7. On failure: Retry with exponential backoff (max 5 retries)
```

### 2. AI Summarization

**Trigger:**

- PDF document uploaded → Automatically queued for summarization

**Pipeline:**

```
1. DocumentsService.uploadDocument() queues job
2. AiSummaryWorker picks up documentId
3. AiSummaryService.processDocument():
   a) Extract text from PDF
   b) Clean & normalize
   c) Call Claude API (timeout: 30s)
   d) Save summary_text
4. Update ai_summaries.status = COMPLETED
5. On timeout: status = FAILED (no retry)
6. On other error: Retry max 3 times (backoff: 10s, 20s, 40s)
```

### 3. Student Synchronization

**Trigger:**

- Admin uploads CSV → POST /admin/student-sync

**Flow:**

```
1. StudentSyncAdminController receives request
2. StudentSyncService.triggerSync() creates job (QUEUED)
3. Returns 202 Accepted immediately with job_id
4. StudentSyncWorker picks up job
5. StudentSyncService.processJob():
   a) Acquire distributed lock (prevent parallel)
   b) Fetch CSV from Object Storage
   c) Parse CSV
   d) Batch-sequential: for each row
      - Validate fields
      - UPSERT to students table
      - Collect errors if validation fails
   e) Update student_sync_jobs progress
   f) Batch insert errors
6. Update job.status = COMPLETED
7. Release lock
```

### 4. Payment Timeout Handling

**Cron Job:** Every 1 minute

```
1. Query PENDING payments where timeout_at < NOW()
2. For each expired payment (in transaction):
   a) UPDATE payment.status = TIMEOUT
   b) UPDATE registration.status = CANCELLED
   c) INCR seat:available:{workshopId} (release seat)
   d) DEL seat:lock:{workshopId}:{registration_id}
3. Log: "Processed X timeout payments"
```

### 5. Seat Reconciliation

**Cron Job:** Every 10 minutes

```
1. For each PUBLISHED workshop:
   a) Read Redis: seat:available:{workshopId}
   b) Calculate from DB: total - confirmed - locked
   c) If |actual - expected| > 5:
      - Log warning
      - Increment discrepancy counter
      - Send alert if first occurrence
2. Log summary: "X workshops checked, Y discrepancies found"
```

---

## 🚀 Queue Implementation Options

### Option A: Bull/BullMQ (Recommended)

```typescript
// In background.module.ts imports:
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: process.env.REDIS_URL,
    }),
    BullModule.registerQueue(
      { name: 'notification' },
      { name: 'ai-summary' },
      { name: 'student-sync' }
    ),
  ],
})
```

**Advantages:**

- Persistent job storage
- Retry logic built-in
- Job progress tracking
- Failed job queue
- Admin dashboard available

### Option B: EventEmitter2 (MVP/Simple)

```typescript
// Use EventEmitter2 for event-based approach
// Simpler setup, no persistence

// Trigger job:
this.eventEmitter.emit('notification.dispatch', { notificationId });

// Consumer:
@OnEvent('notification.dispatch')
async handleNotificationDispatch(payload: any) {
  // Process notification
}
```

**Advantages:**

- No external service required
- Simple implementation
- Fast for MVP

**Disadvantages:**

- No persistence (jobs lost on server restart)
- Limited retry capabilities
- No job progress tracking

---

## 📊 Database Tables (Backend Module)

### notification_logs

```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  workshop_id UUID,
  notification_type VARCHAR(50),
  channel VARCHAR(20), -- EMAIL, TELEGRAM
  status VARCHAR(20), -- PENDING, SENT, FAILED
  payload JSONB,
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notif_status ON notification_logs(status)
  WHERE status = 'PENDING';
```

### notification_channel_configs

```sql
CREATE TABLE notification_channel_configs (
  id UUID PRIMARY KEY,
  channel_type VARCHAR(20), -- EMAIL, TELEGRAM
  is_active BOOLEAN DEFAULT true,
  config_json JSONB, -- Provider-specific settings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(channel_type)
);
```

### student_sync_jobs

```sql
CREATE TABLE student_sync_jobs (
  id UUID PRIMARY KEY,
  source_file_name VARCHAR(500),
  status VARCHAR(20), -- QUEUED, RUNNING, COMPLETED, FAILED
  total_rows INT DEFAULT 0,
  processed_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  error_count INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### student_sync_errors

```sql
CREATE TABLE student_sync_errors (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES student_sync_jobs(id),
  row_number INT,
  raw_data JSONB,
  error_reason VARCHAR(255),
  error_detail TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_errors_job ON student_sync_errors(job_id);
```

---

## 🔧 Implementation Checklist

### Phase 1: Queue Setup (1 week)

- [ ] Choose queue implementation (Bull/BullMQ or EventEmitter2)
- [ ] Setup @nestjs/schedule for Cron
- [ ] Create all database tables
- [ ] Implement Redis cache configuration
- [ ] Test queue connectivity

### Phase 2: Notification System (1 week)

- [ ] Implement NotificationsService (audit queries)
- [ ] Implement NotificationDispatchService (email/telegram adapters)
- [ ] Implement NotificationWorker (queue consumer)
- [ ] Setup email provider (nodemailer)
- [ ] Setup Telegram Bot API integration
- [ ] Test notification delivery with retries

### Phase 3: AI Summarization (1-2 weeks)

- [ ] Setup Anthropic SDK for Claude API
- [ ] Implement AiSummaryService (pipeline)
- [ ] Implement PDF text extraction
- [ ] Implement text cleaning
- [ ] Implement Claude API integration
- [ ] Implement AiSummaryWorker (timeout handling)
- [ ] Test with sample PDFs

### Phase 4: Student Sync (1 week)

- [ ] Implement StudentSyncService
- [ ] Implement CSV parsing
- [ ] Implement student upsert logic
- [ ] Implement StudentSyncWorker (concurrency control)
- [ ] Test with sample CSV files
- [ ] Error handling & validation

### Phase 5: Background Jobs (1 week)

- [ ] Implement PaymentTimeoutCron
- [ ] Implement ReconciliationCron
- [ ] Setup cron monitoring
- [ ] Test cron execution
- [ ] Add cron metrics/alerts

### Phase 6: System Monitoring (3-4 days)

- [ ] Implement SystemMonitorService
- [ ] Implement SystemAdminController
- [ ] Build monitoring dashboard
- [ ] Setup circuit breaker reset

### Phase 7: Integration & Testing (1 week)

- [ ] Integration tests for each workflow
- [ ] Load testing for background jobs
- [ ] Error scenario testing
- [ ] Retry logic verification
- [ ] Cron execution verification

---

## 🎯 Critical Implementation Notes

### 1. Notification Retry Logic

- Use exponential backoff: 5s, 10s, 20s, 40s, 80s
- Max 5 retries (configurable)
- After max retries, move to failed queue
- Update `notification_logs.status` on each attempt

### 2. AI Summary Pipeline

- **Text Extraction:** Handle image-only PDFs gracefully
- **Timeout:** Set LLM timeout to 30s, overall job timeout to 40s
- **Error Handling:** Timeout is fatal, no retry
- **Token Limits:** Truncate text to ~8000 tokens for Claude

### 3. Student Sync Batch Processing

- Use Batch-Sequential pattern: process one row at a time
- Collect all errors, insert in batch after processing
- Use transaction for atomicity per row
- Implement distributed lock to prevent parallel jobs

### 4. Payment Timeout Cron

- Run every 1 minute for responsiveness
- Use transaction to ensure atomicity
- INCR Redis counter to release seats
- Log statistics for monitoring

### 5. Reconciliation Cron

- Run every 10 minutes (not too frequent)
- Check discrepancies > 5 seats (configurable threshold)
- Log warnings without fixing (manual intervention required)
- Send alerts for first occurrence per workshop

### 6. Queue Configuration

- **Dead Letter Queue:** Capture failed jobs for analysis
- **Timeout:** Set appropriately per job type
- **Concurrency:** 1 for student-sync (lock prevents duplicates)
- **Persistence:** Critical for notification and sync jobs

---

## 📝 Configuration Variables

```env
# Queue Setup
QUEUE_TYPE=bull          # bull or event-emitter
REDIS_URL=redis://...   # For Bull

# Notification Channels
NOTIFICATION_EMAIL_ENABLED=true
NOTIFICATION_TELEGRAM_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
TELEGRAM_BOT_TOKEN=...

# AI Summary
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-20250514
AI_SUMMARY_TIMEOUT_MS=30000

# Background Jobs
PAYMENT_TIMEOUT_CRON=*/1 * * * *     # Every 1 minute
RECONCILIATION_CRON=*/10 * * * *     # Every 10 minutes
RECONCILIATION_THRESHOLD=5           # Seats discrepancy threshold

# Retry Configuration
NOTIFICATION_MAX_RETRIES=5
NOTIFICATION_BACKOFF_BASE_MS=5000
AI_SUMMARY_MAX_RETRIES=3
AI_SUMMARY_BACKOFF_BASE_MS=10000
STUDENT_SYNC_BATCH_SIZE=100
```

---

## ✅ Testing Strategy

### Unit Tests

- Notification service (mock dispatch)
- Student sync service (mock CSV parsing)
- System monitor service (mock queries)
- Cron logic (mock time)

### Integration Tests

- Full notification delivery flow
- AI summary pipeline (mock Claude)
- Student sync end-to-end
- Queue consumer processing
- Cron job execution

### Load Tests

- 10K notifications/hour
- 1000 student imports/minute
- AI summary throughput
- Queue performance

---

**Status: 🟡 PLANNING COMPLETE — Ready for Implementation**
