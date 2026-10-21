/**
 * API endpoint registry (contract drift detection source).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import type { ApiEndpoint } from "../agent/api-catalog.js";
import { StorageIntegrity } from "./integrity.js";

export class StorageApiCatalog extends StorageIntegrity {
    public static saveApiEndpoint(endpoint: ApiEndpoint): void {
        this.getDB().prepare(`
            INSERT INTO api_endpoints (method, path, tag, summary, auth_required, request_schema, response_schema, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(method, path) DO UPDATE SET
                tag = excluded.tag,
                summary = excluded.summary,
                auth_required = excluded.auth_required,
                request_schema = excluded.request_schema,
                response_schema = excluded.response_schema,
                source = excluded.source,
                updated_at = excluded.updated_at
        `).run(
            endpoint.method.toUpperCase(),
            endpoint.path,
            endpoint.tag ?? null,
            endpoint.summary ?? null,
            endpoint.authRequired ? 1 : 0,
            endpoint.requestSchema ?? null,
            endpoint.responseSchema ?? null,
            endpoint.source ?? null,
            endpoint.updatedAt || new Date().toISOString(),
        );
    }

    public static getApiEndpoints(filter: { tag?: string; method?: string; search?: string } = {}): ApiEndpoint[] {
        const conditions: string[] = [];
        const params: string[] = [];
        if (filter.tag) { conditions.push("tag = ?"); params.push(filter.tag); }
        if (filter.method) { conditions.push("method = ?"); params.push(filter.method.toUpperCase()); }
        if (filter.search) {
            conditions.push("(LOWER(path) LIKE ? OR LOWER(request_schema) LIKE ? OR LOWER(response_schema) LIKE ? OR LOWER(summary) LIKE ?)");
            const like = `%${filter.search.toLowerCase()}%`;
            params.push(like, like, like, like);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const rows = this.getDB().prepare(
            `SELECT method, path, tag, summary, auth_required, request_schema, response_schema, source, updated_at
             FROM api_endpoints ${where} ORDER BY path ASC, method ASC`,
        ).all(...params) as Array<Record<string, unknown>>;
        return rows.map((r) => this.rowToApiEndpoint(r));
    }

    public static findApiEndpoint(pathQuery: string, method?: string): ApiEndpoint[] {
        const conditions = ["path = ?"];
        const params: string[] = [pathQuery];
        if (method) { conditions.push("method = ?"); params.push(method.toUpperCase()); }
        let rows = this.getDB().prepare(
            `SELECT method, path, tag, summary, auth_required, request_schema, response_schema, source, updated_at
             FROM api_endpoints WHERE ${conditions.join(" AND ")}`,
        ).all(...params) as Array<Record<string, unknown>>;
        if (rows.length === 0) {
            // Fallback: substring match when exact path not found.
            rows = this.getDB().prepare(
                `SELECT method, path, tag, summary, auth_required, request_schema, response_schema, source, updated_at
                 FROM api_endpoints WHERE path LIKE ?${method ? " AND method = ?" : ""}`,
            ).all(`%${pathQuery}%`, ...(method ? [method.toUpperCase()] : [])) as Array<Record<string, unknown>>;
        }
        return rows.map((r) => this.rowToApiEndpoint(r));
    }

    public static deleteApiEndpoint(method: string, path: string): boolean {
        return this.getDB().prepare("DELETE FROM api_endpoints WHERE method = ? AND path = ?")
            .run(method.toUpperCase(), path).changes > 0;
    }

    /** Replace the whole catalog with a fresh scan; returns upserted/deleted counts. */

    public static replaceApiCatalog(endpoints: ApiEndpoint[]): { upserted: number; deleted: number } {
        const db = this.getDB();
        const tx = db.transaction(() => {
            const keys = new Set(endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`));
            const existing = db.prepare("SELECT method, path FROM api_endpoints").all() as Array<{ method: string; path: string }>;
            let deleted = 0;
            for (const row of existing) {
                if (!keys.has(`${row.method} ${row.path}`)) {
                    deleted += db.prepare("DELETE FROM api_endpoints WHERE method = ? AND path = ?").run(row.method, row.path).changes;
                }
            }
            for (const e of endpoints) this.saveApiEndpoint(e);
            return { upserted: endpoints.length, deleted };
        });
        return tx();
    }

    private static rowToApiEndpoint(r: Record<string, unknown>): ApiEndpoint {
        return {
            method: String(r.method),
            path: String(r.path),
            tag: (r.tag as string | null) ?? undefined,
            summary: (r.summary as string | null) ?? undefined,
            authRequired: Number(r.auth_required) === 1,
            requestSchema: (r.request_schema as string | null) ?? undefined,
            responseSchema: (r.response_schema as string | null) ?? undefined,
            source: (r.source as string | null) ?? undefined,
            updatedAt: String(r.updated_at),
        };
    }
}
