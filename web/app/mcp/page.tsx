import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/mcp/tools";
import { openGraph } from "@/lib/og/meta";

// The connector's documentation, for a person. /api/mcp is the server and
// /api/v1/openapi.json describes the same operations to a program; until
// 2026-11-17 nothing explained to a human what the connector is or how to
// add it, which is also the "documentation URL" a connector directory asks
// for. The tool names, titles and descriptions below are read from the
// server's own list (lib/mcp/tools.ts), so this page cannot describe a tool
// the server does not have.
//
// This is documentation, so it is prose where the rest of the site is
// figures: the house copy rule is about a value's second line, and there is
// no value here to restate.
export const dynamic = "force-static";

const SERVER = "https://censusev.com/api/mcp";
const TITLE = "Census EV connector for Claude and other AI assistants (MCP) | Census EV";
const DESCRIPTION =
  "Search every electric and plug-in hybrid car for sale in the US from inside an AI assistant. A free, read-only Model Context Protocol server: no account, no key.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/mcp" },
  openGraph: openGraph(TITLE, DESCRIPTION, "/mcp"),
};

const FILTERS =
  "make, model, model year, price, mileage, condition (new, used, certified), battery-electric or plug-in hybrid, state, distance from a ZIP code, range, battery size, heat pump, charge port, drivetrain and body style";

const PROMPTS = [
  "Find used Kia EV6s under $28,000 within 100 miles of 60614, lowest mileage first.",
  "Which plug-in hybrid SUVs with a heat pump are for sale in Colorado under $35,000?",
  "Has the asking price changed on the car with VIN 5YJ3E1EA4MF099936?",
];

const h2 = "mt-10 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60";
const p = "mt-3 text-sm leading-relaxed text-ink/80";

export default function ConnectorPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        / <span className="text-ink/70">Connector</span>
      </nav>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Census EV connector</h1>
      <p className={p}>
        A Model Context Protocol (MCP) server that lets an AI assistant search the electric and plug-in hybrid cars for
        sale in the United States that Census EV lists: new, used and certified, from dealer sites and manufacturer
        inventory. It is free and read-only. There is no account, no key and no sign-in.
      </p>

      <h2 className={h2}>Server address</h2>
      <code className="mt-3 block border-[3px] border-ink bg-paper px-4 py-3 text-[14px] font-bold break-all">{SERVER}</code>
      <p className={p}>Streamable HTTP. No authentication.</p>

      <h2 className={h2}>Add it to Claude</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
        <li>Open Settings, then Connectors.</li>
        <li>Choose Add custom connector.</li>
        <li>Name it Census EV and paste the server address above.</li>
        <li>In a conversation, turn the connector on and ask about a car.</li>
      </ol>
      <p className={p}>Any other assistant or agent that supports remote MCP servers takes the same address.</p>

      <h2 className={h2}>Tools</h2>
      <dl className="mt-3 divide-y divide-ink/10 border-[3px] border-ink bg-paper">
        {TOOLS.map((t) => (
          <div key={t.name} className="px-4 py-3">
            <dt className="text-[14px] font-bold text-ink">
              {t.title} <code className="ml-1 text-[12.5px] font-semibold text-ink/50">{t.name}</code>
            </dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink/70">{t.description}</dd>
          </div>
        ))}
      </dl>
      <p className={p}>Search filters: {FILTERS}. All three tools only read; none changes anything.</p>

      <h2 className={h2}>Things to ask</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
        {PROMPTS.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>

      <h2 className={h2}>What comes back</h2>
      <p className={p}>
        Each car carries its asking price, mileage, location, battery size, EPA range, charge port, heat pump and DC
        fast-charging rate, and a link to the seller&rsquo;s page, which is where the car is bought. A figure that is
        not the manufacturer&rsquo;s is marked estimated. Every response states the time its inventory was read, as{" "}
        <code className="text-[13px]">as_of</code>.
      </p>

      <h2 className={h2}>Without MCP</h2>
      <p className={p}>
        The same three operations are a plain JSON API at{" "}
        <Link href="/api/v1" className="font-semibold text-cobalt hover:underline">
          censusev.com/api/v1
        </Link>
        , described in{" "}
        <Link href="/api/v1/openapi.json" className="font-semibold text-cobalt hover:underline">
          OpenAPI
        </Link>
        .
      </p>

      <h2 className={h2}>Support</h2>
      <p className={p}>
        <a href="mailto:peter@censusev.com" className="font-semibold text-cobalt hover:underline">
          peter@censusev.com
        </a>
        {" · "}
        <Link href="/privacy" className="font-semibold text-cobalt hover:underline">
          Privacy
        </Link>
      </p>
    </div>
  );
}
