import type { StorefrontImage } from "@/types/commerce";

/**
 * TEMPORARY development imagery. See ./README.md.
 *
 * Every remote image used by the storefront is declared here, so there is one
 * list to delete when real photography arrives and no component ever contains
 * a URL. The host is allowed in `next.config.ts`; that entry goes at the same
 * time.
 *
 * Alt text describes the garment, because that is what a shopper who cannot
 * see the photograph needs to know. "Product image" would tell them nothing.
 */

const UNSPLASH = "https://images.unsplash.com";

/**
 * Portrait, 4:5. The one aspect ratio every card and tile uses, so rows line
 * up and nothing shifts as images arrive.
 */
const PORTRAIT = { width: 800, height: 1000 } as const;

/** Wide, 3:2, for the hero and editorial panels. */
const LANDSCAPE = { width: 1600, height: 1067 } as const;

function portrait(photoId: string, alt: string): StorefrontImage {
  return {
    src: `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=${PORTRAIT.width}&h=${PORTRAIT.height}&q=70`,
    alt,
    ...PORTRAIT,
  };
}

function landscape(photoId: string, alt: string): StorefrontImage {
  return {
    src: `${UNSPLASH}/${photoId}?auto=format&fit=crop&w=${LANDSCAPE.width}&h=${LANDSCAPE.height}&q=70`,
    alt,
    ...LANDSCAPE,
  };
}

export const storefrontMedia = {
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

  categories: {
    cottonDresses: portrait(
      "photo-1595777457583-95e059d581b8",
      "A loose cotton dress with short sleeves",
    ),
    coordSets: portrait(
      "photo-1496747611176-843222e1e57c",
      "A matching two-piece set in a plain weave",
    ),
    shortTops: portrait(
      "photo-1434389677669-e08b4cac3105",
      "A cropped top worn with wide trousers",
    ),
    semiPartyWear: portrait(
      "photo-1566174053879-31528523f8ae",
      "An evening dress with a draped neckline",
    ),
  },

  products: {
    poppySundress: portrait(
      "photo-1515372039744-b8f02a3ae446",
      "A sleeveless cotton sundress in a small floral print",
    ),
    poppySundressAlt: portrait(
      "photo-1502716119720-b23a93e5fe1b",
      "The same sundress photographed from the back",
    ),
    linenCoord: portrait(
      "photo-1485462537746-965f33f7f6a7",
      "A linen co-ord set with a boxy top and tie waist trousers",
    ),
    linenCoordAlt: portrait(
      "photo-1467043198406-dc953a3defa0",
      "The linen co-ord trousers shown in full length",
    ),
    ribbedTop: portrait(
      "photo-1503342217505-b0a15ec3261c",
      "A ribbed short top with a round neck",
    ),
    ribbedTopAlt: portrait(
      "photo-1529903384028-929ae5dccdf1",
      "The ribbed top styled with a long skirt",
    ),
    eveningSlip: portrait(
      "photo-1539008835657-9e8e9680c956",
      "A satin slip dress with thin straps",
    ),
    tieredMidi: portrait(
      "photo-1496747611176-843222e1e57c",
      "A tiered midi dress in a soft cotton weave",
    ),
    blockPrintKurta: portrait(
      "photo-1583391733956-3750e0ff4e8b",
      "A block printed cotton top with long sleeves",
    ),
    poplinShirtDress: portrait(
      "photo-1554568218-0f1715e72254",
      "A collared poplin shirt dress with a belt",
    ),
    knitCoord: portrait(
      "photo-1490481651871-ab68de25d43d",
      "A fine knit co-ord set in a muted tone",
    ),
  },
} as const;
