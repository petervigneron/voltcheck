"use client";

import { useEffect, useState } from "react";
import { isSaved, subscribeSaved, toggleSaved } from "@/lib/saved";
import { track } from "@/lib/events";

// The save control, in the two dialects the site speaks: a keylined square
// over the card corner (browse/saved grids), and a rounded button in the
// detail page's summary card. One glyph pair carries the whole state — a
// toggle, not an explainer.
//
// Renders unsaved on the server and corrects itself in an effect: localStorage
// is client-only, and the first client paint has to match the static shell.

export function SaveToggle({
  id,
  title,
  priceUsd,
  variant = "card",
}: {
  /** Listing id (lowercase VIN) — see lib/saved.ts. */
  id: string;
  /** Display title, snapshotted so a later-delisted save can still be named. */
  title: string;
  /** Real asking price at save time, when there is one. */
  priceUsd?: number;
  variant?: "card" | "detail";
}) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(isSaved(id));
    sync();
    return subscribeSaved(sync);
  }, [id]);

  const onClick = (e: React.MouseEvent) => {
    // On cards the toggle sits inside the listing link; saving must not
    // navigate.
    e.preventDefault();
    e.stopPropagation();
    const now = toggleSaved({ id, title, priceUsd });
    setSaved(now);
    track(now ? "listing_saved" : "listing_unsaved", id);
  };

  if (variant === "detail") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        className={`block w-full border-[3px] border-ink py-2.5 text-center text-[12.5px] font-extrabold tracking-[0.06em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-cobalt focus-visible:ring-offset-2 ${
          saved ? "bg-ink text-paper hover:bg-cobalt" : "bg-paper text-ink hover:bg-putty"
        }`}
      >
        {saved ? "★ Saved" : "☆ Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      title={saved ? "Saved" : "Save"}
      className={`absolute top-0 right-0 z-10 flex h-10 w-10 items-center justify-center border-b-[3px] border-l-[3px] border-ink text-[16px] leading-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt ${
        saved ? "bg-ink text-paper hover:bg-cobalt" : "bg-paper text-ink hover:bg-putty"
      }`}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}
