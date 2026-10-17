# Atabey — self-host image (unified MCP + dashboard + Hermes WSS Bus)
FROM node:22-bookworm-slim

# better-sqlite3 native build prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/atabey/package.json packages/atabey/
COPY packages/atabey-mcp/package.json packages/atabey-mcp/
COPY packages/atabey-mcp/dashboard/package.json packages/atabey-mcp/dashboard/

RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

ENV MCP_TRANSPORT=unified \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=5858 \
    ATABEY_PROJECT_ROOT=/workspace

EXPOSE 5858

CMD ["node", "packages/atabey-mcp/dist/atabey-mcp/src/mcp/index.js"]
