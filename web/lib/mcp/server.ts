// A Model Context Protocol server, tools only, over the Streamable HTTP
// transport in its stateless form: one JSON-RPC request in, one JSON
// response out, no session, no server-initiated stream. The whole protocol
// surface a tools-only server needs is five methods, so this is written
// against the spec (2025-06-18) rather than pulled in as a dependency — the
// published handlers for Next.js pin a different SDK line than this app's
// Next, and the transport they add (SSE streams, sessions) is nothing a
// read-only search needs. Pure: no I/O of its own, so the tests can drive
// it with plain objects.
//
// Resources (resources/list, resources/read) exist for one thing: the MCP
// Apps card UI (lib/mcp/ui/). A server built without `resources` advertises
// no resources capability and answers resources/* as an unknown method,
// exactly as it did before they existed — that is the published connector,
// and tests/mcp-ui.test.ts pins it byte for byte.

/**
 * What a tool does to the world, as the spec's hints. A host uses them to
 * decide whether a call needs the user's confirmation, and a directory uses
 * them to decide whether to list the server at all (Claude's connector
 * directory requires a title and a read-only or destructive hint on every
 * tool). They are hints, not enforcement: the handler is what is true.
 */
export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  /** Human-readable name for a host's UI. */
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  /** Listed on the tool in tools/list when present. MCP Apps reads
   *  `_meta.ui.resourceUri` (and the legacy flat "ui/resourceUri") here. */
  _meta?: Record<string, unknown>;
  /** The result, or an AppResult when the model and an MCP App should be
   *  handed different things. */
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * A tool result whose `structuredContent` is not the model's result: `result`
 * becomes the `content` text exactly as any other result would, and `app`
 * becomes `structuredContent`, which an MCP Apps host pushes to the app.
 */
export class AppResult {
  readonly result: unknown;
  readonly app: Record<string, unknown>;
  constructor(result: unknown, app: Record<string, unknown>) {
    this.result = result;
    this.app = app;
  }
}

/** A static text resource: the MCP Apps card is one HTML document. */
export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType: string;
  text: string;
  /** On the resources/read content item (where Claude reads `_meta.ui`). */
  _meta?: Record<string, unknown>;
}

export interface McpServerOptions {
  name: string;
  /** Human-readable name for a host's UI. */
  title?: string;
  version: string;
  instructions?: string;
  tools: McpTool[];
  resources?: McpResource[];
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
  const resources = o.resources?.length ? new Map(o.resources.map((r) => [r.uri, r])) : undefined;

  async function one(req: Request): Promise<unknown | undefined> {
    const id = req.id ?? null;
    const notification = req.id === undefined;
    switch (req.method) {
      case "initialize": {
        const asked = String(req.params?.protocolVersion ?? "");
        return ok(id, {
          protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL_VERSION,
          capabilities: resources ? { tools: { listChanged: false }, resources: { listChanged: false } } : { tools: { listChanged: false } },
          serverInfo: { name: o.name, ...(o.title ? { title: o.title } : {}), version: o.version },
          ...(o.instructions ? { instructions: o.instructions } : {}),
        });
      }
      case "ping":
        return notification ? undefined : ok(id, {});
      case "tools/list":
        return ok(id, {
          tools: o.tools.map(({ name, title, description, inputSchema, annotations, _meta }) => ({
            name,
            ...(title ? { title } : {}),
            description,
            inputSchema,
            ...(annotations ? { annotations: { ...(title ? { title } : {}), ...annotations } } : {}),
            ...(_meta ? { _meta } : {}),
          })),
        });
      case "tools/call": {
        const name = String(req.params?.name ?? "");
        const tool = tools.get(name);
        if (!tool) return err(id, -32602, `unknown tool: ${name}`);
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const out = await tool.handler(args);
          if (out instanceof AppResult) {
            return ok(id, { content: [{ type: "text", text: JSON.stringify(out.result) }], structuredContent: out.app, isError: false });
          }
          return ok(id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
        } catch (e) {
          // A tool's failure is a tool result, not a protocol error: the
          // model reads it and can retry with better arguments.
          return ok(id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
        }
      }
      case "resources/list":
        if (!resources) break;
        return ok(id, {
          resources: [...resources.values()].map(({ uri, name, title, description, mimeType }) => ({
            uri,
            name,
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            mimeType,
          })),
        });
      case "resources/templates/list":
        if (!resources) break;
        return ok(id, { resourceTemplates: [] });
      case "resources/read": {
        if (!resources) break;
        const uri = String(req.params?.uri ?? "");
        const r = resources.get(uri);
        // -32002 is the spec's "resource not found".
        if (!r) return err(id, -32002, "resource not found", { uri });
        return ok(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text, ...(r._meta ? { _meta: r._meta } : {}) }] });
      }
    }
    // Anything unhandled, including resources/* on a server with none.
    if (req.method.startsWith("notifications/")) return undefined;
    return notification ? undefined : err(id, -32601, `method not found: ${req.method}`);
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
