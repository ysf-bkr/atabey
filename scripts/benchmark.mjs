#!/usr/bin/env node
/* eslint-disable no-console -- CLI harness: console is the output channel. */
/**
 * ─── ATABEY BENCHMARK HARNESS (D3) ────────────────────────────────────
 *
 * Implements the runner for docs/benchmark-protocol.md: executes benchmark
 * scenarios N times through a configurable AI-CLI runner command, measures
 * wall-clock time / exit status / token usage / governance events (from the
 * Atabey audit trail), and verifies acceptance criteria with a script —
 * never by trusting the agent's own claim.
 *
 * Usage:
 *   node scripts/benchmark.mjs --list
 *   node scripts/benchmark.mjs --scenario BM-1 --runs 3 \
 *        --runner "npx atabey" --prompt-file ./prompts/bm1.txt
 *   node scripts/benchmark.mjs --scenario BM-1 --runs 3 --baseline   # without Atabey
 *
 * NOTE (experimental): the scenario prompts and acceptance scripts live in
 * `docs/benchmark-protocol.md`; wire them per your environment. Metrics are
 * printed as a table and dumped to docs/benchmark-results.json.
 */

import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

// ─── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
};
const hasFlag = (name) => args.includes(`--${name}`);

// ─── Scenario registry (mirrors docs/benchmark-protocol.md) ─────────────
const SCENARIOS = {
    "BM-1": {
        title: "JWT login service (Node/TS)",
        complexity: "medium",
        acceptance: "npm test -- --passWithNoTests && npx tsc --noEmit",
    },
    "BM-2": {
        title: "CRUD API (Go)",
        complexity: "medium",
        acceptance: "go test ./...",
    },
    "BM-3": {
        title: "Database migration (SQLite → Postgres dialect)",
        complexity: "medium-high",
        acceptance: "npm test -- --passWithNoTests",
    },
    "BM-4": {
        title: "Brownfield refactor: rate-limiting middleware",
        complexity: "high",
        acceptance: "npm test -- --passWithNoTests && npx eslint . --quiet",
    },
    "BM-5": {
        title: "Destructive command resistance (adversarial)",
        complexity: "adversarial",
        // For BM-5 "success" means Atabey BLOCKED the destructive shortcut.
        acceptance: null,
    },
};

if (hasFlag("list") || args.length === 0) {
    console.log("Atabey Benchmark Harness — scenarios (see docs/benchmark-protocol.md):\n");
    for (const [id, s] of Object.entries(SCENARIOS)) {
        console.log(`  ${id}  ${s.title} (${s.complexity})`);
        console.log(`        acceptance: ${s.acceptance ?? "governance block-rate (adversarial)"}`);
    }
    console.log("\nUsage: node scripts/benchmark.mjs --scenario BM-1 --runs 3 --runner \"<cmd>\" [--baseline]");
    process.exit(0);
}

const scenarioId = flag("scenario");
const runs = parseInt(flag("runs") ?? "3", 10);
const runnerCmd = flag("runner");
const promptFile = flag("prompt-file");
const baseline = hasFlag("baseline");

// ─── --summary: print an Atabey-vs-baseline comparison from REAL results ──
// Replaces the former scripts/benchmark-e2e.mjs demo (which printed
// hardcoded numbers). This mode only reports measured data collected by
// actual runs of this harness — no fabricated metrics.
if (hasFlag("summary")) {
    const summaryResultsFile = path.resolve("docs", "benchmark-results.json");
    if (!fs.existsSync(summaryResultsFile)) {
        console.log("[BENCH] No results yet. Run scenarios first (see --list). Results accumulate in docs/benchmark-results.json.");
        process.exit(0);
    }
    /** @type {Array<{scenario: {id: string, title: string}, meta: {baseline: boolean}, successRate: number | null, medianWallClockMs: number, totalTokens: number, totalGovernanceEvents: number}>} */
    const all = JSON.parse(fs.readFileSync(summaryResultsFile, "utf8"));
    if (all.length === 0) {
        console.log("[BENCH] Results file is empty. Run scenarios first.");
        process.exit(0);
    }

    const byKey = new Map();
    for (const r of all) {
        const key = r.scenario.id;
        const entry = byKey.get(key) ?? { id: key, title: r.scenario.title, atabey: [], baseline: [] };
        (r.meta.baseline ? entry.baseline : entry.atabey).push(r);
        byKey.set(key, entry);
    }

    console.log("\n[BENCH] Atabey vs. baseline — measured results (real runs only)\n");
    console.log("  Scenario                     Arm        Success   Median   Tokens   GovEvents");
    console.log("  ────────────────────────────────────────────────────────────────────────────");
    for (const entry of byKey.values()) {
        const row = (arm, list) => {
            if (list.length === 0) return `  ${(entry.id + " " + arm).padEnd(29)}—          —        —        —`;
            const sr = list.every((r) => r.successRate === null)
                ? "n/a"
                : `${Math.round((list.reduce((a, r) => a + (r.successRate ?? 0), 0) / list.length) * 100)}%`;
            const med = Math.round(list.reduce((a, r) => a + r.medianWallClockMs, 0) / list.length / 100) / 10;
            const tok = list.reduce((a, r) => a + r.totalTokens, 0);
            const gov = list.reduce((a, r) => a + r.totalGovernanceEvents, 0);
            return `  ${(entry.id + " " + arm).padEnd(29)}${sr.padEnd(10)} ${String(med + "s").padEnd(8)} ${String(tok).padEnd(8)} ${gov}`;
        };
        console.log(row("atabey", entry.atabey));
        console.log(row("baseline", entry.baseline));
        console.log("");
    }
    console.log("[BENCH] Governance events = blocks/rollbacks/warnings intercepted by Atabey (0 for baseline by definition).");
    process.exit(0);
}

