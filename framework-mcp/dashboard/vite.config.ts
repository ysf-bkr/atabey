import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite dev server config - values from env or defaults
const DEV_PORT = parseInt(process.env.VITE_DEV_PORT || "5050", 10);
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:5858";
const WS_TARGET = process.env.VITE_WS_TARGET || "ws://localhost:5858";

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: "../dist/dashboard",
        emptyOutDir: true,
    },
    server: {
        port: DEV_PORT,
        proxy: {
            "/api": API_TARGET,
            "/ws": {
                target: WS_TARGET,
                ws: true,
            },
        },
    },
});
