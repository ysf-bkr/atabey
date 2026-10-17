import { Storage } from "atabey-shared/storage.js";
import { runPendingMigrations } from "atabey-shared/migrations.js";
import { UI } from "../utils/ui.js";

export async function dbCommand(args: string[]): Promise<void> {
    const sub = (args[0] || "status").toLowerCase();

    if (sub === "status") {
        const status = Storage.getMigrationStatus();
        const integrity = Storage.verifyDatabaseIntegrity("quick");
        UI.info(`SQLite Schema Version: v${status.currentVersion}`);
        UI.info(`Integrity Check: ${integrity.ok ? "OK" : `FAILED (${integrity.messages.join("; ")})`}`);
        UI.info(`Applied Migrations: ${status.applied.length}`);
        for (const m of status.applied) {
            process.stdout.write(`  [v${m.version}] ${m.name} (${m.applied_at})\n`);
        }
        if (status.pending.length > 0) {
            UI.warning(`Pending Migrations: ${status.pending.map((p) => `v${p.version}:${p.name}`).join(", ")}`);
        }
        return;
    }

    if (sub === "migrate") {
        const db = Storage.getDB();
        const res = runPendingMigrations(db);
        UI.success(
            `Migrations complete. Applied: ${res.applied.length} (current schema v${res.currentVersion}).`,
        );
        return;
    }

    if (sub === "verify") {
        const res = Storage.verifyDatabaseIntegrity("full");
        if (res.ok) {
            UI.success("Database full integrity check passed (0 foreign-key violations).");
        } else {
            UI.error(
                `Database integrity check failed: ${res.messages.join("; ")} (FK violations: ${res.foreignKeyViolations})`,
            );
            process.exitCode = 1;
        }
        return;
    }

    if (sub === "backup") {
        const dest = args[1];
        const result = Storage.backup(dest);
        UI.success(`Database backup written to: ${result.backupPath}`);
        UI.info(`SHA-256: ${result.sha256} (${result.sizeBytes} bytes, schema v${result.schemaVersion})`);
        return;
    }

    if (sub === "restore") {
        const src = args[1];
        if (!src) {
            UI.error("Usage: atabey db restore <backup-file> [target-db-path]");
            process.exitCode = 64;
            return;
        }
        const restored = Storage.restore(src, args[2]);
        UI.success(`Database restored to: ${restored.restoredPath}`);
        UI.info(`Verified SHA-256: ${restored.sha256} (schema v${restored.schemaVersion})`);
        return;
    }

    UI.error("Usage: atabey db <status|migrate|verify|backup|restore> [path]");
}
