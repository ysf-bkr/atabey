import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawn } from "child_process";
import { safePath } from "atabey-mcp/utils/security.js";
import { verifyReadPermission, verifyWritePermission } from "atabey-mcp/utils/permissions.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { DecompressFilesArgs, ToolResult } from "../types.js";

export function handleDecompressFiles(projectRoot: string, args: DecompressFilesArgs): Promise<ToolResult> {
    if (!args.archivePath || !args.outputPath) {
        const err = "Missing 'archivePath' or 'outputPath' argument.";
        Metrics.logError(projectRoot, "@mcp", "decompress_files", err);
        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
    }

    try {
        const archiveFilePath = safePath(projectRoot, args.archivePath);
        const outputFilePath = safePath(projectRoot, args.outputPath);

        // ENFORCE PERMISSION MATRIX
        verifyReadPermission(projectRoot, args.archivePath);
        verifyWritePermission(projectRoot, args.outputPath);

        if (!fs.existsSync(archiveFilePath)) {
            const err = `Archive path not found: ${args.archivePath}`;
            Metrics.logError(projectRoot, "@mcp", "decompress_files", err);
            return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
        }

        // Auto-detect format if not explicitly provided
        let format = args.format;
        if (!format) {
            const lower = args.archivePath.toLowerCase();
            if (lower.endsWith(".zip")) {
                format = "zip";
            } else if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".tar")) {
                format = "tar";
            } else if (lower.endsWith(".gz")) {
                format = "gzip";
            } else {
                const err = "Could not auto-detect archive format. Please specify 'format' explicitly.";
                Metrics.logError(projectRoot, "@mcp", "decompress_files", err);
                return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
            }
        }

        const relativeArchive = path.relative(projectRoot, archiveFilePath);
        const relativeOutput = path.relative(projectRoot, outputFilePath);

        if (format === "gzip") {
            const parentDir = path.dirname(outputFilePath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }

            const input = fs.readFileSync(archiveFilePath);
            const decompressed = zlib.gunzipSync(input);
            fs.writeFileSync(outputFilePath, decompressed);

            Metrics.logUsage(projectRoot, "@mcp", `decompress_files:gzip ${args.archivePath}`, 100);
            return Promise.resolve({
                content: [{ type: "text", text: `[OK] File decompressed successfully with gzip to ${args.outputPath}` }]
            });
        }

        if (format === "zip") {
            return new Promise((resolve) => {
                // Ensure output directory exists before unzipping
                if (!fs.existsSync(outputFilePath)) {
                    fs.mkdirSync(outputFilePath, { recursive: true });
                }

                const child = spawn("unzip", ["-o", relativeArchive, "-d", relativeOutput], {
                    cwd: projectRoot,
                    shell: false,
                    stdio: ["ignore", "ignore", "pipe"],
                });

                let stderr = "";

                child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

                child.on("error", (err) => {
                    const errorMsg = `Failed to start unzip command: ${err.message}`;
                    Metrics.logError(projectRoot, "@mcp", "decompress_files", errorMsg);
                    resolve({
                        content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                        isError: true,
                    });
                });

                child.on("close", (code) => {
                    if (code !== 0) {
                        const errorMsg = `unzip command failed with exit code ${code}. Stderr: ${stderr}`;
                        Metrics.logError(projectRoot, "@mcp", "decompress_files", errorMsg);
                        resolve({
                            content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                            isError: true,
                        });
                        return;
                    }

                    Metrics.logUsage(projectRoot, "@mcp", `decompress_files:zip ${args.archivePath}`, 200);
                    resolve({
                        content: [{ type: "text", text: `[OK] Decompressed successfully with unzip to ${args.outputPath}` }]
                    });
                });
            });
        }

        if (format === "tar") {
            return new Promise((resolve) => {
                // Ensure output directory exists
                if (!fs.existsSync(outputFilePath)) {
                    fs.mkdirSync(outputFilePath, { recursive: true });
                }

                const child = spawn("tar", ["-xzf", relativeArchive, "-C", relativeOutput], {
                    cwd: projectRoot,
                    shell: false,
                    stdio: ["ignore", "ignore", "pipe"],
                });

                let stderr = "";

                child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

                child.on("error", (err) => {
                    const errorMsg = `Failed to start tar command: ${err.message}`;
                    Metrics.logError(projectRoot, "@mcp", "decompress_files", errorMsg);
                    resolve({
                        content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                        isError: true,
                    });
                });

                child.on("close", (code) => {
                    if (code !== 0) {
                        const errorMsg = `tar command failed with exit code ${code}. Stderr: ${stderr}`;
                        Metrics.logError(projectRoot, "@mcp", "decompress_files", errorMsg);
                        resolve({
                            content: [{ type: "text", text: `[ERROR] ${errorMsg}` }],
                            isError: true,
                        });
                        return;
                    }

                    Metrics.logUsage(projectRoot, "@mcp", `decompress_files:tar ${args.archivePath}`, 200);
                    resolve({
                        content: [{ type: "text", text: `[OK] Decompressed successfully with tar to ${args.outputPath}` }]
                    });
                });
            });
        }

        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] Unsupported format: ${format}` }] });
    } catch (e) {
        const err = `Failed to decompress files: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", "decompress_files", err);
        return Promise.resolve({ isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] });
    }
}
