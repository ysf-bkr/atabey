export type AgentTier = "supreme" | "core" | "recon";
export type AgentTag =
  | "core" | "orchestration" | "governance" | "security"
  | "design" | "logic" | "ui" | "mobile" | "native"
  | "audit" | "discipline" | "data" | "infra"
  | "recon" | "logistics" | "strategy";

export interface AgentInstructions {
  /** One-line identity statement surfaced to the agent as its persona. */
  identity: string;
  /** The agent's primary mission objective. */
  mission: string;
  /** Chain of Thought protocol the agent must follow. */
  chainOfThought: string;
  /** Mandatory, ordered discipline rules the agent must enforce. */
  rules: string[];
  /**
   * Optional: skill documents the agent MUST read before acting.
   * Paths are relative to the framework's knowledge directory.
   */
  knowledgeFiles?: string[];
}

export interface AgentDefinition {
  /** Machine identifier — used in routing and send_agent_message targets. */
  name: string;
  displayName: string;
  role: string;
  description: string;
  /** Capability score 1–10. Determines orchestration authority. */
  capability: 10 | 9 | 8;
  tier: AgentTier;
  tags: AgentTag[];
  stateMachine: string;
  tools: string[];
  instructions: AgentInstructions;
  /** Sub-specialty weights mapping (e.g. { "postgres": 10, "redis": 8, "react": 9 }) */
  specialties?: Record<string, number>;
}
