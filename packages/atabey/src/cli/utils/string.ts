export function insertTaskRow(memoryContent: string, row: string): string | null {
    const sectionHeader = "## ACTIVE TASKS";
    const tableDivider = "| :--- | :--- | :--- | :--- | :--- |";
    const sectionIndex = memoryContent.indexOf(sectionHeader);
    if (sectionIndex === -1) return null;
    const dividerIndex = memoryContent.indexOf(tableDivider, sectionIndex);
    if (dividerIndex === -1) return null;
    const dividerLineEnd = memoryContent.indexOf("\n", dividerIndex);
    if (dividerLineEnd === -1) return null;

    return (
        memoryContent.slice(0, dividerLineEnd + 1) +
    `${row}\n` +
    memoryContent.slice(dividerLineEnd + 1)
    );
}

export function sanitizeInput(input: string): string {
    return String(input)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/[\r\n]+/g, " ")
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "") 
        .replace(/--/g, "-") 
        .trim();
}

export function sanitizeTableCell(value: unknown): string {
    return sanitizeInput(String(value)).replace(/\|/g, "\\|");
}

export function normalizeAgentName(agent?: unknown): string {
    return String(agent || "manager").replace(/^@+/, "").trim() || "manager";
}

export function normalizePriority(priority?: unknown): string {
    const normalized = String(priority || "P2").toUpperCase().trim();
    return /^P[0-3]$/.test(normalized) ? normalized : "P2";
}

export function slugifyName(value: string): string {
    const slug = String(value || "atabey-app")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "atabey-app";
}

export function titleCase(value: string): string {
    return String(value || "Atabey App")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
