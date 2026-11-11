// The one picture every link preview is drawn from: 1200x630, the header's
// ink bar scaled up. Wordmark top left, one headline, at most one line under
// it. The headline is the page's own name and the line under it is a figure
// the page itself prints — nothing is written for the card that the page
// does not already say.
//
// Rendered by next/og (Satori): flexbox only, inline styles only, and the
// bundled Geist Regular is the only face, so weight is carried by size.
// Colours are globals.css's ink / paper / ochre-lt, repeated as literals
// because a stylesheet variable does not exist in here. Ochre-lt is the EV
// in the wordmark and nothing else, as on the site: the count line is paper.
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const INK = "#121212";
const PAPER = "#ffffff";
const OCHRE_LT = "#e0bf5a";

/** Long nameplates ("Mercedes-Benz EQS-Class SUV") step down instead of wrapping to three lines. */
export function headlineSize(text: string): number {
  if (text.length <= 16) return 124;
  if (text.length <= 24) return 100;
  if (text.length <= 34) return 80;
  return 64;
}

export function ogCard({ headline, line }: { headline?: string; line?: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: PAPER,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", fontSize: headline ? 44 : 132, letterSpacing: "-0.03em" }}>
          <span>CENSUS</span>
          <span style={{ color: OCHRE_LT, marginLeft: "0.3em" }}>EV</span>
        </div>
        {headline ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: headlineSize(headline), letterSpacing: "-0.035em", lineHeight: 1.05 }}>{headline}</div>
            {line ? <div style={{ display: "flex", marginTop: 22, fontSize: 46, opacity: 0.85 }}>{line}</div> : null}
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: headline ? 30 : 52, opacity: headline ? 0.6 : 0.85 }}>Every electric car. One site.</div>
      </div>
    ),
    OG_SIZE,
  );
}
