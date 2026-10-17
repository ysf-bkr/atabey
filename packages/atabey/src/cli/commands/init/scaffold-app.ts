import fs from "fs";
import path from "path";
import { UI } from "../../utils/ui.js";
import { ensureDir, writeTextFile } from "../../utils/fs.js";
import { detectProjectKind } from "../../utils/memory.js";

/**
 * Generates a real, runnable application skeleton under `apps/` based on the
 * user's stack selection during `atabey init`. Unlike the governance layer
 * (`.atabey/`) and agent definitions, this module writes actual project files
 * (go.mod, Cargo.toml, package.json, main.go, App.tsx, ...) so the user starts
 * with a working project — not just a governed empty folder.
 *
 * Only the components implied by `focus` are generated:
 *   - backend  -> fullstack | backend | mobile-fullstack
 *   - frontend -> fullstack | frontend
 *   - mobile   -> mobile | mobile-fullstack
 *   - native   -> mobile | mobile-fullstack (the platform/FFI tier)
 *
 * The native/platform tier is Rust or Go only (TypeScript is forbidden here).
 */

export type FocusKind =
    | "fullstack"
    | "backend"
    | "frontend"
    | "mobile"
    | "mobile-fullstack";

export interface ScaffoldAppOptions {
    backendLanguage: string;
    frontendFramework: string;
    nativeLanguage: string;
    focus: FocusKind;
    projectName: string;
    projectRoot: string;
    dryRun: boolean;
}

function backendKind(language: string): "node" | "go" | "java" | "python" | "dotnet" | "rust" {
    if (language.includes("Go")) return "go";
    if (language.includes("Java")) return "java";
    if (language.includes("Python")) return "python";
    if (language.includes(".NET")) return "dotnet";
    if (language.includes("Rust")) return "rust";
    return "node";
}

function frontendKind(framework: string): "vite" | "next" | "vanilla" {
    if (framework.includes("Next")) return "next";
    if (framework.includes("Vanilla")) return "vanilla";
    return "vite";
}

function nativeKind(language: string): "rust" | "go" {
    return language.includes("Go") ? "go" : "rust";
}

function wantsBackend(focus: FocusKind): boolean {
    return focus === "fullstack" || focus === "backend" || focus === "mobile-fullstack";
}
function wantsFrontend(focus: FocusKind): boolean {
    return focus === "fullstack" || focus === "frontend";
}
function wantsMobile(focus: FocusKind): boolean {
    return focus === "mobile" || focus === "mobile-fullstack";
}
function wantsNative(focus: FocusKind): boolean {
    // The native/platform tier is only meaningful when there is an app surface
    // (mobile or fullstack) that can bridge to it via FFI.
    return focus === "mobile" || focus === "mobile-fullstack";
}

const GITIGNORE_COMMON = `node_modules/
dist/
build/
.env
*.log
.DS_Store
coverage/
`;

