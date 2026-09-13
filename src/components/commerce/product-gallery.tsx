"use client";

import { useState } from "react";
import Image from "next/image";

import type { StorefrontImage } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * The product photographs.
 *
 * Thumbnails select the main image. A radio group again, so one tab stop
 * covers the strip, arrow keys move between shots, and the current one is
 * announced without any of that being written here.
 *
 * On a phone the thumbnails sit under the main image; from the large
 * breakpoint they move to a column beside it. Swipe carousels are avoided on
 * purpose: they hide how many photographs there are and are awkward to reach
 * by keyboard.
 *
 * The first image is marked priority because on a product page it is the
 * largest thing above the fold, and every image sits in a fixed 4:5 box so the
 * page does not move as they load.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: readonly StorefrontImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex] ?? images[0];

  if (!active) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row-reverse lg:gap-5">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-surface lg:flex-1">
        <Image
          key={active.src}
          src={active.src}
          alt={active.alt}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <fieldset className="lg:w-20 lg:shrink-0">
          <legend className="sr-only">Choose a photograph of {productName}</legend>

          <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {images.map((image, index) => {
              const checked = index === activeIndex;

              return (
                <label
                  key={image.src}
                  className={cn(
                    "relative aspect-[4/5] w-16 shrink-0 cursor-pointer overflow-hidden rounded-control bg-surface transition-all lg:w-full",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                    checked
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-canvas"
                      : "ring-1 ring-inset ring-line hover:ring-ink-400",
                  )}
                >
                  <input
                    type="radio"
                    name="product-photograph"
                    checked={checked}
                    onChange={() => setActiveIndex(index)}
                    className="sr-only"
                  />
                  <Image
                    src={image.src}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                  <span className="sr-only">
                    View {index + 1} of {images.length}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
