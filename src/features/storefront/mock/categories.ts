import type { StorefrontCategory } from "@/types/commerce";
import { storefrontMedia } from "./media";

/**
 * TEMPORARY category data. See ./README.md.
 *
 * These become rows in a `Category` table in Phase 5. Slugs are the same
 * values the shop page reads from the `category` search parameter, so the
 * links here already work and will keep working once the data is real.
 */
export const mockCategories: readonly StorefrontCategory[] = [
  {
    slug: "cotton-dresses",
    name: "Cotton Dresses",
    tagline: "Breathable weaves for long, warm days",
    image: storefrontMedia.categories.cottonDresses,
  },
  {
    slug: "co-ord-sets",
    name: "Co-ord Sets",
    tagline: "Two pieces, one decision",
    image: storefrontMedia.categories.coordSets,
  },
  {
    slug: "short-tops",
    name: "Short Tops",
    tagline: "Cropped cuts that sit where you want them",
    image: storefrontMedia.categories.shortTops,
  },
  {
    slug: "semi-party-wear",
    name: "Semi-Party Wear",
    tagline: "Dressed up without the occasion",
    image: storefrontMedia.categories.semiPartyWear,
  },
] as const;
