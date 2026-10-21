/**
 * API Catalog — endpoint registry, route/OpenAPI scanner, and drift detection.
 *
 * Purpose: let frontend/mobile agents integrate against the backend API using
 * a compact JSON catalog instead of reading large route source files (token
 * savings + zero context pollution).
 *
 * The scanner is HEURISTIC (regex/AST-lite) and covers:
 *   - Express / Fastify:  app|router|server|fastify.get('/path', ...)
 *   - Fastify route():    fastify.route({ method, url, ... })
 *   - NestJS decorators:  @Get('path') / @Post('path')
 *   - OpenAPI v3 / Swagger v2 JSON specs
 */

import fs from "fs";
import path from "path";

export interface ApiEndpoint {
    method: string;                 // GET | POST | PUT | PATCH | DELETE | ...
    path: string;                   // e.g. /api/v1/auth/login
    tag?: string;                   // group/category (OpenAPI tag or first path segment)
    summary?: string;
    authRequired: boolean;          // heuristic for code; explicit for OpenAPI security
    requestSchema?: string;         // schema name / $ref / JSON summary
    responseSchema?: string;
    source?: string;                // file or "openapi" origin
    updatedAt: string;              // ISO-8601
}

export interface ApiCatalog {
    version: 1;
    generatedAt: string;
    endpoints: ApiEndpoint[];
}

export interface ApiDrift {
    added: ApiEndpoint[];
    removed: ApiEndpoint[];
    changed: Array<{ previous: ApiEndpoint; current: ApiEndpoint }>;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
const ROUTE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", ".atabey", ".next"]);

export function endpointKey(e: { method: string; path: string }): string {
    return `${e.method.toUpperCase()} ${normalizePath(e.path)}`;
}

export function normalizePath(p: string): string {
    if (!p) return "/";
    let out = p.trim();
    if (!out.startsWith("/")) out = `/${out}`;
    // Collapse :param and {param} to a stable placeholder for drift comparison.
    out = out.replace(/\{[^}]+\}/g, ":param").replace(/:[A-Za-z0-9_]+/g, ":param");
    out = out.replace(/\/+$/, "");
    return out || "/";
}

function defaultTag(p: string): string {
    const seg = p.split("/").filter(Boolean);
    return seg[0] || "root";
}

