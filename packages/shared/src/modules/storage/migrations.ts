/**
 * SQLite Schema Migration Runner, Startup Integrity Check & Online Backup/Restore (Phase 1.5)
 *
 * Provides:
 *   1. Versioned, checksummed schema migrations (`schema_migrations` table).
 *   2. Startup integrity verification (`PRAGMA quick_check` / `PRAGMA integrity_check`).
 *   3. Atomic online backup (`VACUUM INTO` + `.sha256` manifest) and verified restore.
 */

import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface SchemaMigration {
    version: number;
    name: string;
    sql: string;
}

export interface AppliedMigration {
    version: number;
    name: string;
    checksum: string;
    applied_at: string;
}

export interface IntegrityCheckResult {
    ok: boolean;
    messages: string[];
    foreignKeyViolations: number;
}

export interface BackupResult {
    backupPath: string;
    sha256: string;
    sizeBytes: number;
    createdAt: string;
    schemaVersion: number;
}

export const BUILTIN_MIGRATIONS: SchemaMigration[] = [
    {
        version: 1,
        name: "001_initial_core_tables",
        sql: `
            CREATE TABLE IF NOT EXISTS agents (
                name TEXT PRIMARY KEY,
                state TEXT DEFAULT 'READY',
                task TEXT DEFAULT 'Idle',
                description TEXT DEFAULT '',
                skills TEXT DEFAULT '[]',
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            );
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
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                trace_id TEXT,
                description TEXT,
                agent TEXT,
                status TEXT DEFAULT 'PENDING',
                priority TEXT DEFAULT 'NORMAL',
                dependencies TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
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
            );
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS costs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cost REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                trace_id TEXT
            );
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT UNIQUE,
                content TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                token TEXT UNIQUE,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `,
    },
    {
        version: 2,
        name: "002_governance_approvals_discipline_cooldowns",
        sql: `
            CREATE TABLE IF NOT EXISTS loop_cooldowns (
                agent TEXT PRIMARY KEY,
                cooldown_until INTEGER NOT NULL,
                detail TEXT,
                cooldown_count INTEGER DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
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
            );
            CREATE TABLE IF NOT EXISTS discipline (
                agent TEXT PRIMARY KEY,
                total_calls INTEGER DEFAULT 0,
                violations INTEGER DEFAULT 0,
                last_violation TEXT,
                cooldown_until INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `,
    },
    {
        version: 3,
        name: "003_performance_indexes",
        sql: `
            CREATE INDEX IF NOT EXISTS idx_messages_receiver_status ON messages(receiver, status);
            CREATE INDEX IF NOT EXISTS idx_messages_trace ON messages(trace_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_trace ON tasks(trace_id);
            CREATE INDEX IF NOT EXISTS idx_logs_trace ON logs(trace_id);
            CREATE INDEX IF NOT EXISTS idx_costs_timestamp ON costs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_costs_trace ON costs(trace_id);
        `,
    },
    {
        version: 4,
        name: "004_api_catalog",
        sql: `
            CREATE TABLE IF NOT EXISTS api_endpoints (
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                tag TEXT,
                summary TEXT,
                auth_required INTEGER DEFAULT 0,
                request_schema TEXT,
                response_schema TEXT,
                source TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (method, path)
            );
            CREATE INDEX IF NOT EXISTS idx_api_endpoints_tag ON api_endpoints(tag);
        `,
    },
    {
        version: 5,
        name: "005_discipline_call_history",
        sql: `
            CREATE TABLE IF NOT EXISTS discipline_calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent TEXT NOT NULL,
                tool TEXT NOT NULL,
                ts INTEGER NOT NULL,
                args_size INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_discipline_calls_agent_ts ON discipline_calls(agent, ts);
        `,
    },
    {
        version: 6,
        name: "006_code_graph",
        sql: `
            CREATE TABLE IF NOT EXISTS code_files (
                path TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS code_symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file TEXT NOT NULL,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                start_line INTEGER,
                end_line INTEGER,
                signature TEXT,
                exported INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols(name);
            CREATE INDEX IF NOT EXISTS idx_code_symbols_file ON code_symbols(file);
            CREATE TABLE IF NOT EXISTS code_imports (
                file TEXT NOT NULL,
                specifier TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_code_imports_file ON code_imports(file);
        `,
    },
    {
        version: 7,
        name: "007_job_queue",
        sql: `
            CREATE TABLE IF NOT EXISTS job_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                queue_name TEXT NOT NULL,
                payload TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                retries INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
            CREATE INDEX IF NOT EXISTS idx_job_queue_queue_name ON job_queue(queue_name);
        `,
    },
];

