/**
 * ─── RULES ENGINE (Prompt Conflict Resolution) ────────────────────
 *
 * Resolves conflicts between AI CLI built-in prompts and Atabey governance rules.
 * Ensures Atabey's critical rules ALWAYS override CLI-level instructions.
 *
 * Priority System:
 * - CRITICAL (P0): Non-bypassable rules (zero any, no console.log, PII masking)
 * - HIGH (P1): Important rules that should not be violated
 * - MEDIUM (P2): Standard best practices
 * - LOW (P3): Recommendations only
 *
 * Enforcement Mechanisms:
 * 1. Pre-execution: Rule validation BEFORE tool runs
 * 2. Post-execution: Scan changed files for violations → auto-rollback
 * 3. CLI System Prompt Override: Inject critical rules at MCP initialization
 */

import path from "path";
import { scanSourceForViolations } from "./ast-scan.js";

// ─── Types ────────────────────────────────────────────────────────

export type RulePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface GovernanceRule {
    id: string;
    name: string;
    description: string;
    priority: RulePriority;
    /** Regex pattern to detect violations in file content */
    detectPattern?: RegExp;
    /** Tool names this rule applies to */
    appliesToTools?: string[];
    /** File extensions this rule applies to (e.g., .ts, .tsx) */
    appliesToExtensions?: string[];
    /** Error message when violated */
    errorMessage: string;
    /** Auto-fix expression (optional) */
    autoFix?: string;
    /** Whether this rule can be bypassed */
    bypassable: boolean;
}

// ─── Built-in Governance Rules ────────────────────────────────────

