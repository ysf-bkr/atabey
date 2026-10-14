import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.resolve(__dirname, "../src/i18n");

const enContent = fs.readFileSync(path.join(i18nDir, "en.ts"), "utf-8");
const trContent = fs.readFileSync(path.join(i18nDir, "tr.ts"), "utf-8");

function extractKeys(content) {
    const keys = [];
    const regex = /"([^"]+)":/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        keys.push(match[1]);
    }
    return keys;
}

const enKeys = extractKeys(enContent);
const trKeys = extractKeys(trContent);

console.log(`[i18n Verification] English keys: ${enKeys.length}, Turkish keys: ${trKeys.length}`);

if (enKeys.length === 0 || trKeys.length === 0) {
    console.error("ERROR: i18n dictionary is empty!");
    process.exit(1);
}

const missingInTr = enKeys.filter(k => !trKeys.includes(k));
const missingInEn = trKeys.filter(k => !enKeys.includes(k));

if (missingInTr.length > 0) {
    console.error(`ERROR: Keys present in English but missing in Turkish: ${missingInTr.join(", ")}`);
    process.exit(1);
}

if (missingInEn.length > 0) {
    console.error(`ERROR: Keys present in Turkish but missing in English: ${missingInEn.join(", ")}`);
    process.exit(1);
}

console.log("[i18n Verification] SUCCESS: 100% parity between TR and EN dictionaries.");
process.exit(0);