function migrationChecksum(sql: string): string {
    return crypto.createHash("sha256").update(sql.trim(), "utf8").digest("hex");
}

function ensureMigrationsTable(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    `);
}

/**
 * Run all pending schema migrations transactionally and return applied version numbers.
 */
export function runPendingMigrations(
    db: Database.Database,
    migrations: SchemaMigration[] = BUILTIN_MIGRATIONS,
): { applied: number[]; currentVersion: number } {
    ensureMigrationsTable(db);

    const existingRows = db
        .prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC")
        .all() as AppliedMigration[];
    const existingMap = new Map<number, AppliedMigration>(existingRows.map((r) => [r.version, r]));

    const sorted = [...migrations].sort((a, b) => a.version - b.version);
    const applied: number[] = [];

    for (const m of sorted) {
        const prev = existingMap.get(m.version);
        const checksum = migrationChecksum(m.sql);
        if (prev) {
            if (prev.checksum !== checksum) {
                throw new Error(
                    `[MIGRATION] Checksum mismatch for migration v${m.version} (${m.name}): ` +
                        `expected ${prev.checksum}, got ${checksum}.`,
                );
            }
            continue;
        }

        const applyOne = db.transaction(() => {
            db.exec(m.sql);
            db.prepare(
                "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
            ).run(m.version, m.name, checksum, new Date().toISOString());
        });
        applyOne();
        applied.push(m.version);
    }

    // Legacy column backfill for older databases that predate v1 hash columns
    try {
        const tableInfo = db.prepare("PRAGMA table_info(logs)").all() as Array<{ name: string }>;
        const colNames = tableInfo.map((c) => c.name);
        if (colNames.length > 0) {
            if (!colNames.includes("prev_hash")) db.exec("ALTER TABLE logs ADD COLUMN prev_hash TEXT");
            if (!colNames.includes("hash")) db.exec("ALTER TABLE logs ADD COLUMN hash TEXT");
        }
    } catch {
        /* ignore if logs table does not exist in custom migration test */
    }

    const latest = db.prepare("SELECT MAX(version) as v FROM schema_migrations").get() as { v: number | null };
    return {
        applied,
        currentVersion: latest?.v ?? 0,
    };
}

/**
 * Return applied and pending migrations for diagnostics/CLI.
 */
export function getMigrationStatus(
    db: Database.Database,
    migrations: SchemaMigration[] = BUILTIN_MIGRATIONS,
): {
    currentVersion: number;
    applied: AppliedMigration[];
    pending: Array<{ version: number; name: string }>;
} {
    ensureMigrationsTable(db);
    const applied = db
        .prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC")
        .all() as AppliedMigration[];
    const appliedSet = new Set(applied.map((a) => a.version));
    const pending = migrations
        .filter((m) => !appliedSet.has(m.version))
        .map((m) => ({ version: m.version, name: m.name }));
    const currentVersion = applied.length > 0 ? applied[applied.length - 1].version : 0;
    return { currentVersion, applied, pending };
}

/**
 * Run SQLite integrity_check / quick_check and foreign_key_check.
 */
export function verifyDatabaseIntegrity(
    db: Database.Database,
    mode: "quick" | "full" = "quick",
): IntegrityCheckResult {
    const pragma = mode === "full" ? "integrity_check" : "quick_check";
    const rows = db.prepare(`PRAGMA ${pragma}`).all() as Array<Record<string, string>>;
    const messages = rows.map((r) => Object.values(r)[0] || "");
    const fkRows = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
    const ok = messages.length === 1 && messages[0].toLowerCase() === "ok" && fkRows.length === 0;
    return {
        ok,
        messages,
        foreignKeyViolations: fkRows.length,
    };
}

function computeFileSha256(filePath: string): string {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    try {
        let bytesRead = 0;
        while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest("hex");
}

/**
 * Perform a consistent online backup using SQLite `VACUUM INTO` and write a `.sha256` sidecar.
 */
export function backupDatabase(db: Database.Database, destinationPath: string): BackupResult {
    const absDest = path.resolve(destinationPath);
    const parentDir = path.dirname(absDest);
    fs.mkdirSync(parentDir, { recursive: true });

    if (fs.existsSync(absDest)) {
        fs.unlinkSync(absDest);
    }

    // Escape single quotes in path for SQLite VACUUM INTO literal
    const escapedPath = absDest.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);

    const sha256 = computeFileSha256(absDest);
    const sizeBytes = fs.statSync(absDest).size;
    fs.writeFileSync(`${absDest}.sha256`, `${sha256}  ${path.basename(absDest)}\n`, { mode: 0o600 });

    const status = getMigrationStatus(db);
    return {
        backupPath: absDest,
        sha256,
        sizeBytes,
        createdAt: new Date().toISOString(),
        schemaVersion: status.currentVersion,
    };
}

/**
 * Verify a backup file (checksum sidecar + SQLite integrity_check) and atomically restore it.
 */
export function restoreDatabase(
    backupPath: string,
    targetDbPath: string,
    options: { verifyChecksum?: boolean } = {},
): { restoredPath: string; sha256: string; schemaVersion: number } {
    const absBackup = path.resolve(backupPath);
    const absTarget = path.resolve(targetDbPath);

    if (!fs.existsSync(absBackup)) {
        throw new Error(`Backup file does not exist: ${absBackup}`);
    }

    const actualSha256 = computeFileSha256(absBackup);

    const sidecarPath = `${absBackup}.sha256`;
    if (options.verifyChecksum !== false && fs.existsSync(sidecarPath)) {
        const expected = fs.readFileSync(sidecarPath, "utf8").trim().split(/\s+/)[0];
        if (expected && expected !== actualSha256) {
            throw new Error(
                `Backup checksum mismatch for ${absBackup}: expected ${expected}, got ${actualSha256}`,
            );
        }
    }

    // Open backup in read-only mode to verify SQLite integrity before overwriting target
    const tempCheckDb = new Database(absBackup, { readonly: true });
    let schemaVersion = 0;
    try {
        const integrity = verifyDatabaseIntegrity(tempCheckDb, "full");
        if (!integrity.ok) {
            throw new Error(`Backup file failed SQLite integrity check: ${integrity.messages.join("; ")}`);
        }
        try {
            const row = tempCheckDb
                .prepare("SELECT MAX(version) as v FROM schema_migrations")
                .get() as { v: number | null } | undefined;
            schemaVersion = row?.v ?? 0;
        } catch {
            /* schema_migrations table may not exist in older backups */
        }
    } finally {
        tempCheckDb.close();
    }

    fs.mkdirSync(path.dirname(absTarget), { recursive: true });
    const stagingPath = `${absTarget}.restore.${process.pid}`;
    fs.copyFileSync(absBackup, stagingPath);

    // Remove stale WAL/SHM files before atomic swap
    for (const suffix of ["-wal", "-shm"]) {
        const walFile = `${absTarget}${suffix}`;
        if (fs.existsSync(walFile)) {
            try {
                fs.unlinkSync(walFile);
            } catch {
                /* ignore */
            }
        }
    }

    fs.renameSync(stagingPath, absTarget);
    return {
        restoredPath: absTarget,
        sha256: actualSha256,
        schemaVersion,
    };
}
