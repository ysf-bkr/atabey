import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface ConsentRecord {
    id: string;
    subject: string;
    purpose: string;
    granted: boolean;
    legalBasis: "consent" | "legitimate_interest" | "contract";
    timestamp: string;
    expiresAt?: string;
    metadata?: Record<string, string>;
}

function getConsentLogPath(): string {
    const frameworkDir = process.env.ATABEY_FRAMEWORK_DIR || path.join(process.cwd(), ".atabey");
    const complianceDir = path.join(frameworkDir, "compliance");
    if (!fs.existsSync(complianceDir)) {
        fs.mkdirSync(complianceDir, { recursive: true });
    }
    return path.join(complianceDir, "consent-log.json");
}

function readLog(): ConsentRecord[] {
    const logPath = getConsentLogPath();
    if (!fs.existsSync(logPath)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(logPath, "utf8")) as ConsentRecord[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeLog(records: ConsentRecord[]): void {
    fs.writeFileSync(getConsentLogPath(), JSON.stringify(records, null, 2), "utf8");
}

export function recordConsent(input: {
    subject: string;
    purpose: string;
    granted: boolean;
    legalBasis?: ConsentRecord["legalBasis"];
    expiresAt?: string;
    metadata?: Record<string, string>;
}): ConsentRecord {
    const record: ConsentRecord = {
        id: crypto.randomUUID(),
        subject: input.subject,
        purpose: input.purpose,
        granted: input.granted,
        legalBasis: input.legalBasis || "consent",
        timestamp: new Date().toISOString(),
        expiresAt: input.expiresAt,
        metadata: input.metadata,
    };
    const records = readLog();
    records.push(record);
    writeLog(records);
    return record;
}

export function listConsentRecords(limit = 100): ConsentRecord[] {
    return readLog().slice(-limit).reverse();
}

export function getConsentStats(): {
    total: number;
    granted: number;
    revoked: number;
    byBasis: Record<string, number>;
} {
    const records = readLog();
    const byBasis: Record<string, number> = {};
    let granted = 0;
    let revoked = 0;
    for (const r of records) {
        byBasis[r.legalBasis] = (byBasis[r.legalBasis] || 0) + 1;
        if (r.granted) granted++;
        else revoked++;
    }
    return { total: records.length, granted, revoked, byBasis };
}