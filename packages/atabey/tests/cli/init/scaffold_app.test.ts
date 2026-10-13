import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scaffoldApp } from "../../../src/cli/commands/init/scaffold-app.js";

/**
 * Verifies that scaffoldApp generates a real, runnable application skeleton
 * for each stack selection, and that `focus` gates which apps are produced.
 */
describe("scaffoldApp — real application skeleton per stack", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-app-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const base = (over: Partial<Parameters<typeof scaffoldApp>[1]>) => ({
        backendLanguage: "Node.js (TypeScript)",
        frontendFramework: "Vite (React)",
        nativeLanguage: "Rust",
        focus: "fullstack" as const,
        projectName: "demo",
        projectRoot: tempDir,
        dryRun: false,
        ...over,
    });

    const exists = (rel: string) => fs.existsSync(path.join(tempDir, rel));
    const read = (rel: string) => fs.readFileSync(path.join(tempDir, rel), "utf8");

    it("emits valid, parseable package.json for Node backend and Vite web", () => {
        scaffoldApp(tempDir, base({}));
        const backendPkg = JSON.parse(read("apps/backend/package.json"));
        expect(backendPkg.name).toBe("demo-backend");
        expect(backendPkg.dependencies.fastify).toBeDefined();
        expect(backendPkg.scripts.test).toBeDefined();

        const webPkg = JSON.parse(read("apps/web/package.json"));
        expect(webPkg.name).toBe("demo-web");
        expect(webPkg.dependencies.react).toBeDefined();
    });

    it("emits valid package.json for React Native mobile", () => {
        scaffoldApp(tempDir, base({ focus: "mobile", nativeLanguage: "Rust" }));
        const mobilePkg = JSON.parse(read("apps/mobile/package.json"));
        expect(mobilePkg.name).toBe("demo-mobile");
        expect(mobilePkg.dependencies.expo).toBeDefined();
        const appJson = JSON.parse(read("apps/mobile/app.json"));
        expect(appJson.expo.name).toBe("demo");
    });

    it("interpolates the project name into generated source (no empty titles)", () => {
        scaffoldApp(tempDir, base({ projectName: "acme-corp", backendLanguage: "Go", focus: "fullstack" }));
        expect(read("apps/web/index.html")).toContain("acme-corp");
        // Go module path uses the project name
        expect(read("apps/backend/go.mod")).toContain("module acme-corp/backend");
    });

    it("produces a health endpoint in every backend language", () => {
        const cases: Array<[string, string]> = [
            ["Go", "apps/backend/main.go"],
            ["Python (FastAPI)", "apps/backend/main.py"],
            [".NET", "apps/backend/Program.cs"],
            ["Java (Spring Boot)", "apps/backend/pom.xml"],
            ["Rust", "apps/backend/src/main.rs"],
        ];
        for (const [lang, file] of cases) {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-app-health-"));
            scaffoldApp(dir, base({ backendLanguage: lang, focus: "backend", projectRoot: dir }));
            const content = fs.readFileSync(path.join(dir, file), "utf8");
            expect(content.length, `${lang} produced an empty ${file}`).toBeGreaterThan(10);
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("marks the native tier as Rust/Go-only and forbids TypeScript in its docs", () => {
        scaffoldApp(tempDir, base({ focus: "mobile", nativeLanguage: "Rust" }));
        const cargo = read("apps/native/Cargo.toml");
        expect(cargo).toContain("TypeScript is forbidden");
        expect(cargo).toContain("cdylib");
        // Rust native lib exposes a versioned ABI + a test
        const lib = read("apps/native/src/lib.rs");
        expect(lib).toContain("native_abi_version");
        expect(lib).toContain("#[cfg(test)]");
    });


    it("generates a Node/TS backend + Vite frontend for fullstack", () => {
        scaffoldApp(tempDir, base({}));
        expect(exists("apps/backend/package.json")).toBe(true);
        expect(exists("apps/backend/src/index.ts")).toBe(true);
        expect(exists("apps/web/package.json")).toBe(true);
        expect(exists("apps/web/index.html")).toBe(true);
        // fullstack does NOT include the native/platform tier
        expect(exists("apps/native")).toBe(false);
    });

    it("generates a Go backend (go.mod + main.go) when backend is Go", () => {
        scaffoldApp(tempDir, base({ backendLanguage: "Go", focus: "backend" }));
        expect(exists("apps/backend/go.mod")).toBe(true);
        expect(exists("apps/backend/main.go")).toBe(true);
        expect(exists("apps/backend/internal/server/server.go")).toBe(true);
        // backend-only focus produces no frontend
        expect(exists("apps/web")).toBe(false);
    });

    it("generates a Python (FastAPI) backend when backend is Python", () => {
        scaffoldApp(tempDir, base({ backendLanguage: "Python (FastAPI)", focus: "backend" }));
        expect(exists("apps/backend/requirements.txt")).toBe(true);
        expect(exists("apps/backend/main.py")).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, "apps/backend/main.py"), "utf8")).toContain("FastAPI");
    });

    it("generates a .NET backend when backend is .NET", () => {
        scaffoldApp(tempDir, base({ backendLanguage: ".NET", focus: "backend" }));
        expect(exists("apps/backend/demo.csproj")).toBe(true);
        expect(exists("apps/backend/Program.cs")).toBe(true);
    });

    it("generates a Spring Boot backend when backend is Java", () => {
        scaffoldApp(tempDir, base({ backendLanguage: "Java (Spring Boot)", focus: "backend" }));
        expect(exists("apps/backend/pom.xml")).toBe(true);
        expect(exists("apps/backend/src/main/java/com/demo/Application.java")).toBe(true);
    });

    it("generates a Rust backend (Cargo.toml + main.rs) when backend is Rust", () => {
        scaffoldApp(tempDir, base({ backendLanguage: "Rust", focus: "backend" }));
        expect(exists("apps/backend/Cargo.toml")).toBe(true);
        expect(exists("apps/backend/src/main.rs")).toBe(true);
    });

    it("generates a Next.js frontend when frontend is Next.js", () => {
        scaffoldApp(tempDir, base({ frontendFramework: "Next.js (App Router)" }));
        expect(exists("apps/web/app/page.tsx")).toBe(true);
        expect(exists("apps/web/app/layout.tsx")).toBe(true);
        expect(exists("apps/web/next.config.mjs")).toBe(true);
    });

    it("generates a Vanilla frontend when frontend is Vanilla", () => {
        scaffoldApp(tempDir, base({ frontendFramework: "Vanilla HTML/JS", focus: "frontend" }));
        expect(exists("apps/web/index.html")).toBe(true);
        expect(exists("apps/web/style.css")).toBe(true);
        expect(exists("apps/web/app.js")).toBe(true);
        expect(exists("apps/web/package.json")).toBe(false);
    });

    it("generates mobile + native (Rust cdylib) for mobile-fullstack", () => {
        scaffoldApp(tempDir, base({ focus: "mobile-fullstack", nativeLanguage: "Rust" }));
        expect(exists("apps/mobile/App.tsx")).toBe(true);
        expect(exists("apps/mobile/package.json")).toBe(true);
        expect(exists("apps/native/Cargo.toml")).toBe(true);
        expect(exists("apps/native/src/lib.rs")).toBe(true);
        // native tier is a cdylib for FFI
        const cargo = fs.readFileSync(path.join(tempDir, "apps/native/Cargo.toml"), "utf8");
        expect(cargo).toContain("cdylib");
    });

    it("generates a Go native tier when native is Go", () => {
        scaffoldApp(tempDir, base({ focus: "mobile", nativeLanguage: "Go" }));
        expect(exists("apps/mobile/App.tsx")).toBe(true);
        expect(exists("apps/native/go.mod")).toBe(true);
        expect(exists("apps/native/main.go")).toBe(true);
    });

    it("does not write any files in dry-run mode", () => {
        scaffoldApp(tempDir, base({ dryRun: true }));
        expect(exists("apps")).toBe(false);
    });
});