/** Extract a route statement plus a few following lines for schema hints. */
function scanRouteSource(filePath: string, content: string): ApiEndpoint[] {
    const now = new Date().toISOString();
    const lines = content.split("\n");
    const found = new Map<string, ApiEndpoint>();

    const add = (method: string, rawPath: string, schemaHint: string, authHint: boolean) => {
        if (!rawPath || rawPath === "*") return;
        const m = method.toUpperCase();
        const p = rawPath;
        const key = endpointKey({ method: m, path: p });
        if (found.has(key)) return;
        const schemaMatch = /(?:schema|body|response)\s*:\s*([A-Za-z0-9_.]+)/.exec(schemaHint);
        found.set(key, {
            method: m,
            path: p.startsWith("/") ? p : `/${p}`,
            tag: defaultTag(p),
            authRequired: authHint,
            requestSchema: schemaMatch?.[1],
            source: filePath,
            updatedAt: now,
        });
    };

    const isRouteLine = (l: string) =>
        /\.(get|post|put|patch|delete|options|head)\s*\(/.test(l) ||
        /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(/.test(l) ||
        /\broute\s*\(/.test(l);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Statement-bounded window: stop at the next route line or statement end
        // so schema/auth hints cannot bleed into the following route.
        let window = line;
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
            if (isRouteLine(lines[j])) break;
            window += `\n${lines[j]}`;
            if (/;\s*$/.test(lines[j])) break;
        }
        const authHint = /\b(authenticate|authGuard|verifyToken|preHandler\s*:\s*\[?\s*auth|requireAuth|jwt)\b/i.test(window);

        // Express / Fastify shorthand: app.get('/x', ...) / router.post("/x", ...)
        const short = /\.(get|post|put|patch|delete|options|head)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
        let m: RegExpExecArray | null;
        while ((m = short.exec(line)) !== null) {
            add(m[1], m[2], window, authHint);
        }

        // Fastify route({ method: 'GET', url: '/x' }) — method/url may be in either order.
        if (/\broute\s*\(/.test(line) || /\burl\s*:/.test(line)) {
            const methodM = /method\s*:\s*[`'"](\w+)[`'"]/i.exec(window);
            const urlM = /url\s*:\s*[`'"]([^`'"]+)[`'"]/i.exec(window);
            if (methodM && urlM) add(methodM[1], urlM[1], window, authHint);
        }

        // NestJS decorators: @Get('path') @Post()
        const dec = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*[`'"]?([^`'")]*)[`'"]?\s*\)/g;
        while ((m = dec.exec(line)) !== null) {
            add(m[1], m[2] || "/", window, authHint);
        }
    }

    return [...found.values()];
}

/** Parse an OpenAPI v3 or Swagger v2 spec object into endpoints. */
export function parseOpenApiSpec(spec: unknown): ApiEndpoint[] {
    const now = new Date().toISOString();
    const doc = spec as Record<string, unknown> | null;
    const paths = doc?.["paths"] as Record<string, Record<string, unknown>> | undefined;
    if (!paths || typeof paths !== "object") return [];

    const out: ApiEndpoint[] = [];
    for (const [rawPath, item] of Object.entries(paths)) {
        if (!item || typeof item !== "object") continue;
        for (const method of HTTP_METHODS) {
            const op = item[method] as Record<string, unknown> | undefined;
            if (!op) continue;
            const tags = Array.isArray(op["tags"]) ? (op["tags"] as string[]) : [];
            const security = op["security"];
            const requestSchema =
                refName(((op["requestBody"] as Record<string, unknown>)?.["content"] as Record<string, unknown>)?.["application/json"]) ??
                refName(op["parameters"]);
            const responses = op["responses"] as Record<string, Record<string, unknown>> | undefined;
            const okResp = responses?.["200"] ?? responses?.["201"] ?? Object.values(responses || {})[0];
            const responseSchema = refName(
                ((okResp?.["content"] as Record<string, unknown>)?.["application/json"]) ?? okResp?.["schema"],
            );
            out.push({
                method: method.toUpperCase(),
                path: rawPath,
                tag: tags[0] || defaultTag(rawPath),
                summary: typeof op["summary"] === "string" ? (op["summary"] as string) : undefined,
                authRequired: Array.isArray(security) ? security.length > 0 : false,
                requestSchema,
                responseSchema,
                source: "openapi",
                updatedAt: now,
            });
        }
    }
    return out;
}

function refName(node: unknown): string | undefined {
    if (!node || typeof node !== "object") return undefined;
    const obj = node as Record<string, unknown>;
    if (typeof obj["$ref"] === "string") return obj["$ref"];
    if (typeof obj["title"] === "string") return obj["title"] as string;
    const schema = obj["schema"];
    if (schema && typeof schema === "object") {
        const s = schema as Record<string, unknown>;
        if (typeof s["$ref"] === "string") return s["$ref"] as string;
        if (typeof s["title"] === "string") return s["title"] as string;
    }
    return undefined;
}

/**
 * Walk a project tree and collect endpoints from route source files and any
 * OpenAPI/Swagger JSON specs.
 */
export function scanProjectForEndpoints(rootDir: string, options: { maxFiles?: number } = {}): ApiEndpoint[] {
    const maxFiles = options.maxFiles ?? 5000;
    const results: ApiEndpoint[] = [];
    let visited = 0;

    const walk = (dir: string) => {
        if (visited >= maxFiles) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (visited >= maxFiles) return;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                walk(full);
            } else if (entry.isFile()) {
                visited++;
                const ext = path.extname(entry.name).toLowerCase();
                try {
                    if (ext === ".json" && /openapi|swagger/i.test(entry.name)) {
                        const spec = JSON.parse(fs.readFileSync(full, "utf8"));
                        results.push(...parseOpenApiSpec(spec));
                    } else if (ROUTE_EXTENSIONS.has(ext)) {
                        const content = fs.readFileSync(full, "utf8");
                        if (/\.(get|post|put|patch|delete)\(|@(Get|Post|Put|Patch|Delete)\(|\broute\(/.test(content)) {
                            results.push(...scanRouteSource(path.relative(rootDir, full), content));
                        }
                    }
                } catch {
                    /* skip unreadable files */
                }
            }
        }
    };

    walk(rootDir);
    return dedupe(results);
}

export function dedupe(endpoints: ApiEndpoint[]): ApiEndpoint[] {
    const map = new Map<string, ApiEndpoint>();
    for (const e of endpoints) {
        const key = endpointKey(e);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, e);
        } else {
            // Prefer the record with richer schema info.
            map.set(key, {
                ...existing,
                requestSchema: existing.requestSchema ?? e.requestSchema,
                responseSchema: existing.responseSchema ?? e.responseSchema,
                authRequired: existing.authRequired || e.authRequired,
            });
        }
    }
    return [...map.values()].sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
}

/**
 * Diff a previous catalog against a freshly scanned one.
 */
export function detectApiDrift(previous: ApiEndpoint[], current: ApiEndpoint[]): ApiDrift {
    const prevMap = new Map(previous.map((e) => [endpointKey(e), e]));
    const curMap = new Map(current.map((e) => [endpointKey(e), e]));

    const added: ApiEndpoint[] = [];
    const removed: ApiEndpoint[] = [];
    const changed: Array<{ previous: ApiEndpoint; current: ApiEndpoint }> = [];

    for (const [key, cur] of curMap) {
        const prev = prevMap.get(key);
        if (!prev) {
            added.push(cur);
            continue;
        }
        if (
            (prev.requestSchema ?? "") !== (cur.requestSchema ?? "") ||
            (prev.responseSchema ?? "") !== (cur.responseSchema ?? "") ||
            prev.authRequired !== cur.authRequired
        ) {
            changed.push({ previous: prev, current: cur });
        }
    }
    for (const [key, prev] of prevMap) {
        if (!curMap.has(key)) removed.push(prev);
    }

    return { added, removed, changed };
}

export function isApiDriftClean(drift: ApiDrift): boolean {
    return drift.added.length === 0 && drift.removed.length === 0 && drift.changed.length === 0;
}
