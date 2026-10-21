/**
 * Database integrity checks, migration status, backup/restore.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import path from "path";
import { backupDatabase, getMigrationStatus, restoreDatabase, verifyDatabaseIntegrity } from "./migrations.js";
import type { BackupResult, IntegrityCheckResult } from "./migrations.js";
import { resolveFrameworkDir } from "./framework-dir.js";
import { StorageCodeGraph } from "./code-graph.js";

export class StorageIntegrity extends StorageCodeGraph {
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
}
