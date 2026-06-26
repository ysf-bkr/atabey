import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getFrameworkDir } from "./memory.js";
import { TraceID } from "./types.js";

export interface AgentRow {
    name: string;
    state: string;
    task: string;
    last_updated: string;
}

export interface MessageRow {
    id?: number;
    timestamp: string;
    from: string;
    to: string;
    category: string;
    content: string;
    traceId: TraceID;
    parentId?: string;
    status: string;
    priority: string;
    requiresApproval: boolean;
}

export interface TaskRow {
    id: string;
    traceId: TraceID;
    description: string;
    agent: string;
    status: string;
    priority: string;
    dependencies: string[];
    createdAt?: string;
}

export interface LogRow {
    id?: number;
    timestamp: string;
    agent: string;
    action: string;
    trace_id?: TraceID;
    status: string;
    summary: string;
    findings?: string;
}

/**
 * [DB] Atabey Storage Engine
 * Central SQLite database for enterprise-scale agent state management.
 */
export class Storage {
    private static db: Database.Database | null = null;

    public static getDB(): Database.Database {
        if (!this.db) {
            const dbPath = path.join(process.cwd(), "atabey.db");
            this.db = new Database(dbPath);
            this.initializeSchema();
        }
        return this.db;
    }

    private static initializeSchema() {
        const db = this.db!;

        // Agents Table (with description & skills for dashboard compatibility)
        db.exec(`
            CREATE TABLE IF NOT EXISTS agents (
                name TEXT PRIMARY KEY,
                state TEXT DEFAULT 'READY',
                task TEXT DEFAULT 'Idle',
                description TEXT DEFAULT 'Otonom Uzman Ajan',
                skills TEXT DEFAULT '[]',
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

        // Knowledge Base Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS knowledge (
                name TEXT PRIMARY KEY,
                content TEXT,
                size INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Users Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                name TEXT PRIMARY KEY,
                token TEXT UNIQUE NOT NULL,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Constitution Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS constitution (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                section TEXT NOT NULL UNIQUE,
                title TEXT,
                content TEXT NOT NULL,
                priority INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // CLI Commands Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS cli_commands (
                command TEXT PRIMARY KEY,
                agent TEXT NOT NULL,
                description TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Prompts Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS prompts (
                name TEXT PRIMARY KEY,
                category TEXT DEFAULT 'general',
                content TEXT NOT NULL,
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Rules Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS rules (
                name TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Registry Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS registry (
                name TEXT PRIMARY KEY,
                type TEXT DEFAULT 'agent',
                data TEXT NOT NULL DEFAULT '{}',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Router Config Table
        db.exec(`
            CREATE TABLE IF NOT EXISTS router_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed default agents if empty
        const isTest = !!(process.env.ATABEY_TEST_DIR || process.env.VITEST || process.env.NODE_ENV === "test");
        if (!isTest) {
            try {
                const agentCount = db.prepare("SELECT COUNT(*) as count FROM agents").get() as { count: number };
                if (agentCount.count === 0) {
                    const defaultAgents = [
                        { name: "manager", desc: "Planlama, koordinasyon ve otonom delege etme uzmanı.", skills: '["planning", "routing", "governance"]' },
                        { name: "security", desc: "Statik kod analizi, bağımlılık güvenliği ve politika gate denetçisi.", skills: '["security_audit", "compliance"]' },
                        { name: "architect", desc: "Sistem mimarisi, tasarım desenleri ve dosya düzeni planlayıcı.", skills: '["architecture", "file_layout"]' },
                        { name: "backend", desc: "API geliştirme, iş mantığı (business logic) ve entegrasyonlar.", skills: '["backend_development", "rest_api"]' },
                        { name: "frontend", desc: "Kullanıcı arayüzleri, CSS stilleri ve görsel kalıplar.", skills: '["frontend_development", "css_styling"]' },
                        { name: "quality", desc: "Kod kapsamı, test otomasyonu ve test suite denetimi.", skills: '["testing", "code_coverage"]' },
                        { name: "database", desc: "SQL şemaları, tablo tasarımı, optimizasyon ve Kysely entegrasyonu.", skills: '["database_design", "sql_queries"]' },
                        { name: "analyst", desc: "Gereksinim analizi, kullanıcı senaryoları ve spesifikasyon üretimi.", skills: '["requirements", "specifications"]' },
                        { name: "mobile", desc: "React Native ve mobil platform standartları uyum denetçisi.", skills: '["mobile_standards"]' },
                        { name: "native", desc: "C++, Rust ve gömülü platform standartları denetçisi.", skills: '["native_standards"]' },
                        { name: "devops", desc: "Docker, CI/CD süreçleri, kabuk betikleri ve sistem otomasyonu.", skills: '["devops_automation", "docker_config"]' },
                        { name: "explorer", desc: "Kod tabanında keşif, anlamsal arama ve kod okuma.", skills: '["codebase_search"]' },
                        { name: "git", desc: "Versiyon kontrolü, commit oluşturma, branch yönetimi ve diff analizi.", skills: '["git_operations"]' }
                    ];
                    const insert = db.prepare(`
                        INSERT INTO agents (name, state, task, last_updated)
                        VALUES (?, 'READY', 'Idle', ?)
                        ON CONFLICT(name) DO NOTHING
                    `);
                    const now = new Date().toISOString();
                    for (const a of defaultAgents) {
                        insert.run(a.name, now);
                    }
                }
            } catch (e) {
                process.stderr.write(`[STORAGE] Agent seed error: ${(e as Error).message}\n`);
            }
        }

        // Seed data from .atabey/ files if tables are empty
        if (!isTest) {
            try {
                const frameworkDir = getFrameworkDir();

                // Seed constitution from ATABEY.md
                const constitutionCount = db.prepare("SELECT COUNT(*) as count FROM constitution").get() as { count: number };
                if (constitutionCount.count === 0) {
                    const atabeyMdPath = path.join(frameworkDir, "ATABEY.md");
                    if (fs.existsSync(atabeyMdPath)) {
                        const content = fs.readFileSync(atabeyMdPath, "utf8");
                        db.prepare("INSERT INTO constitution (section, title, content) VALUES (?, ?, ?)").run("supreme_law", "Supreme Law", content);
                    }
                }

                // Seed CLI commands
                const cmdCount = db.prepare("SELECT COUNT(*) as count FROM cli_commands").get() as { count: number };
                if (cmdCount.count === 0) {
                    const cmdPath = path.join(frameworkDir, "cli-commands.json");
                    if (fs.existsSync(cmdPath)) {
                        const cmdData = JSON.parse(fs.readFileSync(cmdPath, "utf8"));
                        const insertCmd = db.prepare("INSERT OR IGNORE INTO cli_commands (command, agent, description) VALUES (?, ?, ?)");
                        for (const [cmd, info] of Object.entries(cmdData.commands || {})) {
                            const ci = info as { agent: string; description: string };
                            insertCmd.run(cmd, ci.agent, ci.description);
                        }
                    }
                }

                // Seed prompts from .atabey/prompts/
                const promptCount = db.prepare("SELECT COUNT(*) as count FROM prompts").get() as { count: number };
                if (promptCount.count === 0) {
                    const promptsDir = path.join(frameworkDir, "prompts");
                    if (fs.existsSync(promptsDir)) {
                        const files = fs.readdirSync(promptsDir).filter(f => f.endsWith(".md"));
                        const insertPrompt = db.prepare("INSERT OR IGNORE INTO prompts (name, category, content) VALUES (?, ?, ?)");
                        for (const file of files) {
                            const content = fs.readFileSync(path.join(promptsDir, file), "utf8");
                            const category = file.replace(/-recipe\.md$/, "").replace(/-template\.md$/, "");
                            insertPrompt.run(file, category, content);
                        }
                    }
                }

                // Seed rules from .atabey/rules/
                const ruleCount = db.prepare("SELECT COUNT(*) as count FROM rules").get() as { count: number };
                if (ruleCount.count === 0) {
                    const rulesDir = path.join(frameworkDir, "rules");
                    if (fs.existsSync(rulesDir)) {
                        const files = fs.readdirSync(rulesDir).filter(f => f.endsWith(".mdc") || f.endsWith(".md"));
                        const insertRule = db.prepare("INSERT OR IGNORE INTO rules (name, content) VALUES (?, ?)");
                        for (const file of files) {
                            const content = fs.readFileSync(path.join(rulesDir, file), "utf8");
                            insertRule.run(file, content);
                        }
                    }
                }

                // Seed registry from .atabey/registry/
                const regCount = db.prepare("SELECT COUNT(*) as count FROM registry").get() as { count: number };
                if (regCount.count === 0) {
                    const registryDir = path.join(frameworkDir, "registry");
                    if (fs.existsSync(registryDir)) {
                        const files = fs.readdirSync(registryDir).filter(f => f.endsWith(".md") || f.endsWith(".json"));
                        const insertReg = db.prepare("INSERT OR IGNORE INTO registry (name, type, data) VALUES (?, ?, ?)");
                        for (const file of files) {
                            const content = fs.readFileSync(path.join(registryDir, file), "utf8");
                            insertReg.run(file, file.endsWith(".json") ? "config" : "doc", content);
                        }
                    }
                }
            } catch (seedErr) {
                process.stderr.write(`[STORAGE] Seed error: ${(seedErr as Error).message}\n`);
            }
        }
    }

    // --- Agent Operations ---

    public static updateAgentStatus(name: string, state: string, task: string, lastUpdated?: string) {
        const db = this.getDB();
        const cleanName = name.replace("@", "");
        const timestamp = lastUpdated || new Date().toISOString();
        db.prepare(`
            INSERT INTO agents (name, state, task, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                state = excluded.state,
                task = excluded.task,
                last_updated = excluded.last_updated
        `).run(cleanName, state, task, timestamp);
    }

    public static getAllAgents(): AgentRow[] {
        return this.getDB().prepare("SELECT * FROM agents").all() as AgentRow[];
    }

    // --- Message Operations ---

    public static saveMessage(msg: MessageRow) {
        const db = this.getDB();
        db.prepare(`
            INSERT INTO messages (sender, receiver, category, content, trace_id, parent_id, status, priority, requires_approval)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            msg.from,
            msg.to,
            msg.category,
            msg.content,
            msg.traceId,
            msg.parentId || null,
            msg.status || "PENDING",
            msg.priority || "NORMAL",
            msg.requiresApproval ? 1 : 0
        );
    }

    public static getPendingMessages(): MessageRow[] {
        const rows = this.getDB().prepare("SELECT * FROM messages WHERE status IN ('PENDING', 'APPROVED') ORDER BY priority DESC, timestamp ASC").all() as {
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
        }[];
        return rows.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            from: r.sender,
            to: r.receiver,
            category: r.category,
            content: r.content,
            traceId: r.trace_id as TraceID,
            parentId: r.parent_id || undefined,
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
        let rows: {
            id: string;
            trace_id: string;
            description: string;
            agent: string;
            status: string;
            priority: string;
            dependencies: string;
            created_at: string;
        }[];
        if (traceId) {
            rows = db.prepare("SELECT * FROM tasks WHERE trace_id = ?").all(traceId) as {
                id: string;
                trace_id: string;
                description: string;
                agent: string;
                status: string;
                priority: string;
                dependencies: string;
                created_at: string;
            }[];
        } else {
            rows = db.prepare("SELECT * FROM tasks").all() as {
                id: string;
                trace_id: string;
                description: string;
                agent: string;
                status: string;
                priority: string;
                dependencies: string;
                created_at: string;
            }[];
        }
        return rows.map(r => {
            let deps: string[] = [];
            try {
                const parsed = JSON.parse(r.dependencies || "[]");
                deps = Array.isArray(parsed) ? parsed : JSON.parse(parsed);
            } catch {
                // Keep empty array
            }

            return {
                id: r.id,
                traceId: r.trace_id as TraceID,
                description: r.description,
                agent: r.agent,
                status: r.status,
                priority: r.priority,
                dependencies: deps,
                createdAt: r.created_at
            };
        });
    }

    public static getLogs(agentName?: string): LogRow[] {
        const db = this.getDB();
        let rows: {
            id: number;
            timestamp: string;
            agent: string;
            action: string;
            trace_id: string | null;
            status: string;
            summary: string;
            findings: string | null;
        }[];
        const cleanName = agentName ? agentName.replace("@", "") : undefined;

        if (cleanName) {
            rows = db.prepare("SELECT * FROM logs WHERE agent = ? ORDER BY timestamp DESC").all(cleanName) as typeof rows;
        } else {
            rows = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC").all() as typeof rows;
        }

        return rows.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            agent: r.agent,
            action: r.action,
            trace_id: (r.trace_id as TraceID) || undefined,
            status: r.status,
            summary: r.summary,
            findings: r.findings || undefined
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
