import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { logger, LogLevel, EnterpriseLogger } from "../src/shared/logger.js";
import { createTestDir, removeTestDir } from "./helpers/temp-dir.js";

describe("EnterpriseLogger", () => {
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
    let tempDir: string;
    let tempLogFile: string;

    beforeEach(() => {
        tempDir = createTestDir("logger-");
        tempLogFile = path.join(tempDir, "test.log");
        stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        // Reset configure defaults
        logger.configure({
            minLevel: LogLevel.DEBUG,
            enableColors: false,
            jsonFormat: false,
            logFile: undefined
        });
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        stderrWriteSpy.mockRestore();
        removeTestDir(tempDir);
    });

    it("should be a singleton instance", () => {
        const anotherInstance = EnterpriseLogger.getInstance();
        expect(logger).toBe(anotherInstance);
    });

    it("should respect minLevel configuration", () => {
        logger.configure({ minLevel: LogLevel.WARN });
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warn message");

        expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
        expect(stdoutWriteSpy.mock.calls[0][0]).toContain("[WARN ]");
    });

    it("should write normal levels (DEBUG, INFO, WARN) to stdout", () => {
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warn message");

        expect(stdoutWriteSpy).toHaveBeenCalledTimes(3);
        expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it("should write ERROR and FATAL levels to stderr", () => {
        logger.error("Error message");
        logger.fatal("Fatal message");

        expect(stderrWriteSpy).toHaveBeenCalledTimes(2);
        expect(stdoutWriteSpy).not.toHaveBeenCalled();
        expect(stderrWriteSpy.mock.calls[0][0]).toContain("[ERROR]");
        expect(stderrWriteSpy.mock.calls[1][0]).toContain("[FATAL]");
    });

    it("should output JSON format when configured", () => {
        logger.configure({ jsonFormat: true });
        logger.info("Hello JSON", { userId: 123 });

        expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
        const logContent = stdoutWriteSpy.mock.calls[0][0].trim();
        const parsed = JSON.parse(logContent);
        
        expect(parsed.level).toBe("INFO");
        expect(parsed.message).toBe("Hello JSON");
        expect(parsed.meta).toEqual({ userId: 123 });
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.pid).toBe(process.pid);
    });

    it("should write to file when logFile is configured", () => {
        logger.configure({ logFile: tempLogFile });
        logger.info("File log message");

        expect(fs.existsSync(tempLogFile)).toBe(true);
        const fileContent = fs.readFileSync(tempLogFile, "utf8");
        expect(fileContent).toContain("[INFO ]");
        expect(fileContent).toContain("File log message");
    });

    it("should handle error when log directory fails to be created", () => {
        const invalidLogPath = "/root/invalid-path/test.log";
        logger.configure({ logFile: invalidLogPath });
        
        expect(stderrWriteSpy).toHaveBeenCalled();
        expect(stderrWriteSpy.mock.calls[0][0]).toContain("[Logger] Failed to create log directory");
    });
});
