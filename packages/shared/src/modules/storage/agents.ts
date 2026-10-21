/**
 * Agent registry rows (state, task, description, skills).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { asAgentID } from "../primitives/types.js";
import type { AgentRow } from "./types.js";
import { StorageUsers } from "./users.js";

export class StorageAgents extends StorageUsers {
    public static createAgent(name: string, description: string, skills: string): void {
        const cleanName = name.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO agents (name, state, task, description, skills, last_updated)
            VALUES (?, 'READY', 'Idle', ?, ?, datetime('now'))
            ON CONFLICT(name) DO UPDATE SET description = excluded.description, skills = excluded.skills
        `).run(cleanName, description, skills);
    }

    public static deleteAgent(name: string): boolean {
        const cleanName = name.replace("@", "");
        const info = this.getDB().prepare("DELETE FROM agents WHERE name = ?").run(cleanName);
        return info.changes > 0;
    }

    public static updateAgentDetails(name: string, description: string, state: string, task: string, skills: string): void {
        const cleanName = name.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO agents (name, state, task, description, skills, last_updated)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(name) DO UPDATE SET
                description = excluded.description,
                state = excluded.state,
                task = excluded.task,
                skills = excluded.skills,
                last_updated = datetime('now')
        `).run(cleanName, state, task, description, skills);
    }

    public static updateAgentStatus(name: string, state: string, task: string, lastUpdated?: string) {
        const cleanName = name.replace("@", "");
        const timestamp = lastUpdated || new Date().toISOString();
        this.getDB().prepare(`
            INSERT INTO agents (name, state, task, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                state = excluded.state,
                task = excluded.task,
                last_updated = excluded.last_updated
        `).run(cleanName, state, task, timestamp);
    }

    public static getAllAgents(): AgentRow[] {
        const db = this.getDB();
        const rows = db.prepare("SELECT * FROM agents").all() as Array<{
            name: string;
            state: string;
            task: string;
            last_updated: string;
        }>;
        return rows.map(r => ({
            name: asAgentID(r.name),
            state: r.state,
            task: r.task,
            last_updated: r.last_updated
        }));
    }
}
