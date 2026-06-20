/**
 * Enterprise Base Error class for the Agent Atabey Framework.
 */
export class AtabeyBaseError extends Error {
    public readonly code: string;
    public readonly timestamp: Date;
    public readonly details?: unknown;
    public readonly solution?: string;

    constructor(message: string, code = "ATABEY_INTERNAL_ERROR", details?: unknown, solution?: string) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.timestamp = new Date();
        this.details = details;
        this.solution = solution;
        
        // Ensure proper prototype chain and capture stack trace
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Converts the error into a structured JSON log format.
     */
    public toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            timestamp: this.timestamp.toISOString(),
            details: this.details,
            solution: this.solution,
            stack: this.stack,
        };
    }
}

/**
 * Thrown when configuration loading or validation fails.
 */
export class ConfigurationError extends AtabeyBaseError {
    constructor(message: string, details?: unknown, solution?: string) {
        super(message, "CONFIGURATION_ERROR", details, solution);
    }
}

/**
 * Thrown when data schema or payload validation fails.
 */
export class ValidationError extends AtabeyBaseError {
    constructor(message: string, details?: unknown, solution?: string) {
        super(message, "VALIDATION_ERROR", details, solution);
    }
}

/**
 * Thrown when adapter initialization or execution fails.
 */
export class AdapterError extends AtabeyBaseError {
    constructor(message: string, adapterId: string, details?: unknown, solution?: string) {
        super(`Adapter '${adapterId}' failure: ${message}`, "ADAPTER_ERROR", details, solution);
    }
}

/**
 * Thrown when orchestration or agent communication fails.
 */
export class OrchestrationError extends AtabeyBaseError {
    constructor(message: string, details?: unknown, solution?: string) {
        super(message, "ORCHESTRATION_ERROR", details, solution);
    }
}
