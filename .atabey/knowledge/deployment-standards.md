# [START] Deployment and Release Standards

This document outlines the protocols for deploying, updating, and rolling back services managed by Agent Atabey.

## 1. Release Strategy
- **Version Control:** All releases must follow Semantic Versioning (SemVer) and be tagged in Git with the format `vX.Y.Z`.
- **Atomic Commits:** Each deployment must be linked to a specific Git commit, which itself must contain a `Trace ID` in the commit message.

## 2. Deployment Workflow
- **CI/CD Integration:** Every deployment must pass the `npm run atabey:test` and `npm run atabey:check` pipeline.
- **Environment Isolation:** Deployments must use environment-specific configurations (.env.{env}) and never cross-pollinate variables.

## 3. Rollback Procedures (The Hermes Safety Valve)
- **Immediate Rollback:** If a deployment causes an escalation alert from an agent or a production failure, a rollback must be initiated within 5 minutes.
- **Git Revert Strategy:** 
    - Rollbacks are executed by checking out the previous stable tag (e.g., `git checkout v1.0.9`).
    - A "Fix-Forward" approach is only allowed for P0 security patches; otherwise, "Revert-First" is the law.
- **Database Safety:** 
    - Every Migration script must strictly include a corresponding `down()` or `revert()` path.
    - Database rollbacks must be tested in the staging environment before production execution.
- **Post-Mortem Requirement:** Every rollback triggers an automatic `@manager` task to create a `docs/post-mortems/TRACE_ID.md` report.
