import { describe, expect, it } from "vitest";
import {
    classifyData,
    containsPII,
    containsPIIInObject,
    maskObject,
    maskText,
    maskToolArgs,
    maskToolResult,
} from "../src/pii.js";

describe("PII Masking Service", () => {
    describe("maskText", () => {
        it("should mask email addresses", () => {
            expect(maskText("user@example.com")).toBe("***@***");
            expect(maskText("Contact: john.doe@company.co.uk")).toBe("Contact: ***@***");
        });

        it("should mask Turkish phone numbers", () => {
            expect(maskText("+90 555 123 45 67")).toBe("***-***-****");
            expect(maskText("0555 123 45 67")).toBe("***-***-****");
        });

        it("should mask TC Kimlik numbers", () => {
            expect(maskText("12345678901")).toBe("***********");
            // Should NOT mask short numbers
            expect(maskText("12345")).toBe("12345");
        });

        it("should mask API keys", () => {
            expect(maskText("sk-abc123def456ghi789jkl012")).toBe("***-REDACTED-***");
            expect(maskText("ghp_abc123def456ghi789jkl012mno345pqrstu")).toBe("***-REDACTED-***");
        });

        it("should mask Bearer tokens", () => {
            expect(maskText("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token")).toBe("Authorization: Bearer ***-REDACTED-***");
        });

        it("should mask IP addresses", () => {
            expect(maskText("Server IP: 192.168.1.1")).toBe("Server IP: ***.***.***.***");
        });

        it("should mask JWT tokens", () => {
            expect(maskText("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature")).toBe("***-JWT-REDACTED-***");
        });

        it("should mask IBAN numbers", () => {
            expect(maskText("TR330006100519786457841326")).toBe("****-IBAN-REDACTED-****");
        });

        it("should mask date of birth", () => {
            expect(maskText("DOB: 15/08/1990")).toBe("DOB: **/**/****");
            expect(maskText("DOB: 15-08-1990")).toBe("DOB: **/**/****");
        });

        it("should mask SSN", () => {
            expect(maskText("SSN: 123-45-6789")).toBe("SSN: ***-**-****");
        });

        it("should handle empty/null input", () => {
            expect(maskText("")).toBe("");
            expect(maskText(null as unknown as string)).toBeNull();
            expect(maskText(undefined as unknown as string)).toBeUndefined();
        });

        it("should mask password fields in JSON", () => {
            const input = "{\"password\": \"mySecret123\", \"apiKey\": \"abc123\"}";
            const result = maskText(input);
            expect(result).toContain("***-REDACTED-***");
            expect(result).not.toContain("mySecret123");
        });
    });

    describe("maskObject", () => {
        it("should mask sensitive fields by key name", () => {
            const input = {
                email: "user@example.com",
                password: "supersecret",
                name: "John Doe",
            };
            const result = maskObject(input) as Record<string, unknown>;
            expect(result.email).toBe("***-REDACTED-***");
            expect(result.password).toBe("***-REDACTED-***");
            expect(result.name).toBe("John Doe");
        });

        it("should mask PII in nested objects", () => {
            const input = {
                user: {
                    email: "test@test.com",
                    profile: {
                        phone: "+90 555 123 45 67",
                    },
                },
            };
            const result = maskObject(input) as Record<string, unknown>;
            const user = result.user as Record<string, unknown>;
            expect(user.email).toBe("***-REDACTED-***");
            const profile = user.profile as Record<string, unknown>;
            expect(profile.phone).toBe("***-REDACTED-***");
        });

        it("should mask PII in arrays", () => {
            const input = {
                users: [
                    { email: "a@b.com" },
                    { email: "c@d.com" },
                ],
            };
            const result = maskObject(input) as Record<string, unknown>;
            const users = result.users as Array<Record<string, unknown>>;
            expect(users[0].email).toBe("***-REDACTED-***");
            expect(users[1].email).toBe("***-REDACTED-***");
        });

        it("should handle null/undefined", () => {
            expect(maskObject(null)).toBeNull();
            expect(maskObject(undefined)).toBeUndefined();
        });
    });

    describe("containsPII", () => {
        it("should detect email", () => {
            expect(containsPII("user@example.com")).toBe(true);
        });

        it("should detect phone number", () => {
            expect(containsPII("+90 555 123 45 67")).toBe(true);
        });

        it("should detect TC Kimlik", () => {
            expect(containsPII("12345678901")).toBe(true);
        });

        it("should detect API key", () => {
            expect(containsPII("sk-abc123def456ghi789jkl012mno345p")).toBe(true);
        });

        it("should return false for clean text", () => {
            expect(containsPII("Hello, this is a normal message.")).toBe(false);
        });
    });

    describe("containsPIIInObject", () => {
        it("should detect PII in nested object", () => {
            const obj = {
                data: {
                    user: "test@example.com",
                },
            };
            expect(containsPIIInObject(obj)).toBe(true);
        });

        it("should return false for clean object", () => {
            const obj = {
                name: "John",
                age: 30,
            };
            expect(containsPIIInObject(obj)).toBe(false);
        });
    });

    describe("classifyData", () => {
        it("should classify API keys as restricted", () => {
            expect(classifyData("sk-abc123def456ghi789jkl012mno345p")).toBe("restricted");
        });

        it("should classify emails as confidential", () => {
            expect(classifyData("user@example.com")).toBe("confidential");
        });

        it("should classify normal text as internal", () => {
            expect(classifyData("Project documentation")).toBe("internal");
        });

        it("should classify empty text as public", () => {
            expect(classifyData("")).toBe("public");
        });
    });

    describe("maskToolResult", () => {
        it("should mask text content in tool result", () => {
            const result = {
                content: [
                    { type: "text" as const, text: "Email: user@example.com" },
                ],
            };
            const masked = maskToolResult(result);
            expect(masked.content[0].text).not.toContain("user@example.com");
            expect(masked.content[0].text).toContain("***@***");
        });

        it("should handle empty result", () => {
            const result = { content: [] };
            expect(maskToolResult(result)).toEqual(result);
        });
    });

    describe("maskToolArgs", () => {
        it("should mask PII in tool arguments", () => {
            const args = {
                path: "/test/file.txt",
                content: "User email: user@example.com",
            };
            const masked = maskToolArgs(args);
            expect(masked.content).not.toContain("user@example.com");
            expect(masked.content).toContain("***@***");
            expect(masked.path).toBe("/test/file.txt"); // Non-PII should be preserved
        });

        it("should mask sensitive fields by key", () => {
            const args = {
                email: "test@test.com",
                message: "Hello world",
            };
            const masked = maskToolArgs(args);
            expect(masked.email).toBe("***-REDACTED-***");
            expect(masked.message).toBe("Hello world");
        });
    });
});
