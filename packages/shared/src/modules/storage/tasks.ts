/**
 * Task rows of execution traces (DAG tasks with dependencies).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { maskText } from "../security/pii.js";
import { asAgentID, asTaskID } from "../primitives/types.js";
import type { TraceID } from "../primitives/types.js";
import type { TaskRow, TaskDbRow } from "./types.js";
import { StorageMessages } from "./messages.js";

export class StorageTasks extends StorageMessages {
    public static saveTask(task: TaskRow) {
        const agent = task.agent;
        const cleanDesc = task.description;

        this.getDB().prepare(`
            INSERT INTO tasks (id, trace_id, description, agent, status, priority, dependencies, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                priority = excluded.priority,
                dependencies = excluded.dependencies,
                agent = excluded.agent
        `).run(
            task.id,
            task.traceId,
            cleanDesc,
            agent,
            task.status,
            task.priority,
            JSON.stringify(task.dependencies),
            task.createdAt || new Date().toISOString()
        );
    }

    public static getTasks(traceId?: TraceID): TaskRow[] {
        const db = this.getDB();
        let rows: TaskDbRow[];
        if (traceId) {
            rows = db.prepare("SELECT * FROM tasks WHERE trace_id = ?").all(traceId) as TaskDbRow[];
        } else {
            rows = db.prepare("SELECT * FROM tasks").all() as TaskDbRow[];
        }

        return rows.map(r => {
            let deps: string[];
            try {
                deps = JSON.parse(r.dependencies || "[]");
            } catch {
                deps = [];
            }
            return {
                id: asTaskID(r.id),
                traceId: r.trace_id as TraceID,
                description: maskText(r.description),
                agent: asAgentID(r.agent),
                status: r.status,
                priority: r.priority,
                dependencies: deps,
                createdAt: r.created_at
            };
        });
    }
}
