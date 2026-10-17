/**
 * Time and unique ID utilities shared across Atabey CLI and MCP servers.
 */

import crypto from "crypto";

export function generateULID(seedTime = Date.now(), seed?: number): string {
    const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const ENCODING_LEN = ENCODING.length;
    let time = seedTime;
    const timeChars = new Array(10);
    for (let i = 9; i >= 0; i--) {
        timeChars[i] = ENCODING.charAt(time % ENCODING_LEN);
        time = Math.floor(time / ENCODING_LEN);
    }
    const randomChars = new Array(16);
    if (seed !== undefined) {
        // Deterministic (test/seed) path — legacy LCG for reproducibility.
        let pseudoRandom = seed;
        for (let i = 0; i < 16; i++) {
            pseudoRandom = (pseudoRandom * 16807) % 2147483647;
            randomChars[i] = ENCODING.charAt(pseudoRandom % ENCODING_LEN);
        }
    } else {
        // Cryptographically strong randomness (no Math.random collisions).
        const bytes = crypto.randomBytes(16);
        for (let i = 0; i < 16; i++) {
            randomChars[i] = ENCODING.charAt(bytes[i] % ENCODING_LEN);
        }
    }
    return timeChars.join("") + randomChars.join("");
}

export function sleep(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
