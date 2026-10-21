## Multi-Layer Governance Pipeline

Every MCP tool call passes through this **fail-closed** pipeline:

```
CallToolRequest
    ↓
 1. [VALIDATION]       Zod schema validation
 2. [GOVERNANCE]       validateArgsAgainstRules()
 3. [DISCIPLINE]       enforceDiscipline()
 4. [LOOP DETECTION]   recordAndCheck() + cooldown
 5. [TOKEN LIMITS]     enforceTokenBudgetPreCall() + checkTokenBudget()
 6. [LICENSE]          validateLicenseCompliance()
 7. [AUTO-ROLLBACK]    prepareWrite() snapshot
 8. [HUMAN-IN-LOOP]    RiskEngine.assessTaskRisk() + checkRiskGate()
 9. [PII MASKING]      maskToolArgs() → mask before handler
10. [EXECUTION]        Tool handler runs
11. [POST-VALIDATION]  scanFileForViolations() → rollback if needed
12. [INJECTION PROTECTION] sanitizeResponse()
13. [PII MASKING]      maskToolResult() → mask before returning to AI
    ↓
 Return governed result
```

A control that cannot run **denies** the operation rather than passing it silently.
