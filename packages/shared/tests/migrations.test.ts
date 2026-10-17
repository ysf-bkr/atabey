import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    BUILTIN_MIGRATIONS,
    backupDatabase,
    getMigrationStatus,
    restoreDatabase,
    runPendingMigrations,
    verifyDatabaseIntegrity,
} from "../src/migrations.js";

const LATEST_VERSION = BUILTIN_MIGRATIONS[BUILTIN_MIGRATIONS.length - 1].version;

describe("SQLite Schema Migrations, Integrity & Backup/Restore", () => {
    let tempDir: string;
    let dbPath: string;
    let db: Database.Database;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-mig-test-"));
        dbPath = path.join(tempDir, "atabey.db");
        db = new Database(dbPath);
    });

    afterEach(() => {
        try {
            db.close();
        } catch {
            /* already closed */
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("applies built-in migrations idempotently and tracks version + checksums", () => {
        const first = runPendingMigrations(db);
        expect(first.applied.length).toBeGreaterThanOrEqual(3);
        expect(first.currentVersion).toBe(LATEST_VERSION);

        const second = runPendingMigrations(db);
        expect(second.applied).toEqual([]);
        expect(second.currentVersion).toBe(LATEST_VERSION);

        const status = getMigrationStatus(db);
        expect(status.currentVersion).toBe(LATEST_VERSION);
        expect(status.pending).toHaveLength(0);
    });

    it("detects tampered migration SQL via checksum mismatch", () => {
        runPendingMigrations(db, [
            { version: 1, name: "001_test", sql: "CREATE TABLE t1 (id INT);" },
        ]);
        expect(() =>
            runPendingMigrations(db, [
                { version: 1, name: "001_test", sql: "CREATE TABLE t1 (id INT, extra TEXT);" },
            ]),
        ).toThrow(/Checksum mismatch/i);
    });

    it("verifies database integrity, creates online backup with SHA-256 sidecar, and restores", () => {
        runPendingMigrations(db);
        db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("project", "atabey");

        const integrity = verifyDatabaseIntegrity(db, "full");
        expect(integrity.ok).toBe(true);

        const backupFile = path.join(tempDir, "backups", "snap.db");
        const backupRes = backupDatabase(db, backupFile);
        expect(fs.existsSync(backupRes.backupPath)).toBe(true);
        expect(fs.existsSync(`${backupRes.backupPath}.sha256`)).toBe(true);
        expect(backupRes.schemaVersion).toBe(LATEST_VERSION);

        // Mutate original DB, then restore from backup
        db.prepare("DELETE FROM metadata WHERE key = ?").run("project");
        db.close();

        const restored = restoreDatabase(backupFile, dbPath);
        expect(restored.sha256).toBe(backupRes.sha256);

        const reopened = new Database(dbPath);
        try {
            const row = reopened
                .prepare("SELECT value FROM metadata WHERE key = ?")
                .get("project") as { value: string } | undefined;
            expect(row?.value).toBe("atabey");
        } finally {
            reopened.close();
        }
    });
});
