/**
 * SQLite connection bootstrap, schema creation, migrations and reset.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { databaseHolder } from "./database.js";
import { logger } from "../observability/logger.js";
import { runPendingMigrations, verifyDatabaseIntegrity } from "./migrations.js";
import { resolveFrameworkDir } from "./framework-dir.js";

export class StorageBase {
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

    public static reset() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
