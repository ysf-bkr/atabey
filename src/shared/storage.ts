import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../cli/utils/memory.js";
import { logger } from "./logger.js";
import { maskText } from "./pii.js";
import { AgentID, LogID, MessageID, TaskID, TraceID, asAgentID, asLogID, asMessageID, asTaskID } from "./types.js";

export interface AgentRow {
    name: AgentID;
    state: string;
    task: string;
    last_updated: string;
}

export interface MessageRow {
    id?: MessageID;
    timestamp: string;
    from: AgentID;
    to: AgentID;
    category: string;
    content: string;
    traceId: TraceID;
    parentId?: TaskID;
    status: string;
    priority: string;
    requiresApproval: boolean;
}

export interface TaskRow {
    id: TaskID;
    traceId: TraceID;
    description: string;
    agent: AgentID;
    status: string;
    priority: string;
    dependencies: string[];
    createdAt?: string;
}

export interface LogRow {
    id?: LogID;
    timestamp: string;
    agent: AgentID;
    action: string;
    trace_id?: TraceID;
    status: string;
    summary: string;
    findings?: string;
}

export interface CostDbRow {
    id: number;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    timestamp: string;
    trace_id: string | null;
}

export interface MessageDbRow {
    id: number;
    timestamp: string;
    sender: string;
    receiver: string;
    category: string;
    content: string;
    trace_id: string;
    parent_id: string | null;
    status: string;
    priority: string;
    requires_approval: number;
}

export interface TaskDbRow {
    id: string;
    trace_id: string;
    description: string;
    agent: string;
    status: string;
    priority: string;
    dependencies: string;
    created_at: string;
}

export interface LogDbRow {
    id: number;
    timestamp: string;
    agent: string;
    action: string;
    trace_id: string | null;
    status: string;
    summary: string;
    findings: string | null;
}

/**
 * [DB] Atabey Storage Engine
 * Central SQLite database for enterprise-scale agent state management.
 */
export class AtabeyStorage {
    private static db: Database.Database | null = null;

    public static getDB(): Database.Database {
        if (!this.db) {
            const frameworkDir = getFrameworkDir();
            if (!fs.existsSync(frameworkDir)) {
                fs.mkdirSync(frameworkDir, { recursive: true });
            }
            const dbPath = path.join(frameworkDir, "atabey.db");
            this.db = new Database(dbPath);
            this.db.pragma("journal_mode = WAL");
            this.initializeSchema();
        }
        return this.db;
    }

