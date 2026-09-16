import type { StorefrontImage } from "@/types/commerce";

/**
 * Brand photography.
 *
 * The hero and the two editorial panels. These are **not** catalogue data:
 * they do not describe a garment that is for sale, they change when the brand
 * changes rather than when the stock does, and no shopper filters by them. So
 * they are configuration, next to the announcement bar and the wordmark, while
 * every product and category photograph is a row in the database.
 *
 * This file replaces the image half of `features/storefront/mock/media.ts`,
 * which was deleted with the rest of the mock catalogue in Phase 5.
 *
 * The images are still development placeholders from Unsplash. They are the
 * one remaining reason `images.unsplash.com` is allowed in `next.config.ts`,
 * along with the seeded product photography, and they are declared here so
 * there is one list to swap when real Purple Rose photography is shot. No
 * component builds a URL.
 *
 * Alt text describes what is in the picture, because that is what someone who
 * cannot see it needs. "Hero image" would tell them nothing.
 */

const UNSPLASH = "https://images.unsplash.com";

/** Wide, 3:2, which is the shape both the hero and the panels are cropped to. */
const LANDSCAPE = { width: 1600, height: 1067 } as const;

function landscape(photoId: string, alt: string): StorefrontImage {
  return {
    src: `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=${LANDSCAPE.width}&h=${LANDSCAPE.height}&q=70`,
    alt,
    ...LANDSCAPE,
  };
}

export const brandMedia = {
  hero: landscape(
    "photo-1483985988355-763728e1935b",
    "A rail of folded and hanging clothes in soft daylight",
  ),
  editorial: landscape(
    "photo-1445205170230-053b83016050",
    "Two women walking together in relaxed summer clothes",
  ),
  seasonal: landscape(
    "photo-1509319117193-57bab727e09d",
    "Lightweight printed fabric moving in the wind",
  ),
} as const;
