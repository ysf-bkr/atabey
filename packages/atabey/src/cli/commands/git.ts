import cp from "child_process";
import fs from "fs";
import path from "path";
import { scanForSecrets } from "atabey-shared/secrets.js";
import { getConfiguredPaths } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

/** Protected branches a PR must never be opened FROM directly. */
const PROTECTED_BRANCHES = new Set(["main", "master", "develop"]);
const SAFE_ENV_TEMPLATES = new Set([".env.example", ".env.sample", ".env.template", ".env.dist"]);

interface StagedSecretFinding {
    file: string;
    description: string;
}

function execGit(args: string[], opts: { cwd?: string; allowFailure?: boolean } = {}): string {
    try {
        const cmdline = ["git", ...args.map((a) => (/[\s"'`()]/.test(a) ? JSON.stringify(a) : a))].join(" ");
        return cp.execSync(cmdline, { encoding: "utf8", cwd: opts.cwd }).trim();
    } catch (err) {
        if (opts.allowFailure) return "";
        throw err;
    }
}

function inspectStagedSecrets(): { findings: StagedSecretFinding[]; error?: string } {
    try {
        const files = cp.execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
            encoding: "utf8",
        }).split("\0").filter(Boolean);
        const findings: StagedSecretFinding[] = [];

        for (const file of files) {
            const basename = path.posix.basename(file);
            if (basename.toLowerCase().startsWith(".env") && !SAFE_ENV_TEMPLATES.has(basename.toLowerCase())) {
                findings.push({ file, description: "environment file may contain local credentials" });
                continue;
            }

            const content = cp.execFileSync("git", ["show", `:${file}`], {
                encoding: "utf8",
                maxBuffer: 50 * 1024 * 1024,
            });
            if (content.includes("\0")) continue;
            for (const secret of scanForSecrets(content)) {
                findings.push({ file, description: secret.description });
            }
        }

        return { findings };
    } catch (err) {
        return { findings: [], error: (err as Error).message };
    }
}

function blockStagedSecrets(): boolean {
    const result = inspectStagedSecrets();
    if (result.error) {
        UI.error(`Could not scan staged changes; refusing to commit: ${result.error}`);
        process.exitCode = 1;
        return true;
    }
    if (result.findings.length === 0) return false;

    UI.error("Commit blocked: potential credentials or secrets were found in staged changes.");
    for (const finding of result.findings) {
        UI.warning(`  ${finding.file}: ${finding.description}`);
    }
    UI.info("Remove the credential or move it to a local environment/vault file, then retry.");
    process.exitCode = 1;
    return true;
}

function detectDefaultBranch(): string {
    const remoteHead = execGit(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], { allowFailure: true });
    if (remoteHead) return remoteHead.replace("origin/", "");
    const remoteShow = execGit(["remote", "show", "origin"], { allowFailure: true });
    const match = remoteShow.match(/HEAD branch:\s*(\S+)/);
    if (match) return match[1];
    return "main";
}

function buildCompareUrl(branch: string, base: string): string | null {
    const remoteUrl = execGit(["remote", "get-url", "origin"], { allowFailure: true });
    if (!remoteUrl) return null;
    const https = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)\.git$/) || remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)$/);
    if (!https) return null;
    return `https://github.com/${https[1]}/${https[2]}/compare/${base}...${branch}`;
}

export async function gitCommitCommand(traceId: string) {
    try {
        const diff = cp.execSync("git diff --staged", { encoding: "utf8" });
        if (!diff) {
            UI.info("No staged changes found. Use 'git add' first.");
            return;
        }
        if (blockStagedSecrets()) return;
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
        process.exit(1);
    }
}

/**
 * [B1] CI feedback loop: fetches the CI/check status of a pull request and
 * feeds the result back into the agent loop as a Hermes CI_RESULT message,
 * so the owning agent (or @manager) can react to red builds without a human
 * relaying the outcome.
 *
 * `atabey git ci-status [pr-number-or-url] [--agent @backend]`
 *
 * Uses the GitHub CLI (`gh pr checks --json`). When `gh` is unavailable or
 * the PR has no checks yet, the command reports that and exits cleanly.
 */
