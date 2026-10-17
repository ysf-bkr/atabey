import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { AUDIT_CHAIN_GENESIS, buildAgentLogChainPayload, chainDigest, readChainAnchor, writeChainAnchor, verifyHashChain } from "./audit-chain.js";
import type { ApiEndpoint } from "./api-catalog.js";
import { databaseHolder } from "./database.js";
import { logger } from "./logger.js";
import {
    backupDatabase,
    getMigrationStatus,
    restoreDatabase,
    runPendingMigrations,
    verifyDatabaseIntegrity,
    type BackupResult,
    type IntegrityCheckResult,
} from "./migrations.js";
import { maskText } from "./pii.js";
import {
    AgentID,
    LogID,
    MessageID,
    TaskID,
    TraceID,
    asAgentID,
    asLogID,
    asMessageID,
    asTaskID,
} from "./types.js";

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

/**
 * Resolves the framework directory (.atabey) intelligently by ascending the directory tree,
 * preventing subpackages and test runners from spraying databases in random subfolders.
 */
export function resolveFrameworkDir(): string {
    const testDir = process.env.ATABEY_TEST_DIR || process.env.ATABEY_FRAMEWORK_DIR;
    if (testDir) return testDir;

    let cur = process.cwd();
    while (cur !== path.parse(cur).root) {
        const candidate = path.join(cur, ".atabey");
        if (fs.existsSync(candidate)) return candidate;
        const pkgJson = path.join(cur, "package.json");
        if (fs.existsSync(pkgJson)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
                if (pkg.name === "atabey-monorepo" || (pkg.workspaces && Array.isArray(pkg.workspaces))) {
                    return path.join(cur, ".atabey");
                }
            } catch { /* ignore */ }
        }
        cur = path.dirname(cur);
    }
    return path.join(process.cwd(), ".atabey");
}

/**
 * [DB] Canonical Atabey Storage Engine (Single Source of Truth)
 * Central SQLite database for enterprise-scale multi-agent state management.
 */
export class AtabeyStorage {
    private static db: Database.Database | null = null;

