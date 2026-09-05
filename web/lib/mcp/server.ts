// A Model Context Protocol server, tools only, over the Streamable HTTP
// transport in its stateless form: one JSON-RPC request in, one JSON
// response out, no session, no server-initiated stream. The whole protocol
// surface a tools-only server needs is five methods, so this is written
// against the spec (2025-06-18) rather than pulled in as a dependency — the
// published handlers for Next.js pin a different SDK line than this app's
// Next, and the transport they add (SSE streams, sessions) is nothing a
// read-only search needs. Pure: no I/O of its own, so the tests can drive
// it with plain objects.

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpServerOptions {
  name: string;
  version: string;
  instructions?: string;
  tools: McpTool[];
}

export const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

type Id = string | number | null;
interface Request {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

const isRequest = (x: unknown): x is Request =>
  !!x && typeof x === "object" && (x as Request).jsonrpc === "2.0" && typeof (x as Request).method === "string";

const err = (id: Id, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } });
const ok = (id: Id, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });

export interface McpResponse {
  status: number;
  body?: unknown;
}

export function createMcpServer(o: McpServerOptions): { handle: (body: unknown) => Promise<McpResponse> } {
  const tools = new Map(o.tools.map((t) => [t.name, t]));

  async function one(req: Request): Promise<unknown | undefined> {
    const id = req.id ?? null;
    const notification = req.id === undefined;
    switch (req.method) {
      case "initialize": {
        const asked = String(req.params?.protocolVersion ?? "");
        return ok(id, {
          protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: o.name, version: o.version },
          ...(o.instructions ? { instructions: o.instructions } : {}),
        });
      }
      case "ping":
        return notification ? undefined : ok(id, {});
      case "tools/list":
        return ok(id, { tools: o.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const name = String(req.params?.name ?? "");
        const tool = tools.get(name);
        if (!tool) return err(id, -32602, `unknown tool: ${name}`);
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const result = await tool.handler(args);
          return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
        } catch (e) {
          // A tool's failure is a tool result, not a protocol error: the
          // model reads it and can retry with better arguments.
          return ok(id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
        }
      }
      default:
        if (req.method.startsWith("notifications/")) return undefined;
        return notification ? undefined : err(id, -32601, `method not found: ${req.method}`);
    }
  }

  return {
    async handle(body: unknown): Promise<McpResponse> {
      if (Array.isArray(body)) {
        if (!body.length || !body.every(isRequest)) return { status: 400, body: err(null, -32600, "invalid request") };
        const out = (await Promise.all(body.map(one))).filter((r) => r !== undefined);
        return out.length ? { status: 200, body: out } : { status: 202 };
      }
      if (!isRequest(body)) return { status: 400, body: err(null, -32600, "invalid request") };
      const res = await one(body);
      return res === undefined ? { status: 202 } : { status: 200, body: res };
    },
  };
}
