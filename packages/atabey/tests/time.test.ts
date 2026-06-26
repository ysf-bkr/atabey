import { describe, it, expect } from "vitest";
import { generateULID, sleep } from "../src/cli/utils/time.js";

describe("Time Utilities", () => {
    describe("generateULID", () => {
        const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        it("should generate a 26 character string", () => {
            const ulid = generateULID();
            expect(ulid).toHaveLength(26);
        });

        it("should only contain valid Crockford's base32 characters (excluding I, L, O, U)", () => {
            const ulid = generateULID();
            for (const char of ulid) {
                expect(CROCKFORD_BASE32).toContain(char);
                expect("ILOU").not.toContain(char);
            }
        });

        it("should be deterministic when given a seed time and seed number", () => {
            const seedTime = 1717718400000; // 2024-06-07T00:00:00.000Z
            const seed = 42;
            const ulid1 = generateULID(seedTime, seed);
            const ulid2 = generateULID(seedTime, seed);

            expect(ulid1).toBe(ulid2);
            expect(ulid1).toHaveLength(26);
            // Ensure first 10 chars encode seedTime correctly in base32
            expect(ulid1.substring(0, 10)).toBe("01HZQZXF00"); 
        });

        it("should generate different random parts without a seed even at the same seedTime", () => {
            const seedTime = Date.now();
            const ulid1 = generateULID(seedTime);
            const ulid2 = generateULID(seedTime);

            expect(ulid1).not.toBe(ulid2);
            expect(ulid1.substring(0, 10)).toBe(ulid2.substring(0, 10)); // Time part must be equal
            expect(ulid1.substring(10)).not.toBe(ulid2.substring(10)); // Random part must differ
        });
    });

    describe("sleep", () => {
        it("should delay execution by approximately the specified time", () => {
            const start = Date.now();
            const delay = 50; // 50ms
            sleep(delay);
            const duration = Date.now() - start;

            // Atomics.wait is quite precise, but let's give a generous buffer for CI
            expect(duration).toBeGreaterThanOrEqual(delay - 5);
            expect(duration).toBeLessThanOrEqual(delay + 50);
        });
    });
});
