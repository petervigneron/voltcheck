// THE ONE LIST of enrichment data files. Every consumer — the matcher, the
// coverage/hygiene/PHEV scripts and the corpus-wide tests — reads ALL_ROWS
// from here, so adding a data file is one line in one place.
//
// Until 2026-09-10 eight files each carried their own copy of this list,
// and copies drift: web/tests/backfill-rowids.test.ts had silently stopped
// at data9 (never saw data10 or data11), and scraper/vpic-model-alias-check
// had once stopped at data4. A research batch of nine new files would have
// meant nine agents editing four scripts and four tests each. Keep the
// order: earlier files win where two rows would otherwise tie.
import type { EnrichmentRow } from "../types";
import { ENRICHMENT_ROWS } from "./data";
import { RESEARCH_ROWS } from "./data2";
import { RESEARCH_ROWS_3 } from "./data3";
import { RESEARCH_ROWS_4 } from "./data4";
import { RESEARCH_ROWS_5 } from "./data5";
import { RESEARCH_ROWS_6 } from "./data6";
import { RESEARCH_ROWS_9 } from "./data9";
import { RESEARCH_ROWS_10 } from "./data10";
import { RESEARCH_ROWS_11 } from "./data11";
import { RESEARCH_ROWS_12 } from "./data12";
import { RESEARCH_ROWS_13 } from "./data13";
import { RESEARCH_ROWS_16 } from "./data16";
import { RESEARCH_ROWS_20 } from "./data20";
import { RESEARCH_ROWS_15 } from "./data15";
import { RESEARCH_ROWS_14 } from "./data14";
import { RESEARCH_ROWS_18 } from "./data18";

export const ALL_ROWS: EnrichmentRow[] = [
  ...ENRICHMENT_ROWS,
  ...RESEARCH_ROWS,
  ...RESEARCH_ROWS_3,
  ...RESEARCH_ROWS_4,
  ...RESEARCH_ROWS_5,
  ...RESEARCH_ROWS_6,
  ...RESEARCH_ROWS_9,
  ...RESEARCH_ROWS_10,
  ...RESEARCH_ROWS_11,
  ...RESEARCH_ROWS_12,
  ...RESEARCH_ROWS_18,
  ...RESEARCH_ROWS_14,
  ...RESEARCH_ROWS_15,
  ...RESEARCH_ROWS_20,
  ...RESEARCH_ROWS_16,
  ...RESEARCH_ROWS_13,
];