export async function gitCiStatusCommand(args: string[]): Promise<void> {
    const positional: string[] = [];
    let agent = "@manager";
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--agent") agent = args[++i] || agent;
        else positional.push(args[i]);
    }

    const ghAvailable = cp.spawnSync("gh", ["--version"], { encoding: "utf8" }).status === 0;
    if (!ghAvailable) {
        UI.error("GitHub CLI ('gh') not found. Install it to use 'atabey git ci-status'.");
        process.exitCode = 64;
        return;
    }

    const prArg = positional[0] ?? "";
    let checksJson: string;
    try {
        checksJson = cp.execSync(
            `gh pr checks ${prArg ? JSON.stringify(prArg) : ""} --json name,state,link --required`,
            { encoding: "utf8" },
        ).trim();
    } catch (err) {
        UI.error(`Failed to fetch PR checks: ${(err as Error).message.split("\n")[0]}`);
        process.exitCode = 1;
        return;
    }

    let checks: Array<{ name: string; state: string; link?: string }>;
    try {
        checks = JSON.parse(checksJson) as Array<{ name: string; state: string; link?: string }>;
    } catch {
        UI.error("Could not parse 'gh pr checks' output as JSON.");
        process.exitCode = 1;
        return;
    }

    if (checks.length === 0) {
        UI.info("No CI checks reported for this PR yet.");
        return;
    }

    const failing = checks.filter((c) => c.state !== "pass" && c.state !== "success");
    const overall = failing.length === 0 ? "GREEN" : "RED";

    // 1. Human-facing summary
    for (const c of checks) {
        const mark = c.state === "pass" || c.state === "success" ? "✓" : "✗";
        process.stdout.write(`  ${mark} ${c.name}: ${c.state}\n`);
    }
    UI[overall === "GREEN" ? "success" : "error"](`CI status: ${overall} (${checks.length - failing.length}/${checks.length} checks passing).`);

    // 2. Agent-facing feedback: structured Hermes message into the loop.
    try {
        const { AtabeyStorage } = await import("atabey-shared/storage.js");
        const { asAgentID, asTraceID } = await import("atabey-shared/types.js");
        const traceId = asTraceID(`CI-${Date.now()}`);
        AtabeyStorage.saveMessage({
            from: asAgentID("@devops"),
            to: asAgentID(agent),
            category: "CI_RESULT" as const,
            content: JSON.stringify({
                type: "CI_RESULT",
                pr: prArg || "(current branch PR)",
                overall,
                passing: checks.length - failing.length,
                total: checks.length,
                failingChecks: failing.map((c) => ({ name: c.name, state: c.state, link: c.link })),
            }),
            traceId,
            timestamp: new Date().toISOString(),
            status: "PENDING" as const,
            priority: failing.length > 0 ? "HIGH" as const : "NORMAL" as const,
            requiresApproval: false,
        });
        AtabeyStorage.saveLog({
            agent: "@devops",
            action: "CI_STATUS_FEEDBACK",
            trace_id: traceId,
            status: overall,
            summary: `CI ${overall}: ${checks.length - failing.length}/${checks.length} checks passing for ${prArg || "current PR"}.`,
        });
        UI.info(`CI result delivered to ${agent} via Hermes (category: CI_RESULT).`);
    } catch (err) {
        UI.warning(`Could not write CI feedback to Hermes: ${(err as Error).message}`);
    }
}

/**
 * [B1] Pull-request automation for agent-driven git flow.
 *
 * `atabey git pr [title] [--base <branch>] [--auto-commit]`
 *
 * Flow: (optionally stage+commit pending changes) → push the current branch
 * to origin → open a PR via the GitHub CLI (`gh`) when available, otherwise
 * print a compare URL so the PR can be created manually. Refuses to open a
 * PR directly from a protected branch.
 */
