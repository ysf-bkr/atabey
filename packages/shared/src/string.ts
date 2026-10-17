export function stripMarkdownCodeBlocks(text: string): string {
    // Regex to find markdown code blocks (```lang ... ```) and extract their content.
    // Handles cases where LLMs might wrap JSON in such blocks.
    const markdownCodeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/g;

    // Attempt to extract content from a single markdown code block.
    const cleanedText = text.replace(markdownCodeBlockRegex, "$1").trim();

    // If after stripping, it looks like JSON, return it.
    if ((cleanedText.startsWith("{") && cleanedText.endsWith("}")) || (cleanedText.startsWith("[") && cleanedText.endsWith("]"))) {
        return cleanedText;
    }

    // Fallback: If the original text itself was valid JSON (without being in a code block)
    // or if the stripping made it valid, this check helps.
    try {
        JSON.parse(text.trim());
        return text.trim(); // Original text was valid JSON
    } catch {
        // Continue if original text wasn't valid JSON
    }

    // Try a more specific JSON code block extraction if the generic one didn't yield valid JSON
    const specificJsonCodeBlockRegex = /```json\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/g;
    const specificMatch = text.match(specificJsonCodeBlockRegex);
    if (specificMatch && specificMatch[1]) {
        return specificMatch[1].trim();
    }

    // If all else fails, return the most aggressively stripped version.
    // JSON.parse will fail if it's not valid, which is the expected behavior.
    return cleanedText;
}
