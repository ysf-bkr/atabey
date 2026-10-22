export const ADAPTER_IDS = ["claude", "grok", "cursor", "codex", "local", "antigravity-cli", "opencode"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

export interface AdapterConfig {
  id: AdapterId;
  frameworkDir: string;
  shimFile: string;
  nestedDirs?: string[];
  agentsDir?: string; // Directory to write individual agents/rules, relative to projectRoot
  agentsExt?: string; // Extensions for agent files (.md or .mdc)
}
