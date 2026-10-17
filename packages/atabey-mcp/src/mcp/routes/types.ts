import fs from "fs";
import http from "http";
import { WebSocket } from "ws";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpSession } from "./index.js";

export interface RouteContext {
    serverVersion: string;
    sessions: Map<string, McpSession>;
    FRAMEWORK_DIR: string;
    PROJECT_ROOT: string;
    UI_DIST_PATH: string;
    server: Server;
    broadcastWS: (type: string, payload: unknown) => void;
    wsClients: Set<WebSocket>;
    HOST: string;
    PORT: number;
}

export function serveJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

export function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content);
        } catch (e) {
            res.writeHead(500);
            res.end((e as Error).message);
        }
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
}

/**
 * Safely reads the request body with a bounded maximum size (default: 2MB)
 * to prevent memory starvation and Denial-of-Service attacks.
 */
export function readBody(req: http.IncomingMessage, maxBytes: number = 2 * 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = "";
        let bytesRead = 0;
        req.on("data", (chunk: Buffer | string) => {
            bytesRead += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
            if (bytesRead > maxBytes) {
                req.destroy();
                reject(new Error("PAYLOAD_TOO_LARGE: Request exceeds 2MB limit"));
                return;
            }
            body += chunk.toString();
        });
        req.on("end", () => resolve(body));
        req.on("error", (err) => reject(err));
    });
}

/**
 * Safely parses JSON from incoming request body with size bounds.
 */
export async function parseJsonBody<T = Record<string, unknown>>(req: http.IncomingMessage, maxBytes?: number): Promise<T> {
    const raw = await readBody(req, maxBytes);
    if (!raw.trim()) return {} as T;
    return JSON.parse(raw) as T;
}
