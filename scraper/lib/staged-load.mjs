// Staged, replay-safe monthly loads (migration 0033) for the two datasets
// that are rebuilt whole every month: wa_ev_sales and vin_variant_vpic.
//
// The old protocol — first chunk sent with replace:true wipes the live table,
// later chunks append — failed two ways. A chunk dying mid-load left the
// table holding a fraction of the archive until next month (the replace had
// already happened), and a chunk that committed but lost its response would
// duplicate rows if replayed, which is why 562ce2a gave every other pipeline
// write a retry ladder and deliberately left these two loops bare.
//
// Now every chunk is parked in a staging table keyed (dataset, batch, chunk),
// where a replay overwrites itself, and one commit call swaps the live table
// inside a single transaction — refusing unless the staged count matches
// rows.length, and answering a replayed commit from its committed-batch
// record. Failure at any point before commit leaves last month's data fully
// live, so these writes finally get the same retry ladder as everything else.
import { fetchWithRetry } from "./retry.mjs";

function post(rpc, payload) {
  return fetch(`${process.env.SUPABASE_URL}/functions/v1/ingest`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      "x-ingest-token": process.env.SUPABASE_INGEST_TOKEN,
      "x-ingest-rpc": rpc,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Loads `rows` as one atomic batch; returns the inserted count. Exits the
// process on permanent failure — the callers are single-purpose scripts and
// their old inline loops did the same.
export async function stagedLoad({ dataset, rows, chunkSize, name }) {
  if (rows.length === 0) {
    // An empty month is an upstream failure, not a fact about the market —
    // leave last month's table standing rather than committing an empty swap.
    console.error(`${name}: no rows to load — leaving the live table as is`);
    return 0;
  }

  const batch = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  let staged = 0;
  for (let i = 0; i * chunkSize < rows.length; i++) {
    const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize);
    const res = await fetchWithRetry(`${name}: stage chunk ${i}`, () =>
      post("stage_monthly_load", { _dataset: dataset, _batch: batch, _chunk: i, _rows: chunk })
    );
    if (!res.ok) {
      console.error(
        `${name}: FAILED staging chunk ${i} — ${res.status === 0 ? "network error" : `HTTP ${res.status}`}: ` +
          `${(await res.text()).slice(0, 300)} (live table untouched)`
      );
      process.exit(1);
    }
    staged += (await res.json()).staged ?? 0;
    console.error(`  staged ${staged}/${rows.length}`);
  }

  const res = await fetchWithRetry(`${name}: commit`, () =>
    post("commit_monthly_load", { _dataset: dataset, _batch: batch, _expected_rows: rows.length })
  );
  if (!res.ok) {
    console.error(
      `${name}: FAILED commit — ${res.status === 0 ? "network error" : `HTTP ${res.status}`}: ` +
        `${(await res.text()).slice(0, 300)} (live table still holds last month's load)`
    );
    process.exit(1);
  }
  const out = await res.json();
  if (out.replay) console.error(`${name}: commit was a replay of an already-committed batch`);
  return out.inserted ?? 0;
}
