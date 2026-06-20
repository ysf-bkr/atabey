import chalk from "chalk";
import readline from "readline";

/**
 * Professional UI Utilities for Agent Atabey CLI.
 * Standardizes headers, status boxes, and strategic intent reporting.
 */

export const UI = {
    /**
     * Renders a strategic intent block similar to Gemini CLI's topic updates.
     */
    intent: (title: string, intent: string) => {
        process.stdout.write(`\n${chalk.bold.cyan(title)}:\n`);
        process.stdout.write(`${chalk.italic.gray(`  ${intent}`)}\n\n`);
    },

    /**
     * Renders a professional agent execution box.
     */
    agentBox: (agentName: string, action: string, details?: string) => {
        const width = process.stdout.columns || 80;
        const line = "─".repeat(Math.max(0, width - 2));

        process.stdout.write(chalk.gray(`╭${line}╮`) + "\n");
        const padding = Math.max(0, width - agentName.length - 27);
        process.stdout.write(`${chalk.gray("│")} ${chalk.bold.yellow("=")} ${chalk.white(`Running Agent: ${chalk.bold.green(agentName)}...`)} ${chalk.gray("(ctrl+o to expand)".padStart(padding))} ${chalk.gray("│")}\n`);
        if (action) {
            const paddingAction = Math.max(0, width - action.length - 6);
            process.stdout.write(`${chalk.gray("│")} ${chalk.blue("!")} ${chalk.cyan(action)} ${" ".repeat(paddingAction)} ${chalk.gray("│")}\n`);
        }
        if (details) {
            const paddingDetails = Math.max(0, width - details.length - 7);
            process.stdout.write(`${chalk.gray("│")}   ${chalk.gray(details.slice(0, width - 10))} ${" ".repeat(paddingDetails)} ${chalk.gray("│")}\n`);
        }
        process.stdout.write(chalk.gray(`╰${line}╯`) + "\n");
    },

    /**
     * Renders the live Terminal UI dashboard for Hermes.
     */
    renderDashboard: (state: {
        traceId: string;
        phase: string;
        agents: Array<{ name: string; state: string; task: string }>;
        pendingCount: number;
        logs: Array<{ timestamp: string; agent: string; action: string; summary: string }>;
    }) => {
        // Clear screen and move cursor to top-left
        readline.cursorTo(process.stdout, 0, 0);
        readline.clearScreenDown(process.stdout);

        const width = process.stdout.columns || 80;
        const line = chalk.gray("─".repeat(width));

        // Header
        process.stdout.write(chalk.bgBlue.white.bold(" [ATABEY] Hermes Terminal Dashboard ".padEnd(width)) + "\n");
        process.stdout.write(` ${chalk.cyan("Active Trace:")} ${chalk.bold(state.traceId)}   ${chalk.cyan("Phase:")} ${state.phase}   ${chalk.cyan("Pending Tasks:")} ${state.pendingCount}\n`);
        process.stdout.write(line + "\n");

        // Agents Table
        process.stdout.write(chalk.bold.yellow(" [AGENT STATUS]\n"));
        process.stdout.write(chalk.gray(String(" Agent").padEnd(15)) + chalk.gray(String("State").padEnd(12)) + chalk.gray("Current Task\n"));

        for (const a of state.agents) {
            const nameColor = a.name === "manager" ? chalk.blueBright : a.name === "quality" ? chalk.magenta : chalk.green;
            const stateColor = a.state === "EXECUTING" ? chalk.bgYellow.black : a.state === "READY" ? chalk.gray : chalk.white;
            const cleanName = `@${a.name}`.padEnd(14);
            const cleanState = `[${a.state}]`.padEnd(11);
            const cleanTask = a.task.length > (width - 28) ? a.task.substring(0, width - 31) + "..." : a.task;

            process.stdout.write(` ${nameColor(cleanName)} ${stateColor(cleanState)} ${chalk.white(cleanTask)}\n`);
        }


        process.stdout.write(line + "\n");

        // Recent Logs
        process.stdout.write(chalk.bold.yellow(" [RECENT ACTIVITY]\n"));
        for (const log of state.logs.slice(0, 8)) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const logLine = ` [${chalk.gray(time)}] ${chalk.cyan(log.agent)}: ${log.action} - ${log.summary}`;
            const cleanLog = logLine.length > width ? logLine.substring(0, width - 3) + "..." : logLine;
            process.stdout.write(`${cleanLog}\n`);
        }

        process.stdout.write("\n" + chalk.italic.gray(" Press Ctrl+C to exit. Waiting for new messages...") + "\n");
    },

    /**
     * Renders a success status message.
     */
    success: (msg: string) => {
        process.stdout.write(`${chalk.bold.green("[OK]")} ${msg}\n`);
    },

    /**
     * Renders an error status message.
     */
    error: (msg: string) => {
        process.stderr.write(`${chalk.bold.red("[ERROR]")} ${chalk.red(msg)}\n`);
    },

    /**
     * Renders a warning status message.
     */
    warning: (msg: string) => {
        process.stdout.write(`${chalk.bold.yellow("[WARN]")} ${chalk.yellow(msg)}\n`);
    },

    /**
     * Renders an info/log message (non-critical, informational).
     */
    info: (msg: string) => {
        process.stdout.write(`${chalk.cyan("[INFO]")} ${msg}\n`);
    },

    /**
     * Renders an info/divider line.
     */
    divider: () => {
        const width = process.stdout.columns || 80;
        process.stdout.write(chalk.gray("─".repeat(width)) + "\n");
    }
};
