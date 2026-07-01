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
