import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleHttpProxyRequest } from "../../../../src/mcp/tools/network/http_proxy.js";
import { ToolArgs } from "../../../../src/mcp/tools/types.js";

let server: http.Server;
let serverPort: number;
let TEST_DIR: string;
let requestCount = 0;

beforeAll(() => {
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "http-proxy-test-"));
    fs.mkdirSync(path.join(TEST_DIR, ".atabey"));

    server = http.createServer((req, res) => {
        requestCount++;
        if (req.url === "/pii") {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Contact me at user@test.com or call +90 532 123 45 67");
        } else if (req.url === "/post" && req.method === "POST") {
            let body = "";
            req.on("data", chunk => { body += chunk; });
            req.on("end", () => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ received: body }));
            });
        } else if (req.url === "/html") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
                <html>
                    <head>
                        <title>Documentation</title>
                        <style>body { color: red; }</style>
                        <script>console.log("hello");</script>
                    </head>
                    <body>
                        <nav><a href="/">Home</a></nav>
                        <h1>Docs Header</h1>
                        <p>Main content paragraphs.</p>
                        <footer>Copyright 2026</footer>
                    </body>
                </html>
            `);
        } else if (req.url === "/error") {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        } else {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("hello world");
        }
    });

    return new Promise<void>((resolve) => {
        server.listen(0, () => {
            const address = server.address();
            serverPort = typeof address === "string" ? 0 : address?.port || 0;
            resolve();
        });
    });
});

afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    return new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
});

describe("HTTP Proxy Request Tool", () => {
    it("should successfully execute a GET request", async () => {
        const args: ToolArgs = {
            url: `http://localhost:${serverPort}/`,
            method: "GET"
        };

        const result = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe("hello world");
    });

    it("should successfully execute a POST request with body", async () => {
        const args: ToolArgs = {
            url: `http://localhost:${serverPort}/post`,
            method: "POST",
            body: "test body content"
        };

        const result = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(result.isError).toBeUndefined();
        const json = JSON.parse(result.content[0].text);
        expect(json.received).toBe("test body content");
    });

    it("should automatically mask PII in the response", async () => {
        const args: ToolArgs = {
            url: `http://localhost:${serverPort}/pii`,
            method: "GET"
        };

        const result = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(result.isError).toBeUndefined();
        const output = result.content[0].text;
        expect(output).toContain("***@***");
        expect(output).toContain("***-***-****");
        expect(output).not.toContain("user@test.com");
        expect(output).not.toContain("+90 532 123 45 67");
    });

    it("should return isError when target returns 500 status", async () => {
        const args: ToolArgs = {
            url: `http://localhost:${serverPort}/error`,
            method: "GET"
        };

        const result = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("failed with status 500");
    });

    it("should strip HTML markup and scripts for token economy", async () => {
        const args: ToolArgs = {
            url: `http://localhost:${serverPort}/html`,
            method: "GET"
        };

        const result = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(result.isError).toBeUndefined();
        const output = result.content[0].text;
        
        // Should contain main text content
        expect(output).toContain("Docs Header");
        expect(output).toContain("Main content paragraphs.");

        // Should NOT contain boilerplate markup, script content, nav or style rules
        expect(output).not.toContain("<p>");
        expect(output).not.toContain("<style>");
        expect(output).not.toContain("console.log");
        expect(output).not.toContain("Copyright 2026"); // footer should be removed
        expect(output).not.toContain("Home"); // nav should be removed
    });

    it("should cache subsequent GET requests to save tokens and latency", async () => {
        const url = `http://localhost:${serverPort}/cache-test`;
        const args: ToolArgs = {
            url,
            method: "GET"
        };

        // First request: goes to server
        requestCount = 0;
        const res1 = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(res1.isError).toBeUndefined();
        expect(requestCount).toBe(1);

        // Second request: should hit cache
        const res2 = await handleHttpProxyRequest(TEST_DIR, args as any);
        expect(res2.isError).toBeUndefined();
        expect(res2.content[0].text).toContain("Cached Response");
        expect(requestCount).toBe(1); // Server request count remains 1
    });

    it("should block requests when rate limit is exceeded", async () => {
        // Since rate limit is 50 requests per window, we loop 60 times to trigger it
        let limitTriggered = false;
        let lastResult: any;

        for (let i = 0; i < 60; i++) {
            const args: ToolArgs = {
                url: `http://localhost:${serverPort}/rate-test-${i}`,
                method: "GET"
            };
            lastResult = await handleHttpProxyRequest(TEST_DIR, args as any);
            if (lastResult.isError && lastResult.content[0].text.includes("Rate limit exceeded")) {
                limitTriggered = true;
                break;
            }
        }

        expect(limitTriggered).toBe(true);
        expect(lastResult.content[0].text).toContain("Rate limit exceeded");
    });
});
