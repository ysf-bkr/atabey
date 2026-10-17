import { describe, expect, it } from "vitest";
import {
    evaluateToolCall,
    formatPolicyDenial,
    isAllowed,
} from "../src/policy-gate.js";

describe("PolicyGate.evaluateToolCall", () => {
    it("allows a normal write path for core agent", () => {
        const d = evaluateToolCall({
            tool: "write_file",
            agent: "@backend",
            tier: "core",
            args: { path: "apps/backend/src/service.ts", content: "x" },
        });
        expect(isAllowed(d)).toBe(true);
        expect(d.code).toBe("ALLOW");
    });

    it("denies path traversal", () => {
        const d = evaluateToolCall({
            tool: "write_file",
            agent: "@backend",
            tier: "core",
            args: { path: "../../.ssh/authorized_keys", content: "x" },
        });
        expect(isAllowed(d)).toBe(false);
        expect(d.code).toBe("DENY_PATH_TRAVERSAL");
        expect(formatPolicyDenial(d)).toContain("POLICY_GATE");
    });

    it("denies protected .env writes", () => {
        const d = evaluateToolCall({
            tool: "replace_text",
            agent: "@backend",
            tier: "core",
            args: { path: ".env", oldText: "a", newText: "b" },
        });
        expect(isAllowed(d)).toBe(false);
        expect(d.code).toBe("DENY_PROTECTED_PATH");
    });

    it("denies recon mutating tools", () => {
        const d = evaluateToolCall({
            tool: "write_file",
            agent: "@explorer",
            tier: "recon",
            args: { path: "apps/web/a.ts", content: "x" },
        });
        expect(isAllowed(d)).toBe(false);
        expect(d.code).toBe("DENY_RECON_MUTATION");
    });

    it("denies shell metacharacters", () => {
        const d = evaluateToolCall({
            tool: "run_shell_command",
            agent: "@backend",
            tier: "core",
            args: { command: "git status && rm -rf /" },
        });
        expect(isAllowed(d)).toBe(false);
        expect(d.code).toBe("DENY_SHELL_METACHAR");
    });

    it("allows non-mutating tools without path checks for empty args", () => {
        const d = evaluateToolCall({
            tool: "get_framework_status",
            agent: "@manager",
            tier: "supreme",
            args: {},
        });
        expect(isAllowed(d)).toBe(true);
    });

    it("denies absolute system paths on mutate", () => {
        const d = evaluateToolCall({
            tool: "write_file",
            agent: "@backend",
            tier: "core",
            args: { path: "/etc/passwd", content: "x" },
        });
        expect(isAllowed(d)).toBe(false);
        expect(d.code).toBe("DENY_ABSOLUTE_ESCAPE");
    });
});
