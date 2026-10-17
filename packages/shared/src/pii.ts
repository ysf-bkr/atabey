/**
 * [PII] Personally Identifiable Information Masking Service
 *
 * Detects and masks sensitive data in compliance with KVKK/GDPR.
 * Used in audit log, logger, storage layers, and MCP middleware.
 *
 * Supported patterns:
 * - Email addresses
 * - Phone numbers (international, Turkish, US, UK)
 * - TC Identification number (11 digits)
 * - API keys / tokens (OpenAI, Anthropic, Google, GitHub, generic)
 * - Bearer tokens / JWTs
 * - IP addresses (IPv4, IPv6)
 * - Credit card numbers (AMEX, Visa, Mastercard, etc.)
 * - Password / secret fields in structured data
 * - Bank account / IBAN
 * - Date of birth / full address patterns
 * - Custom names (configurable)
 */

// Sensitive patterns to detect and mask
// IMPORTANT: More specific patterns MUST come before generic ones
interface SensitivePattern {
    pattern: RegExp;
    replacement: string;
    /** Optional extra check to avoid false positives (e.g. TCKN checksum). */
    validate?: (match: string) => boolean;
}

/** Turkish TC Kimlik No checksum (reduces over-masking of arbitrary 11-digit numbers). */
function isValidTckn(value: string): boolean {
    if (!/^[1-9]\d{10}$/.test(value)) return false;
    const d = value.split("").map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8];
    const even = d[1] + d[3] + d[5] + d[7];
    const tenth = (((odd * 7) - even) % 10 + 10) % 10;
    if (tenth !== d[9]) return false;
    const sumFirst10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
    return sumFirst10 % 10 === d[10];
}

function isValidIpv4(value: string): boolean {
    return value.split(".").every((o) => {
        const n = Number(o);
        return Number.isInteger(n) && n >= 0 && n <= 255;
    });
}

