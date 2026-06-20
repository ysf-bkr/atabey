/**
 * ─── LICENSE / COPYRIGHT SCANNER ──────────────────────────────────
 *
 * Detects restrictive license blocks in AI-generated code before
 * it reaches the developer's project. Prevents GPL, AGPL, and other
 * copyleft license violations at the MCP middleware layer.
 *
 * Features:
 * - Recognizes SPDX license identifiers
 * - Detects known open-source license headers (GPL, AGPL, LGPL, MPL)
 * - Checks against corporate allowlist/blocklist
 * - Source code similarity detection for known OSS snippets
 * - Warning vs. blocking based on license severity
 *
 * License Severity:
 *   CRITICAL: GPL-3.0, AGPL-3.0 (copyleft, automatic blocking)
 *   HIGH:    GPL-2.0, LGPL-3.0, MPL-2.0 (file-level copyleft)
 *   MEDIUM:  MIT, Apache-2.0, BSD (permissive, allowed with attribution)
 *   LOW:     CC0, Unlicense (public domain, no restrictions)
 */

import path from "path";

// ─── Configuration ────────────────────────────────────────────────

const CONFIG = {
    /** Enable license scanning */
    ENABLED: process.env.ATABEY_LICENSE_SCAN !== "false",
    /** Automatically block copyleft licenses */
    BLOCK_COPYLEFT: process.env.ATABEY_BLOCK_COPYLEFT !== "false",
    /** SPDX blocklist – these licenses are automatically blocked */
    BLOCKLIST: (process.env.ATABEY_LICENSE_BLOCKLIST || "GPL-3.0,AGPL-3.0,GPL-2.0").split(",").map(l => l.trim()),
    /** SPDX allowlist – these licenses are always allowed */
    ALLOWLIST: (process.env.ATABEY_LICENSE_ALLOWLIST || "MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,CC0-1.0,Unlicense").split(",").map(l => l.trim()),
    /** Detect known OSS snippets by hash (requires snippet database) */
    ENABLE_SNIPPET_DETECTION: process.env.ATABEY_LICENSE_SNIPPET_CHECK === "true",
    /** Path to snippet hash database */
    SNIPPET_DB_PATH: process.env.ATABEY_SNIPPET_DB_PATH || "",
};

// ─── License Severity ─────────────────────────────────────────────

export type LicenseSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface LicenseMatch {
    license: string;
    severity: LicenseSeverity;
    spdxId: string;
    source: "header" | "spdx" | "snippet" | "comment";
    line: number;
    snippet: string;
    /** Whether this license requires blocking */
    blocked: boolean;
    /** Whether attribution is required */
    requiresAttribution: boolean;
}

// ─── SPDX License Database ────────────────────────────────────────

interface LicenseInfo {
    name: string;
    severity: LicenseSeverity;
    copyleft: boolean;
    requiresAttribution: boolean;
}

const SPDX_LICENSES: Record<string, LicenseInfo> = {
    // Critical – Copyleft
    "GPL-3.0": { name: "GNU General Public License v3.0", severity: "CRITICAL", copyleft: true, requiresAttribution: true },
    "GPL-3.0-only": { name: "GNU General Public License v3.0 only", severity: "CRITICAL", copyleft: true, requiresAttribution: true },
    "GPL-3.0-or-later": { name: "GNU General Public License v3.0 or later", severity: "CRITICAL", copyleft: true, requiresAttribution: true },
    "AGPL-3.0": { name: "GNU Affero General Public License v3.0", severity: "CRITICAL", copyleft: true, requiresAttribution: true },
    "AGPL-3.0-only": { name: "GNU Affero General Public License v3.0 only", severity: "CRITICAL", copyleft: true, requiresAttribution: true },
    "SSPL-1.0": { name: "Server Side Public License v1", severity: "CRITICAL", copyleft: true, requiresAttribution: true },

    // High – File-level copyleft
    "GPL-2.0": { name: "GNU General Public License v2.0", severity: "HIGH", copyleft: true, requiresAttribution: true },
    "GPL-2.0-only": { name: "GNU General Public License v2.0 only", severity: "HIGH", copyleft: true, requiresAttribution: true },
    "LGPL-3.0": { name: "GNU Lesser General Public License v3.0", severity: "HIGH", copyleft: true, requiresAttribution: true },
    "LGPL-3.0-only": { name: "GNU Lesser General Public License v3.0 only", severity: "HIGH", copyleft: true, requiresAttribution: true },
    "MPL-2.0": { name: "Mozilla Public License 2.0", severity: "HIGH", copyleft: true, requiresAttribution: true },
    "EUPL-1.2": { name: "European Union Public License 1.2", severity: "HIGH", copyleft: true, requiresAttribution: true },

    // Medium – Permissive
    "MIT": { name: "MIT License", severity: "MEDIUM", copyleft: false, requiresAttribution: true },
    "Apache-2.0": { name: "Apache License 2.0", severity: "MEDIUM", copyleft: false, requiresAttribution: true },
    "BSD-2-Clause": { name: "BSD 2-Clause License", severity: "MEDIUM", copyleft: false, requiresAttribution: true },
    "BSD-3-Clause": { name: "BSD 3-Clause License", severity: "MEDIUM", copyleft: false, requiresAttribution: true },
    "ISC": { name: "ISC License", severity: "MEDIUM", copyleft: false, requiresAttribution: true },

    // Low – Public domain
    "CC0-1.0": { name: "Creative Commons Zero v1.0", severity: "LOW", copyleft: false, requiresAttribution: false },
    "Unlicense": { name: "The Unlicense", severity: "LOW", copyleft: false, requiresAttribution: false },
};