export async function gitPrCommand(args: string[]): Promise<void> {
    const positional: string[] = [];
    let base: string | undefined;
    let autoCommit = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--base") base = args[++i];
        else if (args[i] === "--auto-commit") autoCommit = true;
        else positional.push(args[i]);
    }

    // 1. Repo + branch sanity
    const branch = execGit(["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
    if (!branch) {
        UI.error("Not inside a git repository. 'atabey git pr' must run from the repo root or a worktree.");
        process.exit(1);
    }
    if (PROTECTED_BRANCHES.has(branch)) {
        UI.error(`Refusing to open a PR from protected branch '${branch}'. Work on an agent branch or worktree (see 'atabey worktree create').`);
        process.exit(1);
    }

    const targetBase = base || detectDefaultBranch();

    // 2. Optional auto-commit of pending changes
    if (autoCommit) {
        const status = execGit(["status", "--porcelain"], { allowFailure: true });
        if (status) {
            execGit(["add", "-A"]);
            if (blockStagedSecrets()) return;
            execGit(["commit", "-m", `chore(agent): auto-commit pending changes on ${branch}`]);
            UI.success(`Auto-committed pending changes on '${branch}'.`);
        } else {
            UI.info("No pending changes to auto-commit.");
        }
    } else {
        const status = execGit(["status", "--porcelain"], { allowFailure: true });
        if (status) {
            UI.warning("Uncommitted changes detected. Commit them first or pass --auto-commit.");
        }
    }

    // 3. Push the branch
    try {
        execGit(["push", "-u", "origin", branch]);
        UI.success(`Pushed '${branch}' to origin.`);
    } catch {
        UI.error(`Failed to push '${branch}' to origin. Check your remote credentials.`);
        process.exit(1);
    }

    // 4. Build title and body
    const commits = execGit(["log", `${targetBase}..HEAD`, "--oneline"], { allowFailure: true })
        .split("\n")
        .filter(Boolean);
    const title = positional.join(" ").trim() ||
        (commits[0] ? commits[0].replace(/^[0-9a-f]+\s*/, "") : `Merge ${branch} into ${targetBase}`);

    // Check for session handoff evidence to enrich the pull request
    const handoffPath = path.join(process.cwd(), ".atabey", "memory", "session-handoff.md");
    let handoffEvidence = "";
    if (fs.existsSync(handoffPath)) {
        try {
            const rawHandoff = fs.readFileSync(handoffPath, "utf8");
            handoffEvidence = `\n\n### 🛡️ Verification & Handoff Evidence\n${rawHandoff.trim()}\n`;
        } catch {
            // non-fatal
        }
    }

    const body = [
        `**Source branch:** \`${branch}\``,
        `**Base branch:** \`${targetBase}\``,
        "",
        "**Commits:**",
        ...(commits.length > 0 ? commits.map((c) => `- ${c}`) : ["- (no commits ahead of base)"]),
        handoffEvidence,
        "",
        "_Created via `atabey git pr` — Atabey governed git flow._",
    ].join("\n");

    // 5. Create the PR via gh, or fall back to a compare URL
    const ghAvailable = cp.spawnSync("gh", ["--version"], { encoding: "utf8" }).status === 0;
    if (ghAvailable) {
        try {
            const url = cp.execSync(
                `gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --base ${targetBase}`,
                { encoding: "utf8" },
            ).trim();
            UI.success(`Pull request created: ${url}`);
            return;
        } catch (err) {
            UI.warning(`gh pr create failed (${(err as Error).message.split("\n")[0]}). Falling back to compare URL.`);
        }
    } else {
        UI.info("GitHub CLI ('gh') not found — printing a compare URL instead.");
    }

    const compare = buildCompareUrl(branch, targetBase);
    if (compare) {
        UI.success(`Open a PR manually: ${compare}`);
    } else {
        UI.info(`Pushed branch '${branch}'. Open a PR against '${targetBase}' from your Git host.`);
        process.stdout.write(`\n### SUGGESTED PR TITLE ###\n\n${title}\n\n### SUGGESTED PR BODY ###\n\n${body}\n`);
    }
}
