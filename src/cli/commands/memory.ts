import { updateProjectMemory } from "../utils/memory.js";

export async function updateProjectMemoryCommand(section: string, content: string) {
    updateProjectMemory(section, content);
}

