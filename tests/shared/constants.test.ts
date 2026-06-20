import { describe, it, expect } from "vitest";
import {
    FRAMEWORK,
    ADAPTER_DIRS,
    NATIVE_AGENT_PATHS,
    pathJoin,
    knowledgePath,
    unifiedAdapterPath,
} from "../../src/shared/constants.js";

describe("shared/constants", () => {
    it("should define core framework directory", () => {
        expect(FRAMEWORK.CORE_DIR).toBe(".atabey");
        expect(FRAMEWORK.UNIFIED_HUB_DIR).toBe(".agents");
    });

    it("should build consistent native agent paths", () => {
        expect(NATIVE_AGENT_PATHS.gemini).toBe(pathJoin(ADAPTER_DIRS.GEMINI, "agents"));
        expect(NATIVE_AGENT_PATHS.cursor).toBe(pathJoin(ADAPTER_DIRS.CURSOR, "rules"));
    });

    it("should build knowledge and unified paths", () => {
        expect(knowledgePath("security-standards.md")).toBe(".atabey/knowledge/security-standards.md");
        expect(unifiedAdapterPath("gemini", "agents")).toBe(".agents/gemini/agents");
    });
});