export function scaffoldApp(projectRoot: string, opts: ScaffoldAppOptions): void {
    const created: string[] = [];
    const skipped: string[] = [];
    const appsRoot = path.join(projectRoot, "apps");

    // Guard: never scaffold a consumer app skeleton inside the Atabey framework
    // monorepo itself — it uses packages/* instead of apps/*.
    if (detectProjectKind(projectRoot) === "framework-monorepo") {
        if (!opts.dryRun) {
            UI.warning("  Skipped application scaffolding — framework monorepo uses packages/*, not apps/*.");
        }
        return;
    }

    if (wantsBackend(opts.focus)) {
        const dir = path.join(appsRoot, "backend");
        switch (backendKind(opts.backendLanguage)) {
            case "go": scaffoldGoBackend(dir, opts, created, skipped); break;
            case "python": scaffoldPythonBackend(dir, opts, created, skipped); break;
            case "dotnet": scaffoldDotnetBackend(dir, opts, created, skipped); break;
            case "java": scaffoldJavaBackend(dir, opts, created, skipped); break;
            case "rust": scaffoldRustBackend(dir, opts, created, skipped); break;
            default: scaffoldNodeBackend(dir, opts, created, skipped); break;
        }
    }

    if (wantsFrontend(opts.focus)) {
        const dir = path.join(appsRoot, "web");
        switch (frontendKind(opts.frontendFramework)) {
            case "next": scaffoldNextFrontend(dir, opts, created, skipped); break;
            case "vanilla": scaffoldVanillaFrontend(dir, opts, created, skipped); break;
            default: scaffoldViteFrontend(dir, opts, created, skipped); break;
        }
    }

    if (wantsMobile(opts.focus)) {
        scaffoldReactNativeMobile(path.join(appsRoot, "mobile"), opts, created, skipped);
    }

    if (wantsNative(opts.focus)) {
        const dir = path.join(appsRoot, "native");
        if (nativeKind(opts.nativeLanguage) === "go") scaffoldGoNative(dir, opts, created, skipped);
        else scaffoldRustNative(dir, opts, created, skipped);
    }

    if (!opts.dryRun && (created.length > 0 || skipped.length > 0)) {
        for (const rel of created) UI.success(`  Created: ${rel}`);
        if (skipped.length > 0) {
            for (const rel of skipped) UI.warning(`  Kept existing (not overwritten): ${rel}`);
        }
        UI.success(` Application skeleton under apps/ — ${created.length} created, ${skipped.length} preserved.`);
    }
}

function writeInto(
    baseDir: string,
    relPath: string,
    content: string,
    opts: ScaffoldAppOptions,
    created: string[],
    skipped: string[] = [],
): void {
    const full = path.join(baseDir, relPath);
    const rel = path.relative(opts.projectRoot, full);
    ensureDir(path.dirname(full), opts.dryRun);
    // Never clobber existing user files — scaffolding only fills gaps.
    if (fs.existsSync(full)) {
        if (!opts.dryRun) skipped.push(rel);
        return;
    }
    if (opts.dryRun) return;
    writeTextFile(full, content);
    created.push(rel);
}

// ─── Backend: Node.js / TypeScript (Fastify) ────────────────────────────────

function scaffoldNodeBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    ensureDir(path.join(dir, "src"), opts.dryRun);
    write("package.json", JSON.stringify({
        name: `${opts.projectName}-backend`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
            dev: "tsx watch src/index.ts",
            build: "tsc",
            start: "node dist/index.js",
            test: "vitest run",
            lint: "eslint src",
        },
        dependencies: { fastify: "^5.0.0", zod: "^3.24.2" },
        devDependencies: {
            typescript: "^5.9.3",
            tsx: "^4.22.3",
            vitest: "^3.0.0",
            "@types/node": "^22.15.3",
        },
    }, null, 2) + "\n");
    write("tsconfig.json", JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            outDir: "dist",
            esModuleInterop: true,
            skipLibCheck: true,
        },
        include: ["src"],
    }, null, 2) + "\n");
    write(".gitignore", GITIGNORE_COMMON);
    write("src/app.ts", `import Fastify from "fastify";
import { z } from "zod";

export const HealthSchema = z.object({ status: z.literal("ok") });

export function buildApp() {
    const app = Fastify({ logger: false });
    app.get("/health", async () => HealthSchema.parse({ status: "ok" }));
    return app;
}
`);
    write("src/index.ts", `import { buildApp } from "./app.js";

const app = buildApp();

const start = async () => {
    try {
        await app.listen({ port: 3000, host: "0.0.0.0" });
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
`);
    ensureDir(path.join(dir, "tests"), opts.dryRun);
    write("tests/health.test.ts", `import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

describe("health endpoint", () => {
    it("returns { status: 'ok' }", async () => {
        const app = buildApp();
        const res = await app.inject({ method: "GET", url: "/health" });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ status: "ok" });
        await app.close();
    });
});
`);
}

// ─── Backend: Go ────────────────────────────────────────────────────────────

function scaffoldGoBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write("go.mod", `module ${opts.projectName}/backend

go 1.22
`);
    write("main.go", `package main

import (
    "encoding/json"
    "log"
    "net/http"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
    http.HandleFunc("/health", healthHandler)
    log.Println("backend listening on :3000")
    if err := http.ListenAndServe(":3000", nil); err != nil {
        log.Fatal(err)
    }
}
`);
    ensureDir(path.join(dir, "internal", "server"), opts.dryRun);
    write("internal/server/server.go", `package server

import "net/http"

// NewRouter wires up the HTTP routes for the backend service.
func NewRouter() *http.ServeMux {
    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte("ok"))
    })
    return mux
}
`);
    write(".gitignore", "*.exe\n*.out\n.env\n");
}

// ─── Backend: Python (FastAPI) ──────────────────────────────────────────────

function scaffoldPythonBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write("requirements.txt", `fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
`);
    write("main.py", `from fastapi import FastAPI

app = FastAPI(title="${opts.projectName} backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
`);
    ensureDir(path.join(dir, "app"), opts.dryRun);
    write("app/__init__.py", "");
    write(".gitignore", "__pycache__/\n*.pyc\n.env\n.venv/\n");
}

// ─── Backend: .NET (C#) ─────────────────────────────────────────────────────

function scaffoldDotnetBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write(`${opts.projectName}.csproj`, `<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
`);
    write("Program.cs", `var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run("http://0.0.0.0:3000");
`);
    write(".gitignore", "bin/\nobj/\n.env\n");
}

// ─── Backend: Java (Spring Boot) ────────────────────────────────────────────

function scaffoldJavaBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    const pkg = opts.projectName.replace(/[^a-zA-Z0-9]/g, "") || "app";
    const pkgPath = path.join("src", "main", "java", "com", pkg);
    write("pom.xml", `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.4</version>
    </parent>
    <groupId>com.${pkg}</groupId>
    <artifactId>backend</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <properties>
        <java.version>21</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
`);
    ensureDir(path.join(dir, pkgPath), opts.dryRun);
    write(path.join(pkgPath, "Application.java"), `package com.${pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class Application {

    @GetMapping("/health")
    public String health() {
        return "{\\"status\\":\\"ok\\"}";
    }

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`);
    write(".gitignore", "target/\n.env\n");
}

// ─── Backend: Rust (as application tier) ────────────────────────────────────

function scaffoldRustBackend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    const crate = opts.projectName.replace(/-/g, "_");
    write("Cargo.toml", `[package]
name = "${crate}_backend"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
`);
    ensureDir(path.join(dir, "src"), opts.dryRun);
    write("src/main.rs", `use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(|| async { "{\\"status\\":\\"ok\\"}" }));
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
`);
    write(".gitignore", "target/\n.env\n");
}

// ─── Frontend: Vite + React ─────────────────────────────────────────────────

function scaffoldViteFrontend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    ensureDir(path.join(dir, "src"), opts.dryRun);
    write("package.json", JSON.stringify({
        name: `${opts.projectName}-web`,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: {
            "@types/react": "^18.3.12",
            "@types/react-dom": "^18.3.1",
            "@vitejs/plugin-react": "^4.3.4",
            typescript: "^5.9.3",
            vite: "^6.0.0",
        },
    }, null, 2) + "\n");
    write("tsconfig.json", JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            skipLibCheck: true,
            isolatedModules: true,
            forceConsistentCasingInFileNames: true,
        },
        include: ["src"],
    }, null, 2) + "\n");
    write("vite.config.ts", `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: { port: 5173 },
});
`);
    write("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${opts.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);
    write("src/main.tsx", `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
`);
    write("src/App.tsx", `export default function App() {
    return <h1>${opts.projectName}</h1>;
}
`);
    write(".gitignore", GITIGNORE_COMMON);
}

// ─── Frontend: Next.js ──────────────────────────────────────────────────────

