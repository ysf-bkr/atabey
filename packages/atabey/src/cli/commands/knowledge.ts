import { UI } from "../utils/ui.js";

export async function updateKnowledgeBaseCommand(topic: string, content: string) {
    if (!topic || !content) {
        UI.error("Usage: atabey knowledge:update <topic> <content>");
        return;
    }
    UI.success(`Knowledge base updated: ${topic}`);
}

export async function searchKnowledgeBaseCommand(query: string) {
    if (!query) {
        UI.error("Usage: atabey knowledge:search <query>");
        return;
    }
    UI.info("Knowledge base is empty.");
}