    private static initializeSchema() {
        const db = this.db!;

        // Agents Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS agents (
                name TEXT PRIMARY KEY,
                state TEXT DEFAULT 'READY',
                task TEXT DEFAULT 'Idle',
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Messages (Hermes) Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                sender TEXT,
                receiver TEXT,
                category TEXT,
                content TEXT,
                trace_id TEXT,
                parent_id TEXT,
                status TEXT DEFAULT 'PENDING',
                priority TEXT DEFAULT 'NORMAL',
                requires_approval BOOLEAN DEFAULT 0
            )
        `);

        // Tasks Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                trace_id TEXT,
                description TEXT,
                agent TEXT,
                status TEXT DEFAULT 'PENDING',
                priority TEXT DEFAULT 'NORMAL',
                dependencies TEXT, -- JSON Array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Logs Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                agent TEXT,
                action TEXT,
                trace_id TEXT,
                status TEXT,
                summary TEXT,
                findings TEXT
            )
        `);

        // Metadata (State) Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        // Costs Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS costs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cost REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                trace_id TEXT
            )
        `);
    }

    // --- Cost Operations ---

    public static saveCost(cost: {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        timestamp: string;
        traceId?: string;
    }): void {
        const db = this.getDB();
        db.prepare(`
            INSERT INTO costs (provider, model, input_tokens, output_tokens, cost, timestamp, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            cost.provider,
            cost.model,
            cost.inputTokens,
            cost.outputTokens,
            cost.cost,
            cost.timestamp,
            cost.traceId || null
        );
    }

    public static getAllCosts(): Array<{
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        timestamp: string;
        traceId?: string;
    }> {
        const rows = this.getDB().prepare("SELECT * FROM costs ORDER BY timestamp ASC").all() as CostDbRow[];
        return rows.map(r => ({
            provider: r.provider,
            model: r.model,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            cost: r.cost,
            timestamp: r.timestamp,
            traceId: r.trace_id || undefined
        }));
    }

    // --- Agent Operations ---

    public static updateAgentStatus(name: string, state: string, task: string, lastUpdated?: string) {
        const db = this.getDB();
        const cleanName = name.replace("@", "");
        const timestamp = lastUpdated || new Date().toISOString();
        // [KVKK/GDPR] Mask PII in task description before storing
        const maskedTask = maskText(task);
        db.prepare(`
            INSERT INTO agents (name, state, task, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                state = excluded.state,
                task = excluded.task,
                last_updated = excluded.last_updated
        `).run(cleanName, state, maskedTask, timestamp);
    }

    public static getAllAgents(): AgentRow[] {
        return this.getDB().prepare("SELECT * FROM agents").all() as AgentRow[];
    }

    // --- Message Operations ---

    public static saveMessage(msg: MessageRow) {
        const db = this.getDB();
        // [KVKK/GDPR] Mask PII in message content before storing
        const maskedContent = maskText(msg.content);
        db.prepare(`
            INSERT INTO messages (sender, receiver, category, content, trace_id, parent_id, status, priority, requires_approval)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            msg.from,
            msg.to,
            msg.category,
            maskedContent,
            msg.traceId,
            msg.parentId || null,
            msg.status || "PENDING",
            msg.priority || "NORMAL",
            msg.requiresApproval ? 1 : 0
        );
    }

    public static getPendingMessages(): MessageRow[] {
        const rows = this.getDB().prepare("SELECT * FROM messages WHERE status IN ('PENDING', 'APPROVED') ORDER BY priority DESC, timestamp ASC").all() as MessageDbRow[];
        return rows.map(r => ({
            id: asMessageID(r.id),
            timestamp: r.timestamp,
            from: asAgentID(r.sender),
            to: asAgentID(r.receiver),
            category: r.category,
            content: r.content,
            traceId: r.trace_id as TraceID,
            parentId: r.parent_id ? asTaskID(r.parent_id) : undefined,
            status: r.status,
            priority: r.priority,
            requiresApproval: r.requires_approval === 1
        }));
    }

    public static updateMessageStatus(id: number, status: string) {
        this.getDB().prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
    }

    // --- Task Operations ---

    public static saveTask(task: TaskRow) {
        const db = this.getDB();
        db.prepare(`
            INSERT INTO tasks (id, trace_id, description, agent, status, priority, dependencies)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                description = excluded.description
        `).run(
            task.id,
            task.traceId,
            task.description,
            task.agent,
            task.status,
            task.priority,
            JSON.stringify(task.dependencies || [])
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
            let deps: string[] = [];
            try {
                const parsed = JSON.parse(r.dependencies || "[]");
                deps = Array.isArray(parsed) ? parsed : JSON.parse(parsed);
            } catch (err) {
                logger.warn("Failed to parse task dependencies, using empty array", err);
            }

            return {
                id: asTaskID(r.id),
                traceId: r.trace_id as TraceID,
                description: r.description,
                agent: asAgentID(r.agent),
                status: r.status,
                priority: r.priority,
                dependencies: deps,
                createdAt: r.created_at
            };
        });
    }

    public static getLogs(agentName?: string): LogRow[] {
        const db = this.getDB();
        let rows: LogDbRow[];
        const cleanName = agentName ? agentName.replace("@", "") : undefined;

        if (cleanName) {
            rows = db.prepare("SELECT * FROM logs WHERE agent = ? ORDER BY timestamp DESC").all(cleanName) as LogDbRow[];
        } else {
            rows = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC").all() as LogDbRow[];
        }

        return rows.map(r => ({
            id: asLogID(r.id),
            timestamp: r.timestamp,
            agent: asAgentID(r.agent),
            action: r.action,
            trace_id: (r.trace_id as TraceID) || undefined,
            status: r.status,
            // [KVKK/GDPR] Mask PII in log summaries before returning
            summary: maskText(r.summary),
            findings: r.findings ? maskText(r.findings) : undefined
        }));
    }

    // --- Metadata Operations ---

    public static setMetadata(key: string, value: string) {
        this.getDB().prepare(`
            INSERT INTO metadata (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(key, value);
    }

    public static getMetadata(key: string): string | null {
        const row = this.getDB().prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value: string } | undefined;
        return row ? row.value : null;
    }

    public static reset() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

/** @deprecated Use AtabeyStorage instead. Kept for backward compatibility. */
export const Storage = AtabeyStorage;