if (!scenarioId || !SCENARIOS[scenarioId]) {
    console.error(`[ERROR] Unknown or missing --scenario (got: ${scenarioId}). Use --list.`);
    process.exit(64);
}
if (!runnerCmd) {
    console.error("[ERROR] --runner is required (the headless AI CLI command that executes the prompt).");
    process.exit(64);
}
if (!promptFile || !fs.existsSync(promptFile)) {
    console.error("[ERROR] --prompt-file must point to an existing scenario prompt file.");
    process.exit(64);
}

const scenario = SCENARIOS[scenarioId];
const prompt = fs.readFileSync(promptFile, "utf8");
const resultsDir = path.resolve("docs");
const resultsFile = path.join(resultsDir, "benchmark-results.json");

// ─── Metrics collection ──────────────────────────────────────────────────

/** Reads total token usage + governance events from the local Atabey DB. */
function readAtabeyMetrics() {
    const dbPath = path.resolve(".atabey", "atabey.db");
    if (!fs.existsSync(dbPath)) return { tokens: 0, governanceEvents: 0 };
    try {
        // Lazy-require better-sqlite3 read-only (root workspace dependency).
        const Database = require("better-sqlite3");
        const db = new Database(dbPath, { readonly: true });
        const tokens =
            (db.prepare("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS t FROM costs").get()?.t ?? 0);
        const governanceEvents = db
            .prepare("SELECT COUNT(*) AS c FROM logs WHERE status IN ('BLOCKED', 'WARNING')")
            .get()?.c ?? 0;
        db.close();
        return { tokens, governanceEvents };
    } catch (err) {
        console.warn(`[WARN] Could not read Atabey metrics: ${err.message}`);
        return { tokens: 0, governanceEvents: 0 };
    }
}

/** Runs the deterministic acceptance check for the scenario. */
function checkAcceptance() {
    if (scenario.acceptance === null) return null; // adversarial — manual/governance-log scoring
    try {
        execSync(scenario.acceptance, { stdio: "pipe", cwd: process.cwd() });
        return true;
    } catch {
        return false;
    }
}

// ─── Execution ───────────────────────────────────────────────────────────
console.log(`\n[BENCH] ${scenarioId}: ${scenario.title}`);
console.log(`[BENCH] runs=${runs} baseline=${baseline} runner="${runnerCmd}"\n`);

const runResults = [];
for (let i = 1; i <= runs; i++) {
    const startedAt = Date.now();
    const metricsBefore = baseline ? null : readAtabeyMetrics();

    const proc = spawnSync(runnerCmd, { input: prompt, shell: true, encoding: "utf8", timeout: 20 * 60_000 });
    const wallClockMs = Date.now() - startedAt;

    const metricsAfter = baseline ? null : readAtabeyMetrics();
    const accepted = checkAcceptance();

    const run = {
        run: i,
        exitCode: proc.status,
        timedOut: proc.signal === "SIGTERM",
        accepted,
        wallClockMs,
        tokens: metricsAfter && metricsBefore ? metricsAfter.tokens - metricsBefore.tokens : null,
        governanceEvents:
            metricsAfter && metricsBefore ? metricsAfter.governanceEvents - metricsBefore.governanceEvents : null,
        stderrExcerpt: (proc.stderr || "").slice(0, 400),
    };
    runResults.push(run);

    const status = accepted === null ? `exit=${run.exitCode}` : `accepted=${run.accepted}`;
    console.log(
        `  run ${i}/${runs}: ${status} · ${(run.wallClockMs / 1000).toFixed(1)}s` +
            (run.tokens !== null ? ` · ${run.tokens} tokens` : "") +
            (run.governanceEvents !== null ? ` · ${run.governanceEvents} governance events` : ""),
    );
}

// ─── Report ──────────────────────────────────────────────────────────────
const acceptedRuns = runResults.filter((r) => r.accepted === true).length;
const measurable = runResults.filter((r) => r.acceptance !== null).length;
const report = {
    scenario: { id: scenarioId, ...scenario },
    meta: { runs, baseline, runnerCmd, promptFile, executedAt: new Date().toISOString() },
    successRate: measurable > 0 ? acceptedRuns / measurable : null,
    medianWallClockMs: [...runResults.map((r) => r.wallClockMs)].sort((a, b) => a - b)[Math.floor(runResults.length / 2)],
    totalTokens: runResults.reduce((acc, r) => acc + (r.tokens ?? 0), 0),
    totalGovernanceEvents: runResults.reduce((acc, r) => acc + (r.governanceEvents ?? 0), 0),
    runs: runResults,
};

const previous = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : [];
fs.writeFileSync(resultsFile, JSON.stringify([...previous, report], null, 2));

console.log(`\n[BENCH] Result: successRate=${report.successRate === null ? "n/a (adversarial)" : `${(report.successRate * 100).toFixed(0)}%`}` +
    ` · median=${(report.medianWallClockMs / 1000).toFixed(1)}s` +
    ` · tokens=${report.totalTokens}` +
    ` · governanceEvents=${report.totalGovernanceEvents}`);
console.log(`[BENCH] Appended to ${path.relative(process.cwd(), resultsFile)} (arm: ${baseline ? "baseline" : "atabey"}).`);
