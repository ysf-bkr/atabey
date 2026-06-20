# [START] Engineering Recipe: Infrastructure Deployment

This recipe governs the @devops agent's protocol for safe, traceable, and reversible system rollouts.

## 🏁 Phase 1: Pre-Deployment Environment Audit
1.  **Integrity Check:** Run `atabey check` to ensure all discipline rules are met.
2.  **Health Scan:** Execute `get_system_health` and `check_active_ports` on the target environment.
3.  **Config Sync:** Verify that all keys in `.env.example` are present in the target environment's secrets manager.

## 🧱 Phase 2: Build & Validation
1.  **Compilation:** Run `npm run build` and capture any stderr.
2.  **Contract Verify:** Run `atabey verify-contract` to ensure FE/BE synchronization.
3.  **Test Suite:** Execute the full test battery. Failure in a single test blocks deployment.

## [SIGNAL] Phase 3: Controlled Rollout
1.  **Atomic Swap:** Deploy the new bundle/service using the project's orchestration scripts.
2.  **Database Sync:** If migrations are pending, follow the `db-management-recipe.md` first.
3.  **Log Monitoring:** Tail `logs/manager.json` for immediate post-deploy spikes in errors.

## [OK] Phase 4: Post-Deploy & Rollback Readiness
1.  **Observability:** Verify system metrics stabilize within 5 minutes.
2.  **Traceability:** Record the deployment Trace ID and commit hash in `PROJECT_MEMORY.md`.
3.  **Rollback Check:** Ensure the previous stable version is tagged and reachable in Git.
