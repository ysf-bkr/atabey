#!/usr/bin/env node
import fs from "fs";
import path from "path";

const root = process.cwd();

const pathsToDelete = [
  path.join(root, "node_modules"),
  path.join(root, "packages", "shared", "node_modules"),
  path.join(root, "packages", "shared", "dist"),
  path.join(root, "packages", "atabey", "node_modules"),
  path.join(root, "packages", "atabey", "dist"),
  path.join(root, "packages", "atabey-mcp", "node_modules"),
  path.join(root, "packages", "atabey-mcp", "dist"),
  // Build/test artifacts
  path.join(root, "coverage"),
  path.join(root, "packages", "shared", "coverage"),
  path.join(root, "packages", "atabey", "coverage"),
  path.join(root, "packages", "atabey-mcp", "coverage"),
  path.join(root, "coverage-clean.json"),
  path.join(root, "coverage-summary.json"),
];

/** Recursively remove macOS .DS_Store junk (excluding node_modules). */
function removeDsStore(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      removeDsStore(full);
    } else if (entry.name === ".DS_Store") {
      try { fs.rmSync(full, { force: true }); } catch { /* ignore */ }
    }
  }
}

for (const p of pathsToDelete) {
  if (fs.existsSync(p)) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`[clean] Removed: ${path.relative(root, p)}`);
    } catch (err) {
      console.warn(`[clean] Failed to remove ${p}: ${err.message}`);
    }
  }
}

// Purge macOS junk
removeDsStore(root);
