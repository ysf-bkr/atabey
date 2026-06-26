import cp from "child_process";
import path from "path";
import { getConfiguredPaths } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

export async function gitCommitCommand(traceId: string) {
    try {
        const diff = cp.execSync("git diff --staged", { encoding: "utf8" });
        if (!diff) {
            UI.info("No staged changes found. Use 'git add' first.");
            return;
        }
        const files = cp.execSync("git diff --staged --name-only", { encoding: "utf8" }).split("\n").filter(Boolean);
        const pathsMap = getConfiguredPaths();
        const backendTypesPath = path.join(pathsMap.backend, "src/types");
        let type = "feat";
        const scope = "code";
        if (files.some((f) => f.includes(".md"))) type = "docs";
        else if (files.some((f) => f.includes(backendTypesPath))) type = "arch";
        else if (files.some((f) => f.includes("bin/cli.js"))) type = "fix";

        const summary = files.length === 1 ? `update ${path.basename(files[0])}` : `update ${files.length} files`;
        process.stdout.write(`\n### SUGGESTED COMMIT MESSAGE ###\n\n[${traceId}] ${type}(${scope}): ${summary}\n`);
    } catch {
        UI.error("Git command failed.");
    }
}

export async function gitSyncCommand() {
    UI.info("Syncing with remote repository...");
    try {
        cp.execSync("git pull origin main --rebase", { stdio: "inherit" });
        UI.success("Successfully synced and rebased.");
    } catch {
        UI.error("Sync failed. Please resolve conflicts manually.");
    }
}
