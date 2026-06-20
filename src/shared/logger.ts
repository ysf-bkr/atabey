import chalk from "chalk";
import path from "path";
import { appendFile, ensureDir } from "./fs.js";
import { containsPII, maskObject, maskText } from "./pii.js";

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4,
}

export interface LoggerConfig {
    minLevel: LogLevel;
    enableColors: boolean;
    jsonFormat: boolean;
    logFile?: string;
    enablePiiMasking: boolean; // KVKK: PII masking active by default
    piiWarning: boolean; // Warn when PII is detected in logs
}

export class EnterpriseLogger {
    private config: LoggerConfig;
    private static instance: EnterpriseLogger;

    private constructor() {
        const isProd = process.env.NODE_ENV === "production";
        this.config = {
            minLevel: isProd ? LogLevel.INFO : LogLevel.DEBUG,
            enableColors: !isProd,
            jsonFormat: isProd,
            enablePiiMasking: true, // KVKK: PII masking ON by default
            piiWarning: true,
        };
    }

    public static getInstance(): EnterpriseLogger {
        if (!EnterpriseLogger.instance) {
            EnterpriseLogger.instance = new EnterpriseLogger();
        }
        return EnterpriseLogger.instance;
    }

    public configure(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };

        if (this.config.logFile) {
            try {
                ensureDir(path.dirname(this.config.logFile));
            } catch (err) {
                // Directly write to stderr — using console here would be circular
                process.stderr.write(`[Logger] Failed to create log directory: ${err}\n`);
            }
        }
    }

    private formatMessage(level: LogLevel, message: string, meta?: unknown): string {
        const timestamp = new Date().toISOString();
        const pid = process.pid;

        // [KVKK] PII masking — mask sensitive data before logging
        const safeMessage = this.config.enablePiiMasking ? maskText(message) : message;
        const safeMeta = this.config.enablePiiMasking && meta ? maskObject(meta) : meta;

        // [KVKK] Warn if PII detected in production
        if (this.config.piiWarning && (containsPII(message) || (meta && containsPII(JSON.stringify(meta))))) {
            process.stderr.write(`[PII WARNING] Potential PII detected in log at ${timestamp}\n`);
        }

        if (this.config.jsonFormat) {
            return JSON.stringify({
                timestamp,
                level: LogLevel[level],
                pid,
                message: safeMessage,
                meta: safeMeta,
            });
        }

        const levelName = LogLevel[level].padEnd(5);
        let coloredLevel = levelName;

        if (this.config.enableColors) {
            switch (level) {
                case LogLevel.DEBUG:
                    coloredLevel = chalk.blue(levelName);
                    break;
                case LogLevel.INFO:
                    coloredLevel = chalk.green(levelName);
                    break;
                case LogLevel.WARN:
                    coloredLevel = chalk.yellow(levelName);
                    break;
                case LogLevel.ERROR:
                    coloredLevel = chalk.red(levelName);
                    break;
                case LogLevel.FATAL:
                    coloredLevel = chalk.bgRed.white.bold(levelName);
                    break;
            }
        }

        const metaStr = safeMeta ? ` | Meta: ${JSON.stringify(safeMeta)}` : "";
        return `[${timestamp}] [PID:${pid}] [${coloredLevel}]: ${safeMessage}${metaStr}`;
    }

    private log(level: LogLevel, message: string, meta?: unknown): void {
        if (level < this.config.minLevel) return;

        const formatted = this.formatMessage(level, message, meta);

        // Route to stderr for ERROR/FATAL, stdout otherwise.
        // Using process.write directly here is intentional — this IS the logger.
        if (level >= LogLevel.ERROR) {
            process.stderr.write(formatted + "\n");
        } else {
            process.stdout.write(formatted + "\n");
        }

        // Output to file if configured
        if (this.config.logFile) {
            try {
                appendFile(this.config.logFile, formatted + "\n");
            } catch (err) {
                // Directly write to stderr — using console here would be circular
                process.stderr.write(`[Logger] Failed to write to log file: ${err}\n`);
            }
        }
    }

    public debug(message: string, meta?: unknown): void {
        this.log(LogLevel.DEBUG, message, meta);
    }

    public info(message: string, meta?: unknown): void {
        this.log(LogLevel.INFO, message, meta);
    }

    public warn(message: string, meta?: unknown): void {
        this.log(LogLevel.WARN, message, meta);
    }

    public error(message: string, meta?: unknown): void {
        this.log(LogLevel.ERROR, message, meta);
    }

    public fatal(message: string, meta?: unknown): void {
        this.log(LogLevel.FATAL, message, meta);
    }
}

export const logger = EnterpriseLogger.getInstance();
