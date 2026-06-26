# 📜 Engineering Recipe: Contract-First Design

This recipe governs the @architect agent's protocol for creating type-safe agreements between system layers.

## 🏁 Phase 1: Requirement Alignment
1.  **Analysis:** Read user requirements and Business Analyst (@analyst) reports.
2.  **Scope Discovery:** Identify the domain objects, actions, and events required for the feature.

## 📐 Phase 2: Technical Modeling
1.  **Branded Types:** Define semantic IDs in `src/types/brands.ts` (e.g., `OrderId`, `ProductSKU`).
2.  **Domain Models:** Create or update interfaces in `src/types/models.ts`. Ensure they extend `BaseEntity`.
3.  **Constants:** Update `src/types/constants.ts` for enums and fixed state values.

## 🔏 Phase 3: Hash Sealing
1.  **Integrity Check:** Run `atabey verify-contract` to check existing state.
2.  **Commitment:** Run `atabey update-contract` to generate new SHA-256 signatures for the updated types.
3.  **Audit:** Verify that `contract.version.json` accurately reflects the new architecture.

## [SIGNAL] Phase 4: Synchronization
1.  **Distribution:** Ensure the updated `src/types` directory is correctly linked or copied to both Frontend and Backend projects.
2.  **Verification:** Trigger @backend and @frontend agents to read the new contract and plan their implementations.
