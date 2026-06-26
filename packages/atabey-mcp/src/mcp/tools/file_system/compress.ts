import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawn } from "child_process";
import { safePath } from "atabey-mcp/utils/security.js";
import { verifyReadPermission, verifyWritePermission } from "atabey-mcp/utils/permissions.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { CompressFilesArgs, ToolResult } from "../types.js";

export function handleCompressFiles(projectRoot: string, args: CompressFilesArgs): Promise<ToolResult> {
    if (!args.sourcePath || !args.outputPath || !args.format) {
        const err = "Missing 'sourcePath', 'outputPath' or 'format' argument.";
        Metrics.logError(projectRoot, "@mcp", "compress_files", err);
        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
    }

    try {
        const sourceFilePath = safePath(projectRoot, args.sourcePath);
        const outputFilePath = safePath(projectRoot, args.outputPath);

        // ENFORCE PERMISSION MATRIX
        verifyReadPermission(projectRoot, args.sourcePath);
        verifyWritePermission(projectRoot, args.outputPath);

        if (!fs.existsSync(sourceFilePath)) {
            const err = `Source path not found: ${args.sourcePath}`;
            Metrics.logError(projectRoot, "@mcp", "compress_files", err);
            return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
        }

        // Create output parent directory if it doesn't exist
        const parentDir = path.dirname(outputFilePath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        const relativeSource = path.relative(projectRoot, sourceFilePath);
        const relativeOutput = path.relative(projectRoot, outputFilePath);

        if (args.format === "gzip") {
            const stats = fs.statSync(sourceFilePath);
            if (stats.isDirectory()) {
                const err = "gzip format only supports single files. For directories, please use zip or tar.";
                Metrics.logError(projectRoot, "@mcp", "compress_files", err);
                return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
            }

            const input = fs.readFileSync(sourceFilePath);
            const compressed = zlib.gzipSync(input);
            fs.writeFileSync(outputFilePath, compressed);

            Metrics.logUsage(projectRoot, "@mcp", `compress_files:gzip ${args.sourcePath}`, 100);
            return Promise.resolve({
                content: [{ type: "text", text: `[OK] File compressed successfully with gzip to ${args.outputPath}` }]
            });
        }

        if (args.format === "zip") {
            return new Promise((resolve) => {
                const child = spawn("zip", ["-r", relativeOutput, relativeSource], {
                    cwd: projectRoot,
                    shell: false,
                    stdio: ["ignore", "ignore", "pipe"],
                });

                let stderr = "";

                child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

                child.on("error", (err) => {
                    const errorMsg = `Failed to start zip command: ${err.message}`;
                    Metrics.logError(projectRoot, "@mcp", "compress_files", errorMsg);
                    resolve({
                        content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                        isError: true,
                    });
                });

                child.on("close", (code) => {
                    if (code !== 0) {
                        const errorMsg = `zip command failed with exit code ${code}. Stderr: ${stderr}`;
                        Metrics.logError(projectRoot, "@mcp", "compress_files", errorMsg);
                        resolve({
                            content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                            isError: true,
                        });
                        return;
                    }

                    Metrics.logUsage(projectRoot, "@mcp", `compress_files:zip ${args.sourcePath}`, 200);
                    resolve({
                        content: [{ type: "text", text: `[OK] Compressed successfully with zip to ${args.outputPath}` }]
                    });
                });
            });
        }

        if (args.format === "tar") {
            return new Promise((resolve) => {
                const child = spawn("tar", ["-czf", relativeOutput, relativeSource], {
                    cwd: projectRoot,
                    shell: false,
                    stdio: ["ignore", "ignore", "pipe"],
                });

                let stderr = "";

                child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

                child.on("error", (err) => {
                    const errorMsg = `Failed to start tar command: ${err.message}`;
                    Metrics.logError(projectRoot, "@mcp", "compress_files", errorMsg);
                    resolve({
                        content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                        isError: true,
                    });
                });

                child.on("close", (code) => {
                    if (code !== 0) {
                        const errorMsg = `tar command failed with exit code ${code}. Stderr: ${stderr}`;
                        Metrics.logError(projectRoot, "@mcp", "compress_files", errorMsg);
                        resolve({
                            content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                            isError: true,
                        });
                        return;
                    }

                    Metrics.logUsage(projectRoot, "@mcp", `compress_files:tar ${args.sourcePath}`, 200);
                    resolve({
                        content: [{ type: "text", text: `[OK] Compressed successfully with tar to ${args.outputPath}` }]
                    });
                });
            });
        }

        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] Unsupported format: ${args.format}` }] });
    } catch (e) {
        const err = `Failed to compress files: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", "compress_files", err);
        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
    }
}
