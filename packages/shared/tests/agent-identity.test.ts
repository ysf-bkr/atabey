import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    decodeAgentToken,
    isAgentIdentityEnforced,
    signAgentToken,
    verifyAgentToken,
} from "../src/modules/agent/agent-identity.js";

describe("agent identity (signed tokens)", () => {
    beforeEach(() => {
        process.env.ATABEY_AGENT_SECRET = "unit-test-agent-secret";
    });
    afterEach(() => {
        delete process.env.ATABEY_AGENT_SECRET;
        delete process.env.ATABEY_AGENT_IDENTITY_REQUIRED;
    });

    it("signs and verifies a token round-trip", () => {
        const token = signAgentToken("@manager");
        const res = verifyAgentToken(token);
        expect(res.valid).toBe(true);
        expect(res.agent).toBe("@manager");
    });

    it("rejects a tampered agent name", () => {
        const token = signAgentToken("@backend");
        const parts = token.split(".");
        parts[0] = "manager"; // forge identity
        const res = verifyAgentToken(parts.join("."));
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/signature/i);
    });

    it("rejects an expired token", () => {
        const token = signAgentToken("@security", { ttlMs: -1000 });
        const res = verifyAgentToken(token);
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/expired/i);
    });

    it("rejects a token signed with a different key", () => {
        const token = signAgentToken("@git", { key: "other-secret" });
        const res = verifyAgentToken(token, { key: "unit-test-agent-secret" });
        expect(res.valid).toBe(false);
    });

    it("exposes enforcement flag and decode helper", () => {
        expect(isAgentIdentityEnforced()).toBe(false);
        process.env.ATABEY_AGENT_IDENTITY_REQUIRED = "true";
        expect(isAgentIdentityEnforced()).toBe(true);
        const decoded = decodeAgentToken(signAgentToken("@explorer"));
        expect(decoded?.agent).toBe("@explorer");
    });
});
