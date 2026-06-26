# ⚡ Corporate Vite Standards

This document defines the configuration and development standards for Vite-based frontend applications.

## 1. Core Config Rules
- **TypeScript Integration:** Always use `vite-tsconfig-paths` to resolve TS path aliases automatically.
- **Port Discipline:** Keep development ports standardized. Default frontend port is `5173`.
- **Environment Variables:** Environment variables must be prefixed with `VITE_` and fully typed in `vite-env.d.ts`.

## 2. Dev & Build Optimizations
- **Build Target:** Target modern browsers (`esnext` or minimum `es2022`).
- **Code Splitting:** Implement splitChunks (manualChunks) for vendor libraries (e.g. react, react-dom, react-router-dom) to keep bundle sizes under control.
- **Minification:** Use `esbuild` for maximum build speeds.
