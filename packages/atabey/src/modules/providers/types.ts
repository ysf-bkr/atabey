export const ADAPTER_IDS = [
    "claude",
    "cursor",
    "codex",
    "copilot",
    "grok",
    "local",
    "antigravity-cli",
    "opencode",
] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

/**
 * How far each adapter has actually been verified.
 *
 * - `verified`     — config path/format checked against the vendor's published
 *                    documentation, and the generated file is asserted in tests.
 *                    Still does not prove a live client connection.
 * - `experimental` — Atabey writes files in the documented-looking location, but
 *                    the vendor has not published a stable config contract we can
 *                    check against, or the target tool has no MCP host at all.
 *
 * Nothing in this codebase can prove "the app connected". That always requires a
 * manual run of the real client (see docs/ai-tool-support.md).
 */
export type AdapterSupport = "verified" | "experimental";

export interface AdapterConfig {
  id: AdapterId;
  frameworkDir: string;
  shimFile: string;
  nestedDirs?: string[];
  agentsDir?: string; // Directory to write individual agents/rules, relative to projectRoot
  agentsExt?: string; // Extensions for agent files (.md or .mdc)
  /** Verification level for the MCP config Atabey writes. */
  support?: AdapterSupport;
  /** One-line human explanation shown by `atabey init`. */
  supportNote?: string;
}
