# ⚡ Engineering Recipe: Performance Optimization

This recipe governs the protocol for identifying and resolving system bottlenecks (Frontend, Backend, or Database).

## [DATA] Phase 1: Profiling & Bottleneck Identification
1.  **Metric Collection:** Read `observability/metrics.json` or run `get_system_health`.
2.  **Log Audit:** Scan `logs/manager.json` for slow actions or timeouts.
3.  **Trace Analysis:** Use `TraceID` to follow a slow request through all layers.

## [MEMORY] Phase 2: Root Cause Analysis
1.  **SQL Audit:** Check for N+1 query patterns or missing indexes in `repository/` files.
2.  **Algorithm Audit:** Scan for O(n²) loops or heavy synchronous operations.
3.  **Frontend Audit:** Check for unnecessary re-renders or massive bundle sizes.

## 🛠️ Phase 3: Surgical Optimization
1.  **DB Level:** Add missing indexes or refactor complex joins.
2.  **Logic Level:** Implement caching (e.g., Redis or in-memory) for frequent read operations.
3.  **UI Level:** Apply memoization, virtualization (FlashList), or code-splitting.

## [OK] Phase 4: Validation & Comparison
1.  **Benchmarking:** Re-run the action and compare new metrics with the baseline.
2.  **Regression Check:** Run `atabey check` and existing tests to ensure logic is intact.
3.  **Knowledge Update:** Record the optimization strategy in `knowledge/performance-history.md`.
