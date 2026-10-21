/**
 * MCP user / token persistence for HTTP API authentication.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageKnowledge } from "./knowledge.js";

export class StorageUsers extends StorageKnowledge {
    public static hasUsers(): boolean {
        try {
            const row = this.getDB().prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
            return row.count > 0;
        } catch {
            return false;
        }
    }

    public static getUsers(): Array<{ name: string; token: string; role: string }> {
        try {
            return this.getDB().prepare("SELECT name, token, role FROM users ORDER BY id ASC").all() as Array<{ name: string; token: string; role: string }>;
        } catch (err) {
            logger.debug(`Failed to get users: ${(err as Error).message}`);
            return [];
        }
    }

    public static getUserByToken(token: string): { name: string; role: string } | null {
        try {
            const row = this.getDB().prepare("SELECT name, role FROM users WHERE token = ?").get(token) as { name: string; role: string } | undefined;
            return row || null;
        } catch (err) {
            logger.debug(`Failed to get user by token: ${(err as Error).message}`);
            return null;
        }
    }

    public static createUser(name: string, token: string, role: string): void {
        this.getDB().prepare("INSERT INTO users (name, token, role) VALUES (?, ?, ?)").run(name, token, role);
    }

    public static deleteUser(name: string): boolean {
        const info = this.getDB().prepare("DELETE FROM users WHERE name = ?").run(name);
        return info.changes > 0;
    }
}
