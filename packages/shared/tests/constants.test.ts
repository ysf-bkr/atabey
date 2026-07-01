import { describe, it, expect } from "vitest";
import {
    FRAMEWORK,
    ADAPTER_DIRS,
    DEFAULT_CONSUMER_PATHS,
    FRAMEWORK_MONOREPO_PATHS,
    NATIVE_AGENT_PATHS,
    pathJoin,
    knowledgePath,
    unifiedAdapterPath,
} from "../src/constants.js";

describe("shared/constants", () => {
    it("should define core framework directory", () => {
        expect(FRAMEWORK.CORE_DIR).toBe(".atabey");
        expect(FRAMEWORK.UNIFIED_HUB_DIR).toBe(".agents");
    });

    it("should build consistent native agent paths", () => {
        expect(NATIVE_AGENT_PATHS.gemini).toBe(pathJoin(ADAPTER_DIRS.GEMINI, "agents"));
        expect(NATIVE_AGENT_PATHS.cursor).toBe(pathJoin(ADAPTER_DIRS.CURSOR, "rules"));
    });

    it("should separate consumer vs framework monorepo paths", () => {
        expect(DEFAULT_CONSUMER_PATHS.backend).toBe("apps/backend");
        expect(FRAMEWORK_MONOREPO_PATHS.backend).toBe("packages/atabey");
        expect(FRAMEWORK_MONOREPO_PATHS.frontend).toBe("packages/atabey-mcp/dashboard");
    });

    it("should build knowledge and unified paths", () => {
        expect(knowledgePath("security-standards.md")).toBe(".atabey/knowledge/security-standards.md");
        expect(unifiedAdapterPath("gemini", "agents")).toBe(".agents/gemini/agents");
    });
});
