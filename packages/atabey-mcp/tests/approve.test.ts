import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { approveCommand } from "../src/cli/commands/approve.js";
import { UI } from "../src/cli/utils/ui.js";
import { ValidationError } from "../src/shared/errors.js";

describe("Approve Command", () => {
    let tempDir: string;
    let messagesDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-approve-test-"));
        messagesDir = path.join(tempDir, "messages");
        process.env.ATABEY_TEST_DIR = tempDir;
        
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        
        // Mock UI to spy on output
        vi.spyOn(UI, "success").mockImplementation(() => {});
        vi.spyOn(UI, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should exit with error if messages directory does not exist", async () => {
        vi.spyOn(UI, "error");

        await expect(approveCommand("trace-123")).rejects.toThrow(ValidationError);
    });

    it("should successfully approve pending ACTION/ALERT message", async () => {
        fs.mkdirSync(messagesDir, { recursive: true });

        const message = {
            timestamp: new Date().toISOString(),
            from: "@manager",
            to: "@coder",
            category: "ACTION",
            content: "Do something",
            traceId: "trace-123",
            status: "PENDING"
        };
        const msgFilePath = path.join(messagesDir, "msg.json");
        fs.writeFileSync(msgFilePath, JSON.stringify(message) + "\n");

        const uiSuccessSpy = vi.spyOn(UI, "success");

        await approveCommand("trace-123");

        const fileContent = fs.readFileSync(msgFilePath, "utf8");
        const parsed = JSON.parse(fileContent.trim());
        expect(parsed.status).toBe("APPROVED");

        expect(uiSuccessSpy).toHaveBeenCalledWith(expect.stringContaining("Approved message"));
    });
});
