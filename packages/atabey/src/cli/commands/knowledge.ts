import chalk from "chalk";
import { UI } from "../utils/ui.js";
import { CoreMemory } from "../../modules/memory/core.js";

export async function updateKnowledgeBaseCommand(topic: string, content: string): Promise<void> {
    if (!topic || !content) {
        UI.error("Usage: atabey knowledge update <topic> <content>");
        return;
    }

    try {
        await CoreMemory.init();
        const id = await CoreMemory.remember({
            content: `${topic}: ${content}`,
            category: "ARCHITECTURE",
            tags: [topic],
        });
        UI.success(`Knowledge base updated: [${topic}] (ID: ${id.slice(0, 8)})`);
    } catch (err) {
        UI.error(`Failed to update knowledge base: ${(err as Error).message}`);
    }
}

export async function searchKnowledgeBaseCommand(query: string): Promise<void> {
    if (!query || !query.trim()) {
        UI.error("Usage: atabey knowledge search <query>");
        return;
    }

    try {
        await CoreMemory.init();
        const results = await CoreMemory.recall(query.trim(), { limit: 5 });

        if (results.length === 0) {
            UI.info(`No knowledge entries found matching "${query.trim()}".`);
            return;
        }

        process.stdout.write(`\n[ATABEY] Knowledge Base Search Results for "${query.trim()}":\n`);
        UI.divider();

        for (const res of results) {
            const scorePct = (Math.max(0, Math.min(1, res.score)) * 100).toFixed(1);
            const tags = res.entry.metadata?.tags?.length ? ` [${res.entry.metadata.tags.join(", ")}]` : "";
            process.stdout.write(`${chalk.bold.cyan(`[Match: ${scorePct}%]`)}${chalk.gray(tags)}\n`);
            process.stdout.write(`  ${res.entry.content}\n\n`);
        }
        UI.divider();
    } catch (err) {
        UI.error(`Knowledge search failed: ${(err as Error).message}`);
    }
}
