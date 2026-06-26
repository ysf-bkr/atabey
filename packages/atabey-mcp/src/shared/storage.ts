import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../mcp/utils/memory.js";
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
    prev_hash?: string;
    hash?: string;
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
    prev_hash: string | null;
    hash: string | null;
}

export class AtabeyStorage {
    private static db: Database.Database | null = null;

    public static getDB(): Database.Database {
        if (!this.db) {
            const frameworkDir = getFrameworkDir();
            if (!fs.existsSync(frameworkDir)) {
                fs.mkdirSync(frameworkDir, { recursive: true });
            }
            const dbPath = path.join(frameworkDir, "atabey.db");
            this.db = new Database(dbPath, { timeout: 5000 });
            this.db.pragma("journal_mode = WAL");
            this.initializeSchema();
        }
        return this.db;
    }

    private static initializeSchema() {
        const db = this.db!;
        db.exec(`
            CREATE TABLE IF NOT EXISTS agents (
                name TEXT PRIMARY KEY,
                state TEXT DEFAULT 'READY',
                task TEXT DEFAULT 'Idle',
                description TEXT DEFAULT '',
                skills TEXT DEFAULT '[]',
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
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
        db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                trace_id TEXT,
                description TEXT,
                agent TEXT,
                status TEXT DEFAULT 'PENDING',
                priority TEXT DEFAULT 'NORMAL',
                dependencies TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                agent TEXT,
                action TEXT,
                trace_id TEXT,
                status TEXT,
                summary TEXT,
                findings TEXT,
                prev_hash TEXT,
                hash TEXT
            )
        `);
        try {
            const tableInfo = db.prepare("PRAGMA table_info(logs)").all() as Array<{ name: string }>;
            const columnNames = tableInfo.map(c => c.name);
            if (!columnNames.includes("prev_hash")) db.exec("ALTER TABLE logs ADD COLUMN prev_hash TEXT");
            if (!columnNames.includes("hash")) db.exec("ALTER TABLE logs ADD COLUMN hash TEXT");
        } catch (err) {
            logger.error(`Failed to migrate logs table schema: ${(err as Error).message}`);
        }
        db.exec(`
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);
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
        db.exec(`
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT UNIQUE,
                content TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                token TEXT UNIQUE,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    // === KNOWLEDGE OPERATIONS ===

    public static getKnowledgeList(): Array<{ filename: string; updated_at: string }> {
        return this.getDB().prepare("SELECT filename, updated_at FROM knowledge ORDER BY filename ASC").all() as Array<{ filename: string; updated_at: string }>;
    }

    public static getKnowledgeFile(filename: string): { filename: string; content: string; updated_at: string } | null {
        const row = this.getDB().prepare("SELECT * FROM knowledge WHERE filename = ?").get(filename) as { filename: string; content: string; updated_at: string } | undefined;
        return row || null;
    }

    public static saveKnowledgeFile(filename: string, content: string): void {
        this.getDB().prepare(`
            INSERT INTO knowledge (filename, content, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
        `).run(filename, content);
    }

    public static deleteKnowledgeFile(filename: string): boolean {
        const result = this.getDB().prepare("DELETE FROM knowledge WHERE filename = ?").run(filename);
        return result.changes > 0;
    }

    // === USER OPERATIONS ===

    public static hasUsers(): boolean {
        const row = this.getDB().prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
        return row.count > 0;
    }

    public static getUsers(): Array<{ name: string; token: string; role: string }> {
        return this.getDB().prepare("SELECT name, token, role FROM users").all() as Array<{ name: string; token: string; role: string }>;
    }

    public static getUserByToken(token: string): { name: string; role: string } | null {
        const row = this.getDB().prepare("SELECT name, role FROM users WHERE token = ?").get(token) as { name: string; role: string } | undefined;
        return row || null;
    }

    public static createUser(name: string, token: string, role: string): void {
        this.getDB().prepare("INSERT INTO users (name, token, role) VALUES (?, ?, ?)").run(name, token, role);
    }

    public static deleteUser(name: string): boolean {
        const result = this.getDB().prepare("DELETE FROM users WHERE name = ?").run(name);
        return result.changes > 0;
    }

    // === ADVANCED AGENT OPERATIONS ===

    public static createAgent(name: string, description: string, skills: string): void {
        const cleanName = name.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO agents (name, state, task, description, skills)
            VALUES (?, 'READY', 'Idle', ?, ?)
            ON CONFLICT(name) DO UPDATE SET description = excluded.description, skills = excluded.skills
        `).run(cleanName, description, skills);
    }

    public static deleteAgent(name: string): boolean {
        const cleanName = name.replace("@", "");
        const result = this.getDB().prepare("DELETE FROM agents WHERE name = ?").run(cleanName);
        return result.changes > 0;
    }

    public static updateAgentDetails(name: string, description: string, state: string, task: string, skills: string): void {
        const cleanName = name.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO agents (name, state, task, description, skills)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET state = excluded.state, task = excluded.task, description = excluded.description, skills = excluded.skills
        `).run(cleanName, state, task, description, skills);
    }

    // === CALLBACK HOOKS ===

    public static onMessageSaved: ((msg: { traceId: string; category: string }) => void) | null = null;
    public static onMessageStatusUpdated: ((id: number, status: string) => void) | null = null;

    // === STANDARD OPERATIONS ===

    public static saveLog(log: { agent: string; action: string; trace_id?: string; status: string; summary: string; findings?: string }): number {
        const db = this.getDB();
        const timestamp = new Date().toISOString();
        const agent = log.agent.replace("@", "");
        const maskedSummary = maskText(log.summary);
        const maskedFindings = log.findings ? maskText(log.findings) : null;
        let prevHash = "GENESIS";
        try {
            const lastRow = db.prepare("SELECT hash FROM logs ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
            if (lastRow?.hash) prevHash = lastRow.hash;
        } catch { /* use default */ }
        const dataToHash = `${prevHash}|${agent}|${log.action}|${log.trace_id || ""}|${log.status}|${maskedSummary}|${timestamp}`;
        const hash = crypto.createHash("sha256").update(dataToHash).digest("hex");
        const result = db.prepare(`INSERT INTO logs (timestamp, agent, action, trace_id, status, summary, findings, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(timestamp, agent, log.action, log.trace_id || null, log.status, maskedSummary, maskedFindings, prevHash, hash);
        return result.lastInsertRowid as number;
    }

    public static verifyLogIntegrity(): { valid: boolean; failedLogId?: number; reason?: string } {
        const db = this.getDB();
        try {
            const rows = db.prepare("SELECT * FROM logs ORDER BY id ASC").all() as Array<{ id: number; timestamp: string; agent: string; action: string; trace_id: string | null; status: string; summary: string; findings: string | null; prev_hash: string | null; hash: string | null }>;
            let expectedPrevHash = "GENESIS";
            for (const row of rows) {
                if (row.prev_hash !== expectedPrevHash) return { valid: false, failedLogId: row.id, reason: `Hash mismatch at row ${row.id}` };
                const dataToHash = `${row.prev_hash}|${row.agent}|${row.action}|${row.trace_id || ""}|${row.status}|${row.summary}|${row.timestamp}`;
                const calculatedHash = crypto.createHash("sha256").update(dataToHash).digest("hex");
                if (row.hash !== calculatedHash) return { valid: false, failedLogId: row.id, reason: `Hash corruption at row ${row.id}` };
                expectedPrevHash = row.hash || "";
            }
            return { valid: true };
        } catch (err) {
            return { valid: false, reason: `Verification error: ${(err as Error).message}` };
        }
    }

    public static saveCost(cost: { provider: string; model: string; inputTokens: number; outputTokens: number; cost: number; timestamp: string; traceId?: string }): void {
        this.getDB().prepare(`INSERT INTO costs (provider, model, input_tokens, output_tokens, cost, timestamp, trace_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(cost.provider, cost.model, cost.inputTokens, cost.outputTokens, cost.cost, cost.timestamp, cost.traceId || null);
    }

    public static getAllCosts(): Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; cost: number; timestamp: string; traceId?: string }> {
        const rows = this.getDB().prepare("SELECT * FROM costs ORDER BY timestamp ASC").all() as CostDbRow[];
        return rows.map(r => ({ provider: r.provider, model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, cost: r.cost, timestamp: r.timestamp, traceId: r.trace_id || undefined }));
    }

    public static updateAgentStatus(name: string, state: string, task: string, lastUpdated?: string) {
        const db = this.getDB();
        const cleanName = name.replace("@", "");
        const timestamp = lastUpdated || new Date().toISOString();
        const maskedTask = maskText(task);
        db.prepare(`INSERT INTO agents (name, state, task, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET state = excluded.state, task = excluded.task, last_updated = excluded.last_updated`).run(cleanName, state, maskedTask, timestamp);
    }

    public static getAllAgents(): AgentRow[] {
        return this.getDB().prepare("SELECT * FROM agents").all() as AgentRow[];
    }

    public static saveMessage(msg: MessageRow) {
        const db = this.getDB();
        const maskedContent = maskText(msg.content);
        db.prepare(`INSERT INTO messages (sender, receiver, category, content, trace_id, parent_id, status, priority, requires_approval) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(msg.from, msg.to, msg.category, maskedContent, msg.traceId, msg.parentId || null, msg.status || "PENDING", msg.priority || "NORMAL", msg.requiresApproval ? 1 : 0);
        if (this.onMessageSaved) this.onMessageSaved({ traceId: String(msg.traceId), category: msg.category });
    }

    public static getPendingMessages(): MessageRow[] {
        const rows = this.getDB().prepare("SELECT * FROM messages WHERE status IN ('PENDING', 'APPROVED') ORDER BY priority DESC, timestamp ASC").all() as MessageDbRow[];
        return rows.map(r => ({ id: asMessageID(r.id), timestamp: r.timestamp, from: asAgentID(r.sender), to: asAgentID(r.receiver), category: r.category, content: r.content, traceId: r.trace_id as TraceID, parentId: r.parent_id ? asTaskID(r.parent_id) : undefined, status: r.status, priority: r.priority, requiresApproval: r.requires_approval === 1 }));
    }

    public static updateMessageStatus(id: number, status: string) {
        this.getDB().prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
        if (this.onMessageStatusUpdated) this.onMessageStatusUpdated(id, status);
    }

    public static saveTask(task: TaskRow) {
        this.getDB().prepare(`INSERT INTO tasks (id, trace_id, description, agent, status, priority, dependencies) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, description = excluded.description`).run(task.id, task.traceId, task.description, task.agent, task.status, task.priority, JSON.stringify(task.dependencies || []));
    }

    public static getTasks(traceId?: TraceID): TaskRow[] {
        const rows: TaskDbRow[] = traceId ? this.getDB().prepare("SELECT * FROM tasks WHERE trace_id = ?").all(traceId) as TaskDbRow[] : this.getDB().prepare("SELECT * FROM tasks").all() as TaskDbRow[];
        return rows.map((r: TaskDbRow) => { let deps: string[]; try { deps = JSON.parse(r.dependencies || "[]"); if (!Array.isArray(deps)) deps = []; } catch { deps = []; } return { id: asTaskID(r.id), traceId: r.trace_id as TraceID, description: r.description, agent: asAgentID(r.agent), status: r.status, priority: r.priority, dependencies: deps, createdAt: r.created_at }; });
    }

    public static getLogs(agentName?: string): LogRow[] {
        const cleanName = agentName ? agentName.replace("@", "") : undefined;
        const rows: LogDbRow[] = cleanName ? this.getDB().prepare("SELECT * FROM logs WHERE agent = ? ORDER BY timestamp DESC").all(cleanName) as LogDbRow[] : this.getDB().prepare("SELECT * FROM logs ORDER BY timestamp DESC").all() as LogDbRow[];
        return rows.map((r: LogDbRow) => ({ id: asLogID(r.id), timestamp: r.timestamp, agent: asAgentID(r.agent), action: r.action, trace_id: (r.trace_id as TraceID) || undefined, status: r.status, summary: maskText(r.summary), findings: r.findings ? maskText(r.findings) : undefined, prev_hash: r.prev_hash || undefined, hash: r.hash || undefined }));
    }

    public static setMetadata(key: string, value: string) {
        this.getDB().prepare(`INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
    }

    public static getMetadata(key: string): string | null {
        const row = this.getDB().prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value: string } | undefined;
        return row ? row.value : null;
    }

    public static reset() {
        if (this.db) { this.db.close(); this.db = null; }
    }
}

export const Storage = AtabeyStorage;
