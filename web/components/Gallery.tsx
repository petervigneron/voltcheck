"use client";

import { useState } from "react";

/** The listing's photos, as an actual gallery rather than a hero plus a
 *  fixed strip of the first four. Every photo the dealer gave us (up to the
 *  scraper's cap of 8) is a clickable thumbnail, so a car with 8 photos
 *  shows 8 thumbnails, not 4 with the rest silently dropped. Clicking one
 *  swaps the large image; the "current / total" badge is the plainest way
 *  to say up front how many there are.
 *
 *  Images are hotlinked straight from the dealer's own CDN, same as before —
 *  this component only changes how they're browsed, not where they load
 *  from. No dark: variants: the rest of this detail page still carries them
 *  from before the site went light-only, but nothing new should add them
 *  back (globals.css's @custom-variant keeps the old ones inert). */
export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) return null;
  const active = Math.min(index, images.length - 1);

  return (
    <div>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- external dealer CDN */}
        <img
          src={images[active]}
          alt={alt}
          className="aspect-[16/10] w-full rounded-xl object-cover bg-zinc-100"
        />
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            {active + 1} / {images.length}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={`overflow-hidden rounded-lg ${
                i === active ? "ring-2 ring-emerald-600" : "opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external dealer CDN */}
              <img
                src={src}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