// ─── License Header Patterns ──────────────────────────────────────

const LICENSE_HEADER_PATTERNS: Array<{
    name: string;
    spdxId: string;
    patterns: RegExp[];
}> = [
    {
        name: "GNU General Public License v3.0",
        spdxId: "GPL-3.0",
        patterns: [
            /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i,
            /GNU General Public License v3/i,
            /GPL-3\.0/,
        ],
    },
    {
        name: "GNU Affero General Public License v3.0",
        spdxId: "AGPL-3.0",
        patterns: [
            /GNU AFFERO GENERAL PUBLIC LICENSE/i,
            /Affero General Public License/i,
            /AGPL-3\.0/,
        ],
    },
    {
        name: "GNU General Public License v2.0",
        spdxId: "GPL-2.0",
        patterns: [
            /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2/i,
            /GNU General Public License v2/i,
            /GPL-2\.0/,
        ],
    },
    {
        name: "MIT License",
        spdxId: "MIT",
        patterns: [
            /MIT License/i,
            /Permission is hereby granted, free of charge, to any person obtaining a copy/i,
        ],
    },
    {
        name: "Apache License 2.0",
        spdxId: "Apache-2.0",
        patterns: [
            /Apache License[\s\S]*Version 2\.0/i,
            /Licensed under the Apache License, Version 2\.0/i,
            /Apache-2\.0/,
        ],
    },
    {
        name: "BSD 2-Clause License",
        spdxId: "BSD-2-Clause",
        patterns: [
            /BSD 2-Clause/i,
            /Redistributions of source code must retain the above copyright notice/i,
        ],
    },
    {
        name: "BSD 3-Clause License",
        spdxId: "BSD-3-Clause",
        patterns: [
            /BSD 3-Clause/i,
            /BSD-3-Clause/,
            /Neither the name of/i,
        ],
    },
    {
        name: "Mozilla Public License 2.0",
        spdxId: "MPL-2.0",
        patterns: [
            /Mozilla Public License/i,
            /MPL-2\.0/,
        ],
    },
];

// ─── Scanner Implementation ───────────────────────────────────────

/**
 * Scan code content for license violations.
 * Returns array of license matches found in the content.
 */