/** Only treat a colon-group as IPv6 when it has a hex letter or a `::` (not a time). */
function looksLikeIpv6(value: string): boolean {
    return value.includes("::") || /[a-fA-F]/.test(value);
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
    // JWT tokens (complete JWT format) - must be before Bearer
    { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: "***-JWT-REDACTED-***" },

    // Bearer tokens in Authorization headers (case-insensitive; includes base64url chars)
    { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "Bearer ***-REDACTED-***" },
    // Basic auth in Authorization headers
    { pattern: /Basic\s+[a-zA-Z0-9=+/]+/gi, replacement: "Basic ***-REDACTED-***" },

    // API keys (common formats) - must be before generic patterns
    // Note: ghp_ tokens can contain digits that look like phone numbers, so we mask the entire prefix + suffix
    { pattern: /\b(sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|ghu_[a-zA-Z0-9]{36,}|ghb_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{36,}|sk-[a-zA-Z0-9_-]{32,}|sk-[a-zA-Z0-9]{48,}|whsec_[a-zA-Z0-9]{16,})\b/g, replacement: "***-REDACTED-***" },

    // Social Security Number (US SSN: XXX-XX-XXXX) - must be before generic phone
    { pattern: /\b(?!000|666|9[0-9]{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, replacement: "***-**-****" },

    // Date of birth patterns - must be before generic phone
    { pattern: /\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[0-2])[/.-](19[0-9]{2}|20[0-9]{2})\b/g, replacement: "**/**/****" },

    // IBAN (international bank account) - strictly matches ISO country codes and length >= 15
    { pattern: /\b(?:TR|DE|FR|GB|IT|ES|NL|CH|AT|BE|PL|SE|NO|DK|FI|PT|GR|IE|CZ|RO|HU|BG|HR|LT|SI|LV|EE|CY|LU|MT|SK|US|CA)\d{2}[A-Z0-9]{11,30}\b/g, replacement: "****-IBAN-REDACTED-****" },

    // TC Kimlik (11 digits) — validated with the official checksum to avoid masking arbitrary IDs
    { pattern: /\b[1-9]\d{10}\b/g, replacement: "***********", validate: isValidTckn },

    // Email
    { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "***@***" },

    // Phone (Turkish: +90 5xx xxx xx xx, 05xx xxx xx xx, or formatted 5xx xxx xx xx)
    { pattern: /(?:(?:\+90|0090|\b0)[\s.-]?)5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g, replacement: "***-***-****" },
    { pattern: /\b5\d{2}[\s.-]\d{3}[\s.-]\d{2}[\s.-]\d{2}\b/g, replacement: "***-***-****" },

    // Phone (international with leading + or delimited format e.g. +1 (555) 123-4567, +44 20 7946 0950)
    // Delimiters or leading '+' are strictly required so that raw Unix timestamps / IDs are not falsely masked.
    { pattern: /\b(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]\d{2,4}(?:[\s.-]\d{2,4})?\b/g, replacement: "***-***-****" },

    // IP addresses (IPv4) — validated octets only
    { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "***.***.***.***", validate: isValidIpv4 },
    // IP addresses (IPv6 - full form)
    { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, replacement: "****:****:****:****" },
    // IPv6 compressed — requires `::` or a hex letter so clock times (10:30:45) are not masked
    { pattern: /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g, replacement: "****:****:****", validate: looksLikeIpv6 },

    // Credit card (Delimited 16 digits or major card issuer BIN prefixes: Visa 4, MC 51-55/22-27, Discover 6011/65)
    // Prevents false-positive masking of 13-digit Unix timestamps (e.g. 1713000000000)
    { pattern: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/g, replacement: "****-****-****-****" },
    { pattern: /\b4\d{3}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replacement: "****-****-****-****" },
    { pattern: /\b(?:5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replacement: "****-****-****-****" },
    { pattern: /\b(?:6011|65\d{2})[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replacement: "****-****-****-****" },
    // AMEX (15 digits, starts with 34/37) — no whitespace/newlines, exact length
    { pattern: /\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b/g, replacement: "****-****-***" },

    // Password fields in JSON (double-quoted)
    { pattern: /"(password|passwd|secret|api_key|apiKey|apikey|auth_token|refresh_token|access_token)"\s*:\s*"[^"]+"/gi, replacement: "\"$1\": \"***-REDACTED-***\"" },
    // Password fields in JSON (single-quoted)
    { pattern: /'(password|passwd|secret|api_key|apiKey|apikey|auth_token|refresh_token|access_token)'\s*:\s*'[^']*'/gi, replacement: "'$1': '***-REDACTED-***'" },

    // Turkish address patterns (contextual: only when accompanied by street/neighborhood identifiers)
    { pattern: /(?:(?:sokak|cadde|mahalle|bulvar|apt|daire|blok)[^,\n]*\b(?:no|kapı no|daire no|numara)[:\s]*\d+)/gi, replacement: "no: ****" },
];

// Fields that are considered sensitive and should always be redacted in structured data
const SENSITIVE_FIELDS = [
    "password", "passwd", "secret", "apiKey", "api_key", "apikey",
    "token", "accessToken", "access_token", "refreshToken", "refresh_token", "authToken", "auth_token",
    "authorization", "Authorization", "bearer",
    "email", "e_mail", "eMail",
    "phone", "phoneNumber", "phone_number", "telephone", "telephoneNumber", "mobile", "mobilePhone", "cellPhone",
    "creditCard", "credit_card", "ccNumber", "cc_number", "ccn", "cvv", "cvv2", "cvc",
    "ssn", "socialSecurity", "social_security",
    "tcKimlik", "tc_kimlik", "identityNumber", "identity_number", "idNumber", "id_number", "nationalId",
    "ipAddress", "ip_address", "ip",
    "dob", "dateOfBirth", "date_of_birth", "birthDate", "birth_date",
    "iban", "IBAN", "bankAccount", "bank_account",
    "address", "homeAddress", "workAddress", "billingAddress", "shippingAddress",
    "fullName", "firstName", "lastName", "surname", "middleName",
];

/**
 * Mask sensitive data in a text string.
 */
export function maskText(text: string): string {
    if (!text || typeof text !== "string") return text;

    let masked = text;
    for (const { pattern, replacement, validate } of SENSITIVE_PATTERNS) {
        if (validate) {
            masked = masked.replace(pattern, (match) => (validate(match) ? replacement : match));
        } else {
            masked = masked.replace(pattern, replacement);
        }
    }
    return masked;
}

/**
 * Recursively mask sensitive fields in an object.
 * Returns a new object with sensitive values redacted.
 * Strict mode: when true, also masks values in objects even if the key
 * is not a known sensitive field name (catches data passed to unknown schemas).
 */
export function maskObject(obj: unknown, depth = 0, strictMode = false): unknown {
    if (depth > 10) return strictMode ? "***-REDACTED-***" : obj; // Prevent infinite recursion
    if (obj === null || obj === undefined) return obj;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(obj)) return `<Buffer ${obj.length} bytes>`;
    if (typeof obj === "string") return maskText(obj);
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => maskObject(item, depth + 1, strictMode));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        // Sensitive by exact name, or (strict mode) by name heuristic.
        const isSensitive =
            SENSITIVE_FIELDS.includes(key) ||
            (strictMode && /(pass|secret|token|key|credential|auth)/i.test(key));
        if (isSensitive) {
            result[key] = typeof value === "string" ? "***-REDACTED-***" : maskObject(value, depth + 1, strictMode);
        } else if (typeof value === "string") {
            result[key] = maskText(value);
        } else if (typeof value === "object") {
            result[key] = maskObject(value, depth + 1, strictMode);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Check if a string contains potential PII.
 * Useful for warning before sending data to external APIs.
 */
export function containsPII(text: string): boolean {
    for (const { pattern, validate } of SENSITIVE_PATTERNS) {
        const re = new RegExp(pattern.source, pattern.flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            if (!validate || validate(m[0])) return true;
            if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-length loops
        }
    }
    return false;
}

/**
 * Check if an object contains PII in any of its string values (recursive).
 */
export function containsPIIInObject(obj: unknown, depth = 0): boolean {
    if (depth > 10) return false;
    if (obj === null || obj === undefined) return false;
    if (typeof obj === "string") return containsPII(obj);
    if (typeof obj !== "object") return false;

    if (Array.isArray(obj)) {
        return obj.some(item => containsPIIInObject(item, depth + 1));
    }

    for (const [, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === "string") {
            if (containsPII(value)) return true;
        } else if (typeof value === "object") {
            if (containsPIIInObject(value, depth + 1)) return true;
        }
    }
    return false;
}

/**
 * Data classification levels for audit/log decisions.
 */
export type DataClassification = "public" | "internal" | "confidential" | "restricted" | "critical";

/**
 * Classify a piece of data based on content analysis.
 */
export function classifyData(text: string): DataClassification {
    if (!text) return "public";

    // Check for highly sensitive / critical data
    if (
        /\b(sk-[a-zA-Z0-9]{20,}|Bearer\s+|eyJ[a-zA-Z0-9_-]+\.)/.test(text) ||
        /\b[1-9][0-9]{10}\b/.test(text) ||
        /"(password|secret|apiKey)"/i.test(text) ||
        /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}\b/.test(text) // IBAN
    ) {
        return "restricted";
    }

    // Check for personally identifiable / confidential data
    if (
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text) ||
        /(\+90|0)?\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}/.test(text) ||
        /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/.test(text) ||
        /\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[0-2])[/.-](19[0-9]{2}|20[0-9]{2})\b/.test(text)
    ) {
        return "confidential";
    }

    return "internal";
}

