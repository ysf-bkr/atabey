/**
 * [ENGINE] OS-Level Sandbox — thin adapter over atabey-shared/sandbox.
 *
 * Prefer importing from `atabey-shared/sandbox.js` in new code.
 * This class keeps a stable engine-facing API for callers inside packages/atabey.
 */

import {
    applySandboxToSpawnOptions,
    clearSandboxIdentityCache,
    getSandboxStatus,
    resolveSandboxIdentity,
    sandboxSpawn,
} from "atabey-shared/sandbox.js";
import type { SpawnOptions } from "child_process";
import { logger } from "../../shared/logger.js";

export class Sandbox {
    /** Resolve and cache sandbox identity (uid/gid). */
    public static resolve(): void {
        const id = resolveSandboxIdentity();
        if (id.enabled) {
            logger.info(
                `[SANDBOX] Active uid=${id.uid}${id.gid !== undefined ? ` gid=${id.gid}` : ""}${
                    id.user ? ` user=${id.user}` : ""
                }`,
            );
        } else if (id.reason) {
            logger.debug(`[SANDBOX] Inactive: ${id.reason}`);
        }
    }

    public static spawn(
        command: string,
        args: string[],
        options: SpawnOptions = {},
    ): ReturnType<typeof sandboxSpawn> {
        const id = resolveSandboxIdentity();
        if (id.enabled) {
            logger.info(
                `[SANDBOX] Active uid=${id.uid}${id.gid !== undefined ? ` gid=${id.gid}` : ""}${
                    id.user ? ` user=${id.user}` : ""
                }`,
            );
        } else if (id.reason) {
            logger.debug(`[SANDBOX] Inactive: ${id.reason}`);
        }
        const child = sandboxSpawn(command, args, options);
        if (id.enabled) {
            logger.debug(
                `[SANDBOX] Spawning with uid=${id.uid}: ${command} ${args.join(" ")}`,
            );
        }
        return child;
    }

    public static isActive(): boolean {
        return resolveSandboxIdentity().enabled;
    }

    public static getInfo(): {
        uid?: number;
        gid?: number;
        user?: string;
        active: boolean;
        reason?: string;
    } {
        const id = resolveSandboxIdentity();
        return {
            uid: id.uid,
            gid: id.gid,
            user: id.user,
            active: id.enabled,
            reason: id.reason,
        };
    }

    public static clearCache(): void {
        clearSandboxIdentityCache();
    }

    public static status() {
        return getSandboxStatus();
    }

    public static applyOptions(options: SpawnOptions & { disableSandbox?: boolean } = {}): SpawnOptions {
        return applySandboxToSpawnOptions(options);
    }
}
