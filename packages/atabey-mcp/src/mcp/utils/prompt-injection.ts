/**
 * ─── PROMPT INJECTION PROTECTION ENGINE ────────────────────────────
 *
 * Scans, detects, and neutralizes prompt injection payloads in tool outputs
 * before they are returned to the AI assistant's context.
 *
 * This prevents malicious files, code comments, or external resources from
 * hijacking the AI client (e.g., instructing it to delete files or ignore safety).
 */

import { logger } from "atabey-mcp/../src/shared/logger.js";

// Common prompt injection signatures
const INJECTION_PATTERNS = [
    /ignore\s+(?:all\s+)?instructions/gi,
    /system\s+override/gi,
    /you\s+must\s+now/gi,
    /you\s+are\s+now/gi,
    /bypass\s+governance/gi,
    /bypass\s+safety/gi,
    /bypass\s+atabey/gi,
    /dan\s+mode/gi,
    /developer\s+mode/gi,
    /override\s+system\s+instructions/gi,
    /ignore\s+safety\s+rules/gi,
    /\[system\s+prompt\]/gi,
    /<system_prompt>/gi,
    /disable\s+restrictions/gi
];

export class PromptInjectionProtection {
    /**
     * Scan tool response text for injection patterns.
     * Replaces any matches with a redirection block and logs it.
     */
    public static sanitizeResponse(text: string): {
        sanitized: string;
        detected: boolean;
        patterns: string[];
    } {
        if (!text) {
            return { sanitized: text, detected: false, patterns: [] };
        }

        let detected = false;
        const patternsMatched: string[] = [];
        let sanitized = text;

        for (const pattern of INJECTION_PATTERNS) {
            if (pattern.test(sanitized)) {
                detected = true;
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(m => {
                        if (!patternsMatched.includes(m)) {
                            patternsMatched.push(m);
                        }
                    });
                }
                sanitized = sanitized.replace(pattern, "[REDACTED PROMPT INJECTION]");
            }
        }

        if (detected) {
            logger.warn(`[INJECTION PROTECTION] Blocked prompt injection pattern in tool response: ${patternsMatched.join(", ")}`);
        }

        return {
            sanitized,
            detected,
            patterns: patternsMatched
        };
    }
}