/**
 * Mask the content field of an MCP tool result.
 * This is used by the MCP middleware layer to automatically
 * sanitize all tool outputs before they reach the AI.
 */
export function maskToolResult(result: { content: Array<{ type: string; text: string }> }): { content: Array<{ type: string; text: string }> } {
    if (!result || !result.content) return result;

    return {
        ...result,
        content: result.content.map(block => ({
            ...block,
            text: block.type === "text" ? maskText(block.text) : block.text,
        })),
    };
}

/**
 * Mask sensitive arguments in an MCP tool call.
 * This is applied BEFORE the tool handler executes, ensuring
 * PII never reaches any processing layer unnecessarily.
 */
export function maskToolArgs(args: Record<string, unknown>): Record<string, unknown> {
    const masked = maskObject(args, 0, true) as Record<string, unknown>;
    return masked;
}

/**
 * Paths where PII masking of tool *results* is intentionally skipped to avoid
 * corrupting technical content (tests, docs, examples, fixtures). Real
 * production secrets are still caught by the secret-leak guard.
 */
const PII_BYPASS_PATH_PATTERNS: RegExp[] = [
    /(^|\/)tests?\//i,
    /(^|\/)__tests__\//i,
    /\.(test|spec)\.[cm]?[jt]sx?$/i,
    /\.mdx?$/i,
    /(^|\/)docs?\//i,
    /\.env\.example$/i,
    /\.example$/i,
    /(^|\/)fixtures?\//i,
];

export function shouldBypassPiiMaskingForPath(filePath?: string): boolean {
    if (!filePath) return false;
    const normalized = filePath.replace(/\\/g, "/");
    return PII_BYPASS_PATH_PATTERNS.some((re) => re.test(normalized));
}