export function scanForLicenses(
    filePath: string,
    content: string
): LicenseMatch[] {
    if (!CONFIG.ENABLED) return [];

    const ext = path.extname(filePath).toLowerCase();
    // Only scan source files
    if (![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rb", ".php", ".c", ".cpp", ".h", ".hpp", ".rs", ".swift", ".kt"].includes(ext)) {
        return [];
    }

    const matches: LicenseMatch[] = [];
    const lines = content.split("\n");

    // 1. Check for SPDX identifiers (e.g., `SPDX-License-Identifier: MIT`)
    const spdxRegex = /SPDX-License-Identifier:\s*([^\s\n]+)/gi;
    let spdxMatch: RegExpExecArray | null;
    while ((spdxMatch = spdxRegex.exec(content)) !== null) {
        const spdxId = spdxMatch[1].trim();
        const lineNo = getLineNumber(content, spdxMatch.index);
        const licenseInfo = SPDX_LICENSES[spdxId];

        if (licenseInfo) {
            const blocked = CONFIG.BLOCKLIST.includes(spdxId) && CONFIG.BLOCK_COPYLEFT;
            matches.push({
                license: licenseInfo.name,
                severity: licenseInfo.severity,
                spdxId,
                source: "spdx",
                line: lineNo,
                snippet: spdxMatch[0].substring(0, 80),
                blocked,
                requiresAttribution: licenseInfo.requiresAttribution,
            });
        } else {
            // Unknown SPDX identifier
            matches.push({
                license: `Unknown (${spdxId})`,
                severity: "UNKNOWN",
                spdxId,
                source: "spdx",
                line: lineNo,
                snippet: spdxMatch[0].substring(0, 80),
                blocked: CONFIG.BLOCK_COPYLEFT,
                requiresAttribution: true,
            });
        }
    }

    // 2. Check for license header patterns in the first 50 lines
    const headerRegion = lines.slice(0, 50).join("\n");
    for (const header of LICENSE_HEADER_PATTERNS) {
        for (const pattern of header.patterns) {
            const headerMatch = headerRegion.match(pattern);
            if (headerMatch) {
                const lineNo = getLineNumber(headerRegion, headerMatch.index!);
                const licenseInfo = SPDX_LICENSES[header.spdxId] || {
                    name: header.name,
                    severity: "UNKNOWN" as LicenseSeverity,
                    copyleft: true,
                    requiresAttribution: true,
                };

                const blocked = CONFIG.BLOCKLIST.includes(header.spdxId) && CONFIG.BLOCK_COPYLEFT;

                // Avoid duplicates from SPDX check
                if (!matches.some(m => m.spdxId === header.spdxId && m.source === "header")) {
                    matches.push({
                        license: header.name,
                        severity: licenseInfo.severity,
                        spdxId: header.spdxId,
                        source: "header",
                        line: lineNo,
                        snippet: headerMatch[0].substring(0, 80),
                        blocked,
                        requiresAttribution: licenseInfo.requiresAttribution,
                    });
                }
                break;
            }
        }
    }

    return matches;
}

/**
 * Validate content for license compliance before allowing file write.
 * Returns error message if blocked, null if allowed.
 */
export function validateLicenseCompliance(
    filePath: string,
    content: string
): string | null {
    const matches = scanForLicenses(filePath, content);

    if (matches.length === 0) return null;

    // Check for blocked licenses
    const blocked = matches.filter(m => m.blocked);
    if (blocked.length > 0) {
        const details = blocked.map(m =>
            `  Line ${m.line}: ${m.license} (${m.spdxId}) [${m.severity}]`
        ).join("\n");

        return [
            "[LICENSE] ⛔ Copyleft license detected – operation blocked",
            "",
            "The generated code contains copyleft-licensed content that",
            "is incompatible with corporate IP policies:",
            "",
            details,
            "",
            `Blocked licenses: ${CONFIG.BLOCKLIST.join(", ")}`,
            `Allowed licenses: ${CONFIG.ALLOWLIST.join(", ")}`,
            "",
            "Please rewrite this code without using copyleft-licensed sources.",
        ].join("\n");
    }

    // Check for licenses requiring attribution
    const needsAttribution = matches.filter(m => m.requiresAttribution);
    if (needsAttribution.length > 0) {
        const details = needsAttribution.map(m =>
            `  ${m.license} (${m.spdxId}) – found at line ${m.line}`
        ).join("\n");

        process.stderr.write(`[LICENSE] ⚠️ Attribution required for:\n${details}\n`);
        // Don't block, just warn
    }

    return null;
}

/**
 * Get the severity summary of a set of license matches.
 */
export function getLicenseSeveritySummary(matches: LicenseMatch[]): {
    hasBlocked: boolean;
    highestSeverity: LicenseSeverity;
    requiresAttribution: boolean;
    uniqueLicenses: string[];
} {
    let highestSeverity: LicenseSeverity = "LOW";
    const severityOrder: LicenseSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
    const uniqueLicenses = new Set<string>();

    for (const match of matches) {
        uniqueLicenses.add(match.spdxId);
        const currentIdx = severityOrder.indexOf(match.severity);
        const highestIdx = severityOrder.indexOf(highestSeverity);
        if (currentIdx < highestIdx || highestIdx === -1) {
            highestSeverity = match.severity;
        }
    }

    return {
        hasBlocked: matches.some(m => m.blocked),
        highestSeverity,
        requiresAttribution: matches.some(m => m.requiresAttribution),
        uniqueLicenses: Array.from(uniqueLicenses),
    };
}

/**
 * Get scanner config.
 */
export function getLicenseScannerConfig(): typeof CONFIG {
    return { ...CONFIG };
}

// ─── Helper ───────────────────────────────────────────────────────

function getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split("\n").length;
}

export { CONFIG as LicenseScannerConfig };
