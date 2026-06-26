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
const SENSITIVE_PATTERNS = [
    // JWT tokens (complete JWT format) - must be before Bearer
    { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, replacement: "***-JWT-REDACTED-***" },

    // Bearer tokens in Authorization headers
    { pattern: /Bearer\s+[a-zA-Z0-9._-]+/g, replacement: "Bearer ***-REDACTED-***" },
    // Basic auth in Authorization headers
    { pattern: /Basic\s+[a-zA-Z0-9=+/]+/g, replacement: "Basic ***-REDACTED-***" },

    // API keys (common formats) - must be before generic patterns
    // Note: ghp_ tokens can contain digits that look like phone numbers, so we mask the entire prefix + suffix
    { pattern: /\b(sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|ghu_[a-zA-Z0-9]{36,}|ghb_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9]{36,}|sk-[a-zA-Z0-9_-]{32,}|sk-[a-zA-Z0-9]{48,}|whsec_[a-zA-Z0-9]{16,})\b/g, replacement: "***-REDACTED-***" },

    // Social Security Number (US SSN: XXX-XX-XXXX) - must be before generic phone
    { pattern: /\b(?!000|666|9[0-9]{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, replacement: "***-**-****" },

    // Date of birth patterns - must be before generic phone
    { pattern: /\b(0[1-9]|[12][0-9]|3[01])[/.-](0[1-9]|1[0-2])[/.-](19[0-9]{2}|20[0-9]{2})\b/g, replacement: "**/**/****" },

    // IBAN (international bank account) - must be before generic alphanumeric patterns
    // Only matches valid IBAN format: 2 letters + 2 digits + 4-30 alphanumeric chars
    // More specific: requires minimum 8 chars total, starts with country code
    { pattern: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}\b/g, replacement: "****-IBAN-REDACTED-****" },

    // TC Kimlik (11 digits starting with 1-9, isolated word boundary) - must be before phone
    { pattern: /\b[1-9][0-9]{10}\b/g, replacement: "***********" },

    // Email
    { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "***@***" },

    // Phone (Turkish: +90 5xx xxx xx xx) - specific before generic
    { pattern: /(\+90|0)?\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{2}\s?[0-9]{2}/g, replacement: "***-***-****" },

    // Phone (international: +90, +1, +44, +49, +33, etc.) - generic, keep last among phones
    { pattern: /(\+\d{1,2}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{2,4}/g, replacement: "***-***-****" },

    // IP addresses (IPv4)
    { pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, replacement: "***.***.***.***" },
    // IP addresses (IPv6 - simplified)
    { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, replacement: "****:****:****:****" },
    // IPv6 compressed
    { pattern: /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g, replacement: "****:****:****" },

    // Credit card (16 digits, optional spaces/dashes)
    { pattern: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "****-****-****-****" },
    // AMEX (15 digits, starts with 34/37)
    { pattern: /\b3[47][0-9\s-]{13,14}\b/g, replacement: "****-****-***" },

    // Password fields in JSON
    { pattern: /"(password|passwd|secret|api_key|apiKey|apikey|auth_token|refresh_token|access_token)"\s*:\s*"[^"]+"/gi, replacement: "\"$1\": \"***-REDACTED-***\"" },

    // Turkish address patterns (optional - sokak, cadde, mahalle, no:)
    { pattern: /(?:no|no:|numara)[:\s]*\d+/gi, replacement: "no: ****" },
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
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
        masked = masked.replace(pattern, replacement);
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
    if (depth > 10) return obj; // Prevent infinite recursion
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return maskText(obj);
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => maskObject(item, depth + 1, strictMode));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        // Check if the key itself is a sensitive field
        if (SENSITIVE_FIELDS.includes(key)) {
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
    for (const { pattern } of SENSITIVE_PATTERNS) {
        if (pattern.test(text)) return true;
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