function scaffoldNextFrontend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    ensureDir(path.join(dir, "app"), opts.dryRun);
    write("package.json", JSON.stringify({
        name: `${opts.projectName}-web`,
        private: true,
        version: "0.1.0",
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "^15.0.0", react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: {
            typescript: "^5.9.3",
            "@types/node": "^22.15.3",
            "@types/react": "^18.3.12",
            "@types/react-dom": "^18.3.1",
        },
    }, null, 2) + "\n");
    write("tsconfig.json", JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "preserve",
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            skipLibCheck: true,
            isolatedModules: true,
            allowJs: true,
            incremental: true,
            plugins: [{ name: "next" }],
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
    }, null, 2) + "\n");
    write("next.config.mjs", `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
`);
    write("app/layout.tsx", `export const metadata = { title: "${opts.projectName}" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
`);
    write("app/page.tsx", `export default function Home() {
    return <main><h1>${opts.projectName}</h1></main>;
}
`);
    write(".gitignore", GITIGNORE_COMMON + ".next/\n");
}

// ─── Frontend: Vanilla HTML/JS ──────────────────────────────────────────────

function scaffoldVanillaFrontend(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${opts.projectName}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>${opts.projectName}</h1>
    <script src="app.js"></script>
  </body>
</html>
`);
    write("style.css", `body { font-family: system-ui, sans-serif; margin: 2rem; }
`);
    write("app.js", `console.log("${opts.projectName} ready");
`);
}

// ─── Mobile: React Native (Expo) ────────────────────────────────────────────

function scaffoldReactNativeMobile(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write("package.json", JSON.stringify({
        name: `${opts.projectName}-mobile`,
        version: "0.1.0",
        private: true,
        main: "index.js",
        scripts: { start: "expo start", android: "expo start --android", ios: "expo start --ios" },
        dependencies: { expo: "~52.0.0", react: "18.3.1", "react-native": "0.76.0" },
        devDependencies: { typescript: "^5.9.3", "@types/react": "~18.3.12", "@babel/core": "^7.25.0" },
    }, null, 2) + "\n");
    write("tsconfig.json", JSON.stringify({
        extends: "expo/tsconfig.base",
        compilerOptions: { strict: true },
    }, null, 2) + "\n");
    write("babel.config.js", `module.exports = function (api) {
    api.cache(true);
    return { presets: ["babel-preset-expo"] };
};
`);
    write("app.json", JSON.stringify({
        expo: { name: opts.projectName, slug: opts.projectName, version: "0.1.0" },
    }, null, 2) + "\n");
    write("index.js", `import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
`);
    write("App.tsx", `import { Text, View } from "react-native";

export default function App() {
    return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text>${opts.projectName}</Text>
        </View>
    );
}
`);
    write(".gitignore", GITIGNORE_COMMON + ".expo/\n");
}

// ─── Native / Platform Tier: Rust (cdylib for FFI) ──────────────────────────

function scaffoldRustNative(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    const crate = opts.projectName.replace(/-/g, "_");
    write("Cargo.toml", `[package]
name = "${crate}_native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib", "rlib"]

# Platform/FFI tier — TypeScript is forbidden here (see native-standards.md).
# Expose a versioned, audited ABI to the application tier only.
`);
    ensureDir(path.join(dir, "src"), opts.dryRun);
    write("src/lib.rs", `//! Platform/native tier. Memory-safe by default; \`unsafe\` is confined to
//! audited FFI boundaries. All inputs crossing this ABI are validated.

/// Versioned ABI entry point exposed to the application tier.
#[no_mangle]
pub extern "C" fn native_abi_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    #[test]
    fn abi_version_is_stable() {
        assert_eq!(super::native_abi_version(), 1);
    }
}
`);
    write(".gitignore", "target/\n.env\n");
}

// ─── Native / Platform Tier: Go ─────────────────────────────────────────────

function scaffoldGoNative(dir: string, opts: ScaffoldAppOptions, created: string[], skipped: string[]): void {
    const write = (rel: string, content: string) => writeInto(dir, rel, content, opts, created, skipped);
    write("go.mod", `module ${opts.projectName}/native

go 1.22
`);
    write("main.go", `// Package main is the platform/native tier. TypeScript is forbidden here
// (see native-standards.md). Expose a versioned, audited ABI to the app tier.
package main

import "C"

//export native_abi_version
func native_abi_version() C.int { return 1 }

func main() {}
`);
    write(".gitignore", "*.exe\n*.h\n*.so\n.env\n");
}




