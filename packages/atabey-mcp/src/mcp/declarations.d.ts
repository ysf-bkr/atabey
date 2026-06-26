declare module "@modelcontextprotocol/sdk/server/index.js" {
    export class Server {
        constructor(info: { name: string; version: string }, options: { capabilities: { tools?: object; resources?: object } });
        setRequestHandler(schema: unknown, handler: (request: unknown) => Promise<unknown>): void;
        connect(transport: unknown): Promise<void>;
        close(): Promise<void>;
    }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
    export class StdioServerTransport {}
}

declare module "@modelcontextprotocol/sdk/types.js" {
    export const ListToolsRequestSchema: unknown;
    export const CallToolRequestSchema: unknown;
    export const ListResourcesRequestSchema: unknown;
    export const ReadResourceRequestSchema: unknown;
}
