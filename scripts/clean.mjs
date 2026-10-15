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
  path.join(root, "packages", "atabey-mcp", "dashboard", "node_modules"),
  path.join(root, "packages", "atabey-mcp", "dashboard", "dist"),
];

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