    public static getDB(): Database.Database {
        if (!this.db) {
            const frameworkDir = resolveFrameworkDir();
            if (!fs.existsSync(frameworkDir)) {
                fs.mkdirSync(frameworkDir, { recursive: true });
            }
            const dbPath = path.join(frameworkDir, "atabey.db");
            this.db = new Database(dbPath, { timeout: 5000 });
            this.db.pragma("journal_mode = WAL");
            databaseHolder.setDB(this.db);
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
        db.exec(`
            CREATE TABLE IF NOT EXISTS loop_cooldowns (
                agent TEXT PRIMARY KEY,
                cooldown_until INTEGER NOT NULL,
                detail TEXT,
                cooldown_count INTEGER DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS approvals (
                trace_id TEXT PRIMARY KEY,
                tool_name TEXT NOT NULL,
                agent TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                reason TEXT NOT NULL,
                args TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                status TEXT DEFAULT 'PENDING',
                passcode TEXT
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS discipline (
                agent TEXT PRIMARY KEY,
                total_calls INTEGER DEFAULT 0,
                violations INTEGER DEFAULT 0,
                last_violation TEXT,
                cooldown_until INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try {
            runPendingMigrations(db);
            const integrity = verifyDatabaseIntegrity(db, "quick");
            if (!integrity.ok) {
                logger.error(`[DB] SQLite startup integrity check failed: ${integrity.messages.join("; ")}`);
            }
        } catch (err) {
            const msg = (err as Error).message;
            if (/Checksum mismatch/i.test(msg)) {
                // Schema drift or tampering — fail closed instead of running on an unknown schema.
                throw err;
            }
            logger.error(`[DB] Schema migration / integrity check warning: ${msg}`);
        }
    }

    // === KNOWLEDGE PERSISTENCE ===

    public static getKnowledgeList(): Array<{ filename: string; updated_at: string }> {
        try {
            return this.getDB().prepare("SELECT filename, updated_at FROM knowledge ORDER BY updated_at DESC").all() as Array<{ filename: string; updated_at: string }>;
        } catch (err) {
            logger.debug(`Failed to get knowledge list: ${(err as Error).message}`);
            return [];
        }
    }

    public static getKnowledgeFile(filename: string): { filename: string; content: string; updated_at: string } | null {
        try {
            const row = this.getDB().prepare("SELECT * FROM knowledge WHERE filename = ?").get(filename) as { filename: string; content: string; updated_at: string } | undefined;
            return row || null;
        } catch (err) {
            logger.debug(`Failed to get knowledge file: ${(err as Error).message}`);
            return null;
        }
    }

    public static saveKnowledgeFile(filename: string, content: string): void {
        this.getDB().prepare(`
            INSERT INTO knowledge (filename, content, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
        `).run(filename, content);
    }

    public static deleteKnowledgeFile(filename: string): boolean {
        const info = this.getDB().prepare("DELETE FROM knowledge WHERE filename = ?").run(filename);
        return info.changes > 0;
    }

    // === USER PERSISTENCE ===

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

    // === AGENT DETAILS PERSISTENCE ===

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

    // === EVENT HOOKS FOR REAL-TIME BROADCASTS ===
    public static onMessageSaved: ((msg: { traceId: string; category: string }) => void) | null = null;
    public static onMessageStatusUpdated: ((id: number, status: string) => void) | null = null;

    public static saveLog(log: {
        agent: string;
        action: string;
        trace_id?: string;
        status: string;
        summary: string;
        findings?: string;
    }): number {
        const db = this.getDB();
        const timestamp = new Date().toISOString();
        const agent = log.agent.replace("@", "");
        const maskedSummary = maskText(log.summary);
        const maskedFindings = log.findings ? maskText(log.findings) : null;
        const traceId = log.trace_id || "";

        let lastId = 0;
        const insert = db.transaction(() => {
            let prevHash = AUDIT_CHAIN_GENESIS;
            try {
                const lastRow = db.prepare(
                    "SELECT hash FROM logs WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1"
                ).get() as { hash: string } | undefined;
                if (lastRow && lastRow.hash) {
                    prevHash = lastRow.hash;
                }
            } catch { /* best-effort fallback to genesis */ }

            const payload = buildAgentLogChainPayload({
                prevHash,
                timestamp,
                agent,
                action: log.action,
                traceId: traceId || "",
                status: log.status,
                summary: maskedSummary,
            });
            const hash = chainDigest(payload);

            const result = db.prepare(`
                INSERT INTO logs (timestamp, agent, action, trace_id, status, summary, findings, prev_hash, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(timestamp, agent, log.action, log.trace_id || null, log.status, maskedSummary, maskedFindings, prevHash, hash);
            lastId = Number(result.lastInsertRowid);

            const count = (db.prepare("SELECT COUNT(*) AS c FROM logs WHERE hash IS NOT NULL").get() as { c: number }).c;
            writeChainAnchor("agent-log", hash, count);
        });

        insert();
        return lastId;
    }

    public static verifyLogIntegrity(): {
        valid: boolean;
        checked?: number;
        failedLogId?: number;
        reason?: string;
        tip?: string;
    } {
        const db = this.getDB();
        try {
            const rows = db.prepare(
                "SELECT * FROM logs ORDER BY id ASC"
            ).all() as Array<{
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
            }>;
            const hashed = rows.filter((r) => r.hash);
            if (hashed.length === 0) {
                return { valid: true, checked: 0, reason: "No hashed log rows yet" };
            }
            const anchor = readChainAnchor("agent-log");
            return verifyHashChain(
                hashed,
                (row, prevHash) =>
                    buildAgentLogChainPayload({
                        prevHash,
                        agent: row.agent,
                        action: row.action,
                        traceId: row.trace_id || "",
                        status: row.status,
                        summary: row.summary,
                        timestamp: row.timestamp,
                    }),
                { expectedTip: anchor?.tip, expectedCount: anchor?.count },
            );
        } catch (err) {
            return { valid: false, reason: `Verification error: ${(err as Error).message}` };
        }
    }

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
        const db = this.getDB();
        const rows = db.prepare("SELECT * FROM costs ORDER BY timestamp ASC").all() as CostDbRow[];
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

    public static saveMessage(msg: MessageRow) {
        const from = msg.from.replace("@", "");
        const to = msg.to.replace("@", "");
        const cleanContent = maskText(msg.content);

        this.getDB().prepare(`
            INSERT INTO messages (timestamp, sender, receiver, category, content, trace_id, parent_id, status, priority, requires_approval)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            msg.timestamp,
            from,
            to,
            msg.category,
            cleanContent,
            msg.traceId,
            msg.parentId || null,
            msg.status,
            msg.priority,
            msg.requiresApproval ? 1 : 0
        );

        if (this.onMessageSaved) {
            try { this.onMessageSaved({ traceId: msg.traceId, category: msg.category }); }
            catch (err) { logger.debug(`onMessageSaved hook error: ${(err as Error).message}`); }
        }
    }

    public static getPendingMessages(): MessageRow[] {
        const db = this.getDB();
        const rows = db.prepare("SELECT * FROM messages WHERE status = 'PENDING'").all() as MessageDbRow[];
        return rows.map(r => ({
            id: asMessageID(r.id),
            timestamp: r.timestamp,
            from: asAgentID(r.sender),
            to: asAgentID(r.receiver),
            category: r.category,
            content: maskText(r.content),
            traceId: r.trace_id as TraceID,
            parentId: (r.parent_id as TaskID) || undefined,
            status: r.status,
            priority: r.priority,
            requiresApproval: r.requires_approval === 1
        }));
    }

    public static updateMessageStatus(id: number, status: string) {
        this.getDB().prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
        if (this.onMessageStatusUpdated) {
            try { this.onMessageStatusUpdated(id, status); }
            catch (err) { logger.debug(`onMessageStatusUpdated hook error: ${(err as Error).message}`); }
        }
    }

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
            summary: maskText(r.summary),
            findings: r.findings ? maskText(r.findings) : undefined,
            prev_hash: r.prev_hash || undefined,
            hash: r.hash || undefined
        }));
    }

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

    // === LOOP COOLDOWN PERSISTENCE ===

    public static saveLoopCooldown(agent: string, cooldownUntil: number, detail: string | null, cooldownCount: number = 1): void {
        const cleanAgent = agent.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO loop_cooldowns (agent, cooldown_until, detail, cooldown_count, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(agent) DO UPDATE SET
                cooldown_until = excluded.cooldown_until,
                detail = excluded.detail,
                cooldown_count = excluded.cooldown_count,
                updated_at = datetime('now')
        `).run(cleanAgent, cooldownUntil, detail, cooldownCount);
    }

    public static getLoopCooldown(agent: string): { agent: string; cooldownUntil: number; detail: string | null; cooldownCount: number } | null {
        const cleanAgent = agent.replace("@", "");
        try {
            const row = this.getDB().prepare("SELECT * FROM loop_cooldowns WHERE agent = ?").get(cleanAgent) as {
                agent: string;
                cooldown_until: number;
                detail: string | null;
                cooldown_count: number;
            } | undefined;
            if (!row) return null;
            return {
                agent: row.agent,
                cooldownUntil: row.cooldown_until,
                detail: row.detail,
                cooldownCount: row.cooldown_count
            };
        } catch (err) {
            logger.debug(`Failed to get loop cooldown: ${(err as Error).message}`);
            return null;
        }
    }

    public static clearLoopCooldown(agent: string): boolean {
        const cleanAgent = agent.replace("@", "");
        const info = this.getDB().prepare("DELETE FROM loop_cooldowns WHERE agent = ?").run(cleanAgent);
        return info.changes > 0;
    }

    public static clearAllLoopCooldowns(): void {
        try {
            this.getDB().prepare("DELETE FROM loop_cooldowns").run();
        } catch (err) {
            logger.debug(`Failed to clear all loop cooldowns: ${(err as Error).message}`);
        }
    }

    public static listActiveLoopCooldowns(): Array<{
        agent: string;
        cooldownUntil: number;
        detail: string | null;
        cooldownCount: number;
    }> {
        const now = Date.now();
        try {
            const rows = this.getDB().prepare("SELECT * FROM loop_cooldowns WHERE cooldown_until > ?").all(now) as Array<{
                agent: string;
                cooldown_until: number;
                detail: string | null;
                cooldown_count: number;
            }>;
            return rows.map(r => ({
                agent: r.agent,
                cooldownUntil: r.cooldown_until,
                detail: r.detail,
                cooldownCount: r.cooldown_count
            }));
        } catch (err) {
            logger.debug(`Failed to list active loop cooldowns: ${(err as Error).message}`);
            return [];
        }
    }

    public static purgeExpiredLoopCooldowns(): number {
        const now = Date.now();
        try {
            const info = this.getDB().prepare("DELETE FROM loop_cooldowns WHERE cooldown_until <= ?").run(now);
            return info.changes;
        } catch (err) {
            logger.debug(`Failed to purge expired loop cooldowns: ${(err as Error).message}`);
            return 0;
        }
    }

    // === APPROVALS PERSISTENCE ===

    public static saveApproval(app: {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }): void {
        this.saveApprovalRequest(app);
    }

    public static saveApprovalRequest(request: {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }): void {
        const db = this.getDB();
        db.prepare(`
            INSERT OR REPLACE INTO approvals (
                trace_id, tool_name, agent, risk_score, risk_level, reason, args,
                created_at, expires_at, status, passcode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            request.traceId,
            request.toolName,
            request.agent,
            request.riskScore,
            request.riskLevel,
            request.reason,
            JSON.stringify(request.args),
            request.createdAt,
            request.expiresAt,
            request.status || "PENDING",
            request.passcode || null
        );
    }

    public static getApproval(traceId: string): {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    } | null {
        try {
            const row = this.getDB().prepare("SELECT * FROM approvals WHERE trace_id = ?").get(traceId) as {
                trace_id: string;
                tool_name: string;
                agent: string;
                risk_score: number;
                risk_level: string;
                reason: string;
                args: string;
                created_at: number;
                expires_at: number;
                status: string;
                passcode: string | null;
            } | undefined;
            if (!row) return null;
            return {
                traceId: row.trace_id,
                toolName: row.tool_name,
                agent: row.agent,
                riskScore: row.risk_score,
                riskLevel: row.risk_level,
                reason: row.reason,
                args: JSON.parse(row.args || "{}") as Record<string, unknown>,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED",
                passcode: row.passcode || undefined
            };
        } catch (err) {
            logger.debug(`Failed to get approval: ${(err as Error).message}`);
            return null;
        }
    }

    public static getPendingApprovals(): Array<{
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }> {
        try {
            const rows = this.getDB().prepare("SELECT * FROM approvals WHERE status = 'PENDING'").all() as Array<{
                trace_id: string;
                tool_name: string;
                agent: string;
                risk_score: number;
                risk_level: string;
                reason: string;
                args: string;
                created_at: number;
                expires_at: number;
                status: string;
                passcode: string | null;
            }>;
            return rows.map(row => ({
                traceId: row.trace_id,
                toolName: row.tool_name,
                agent: row.agent,
                riskScore: row.risk_score,
                riskLevel: row.risk_level,
                reason: row.reason,
                args: JSON.parse(row.args || "{}") as Record<string, unknown>,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED",
                passcode: row.passcode || undefined
            }));
        } catch (err) {
            logger.debug(`Failed to get pending approvals: ${(err as Error).message}`);
            return [];
        }
    }

    public static updateApprovalStatus(traceId: string, status: string): void {
        this.getDB().prepare("UPDATE approvals SET status = ? WHERE trace_id = ?").run(status, traceId);
    }

    public static clearAllApprovals(): void {
        try {
            this.getDB().prepare("DELETE FROM approvals").run();
        } catch (err) {
            logger.debug(`Failed to clear approvals: ${(err as Error).message}`);
        }
    }

    // === DISCIPLINE PERSISTENCE ===

    public static saveDiscipline(agent: string, stats: { totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number }): void {
        const cleanAgent = agent.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO discipline (agent, total_calls, violations, last_violation, cooldown_until, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(agent) DO UPDATE SET
                total_calls = excluded.total_calls,
                violations = excluded.violations,
                last_violation = excluded.last_violation,
                cooldown_until = excluded.cooldown_until,
                updated_at = datetime('now')
        `).run(cleanAgent, stats.totalCalls, stats.violations, stats.lastViolation, stats.cooldownUntil);
    }

    public static getDiscipline(agent: string): { agent: string; totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number } | null {
        const cleanAgent = agent.replace("@", "");
        try {
            const row = this.getDB().prepare("SELECT * FROM discipline WHERE agent = ?").get(cleanAgent) as {
                agent: string;
                total_calls: number;
                violations: number;
                last_violation: string | null;
                cooldown_until: number;
            } | undefined;
            if (!row) return null;
            return {
                agent: row.agent,
                totalCalls: row.total_calls,
                violations: row.violations,
                lastViolation: row.last_violation,
                cooldownUntil: row.cooldown_until
            };
        } catch (err) {
            logger.debug(`Failed to get discipline: ${(err as Error).message}`);
            return null;
        }
    }

    public static getAllDiscipline(): Array<{ agent: string; totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number }> {
        try {
            const rows = this.getDB().prepare("SELECT * FROM discipline").all() as Array<{
                agent: string;
                total_calls: number;
                violations: number;
                last_violation: string | null;
                cooldown_until: number;
            }>;
            return rows.map(row => ({
                agent: row.agent,
                totalCalls: row.total_calls,
                violations: row.violations,
                lastViolation: row.last_violation,
                cooldownUntil: row.cooldown_until
            }));
        } catch (err) {
            logger.debug(`Failed to get all discipline: ${(err as Error).message}`);
            return [];
        }
    }

    public static clearAllDiscipline(): void {
        try {
            this.getDB().prepare("DELETE FROM discipline").run();
        } catch (err) {
            logger.debug(`Failed to clear discipline: ${(err as Error).message}`);
        }
    }

    // === DISCIPLINE CALL HISTORY (restart-durable rate limiting) ===

    public static recordDisciplineCall(agent: string, tool: string, timestamp: number, argsSize: number): void {
        const cleanAgent = agent.replace("@", "");
        try {
            this.getDB().prepare(
                "INSERT INTO discipline_calls (agent, tool, ts, args_size) VALUES (?, ?, ?, ?)"
            ).run(cleanAgent, tool, timestamp, argsSize);
        } catch (err) {
            logger.debug(`Failed to record discipline call: ${(err as Error).message}`);
        }
    }

    public static getRecentDisciplineCalls(agent: string, sinceTs: number): Array<{ tool: string; timestamp: number; argsSize: number }> {
        const cleanAgent = agent.replace("@", "");
        try {
            const rows = this.getDB().prepare(
                "SELECT tool, ts, args_size FROM discipline_calls WHERE agent = ? AND ts > ? ORDER BY ts ASC"
            ).all(cleanAgent, sinceTs) as Array<{ tool: string; ts: number; args_size: number }>;
            return rows.map(r => ({ tool: r.tool, timestamp: r.ts, argsSize: r.args_size }));
        } catch (err) {
            logger.debug(`Failed to get recent discipline calls: ${(err as Error).message}`);
            return [];
        }
    }

    public static pruneDisciplineCalls(beforeTs: number): void {
        try {
            this.getDB().prepare("DELETE FROM discipline_calls WHERE ts < ?").run(beforeTs);
        } catch (err) {
            logger.debug(`Failed to prune discipline calls: ${(err as Error).message}`);
        }
    }

    public static clearDisciplineCalls(agent?: string): void {
        try {
            if (agent) {
                this.getDB().prepare("DELETE FROM discipline_calls WHERE agent = ?").run(agent.replace("@", ""));
            } else {
                this.getDB().prepare("DELETE FROM discipline_calls").run();
            }
        } catch (err) {
            logger.debug(`Failed to clear discipline calls: ${(err as Error).message}`);
        }
    }

    // === CODE GRAPH (incremental symbol/file index) ===

    public static getCodeFileHash(filePath: string): string | null {
        try {
            const row = this.getDB().prepare("SELECT hash FROM code_files WHERE path = ?").get(filePath) as { hash: string } | undefined;
            return row?.hash ?? null;
        } catch (err) {
            logger.debug(`Failed to get code file hash: ${(err as Error).message}`);
            return null;
        }
    }

    public static upsertCodeFile(filePath: string, hash: string): void {
        this.getDB().prepare(`
            INSERT INTO code_files (path, hash, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, updated_at = datetime('now')
        `).run(filePath, hash);
    }

    public static replaceCodeSymbols(
        filePath: string,
        symbols: Array<{ name: string; kind: string; startLine: number; endLine: number; signature: string; exported: boolean }>,
    ): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols WHERE file = ?").run(filePath);
            const ins = db.prepare(
                "INSERT INTO code_symbols (file, name, kind, start_line, end_line, signature, exported) VALUES (?, ?, ?, ?, ?, ?, ?)",
            );
            for (const s of symbols) {
                ins.run(filePath, s.name, s.kind, s.startLine, s.endLine, s.signature, s.exported ? 1 : 0);
            }
        });
        tx();
    }

    public static replaceCodeImports(filePath: string, specifiers: string[]): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_imports WHERE file = ?").run(filePath);
            const ins = db.prepare("INSERT INTO code_imports (file, specifier) VALUES (?, ?)");
            for (const s of specifiers) ins.run(filePath, s);
        });
        tx();
    }

    public static deleteCodeFile(filePath: string): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols WHERE file = ?").run(filePath);
            db.prepare("DELETE FROM code_imports WHERE file = ?").run(filePath);
            db.prepare("DELETE FROM code_files WHERE path = ?").run(filePath);
        });
        tx();
    }

    public static getAllCodeFilePaths(): string[] {
        try {
            return (this.getDB().prepare("SELECT path FROM code_files").all() as Array<{ path: string }>).map((r) => r.path);
        } catch (err) {
            logger.debug(`Failed to list code files: ${(err as Error).message}`);
            return [];
        }
    }

    public static searchCodeSymbols(
        query: string,
        limit = 20,
    ): Array<{ file: string; name: string; kind: string; startLine: number; endLine: number; signature: string; exported: boolean }> {
        try {
            const rows = this.getDB()
                .prepare(
                    "SELECT file, name, kind, start_line, end_line, signature, exported FROM code_symbols " +
                        "WHERE name LIKE ? ORDER BY (name = ?) DESC, length(name) ASC LIMIT ?",
                )
                .all(`%${query}%`, query, limit) as Array<{
                file: string;
                name: string;
                kind: string;
                start_line: number;
                end_line: number;
                signature: string;
                exported: number;
            }>;
            return rows.map((r) => ({
                file: r.file,
                name: r.name,
                kind: r.kind,
                startLine: r.start_line,
                endLine: r.end_line,
                signature: r.signature,
                exported: r.exported === 1,
            }));
        } catch (err) {
            logger.debug(`Failed to search code symbols: ${(err as Error).message}`);
            return [];
        }
    }

    public static getCodeGraphStats(): { files: number; symbols: number; imports: number } {
        try {
            const db = this.getDB();
            const files = (db.prepare("SELECT COUNT(*) AS c FROM code_files").get() as { c: number }).c;
            const symbols = (db.prepare("SELECT COUNT(*) AS c FROM code_symbols").get() as { c: number }).c;
            const imports = (db.prepare("SELECT COUNT(*) AS c FROM code_imports").get() as { c: number }).c;
            return { files, symbols, imports };
        } catch (err) {
            logger.debug(`Failed to read code graph stats: ${(err as Error).message}`);
            return { files: 0, symbols: 0, imports: 0 };
        }
    }

    public static clearCodeGraph(): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols").run();
            db.prepare("DELETE FROM code_imports").run();
            db.prepare("DELETE FROM code_files").run();
        });
        tx();
    }

    public static checkIntegrity(): { ok: boolean; message: string } {
        try {
            const db = this.getDB();
            const res = verifyDatabaseIntegrity(db, "quick");
            return { ok: res.ok, message: res.messages.join("; ") || "unknown" };
        } catch (err) {
            return { ok: false, message: (err as Error).message };
        }
    }

    public static verifyDatabaseIntegrity(mode: "quick" | "full" = "full"): IntegrityCheckResult {
        return verifyDatabaseIntegrity(this.getDB(), mode);
    }

    public static getMigrationStatus() {
        return getMigrationStatus(this.getDB());
    }

    public static backup(destinationPath?: string): BackupResult {
        const db = this.getDB();
        const frameworkDir = resolveFrameworkDir();
        const defaultDest = path.join(
            frameworkDir,
            "backups",
            `atabey-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
        );
        return backupDatabase(db, destinationPath || defaultDest);
    }

    public static restore(backupPath: string, targetDbPath?: string): { restoredPath: string; sha256: string; schemaVersion: number } {
        const frameworkDir = resolveFrameworkDir();
        const target = targetDbPath || path.join(frameworkDir, "atabey.db");
        this.reset();
        return restoreDatabase(backupPath, target);
    }

    // === API CATALOG (endpoint registry) ===

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

    public static reset() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

/** Canonical alias */
export const Storage = AtabeyStorage;

