export const ADAPTER_IDS = ["gemini", "claude", "grok", "cursor", "codex", "local", "antigravity-cli"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

export type AdapterRole = "commander" | "architect" | "researcher" | "implementer" | "general";

export interface AdapterConfig {
  id: AdapterId;
  frameworkDir: string;
  shimFile: string;
  shimTemplate: string;
  role: AdapterRole;
  templateDir: ".atabey";
  nestedDirs?: string[];
  agentsDir?: string; // Directory to write individual agents/rules, relative to projectRoot
  agentsExt?: string; // Extensions for agent files (.md or .mdc)
}
