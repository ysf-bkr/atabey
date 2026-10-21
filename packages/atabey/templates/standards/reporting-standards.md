# Reporting & Data Aggregation Standards

> High-performance guidelines for reporting, aggregation queries, and exports in Atabey-governed services.

## 1. Aggregation & Analytical Queries

- **Read Replicas:** Heavy analytical queries (`COUNT(*)`, `SUM`, multi-table `JOIN`) must run on read replicas or dedicated read transactions.
- **Materialized Views:** Daily/weekly aggregations exceeding 100k rows must use materialized views refreshed periodically via background jobs, not computed on request.
- **Pagination & Time Windows:** Analytical endpoints must require mandatory time-range bounds (`startDate`, `endDate` <= 90 days) and keyset pagination.

## 2. Export Pipelines (CSV & PDF)

- **Streaming Output:** Never load complete datasets into memory before serializing. Use Node.js Streams (`stream.Readable` / Fastify `reply.send(stream)`).
- **Background Execution:** Exports exceeding 5,000 rows must run asynchronously via a background job queue:
  1. API issues a report task (`status: PENDING`, returns `reportId`).
  2. Worker streams query results directly to object storage (S3/MinIO) or local reports directory.
  3. Client polls status or receives notification upon completion.
- **CSV Injection Defense:** Prefix cells beginning with `=`, `+`, `-`, `@` with a single quote (`'`) to prevent formula execution in Excel/Calc.

## 3. Scheduled Reports

- **Distributed Locks:** Cron-triggered report jobs must acquire a distributed lock (`AtomicFileLock` or Redis lock) to prevent duplicate runs across worker instances.
- **Graceful Timeouts:** Set explicit database statement timeouts (`statement_timeout = 30000`) for analytical queries.
