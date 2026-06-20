/**
 * ─── LICENSE SCANNER TEST ─────────────────────────────────────────
 *
 * Tests the license/copyright scanner for copyleft detection.
 * Covers: SPDX detection, header patterns, blocking, attribution.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LicenseScanner", () => {
    let scanForLicenses: any;
    let validateLicenseCompliance: any;
    let getLicenseSeveritySummary: any;

    beforeEach(async () => {
        vi.resetModules();
        process.env.ATABEY_LICENSE_SCAN = "true";
        process.env.ATABEY_BLOCK_COPYLEFT = "true";

        const mod = await import("../../src/utils/license-scanner.js");
        scanForLicenses = mod.scanForLicenses;
        validateLicenseCompliance = mod.validateLicenseCompliance;
        getLicenseSeveritySummary = mod.getLicenseSeveritySummary;
    });

    describe("SPDX Identifier Detection", () => {
        it("should detect MIT SPDX identifier", () => {
            const content = "// SPDX-License-Identifier: MIT\nconst x = 1;";
            const matches = scanForLicenses("test.ts", content);
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].spdxId).toBe("MIT");
            expect(matches[0].severity).toBe("MEDIUM");
            expect(matches[0].blocked).toBe(false);
        });

        it("should detect GPL-3.0 SPDX identifier and mark as blocked", () => {
            const content = "// SPDX-License-Identifier: GPL-3.0\nconst x = 1;";
            const matches = scanForLicenses("test.ts", content);
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].spdxId).toBe("GPL-3.0");
            expect(matches[0].severity).toBe("CRITICAL");
            expect(matches[0].blocked).toBe(true);
        });

        it("should detect AGPL-3.0 as critical and blocked", () => {
            const content = "/* SPDX-License-Identifier: AGPL-3.0 */";
            const matches = scanForLicenses("test.ts", content);
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].spdxId).toBe("AGPL-3.0");
            expect(matches[0].severity).toBe("CRITICAL");
            expect(matches[0].blocked).toBe(true);
        });

        it("should detect Apache-2.0 as allowed", () => {
            const content = "// SPDX-License-Identifier: Apache-2.0";
            const matches = scanForLicenses("test.ts", content);
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].spdxId).toBe("Apache-2.0");
            expect(matches[0].blocked).toBe(false);
        });
    });

    describe("License Header Detection", () => {
        it("should detect GPL header in first 50 lines", () => {
            const content = "/*\n * This program is free software: you can redistribute it and/or modify\n * it under the terms of the GNU General Public License as published by\n * the Free Software Foundation, either version 3 of the License\n */\nconst x = 1;";
            const matches = scanForLicenses("test.ts", content);
            const gplMatch = matches.find((m: { spdxId: string }) => m.spdxId === "GPL-3.0");
            expect(gplMatch).toBeDefined();
            expect(gplMatch!.blocked).toBe(true);
        });

        it("should detect MIT header", () => {
            const content = "// MIT License\n// Permission is hereby granted, free of charge, to any person obtaining a copy\nconst x = 1;";
            const matches = scanForLicenses("test.ts", content);
            const mitMatch = matches.find((m: { spdxId: string }) => m.spdxId === "MIT");
            expect(mitMatch).toBeDefined();
            expect(mitMatch!.blocked).toBe(false);
        });
    });

    describe("File Extension Filtering", () => {
        it("should skip non-source files", () => {
            const content = "// SPDX-License-Identifier: GPL-3.0";
            const matches = scanForLicenses("README.md", content);
            expect(matches.length).toBe(0);
        });

        it("should scan TypeScript files", () => {
            const content = "// SPDX-License-Identifier: MIT";
            const matches = scanForLicenses("component.tsx", content);
            expect(matches.length).toBeGreaterThan(0);
        });

        it("should scan Python files", () => {
            const content = "# SPDX-License-Identifier: Apache-2.0";
            const matches = scanForLicenses("main.py", content);
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    describe("validateLicenseCompliance", () => {
        it("should return null for clean code", () => {
            const result = validateLicenseCompliance("test.ts", "const x = 1;");
            expect(result).toBeNull();
        });

        it("should return error for GPL code", () => {
            const result = validateLicenseCompliance("test.ts", "// SPDX-License-Identifier: GPL-3.0\nconst x = 1;");
            expect(result).not.toBeNull();
            expect(result).toContain("GPL-3.0");
            expect(result).toContain("blocked");
        });

        it("should return null for MIT code (allowed)", () => {
            const result = validateLicenseCompliance("test.ts", "// SPDX-License-Identifier: MIT\nconst x = 1;");
            expect(result).toBeNull();
        });
    });

    describe("getLicenseSeveritySummary", () => {
        it("should return hasBlocked=true for GPL matches", () => {
            const matches = [
                { spdxId: "GPL-3.0", severity: "CRITICAL", blocked: true, requiresAttribution: true },
            ];
            const summary = getLicenseSeveritySummary(matches);
            expect(summary.hasBlocked).toBe(true);
            expect(summary.highestSeverity).toBe("CRITICAL");
        });

        it("should return hasBlocked=false for MIT matches", () => {
            const matches = [
                { spdxId: "MIT", severity: "MEDIUM", blocked: false, requiresAttribution: true },
            ];
            const summary = getLicenseSeveritySummary(matches);
            expect(summary.hasBlocked).toBe(false);
            expect(summary.highestSeverity).toBe("MEDIUM");
        });

        it("should return unique licenses", () => {
            const matches = [
                { spdxId: "MIT", severity: "MEDIUM", blocked: false, requiresAttribution: true },
                { spdxId: "Apache-2.0", severity: "MEDIUM", blocked: false, requiresAttribution: true },
            ];
            const summary = getLicenseSeveritySummary(matches);
            expect(summary.uniqueLicenses).toContain("MIT");
            expect(summary.uniqueLicenses).toContain("Apache-2.0");
        });
    });
});