const GOVERNANCE_RULES: GovernanceRule[] = [
    // ── CRITICAL (P0) Rules ────────────────────────────────────
    {
        id: "no-any-types",
        name: "Zero Any Type Policy",
        description: "TypeScript 'any' type is strictly forbidden",
        priority: "CRITICAL",
        detectPattern: /:\s*any\b/g,
        appliesToExtensions: [".ts", ".tsx"],
        errorMessage: "CRITICAL: 'any' type is forbidden. Use 'unknown' with proper type guards instead.",
        bypassable: false,
    },
    {
        id: "no-console-log",
        name: "No Console Log",
        description: "console.log/error/warn is forbidden (use logger instead)",
        priority: "CRITICAL",
        detectPattern: /console\.(log|error|warn|debug|info)\s*\(/g,
        appliesToExtensions: [".ts", ".tsx", ".js", ".jsx"],
        errorMessage: "CRITICAL: console.log/error/warn is forbidden. Use the project's logger instead.",
        bypassable: false,
    },
    {
        id: "pii-masking",
        name: "PII Masking Required",
        description: "Sensitive data must be masked before logging or storing",
        priority: "CRITICAL",
        errorMessage: "CRITICAL: Detected potential PII in unmasked form. Use maskText() / maskObject() from pii.ts.",
        bypassable: false,
    },
    {
        id: "no-ts-directives",
        name: "No TypeScript Suppression Directives",
        description: "@ts-ignore / @ts-nocheck / @ts-expect-error are forbidden",
        priority: "CRITICAL",
        errorMessage: "CRITICAL: TypeScript suppression directives are forbidden. Fix the underlying type error.",
        bypassable: false,
    },
    {
        id: "no-debugger",
        name: "No Debugger Statement",
        description: "`debugger` statements must not be committed",
        priority: "CRITICAL",
        errorMessage: "CRITICAL: `debugger` statement detected. Remove it before committing.",
        bypassable: false,
    },

    // ── HIGH (P1) Rules ────────────────────────────────────────
    {
        id: "no-hardcoded-secrets",
        name: "No Hardcoded Secrets",
        description: "API keys, tokens, passwords must use environment variables",
        priority: "HIGH",
        detectPattern: /(['"])sk-[a-zA-Z0-9]{20,}['"]|(['"])ghp_[a-zA-Z0-9]{36,}['"]|(['"])AIza[0-9A-Za-z_-]{35}['"]/g,
        appliesToExtensions: [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".yaml", ".yml", ".env.example"],
        errorMessage: "HIGH: Hardcoded API keys/tokens detected. Use environment variables (process.env.*).",
        bypassable: false,
    },
    {
        id: "no-commented-code",
        name: "No Commented-Out Code",
        description: "Dead code should be removed, not commented out",
        priority: "HIGH",
        // Only flag comments that actually look like commented-out code, not
        // every `// ...` (which previously matched URLs and prose comments).
        detectPattern: /\/\/\s*(?:const|let|var|function|return|import|export|if|for|while|switch|class|interface|type)\b/g,
        appliesToExtensions: [".ts", ".tsx", ".js", ".jsx"],
        errorMessage: "HIGH: Commented-out code detected. Remove dead code instead of commenting.",
        bypassable: true,
    },

    // ── MEDIUM (P2) Rules ──────────────────────────────────────
    {
        id: "no-console-in-jsx",
        name: "No Console in JSX",
        description: "Avoid console statements inside JSX/TSX components",
        priority: "MEDIUM",
        detectPattern: /{.*console\.(log|error|warn)\(.*}/g,
        appliesToExtensions: [".tsx", ".jsx"],
        errorMessage: "MEDIUM: Console statement inside JSX detected. Move to event handler or useEffect.",
        bypassable: true,
    },
    {
        id: "i18n-usage",
        name: "Internationalization Required",
        description: "Use i18n for user-facing strings",
        priority: "MEDIUM",
        detectPattern: /(['"])([A-Z][a-z]+ [a-z]+ [a-z]+)['"]/g,
        appliesToExtensions: [".tsx", ".jsx"],
        errorMessage: "MEDIUM: User-facing string detected. Use i18n translation function instead.",
        bypassable: true,
    },
];

// ─── Rule Engine ──────────────────────────────────────────────────

let rulesMap: Map<string, GovernanceRule> | null = null;

function getRulesMap(): Map<string, GovernanceRule> {
    if (!rulesMap) {
        rulesMap = new Map();
        for (const rule of GOVERNANCE_RULES) {
            rulesMap.set(rule.id, rule);
        }
    }
    return rulesMap;
}

/**
 * Get all governance rules.
 */
export function getAllRules(): GovernanceRule[] {
    return [...GOVERNANCE_RULES];
}

/**
 * Get rules by priority level.
 */
export function getRulesByPriority(priority: RulePriority): GovernanceRule[] {
    return GOVERNANCE_RULES.filter(r => r.priority === priority);
}

/**
 * Get non-bypassable rules (CRITICAL + HIGH non-bypassable).
 */
export function getNonBypassableRules(): GovernanceRule[] {
    return GOVERNANCE_RULES.filter(r => !r.bypassable);
}

/**
 * Scan file content for rule violations.
 * Returns array of violations found.
 */
export function scanFileForViolations(
    filePath: string,
    content: string,
    options: { includeBypassable?: boolean } = {},
): Array<{ rule: GovernanceRule; match: string; line: number }> {
    const includeBypassable = options.includeBypassable ?? true;
    const ext = path.extname(filePath);
    const violations: Array<{ rule: GovernanceRule; match: string; line: number }> = [];
    const lines = content.split("\n");

    for (const rule of GOVERNANCE_RULES) {
        if (!includeBypassable && rule.bypassable) continue;
        // Check if rule applies to this file extension
        if (rule.appliesToExtensions && !rule.appliesToExtensions.includes(ext)) {
            continue;
        }

        // Check if rule has a detect pattern
        if (!rule.detectPattern) continue;

        // Scan each line
        for (let i = 0; i < lines.length; i++) {
            // Reset lastIndex for stateful /g regexes before each line.
            rule.detectPattern.lastIndex = 0;
            const match = lines[i].match(rule.detectPattern);
            if (match) {
                violations.push({
                    rule,
                    match: match[0],
                    line: i + 1,
                });
            }
        }
    }

    // [REAL AST] For TS/JS, augment regex findings with TypeScript Compiler API
    // results (catches `Array<any>`, type aliases, console.* in expressions, and
    // avoids false positives from comments/strings).
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const astViolations = scanSourceForViolations(filePath, content);
        for (const av of astViolations) {
            const rule = getRulesMap().get(av.ruleId);
            if (!rule) continue;
            if (!includeBypassable && rule.bypassable) continue;
            const already = violations.some((v) => v.rule.id === rule.id && v.line === av.line);
            if (already) continue;
            violations.push({ rule, match: av.text, line: av.line });
        }
    }

    return violations;
}

/**
 * Collect the user-supplied content to scan across every write-style tool shape.
 */
function collectScannableContent(args: Record<string, unknown>): string[] {
    const contents: string[] = [];
    for (const key of ["content", "newText", "newContent", "replacement"]) {
        const v = args[key];
        if (typeof v === "string" && v) contents.push(v);
    }
    if (Array.isArray(args.edits)) {
        for (const edit of args.edits) {
            if (edit && typeof edit === "object") {
                const obj = edit as Record<string, unknown>;
                for (const key of ["newText", "newContent", "content", "replacement"]) {
                    const v = obj[key];
                    if (typeof v === "string" && v) contents.push(v);
                }
            }
        }
    }
    return contents;
}

/**
 * Validate tool arguments against governance rules.
 * Returns violation messages if any critical rule is violated.
 */
export function validateArgsAgainstRules(
    toolName: string,
    args: Record<string, unknown>
): string | null {
    // Content-bearing write tools all route through here (not just write_file).
    const contents = collectScannableContent(args);
    if (contents.length === 0) return null;

    const filePath = (args.path as string) || "unknown.ts";
    const violations = contents
        .flatMap((content) => scanFileForViolations(filePath, content, { includeBypassable: false }))
        .filter((v) => !v.rule.appliesToTools || v.rule.appliesToTools.includes(toolName));

    if (violations.length === 0) return null;

    const details = violations.map(v =>
        `  Line ${v.line}: ${v.match} (${v.rule.name} - ${v.rule.priority})`
    ).join("\n");
    const top = violations[0].rule;
    return [
        `[GOVERNANCE] ${top.priority} rule violation: ${top.name}`,
        `${top.errorMessage}`,
        "\nViolations:",
        details,
    ].join("\n");
}

/**
 * Validate tool response for governance violations.
 * Returns violation messages if found.
 */
export function validateResponseAgainstRules(
    toolName: string,
    responseText: string
): string | null {
    // For file reads, check if the content contains PII or secrets
    if (toolName === "read_file" && responseText.length > 0) {
        const criticalRules = getNonBypassableRules();
        for (const rule of criticalRules) {
            if (!rule.detectPattern) continue;
            // Stateful /g regexes keep lastIndex between calls — reset it.
            rule.detectPattern.lastIndex = 0;
            if (rule.detectPattern.test(responseText)) {
                return `[GOVERNANCE] ${rule.priority} violation detected in response: ${rule.name}. ${rule.errorMessage}`;
            }
        }
    }

    return null;
}

/**
 * Build system prompt override block for CLI initialization.
 * This is injected into the AI's system prompt at MCP connect time.
 */
export function buildSystemPromptOverride(): string {
    const criticalRules = getRulesByPriority("CRITICAL");
    const highRules = getRulesByPriority("HIGH");

    return [
        "## [ATABEY GOVERNANCE] Critical Rules — DO NOT OVERRIDE",
        "",
        "The following rules are ENFORCED by the Atabey Governance Layer.",
        "They CANNOT be bypassed or disabled.",
        "",
        "### Critical Rules (Non-Bypassable)",
        ...criticalRules.map(r => `- 🔴 ${r.name}: ${r.description}`),
        "",
        "### High Priority Rules",
        ...highRules.map(r => `- 🟠 ${r.name}: ${r.description}`),
        "",
        "> These rules are injected at the MCP middleware layer and enforced",
        "> at both pre-execution and post-execution stages.",
        "",
    ].join("\n");
}

/**
 * Add a custom governance rule at runtime.
 */
export function addRule(rule: GovernanceRule): void {
    const map = getRulesMap();
    if (!map.has(rule.id)) {
        GOVERNANCE_RULES.push(rule);
        map.set(rule.id, rule);
    }
}

export { GOVERNANCE_RULES as DefaultGovernanceRules };
