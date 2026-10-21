/**
 * ─── PROMPT INJECTION PROTECTION ENGINE (HARDENED) ─────────────────
 *
 * Multi-layer defense against prompt injection, jailbreaks, and delimiter
 * hijacking in tool outputs before returning them to AI assistant contexts.
 *
 * Defense layers:
 * 1. Signature & Regex matching for common jailbreak & override phrases.
 * 2. Delimiter & Role token manipulation (<|im_start|>, [INST], <system>).
 * 3. Zero-width character & homoglyph de-obfuscation (NFKC + zero-width strip).
 * 4. Encoded payload inspection (Base64 & URL-encoded payload scanning).
 * 5. Prompt exfiltration and system prompt leakage prevention.
 */

import { logger } from "atabey-shared/logger.js";

// Common prompt injection signatures & jailbreaks
const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(?:all\s+)?instructions/gi,
    /disregard\s+(?:all\s+)?(?:previous\s+)?instructions/gi,
    /system\s+override/gi,
    /you\s+must\s+now/gi,
    /you\s+are\s+now/gi,
    /bypass\s+(?:governance|safety|atabey|rules|guardrails)/gi,
    /dan\s+mode/gi,
    /developer\s+mode/gi,
    /override\s+system\s+instructions/gi,
    /ignore\s+safety\s+rules/gi,
    /\[system\s+prompt\]/gi,
    /<system_prompt>/gi,
    /disable\s+restrictions/gi,
    /forget\s+(?:previous|all)\s+instructions/gi,
    /new\s+instructions\s*:/gi,
    /from\s+now\s+on/gi,
    /act\s+as\s+(?:an?\s+)?(?:unrestricted|evil|jailbroken|godmode)/gi,
    /pretend\s+(?:you\s+are|to\s+be)/gi,
    /do\s+not\s+(?:follow|obey)\s+(?:previous|any)\s+(?:rules|instructions)/gi,
    /jailbreak/gi,
    /roleplay\s+as/gi,
    // Role delimiter and prompt injection tokens
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /\[\/?INST\]/gi,
    /<\/?system(?:_override)?>/gi,
    /<\/?instructions>/gi,
    /<antml:system>/gi,
    // Prompt exfiltration patterns
    /repeat\s+(?:your\s+)?(?:system\s+)?instructions\s+verbatim/gi,
    /output\s+(?:your\s+)?(?:initial\s+)?system\s+prompt/gi,
    /leak\s+(?:the\s+)?(?:system\s+)?prompt/gi
];

// Regex to detect zero-width and invisible control characters used for obfuscation
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u2060\u200E\u200F]/g;

// Regex to capture potential Base64 strings of length 20 or more
const BASE64_CANDIDATE_REGEX = /(?:[A-Za-z0-9+/]{4}){5,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;

export class PromptInjectionProtection {
    /**
     * Inspect incoming task descriptions, arguments, or file contents for injection attempts.
     */
    public static scanPayload(text: string): {
        detected: boolean;
        patterns: string[];
    } {
        if (!text || typeof text !== "string") {
            return { detected: false, patterns: [] };
        }
        const result = this.sanitizeResponse(text);
        return {
            detected: result.detected,
            patterns: result.patterns,
        };
    }

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

        // 1. Primary Pattern Scan on Direct Content
        for (const pattern of INJECTION_PATTERNS) {
            if (pattern.test(sanitized)) {
                detected = true;
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach((m) => {
                        if (!patternsMatched.includes(m)) {
                            patternsMatched.push(m);
                        }
                    });
                }
                sanitized = sanitized.replace(pattern, "[REDACTED PROMPT INJECTION]");
            }
        }

        // 2. Zero-Width Character / Unicode De-obfuscation Check
        const normalized = text.normalize("NFKC").replace(ZERO_WIDTH_REGEX, "");
        if (normalized !== text) {
            for (const pattern of INJECTION_PATTERNS) {
                if (pattern.test(normalized)) {
                    detected = true;
                    const matches = normalized.match(pattern);
                    if (matches) {
                        matches.forEach((m) => {
                            const desc = `Obfuscated: ${m}`;
                            if (!patternsMatched.includes(desc)) {
                                patternsMatched.push(desc);
                            }
                        });
                    }
                    // Redact occurrences in the text
                    sanitized = "[REDACTED PROMPT INJECTION]";
                    break;
                }
            }
        }

        // 3. Encoded Payload Check (Base64)
        if (!detected) {
            const b64Matches = text.match(BASE64_CANDIDATE_REGEX);
            if (b64Matches) {
                for (const candidate of b64Matches) {
                    try {
                        const decoded = Buffer.from(candidate, "base64").toString("utf8");
                        // Verify decoded looks like printable text
                        if (/^[\x20-\x7E\s]+$/.test(decoded)) {
                            for (const pattern of INJECTION_PATTERNS) {
                                if (pattern.test(decoded)) {
                                    detected = true;
                                    patternsMatched.push(`Base64 Encoded: ${candidate.slice(0, 16)}...`);
                                    sanitized = sanitized.replace(candidate, "[REDACTED PROMPT INJECTION]");
                                    break;
                                }
                            }
                        }
                    } catch (err) {
                        logger.debug("Prompt injection scan operation failed (non-fatal)", err);
                    }
                }
            }
        }

        // 4. URL-Encoded Payload Check
        if (sanitized.includes("%")) {
            try {
                const urlDecoded = decodeURIComponent(sanitized);
                if (urlDecoded !== sanitized) {
                    for (const pattern of INJECTION_PATTERNS) {
                        if (pattern.test(urlDecoded)) {
                            detected = true;
                            patternsMatched.push("URL-Encoded injection");
                            sanitized = "[REDACTED PROMPT INJECTION]";
                            break;
                        }
                    }
                }
            } catch (err) {
                logger.debug("Prompt injection scan operation failed (non-fatal)", err);
            }
        }

        if (detected) {
            logger.warn(`[INJECTION PROTECTION] Blocked prompt injection pattern in tool response: ${patternsMatched.join(", ")}`);
        }

        return {
            sanitized,
            detected,
            patterns: patternsMatched,
        };
    }
}
