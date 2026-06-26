import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSendAgentMessage } from "../../../../src/mcp/tools/messaging/send_message.js";
import { SendAgentMessageArgs } from "../../../../src/mcp/tools/types.js";
import { asAgentID, asTraceID } from "../../../../src/mcp/utils/types.js";

const TEST_DIR = path.resolve(__dirname, "../../_temp_messaging_tests");
const MESSAGES_DIR = path.join(TEST_DIR, ".gemini/messages");
const BACKEND_LOCK_FILE = path.join(MESSAGES_DIR, "backend.lock");

beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    // Write a dummy package.json to test directory to lock frameworkDir as .gemini
    const dummyPkg = {
        name: "test-pkg",
        atabey: {
            frameworkDir: ".gemini"
        }
    };
    fs.writeFileSync(path.join(TEST_DIR, "package.json"), JSON.stringify(dummyPkg, null, 2), "utf8");
});

afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Hermes Lock Protocol & Message sending", () => {
    it("should successfully send message when lock is not present", async () => {
        const args: SendAgentMessageArgs = {
            to: asAgentID("@backend"),
            from: asAgentID("@manager"),
            category: "ACTION",
            content: "Build database models",
            traceId: asTraceID("T-123"),
            priority: "HIGH",
            requiresApproval: false,
        };

        const result = await handleSendAgentMessage(TEST_DIR, args);
        expect(result.content[0].text).toContain("[OK] Message sent to @backend");

        // Verify the message file contains the sent message
        const messageFilePath = path.join(MESSAGES_DIR, "backend.json");
        expect(fs.existsSync(messageFilePath)).toBe(true);

        const content = fs.readFileSync(messageFilePath, "utf8");
        const msg = JSON.parse(content.trim());
        expect(msg.from).toBe("@manager");
        expect(msg.to).toBe("@backend");
        expect(msg.category).toBe("ACTION");
        expect(msg.content).toBe("Build database models");
        expect(msg.traceId).toBe("T-123");
        expect(msg.priority).toBe("HIGH");
        expect(msg.status).toBe("PENDING");
    });

    it("should retry and fail to send message if lock is kept busy", async () => {
        // Prepare a busy lock file
        fs.mkdirSync(MESSAGES_DIR, { recursive: true });
        fs.writeFileSync(BACKEND_LOCK_FILE, "Locked by @test at " + new Date().toISOString(), "utf8");

        const args: SendAgentMessageArgs = {
            to: asAgentID("@backend"),
            from: asAgentID("@manager"),
            category: "ACTION",
            content: "Build database models",
            traceId: asTraceID("T-123"),
            priority: "NORMAL",
            requiresApproval: false,
        };

        const startTime = Date.now();
        const result = await handleSendAgentMessage(TEST_DIR, args);
        const duration = Date.now() - startTime;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("[ERROR] Could not send message to @backend: Hermes lock is busy.");
        // Retries takes 20 attempts with 500ms delay -> duration should be at least ~9000ms
        expect(duration).toBeGreaterThanOrEqual(9000);
    }, 15000);

    it("should bypass and acquire lock if existing lock is stale (older than 10s)", async () => {
        fs.mkdirSync(MESSAGES_DIR, { recursive: true });
        // Set lock file mtime to 15 seconds ago
        fs.writeFileSync(BACKEND_LOCK_FILE, "Locked by @test at " + new Date().toISOString(), "utf8");
        const fifteenSecondsAgo = new Date(Date.now() - 15000);
        fs.utimesSync(BACKEND_LOCK_FILE, fifteenSecondsAgo, fifteenSecondsAgo);

        const args: SendAgentMessageArgs = {
            to: asAgentID("@backend"),
            from: asAgentID("@manager"),
            category: "ACTION",
            content: "Build database models",
            traceId: asTraceID("T-123"),
            priority: "NORMAL",
            requiresApproval: false,
        };

        const result = await handleSendAgentMessage(TEST_DIR, args);
        expect(result.content[0].text).toContain("[OK] Message sent to @backend");
        expect(fs.existsSync(BACKEND_LOCK_FILE)).toBe(false); // Lock should have been unlinked in finally
    });

    it("should safely resolve concurrent messages and execute them in sequence", async () => {
        const send1Promise = handleSendAgentMessage(TEST_DIR, {
            to: asAgentID("@backend"),
            from: asAgentID("@manager"),
            category: "ACTION",
            content: "Job 1",
            traceId: asTraceID("T-123"),
            priority: "NORMAL",
            requiresApproval: false,
        });

        // Delay starting the second call slightly to make sure lock is acquired by Job 1 first
        await new Promise((resolve) => setTimeout(resolve, 50));

        const send2Promise = handleSendAgentMessage(TEST_DIR, {
            to: asAgentID("@backend"),
            from: asAgentID("@frontend"),
            category: "ACTION",
            content: "Job 2",
            traceId: asTraceID("T-123"),
            priority: "NORMAL",
            requiresApproval: false,
        });

        const [res1, res2] = await Promise.all([send1Promise, send2Promise]);

        expect(res1.isError).toBeFalsy();
        expect(res2.isError).toBeFalsy();
        expect(res1.content[0].text).toContain("[OK] Message sent to @backend");
        expect(res2.content[0].text).toContain("[OK] Message sent to @backend");

        // Verify both messages exist in order in the message log file
        const messageFilePath = path.join(MESSAGES_DIR, "backend.json");
        const lines = fs.readFileSync(messageFilePath, "utf8").trim().split("\n");
        expect(lines.length).toBe(2);

        const msg1 = JSON.parse(lines[0]);
        const msg2 = JSON.parse(lines[1]);
        expect(msg1.content).toBe("Job 1");
        expect(msg2.content).toBe("Job 2");
    });
});
