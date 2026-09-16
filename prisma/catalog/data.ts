/**
 * The seeded catalogue.
 *
 * Content only: this file describes what Purple Rose sells and nothing about
 * how it is written to the database. `./seed.ts` does that.
 *
 * ## Photography
 *
 * Every image URL is built by `photo()` from a small pool of Unsplash
 * identifiers, which is the same development placeholder photography Phase 4
 * used and the last thing in the project pointing at that host. It is pooled
 * and rotated rather than one picture per garment because there are far more
 * colour galleries than there are placeholder photographs, and a repeated
 * stock photo is an obviously temporary picture rather than a wrong one.
 *
 * The alt text names the garment and the colour the row represents, which is
 * what a shopper needs and what will be exactly true the moment real Purple
 * Rose photography replaces the URLs. Replacing it is this file and nothing
 * else: no component contains a URL, and the schema is not tied to the host.
 *
 * ## Money
 *
 * Prices are written in rupees and converted by `inr()`. What is stored is an
 * integer number of paise, as everywhere else in the application.
 */
import {
  Fabric,
  Fit,
  Occasion,
  Pattern,
  ProductStatus,
} from "../../src/generated/prisma/enums";

/** Rupees to paise. 1299 becomes 129900. */
const inr = (rupees: number) => rupees * 100;

/** Portrait, 4:5, the one ratio every card, tile and gallery uses. */
const PORTRAIT = { width: 800, height: 1000 } as const;

const UNSPLASH = "https://images.unsplash.com";

/**
 * Development photography, verified to exist in Phase 4.
 *
 * Deliberately not extended with invented identifiers: an Unsplash id that
 * does not resolve is a broken image in every gallery it lands in.
 */
const PHOTO_POOL = [
  "photo-1515372039744-b8f02a3ae446",
  "photo-1502716119720-b23a93e5fe1b",
  "photo-1485462537746-965f33f7f6a7",
  "photo-1467043198406-dc953a3defa0",
  "photo-1503342217505-b0a15ec3261c",
  "photo-1529903384028-929ae5dccdf1",
  "photo-1539008835657-9e8e9680c956",
  "photo-1496747611176-843222e1e57c",
  "photo-1583391733956-3750e0ff4e8b",
  "photo-1554568218-0f1715e72254",
  "photo-1490481651871-ab68de25d43d",
  "photo-1595777457583-95e059d581b8",
  "photo-1434389677669-e08b4cac3105",
  "photo-1566174053879-31528523f8ae",
] as const;

export function photoUrl(index: number): string {
  const id = PHOTO_POOL[Math.abs(index) % PHOTO_POOL.length];
  return `${UNSPLASH}/${id}?auto=format&fit=crop&w=${PORTRAIT.width}&h=${PORTRAIT.height}&q=70`;
}

export const portraitSize = PORTRAIT;

/* ------------------------------------------------------------------ */

export type CategorySeed = {
  slug: string;
  name: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  position: number;
  isActive: boolean;
  /** Index into the photography pool. Categories without one get no tile. */
  photo?: number;
};

/**
 * Five live collections and one retired one.
 *
 * "Fresh Prints" is a print story rather than a garment type, so nothing has
 * it as a primary category and everything in it is also a dress, a co-ord or a
 * top. It is the reason products belong to many categories.
 *
 * "Archive" is disabled on purpose, and one seeded product still points at it,
 * so there is a real case to check that a disabled collection never appears in
 * the navigation, the tiles, the filter panel or the sitemap.
 */
export const categories: readonly CategorySeed[] = [
  {
    slug: "cotton-dresses",
    name: "Cotton Dresses",
    description: "Breathable weaves for long, warm days",
    seoTitle: "Cotton Dresses for Women",
    seoDescription:
      "Everyday cotton dresses in poplin, linen and soft weaves, cut to be worn rather than kept for later.",
    position: 0,
    isActive: true,
    photo: 11,
  },
  {
    slug: "co-ord-sets",
    name: "Co-ord Sets",
    description: "Two pieces, one decision",
    seoTitle: "Women's Co-ord Sets",
    seoDescription:
      "Matching two-piece sets in linen, knit and poplin. Worn together, or split across the rest of your wardrobe.",
    position: 1,
    isActive: true,
    photo: 7,
  },
  {
    slug: "short-tops",
    name: "Short Tops",
    description: "Cropped cuts that sit where you want them",
    seoTitle: "Short Tops and Crop Tops for Women",
    seoDescription:
      "Ribbed, poplin and modal tops that end at the waist, in colours that go with everything already in the wardrobe.",
    position: 2,
    isActive: true,
    photo: 12,
  },
  {
    slug: "semi-party-wear",
    name: "Semi-Party Wear",
    description: "Dressed up without the occasion",
    seoTitle: "Semi-Party Wear for Women",
    seoDescription:
      "Satin, georgette and chiffon pieces for evenings out, weddings and everything that sits between.",
    position: 3,
    isActive: true,
    photo: 13,
  },
  {
    slug: "fresh-prints",
    name: "Fresh Prints",
    description: "Florals, blocks and checks, printed in small runs",
    seoTitle: "Printed Dresses, Co-ords and Tops",
    seoDescription:
      "The print story: florals, block prints, gingham and stripes, across dresses, co-ord sets and tops.",
    position: 4,
    isActive: true,
    photo: 0,
  },
  {
    slug: "archive",
    name: "Archive",
    description: "Past seasons, kept for the record",
    seoTitle: "Archive",
    seoDescription: "Past-season pieces, no longer on sale.",
    position: 5,
    // Disabled: nothing public may ever show this collection or its products.
    isActive: false,
  },
];

/* ------------------------------------------------------------------ */

export type SizeSeed = {
  code: string;
  name: string;
  position: number;
  bustCm: number;
  waistCm: number;
  hipCm: number;
};

/**
 * The size run, smallest first.
 *
 * Measurements are seeded because the columns exist and a size guide is the
 * obvious next use of them. Nothing renders them yet, and nothing pretends to.
 */
export const sizes: readonly SizeSeed[] = [
  { code: "XS", name: "Extra small", position: 0, bustCm: 81, waistCm: 63, hipCm: 88 },
  { code: "S", name: "Small", position: 1, bustCm: 86, waistCm: 68, hipCm: 93 },
  { code: "M", name: "Medium", position: 2, bustCm: 91, waistCm: 73, hipCm: 98 },
  { code: "L", name: "Large", position: 3, bustCm: 97, waistCm: 79, hipCm: 104 },
  { code: "XL", name: "Extra large", position: 4, bustCm: 104, waistCm: 86, hipCm: 111 },
  { code: "XXL", name: "Double extra large", position: 5, bustCm: 112, waistCm: 94, hipCm: 119 },
];

/* ------------------------------------------------------------------ */

export type ColorSeed = {
  slug: string;
  name: string;
  hex: string;
  position: number;
};

/**
 * One palette, shared by every product.
 *
 * Reusable rows rather than a colour written out per product, so "Lavender" is
 * spelled once, swatched once, and appears once in the colour filter however
 * many garments are cut in it.
 */
export const colors: readonly ColorSeed[] = [
  { slug: "black", name: "Black", hex: "#1c1a21", position: 0 },
  { slug: "white", name: "White", hex: "#f7f5f2", position: 1 },
  { slug: "beige", name: "Beige", hex: "#e0d7c7", position: 2 },
  { slug: "pink", name: "Pink", hex: "#e3a8bd", position: 3 },
  { slug: "lavender", name: "Lavender", hex: "#a87bc9", position: 4 },
  { slug: "blue", name: "Blue", hex: "#6b86b3", position: 5 },
  { slug: "green", name: "Green", hex: "#7f9678", position: 6 },
  { slug: "red", name: "Red", hex: "#a8342f", position: 7 },
];

/* ------------------------------------------------------------------ */

/** A colour of a product, and how many of each size are on the shelf. */
export type ColourwaySeed = {
  colour: string;
  /** Size code to units in stock. A size absent here is not cut in this colour. */
  stock: Readonly<Record<string, number>>;
};

export type ProductSeed = {
  articleNumber: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  careInstructions: string;
  status: ProductStatus;
  /** Days before the seed runs, so "newest" has something real to order by. */
  publishedDaysAgo: number | null;
  price: number;
  compareAtPrice?: number;
  fabric: Fabric;
  pattern: Pattern;
  fit: Fit;
  occasion: Occasion;
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  seasonal?: boolean;
  /** The category shown on the card and in the breadcrumb. */
  primaryCategory: string;
  /** Further collections this piece appears in. */
  alsoIn?: readonly string[];
  colourways: readonly ColourwaySeed[];
};

/**
 * Twenty-four live pieces, one draft and one archived.
 *
 * The live twenty-four are exactly two pages at twelve per page, which is what
 * makes the pager real rather than hypothetical. Between them they cover every
 * state the storefront has to render: a reduced price, a piece sold out in one
 * colour, two sold out entirely, each merchandising badge, products in one
 * collection and products in two, a full size run and a short one, and a price
 * spread from 990 to 5,490 wide enough that sorting and the price filter
 * visibly do something.
 *
 * The draft and the archived piece are here so that "unpublished work is not
 * public" is something that can be checked rather than assumed. The archived
 * one also sits in the disabled Archive collection.
 */
export const products: readonly ProductSeed[] = [
  {
    articleNumber: "PR-DR-0001",
    slug: "poppy-cotton-sundress",
    name: "Poppy Cotton Sundress",
    shortDescription:
      "A loose sundress in lightweight cotton poplin, with deep pockets and straps that stay put.",
    description:
      "A loose sundress cut from lightweight cotton poplin, with a gathered waist that skims rather than clings. Deep side pockets, and straps that adjust so the fit stays where you put it. The poplin softens after the first wash and keeps its shape through the summer.",
    careInstructions: "Machine wash cold, line dry, warm iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 26,
    price: inr(2490),
    compareAtPrice: inr(3200),
    fabric: Fabric.COTTON_POPLIN,
    pattern: Pattern.FLORAL,
    fit: Fit.RELAXED,
    occasion: Occasion.EVERYDAY,
    featured: true,
    primaryCategory: "cotton-dresses",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "white", stock: { XS: 0, S: 6, M: 8, L: 5, XL: 2 } },
      { colour: "lavender", stock: { S: 4, M: 6, L: 3 } },
      { colour: "green", stock: { M: 0, L: 0 } },
    ],
  },
  {
    articleNumber: "PR-CO-0002",
    slug: "still-linen-co-ord",
    name: "Still Linen Co-ord",
    shortDescription:
      "A boxy linen top and wide tie-waist trousers, made to be worn together or apart.",
    description:
      "A boxy linen top and wide tie-waist trousers, made to be worn together or split across the rest of your wardrobe. The linen is washed before it is cut, so it arrives soft and softens further with every wash.",
    careInstructions: "Machine wash cold, warm iron while damp",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 54,
    price: inr(3890),
    fabric: Fabric.LINEN,
    pattern: Pattern.SOLID,
    fit: Fit.RELAXED,
    occasion: Occasion.BRUNCH,
    bestSeller: true,
    primaryCategory: "co-ord-sets",
    colourways: [
      { colour: "beige", stock: { S: 5, M: 7, L: 6, XL: 3 } },
      { colour: "black", stock: { S: 2, M: 4, L: 4, XL: 1, XXL: 2 } },
    ],
  },
  {
    articleNumber: "PR-TO-0003",
    slug: "everyday-ribbed-top",
    name: "Everyday Ribbed Top",
    shortDescription:
      "A close-fitting ribbed top with a clean round neck, cut to sit at the waistband.",
    description:
      "A close-fitting ribbed top with a clean round neck, cut to sit at the waistband. The one you reach for when nothing else is decided. Cotton rib with just enough elastane to hold its shape through a long day.",
    careInstructions: "Machine wash cold, do not tumble dry",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 4,
    price: inr(1290),
    fabric: Fabric.KNIT,
    pattern: Pattern.SOLID,
    fit: Fit.FITTED,
    occasion: Occasion.EVERYDAY,
    newArrival: true,
    primaryCategory: "short-tops",
    colourways: [
      { colour: "white", stock: { XS: 6, S: 9, M: 9, L: 6, XL: 4 } },
      { colour: "black", stock: { XS: 5, S: 8, M: 8, L: 5, XL: 3 } },
      { colour: "lavender", stock: { S: 3, M: 4, L: 0 } },
      { colour: "red", stock: { S: 2, M: 3 } },
    ],
  },
  {
    articleNumber: "PR-SP-0004",
    slug: "low-light-slip-dress",
    name: "Low Light Slip Dress",
    shortDescription:
      "A bias-cut satin slip that holds its shape and catches the light without shouting.",
    description:
      "A bias-cut slip in a heavy satin that holds its shape and catches the light without shouting. Straps are fixed rather than adjustable, so nothing slides mid-evening, and the bodice is lined.",
    careInstructions: "Dry clean only",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 41,
    price: inr(4250),
    fabric: Fabric.SATIN,
    pattern: Pattern.SOLID,
    fit: Fit.STRAIGHT,
    occasion: Occasion.EVENING,
    featured: true,
    primaryCategory: "semi-party-wear",
    colourways: [
      { colour: "black", stock: { XS: 3, S: 5, M: 5, L: 3 } },
      { colour: "lavender", stock: { S: 2, M: 4, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-DR-0005",
    slug: "afternoon-tiered-midi",
    name: "Afternoon Tiered Midi",
    shortDescription:
      "Three soft tiers in a plain cotton weave, with a neckline that stays where it is put.",
    description:
      "Three soft tiers in a plain cotton weave, gathered at each seam so the skirt moves without adding bulk at the waist. The neckline is elasticated at the back only, so it stays where it is put.",
    careInstructions: "Machine wash cold, line dry in shade",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 63,
    price: inr(2890),
    fabric: Fabric.COTTON,
    pattern: Pattern.SOLID,
    fit: Fit.A_LINE,
    occasion: Occasion.BRUNCH,
    primaryCategory: "cotton-dresses",
    colourways: [
      { colour: "beige", stock: { S: 4, M: 6, L: 4, XL: 2 } },
      { colour: "blue", stock: { S: 3, M: 5, L: 3 } },
      { colour: "pink", stock: { M: 2, L: 1 } },
    ],
  },
  {
    articleNumber: "PR-TO-0006",
    slug: "block-print-day-top",
    name: "Block Print Day Top",
    shortDescription:
      "A hand block printed cotton top with long sleeves and a tie at the back of the neck.",
    description:
      "A hand block printed cotton top with long sleeves and a single tie at the back of the neck. Each run is printed by hand, so no two pieces carry the print in exactly the same place.",
    careInstructions: "Hand wash separately for the first three washes",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 72,
    price: inr(1490),
    compareAtPrice: inr(1990),
    fabric: Fabric.COTTON,
    pattern: Pattern.BLOCK_PRINT,
    fit: Fit.RELAXED,
    occasion: Occasion.EVERYDAY,
    primaryCategory: "short-tops",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "blue", stock: { S: 7, M: 8, L: 6, XL: 3 } },
      { colour: "red", stock: { S: 4, M: 5, L: 4 } },
    ],
  },
  {
    articleNumber: "PR-DR-0007",
    slug: "open-collar-shirt-dress",
    name: "Open Collar Shirt Dress",
    shortDescription:
      "A collared poplin shirt dress with a removable belt and a hem that clears the knee.",
    description:
      "A collared poplin shirt dress with a removable belt and a hem that clears the knee. Buttons all the way down, so it works open over something else. Cut straight through the body rather than nipped at the waist.",
    careInstructions: "Machine wash cold, hot iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 9,
    price: inr(3190),
    fabric: Fabric.COTTON_POPLIN,
    pattern: Pattern.SOLID,
    fit: Fit.STRAIGHT,
    occasion: Occasion.WORK,
    newArrival: true,
    primaryCategory: "cotton-dresses",
    colourways: [
      { colour: "white", stock: { XS: 2, S: 5, M: 7, L: 5, XL: 3, XXL: 2 } },
      { colour: "beige", stock: { S: 3, M: 5, L: 4, XL: 2 } },
    ],
  },
  {
    articleNumber: "PR-CO-0008",
    slug: "quiet-knit-co-ord",
    name: "Quiet Knit Co-ord",
    shortDescription:
      "A fine knit top and matching skirt in a muted tone, warm enough for an over-cooled office.",
    description:
      "A fine knit top and matching skirt in a muted tone, warm enough for an over-cooled office and light enough to wear out afterwards. The skirt sits on the waist and falls to mid-calf.",
    careInstructions: "Hand wash cold, dry flat",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 88,
    price: inr(4490),
    fabric: Fabric.KNIT,
    pattern: Pattern.SOLID,
    fit: Fit.RELAXED,
    occasion: Occasion.HOLIDAY,
    primaryCategory: "co-ord-sets",
    colourways: [
      { colour: "beige", stock: { S: 3, M: 4, L: 3 } },
      { colour: "green", stock: { M: 2, L: 2, XL: 1 } },
    ],
  },
  {
    articleNumber: "PR-DR-0009",
    slug: "meadow-print-wrap-dress",
    name: "Meadow Print Wrap Dress",
    shortDescription:
      "A true wrap dress in a fluid rayon, printed with a small scattered floral.",
    description:
      "A true wrap dress in a fluid rayon, printed with a small scattered floral rather than a large placed one, so it reads as texture from across a room. Ties inside and out, so the crossover holds.",
    careInstructions: "Machine wash cold on a gentle cycle, cool iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 12,
    price: inr(2790),
    fabric: Fabric.RAYON,
    pattern: Pattern.FLORAL,
    fit: Fit.A_LINE,
    occasion: Occasion.BRUNCH,
    newArrival: true,
    bestSeller: true,
    primaryCategory: "cotton-dresses",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "green", stock: { XS: 3, S: 6, M: 7, L: 5, XL: 2 } },
      { colour: "pink", stock: { S: 4, M: 6, L: 4 } },
      { colour: "blue", stock: { M: 3, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-CO-0010",
    slug: "sunday-stripe-co-ord",
    name: "Sunday Stripe Co-ord",
    shortDescription:
      "A woven stripe co-ord in a linen blend: short-sleeved shirt, drawstring trousers.",
    description:
      "A woven stripe co-ord in a linen blend, not a printed one, so the stripe runs through the cloth and does not fade off it. Short-sleeved shirt, drawstring trousers, both cut generously.",
    careInstructions: "Machine wash cold, warm iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 34,
    price: inr(3290),
    compareAtPrice: inr(3990),
    fabric: Fabric.LINEN_BLEND,
    pattern: Pattern.STRIPED,
    fit: Fit.RELAXED,
    occasion: Occasion.HOLIDAY,
    seasonal: true,
    primaryCategory: "co-ord-sets",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "blue", stock: { S: 4, M: 6, L: 5, XL: 2 } },
      { colour: "beige", stock: { S: 2, M: 3, L: 3 } },
    ],
  },
  {
    articleNumber: "PR-TO-0011",
    slug: "paper-cotton-crop-top",
    name: "Paper Cotton Crop Top",
    shortDescription:
      "A plain cotton crop with a boat neck and a hem that ends just above the waistband.",
    description:
      "A plain cotton crop with a boat neck and a hem that ends just above the waistband. Cut from a light, papery cotton that holds its shape rather than clinging, so it works over a high waist.",
    careInstructions: "Machine wash cold, line dry",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 96,
    price: inr(990),
    fabric: Fabric.COTTON,
    pattern: Pattern.SOLID,
    fit: Fit.FITTED,
    occasion: Occasion.EVERYDAY,
    primaryCategory: "short-tops",
    colourways: [
      { colour: "white", stock: { XS: 8, S: 10, M: 9, L: 6 } },
      { colour: "black", stock: { XS: 6, S: 9, M: 8, L: 5 } },
      { colour: "green", stock: { S: 3, M: 3 } },
    ],
  },
  {
    articleNumber: "PR-SP-0012",
    slug: "evening-georgette-maxi",
    name: "Evening Georgette Maxi",
    shortDescription:
      "A floor-length georgette maxi with a lined bodice and a soft, unstructured skirt.",
    description:
      "A floor-length georgette maxi with a lined bodice and a soft, unstructured skirt that moves with the room. Cut long deliberately: it is meant to be worn with a heel and it is meant to reach the floor.",
    careInstructions: "Dry clean only",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 48,
    price: inr(5490),
    fabric: Fabric.GEORGETTE,
    pattern: Pattern.SOLID,
    fit: Fit.STRAIGHT,
    occasion: Occasion.FESTIVE,
    featured: true,
    primaryCategory: "semi-party-wear",
    colourways: [
      { colour: "black", stock: { S: 2, M: 4, L: 3, XL: 1 } },
      { colour: "red", stock: { S: 1, M: 3, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-DR-0013",
    slug: "terrace-gingham-midi",
    name: "Terrace Gingham Midi",
    shortDescription:
      "A small-check gingham midi with a square neck and short puffed sleeves.",
    description:
      "A small-check gingham midi with a square neck and short puffed sleeves. The check is woven rather than printed, and the skirt is panelled so it flares without gathering at the waist.",
    careInstructions: "Machine wash cold, warm iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 17,
    price: inr(2690),
    fabric: Fabric.COTTON,
    pattern: Pattern.CHECKED,
    fit: Fit.A_LINE,
    occasion: Occasion.BRUNCH,
    newArrival: true,
    primaryCategory: "cotton-dresses",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "red", stock: { XS: 2, S: 5, M: 6, L: 4 } },
      { colour: "blue", stock: { S: 3, M: 5, L: 4, XL: 2 } },
    ],
  },
  {
    articleNumber: "PR-TO-0014",
    slug: "second-skin-modal-tee",
    name: "Second Skin Modal Tee",
    shortDescription:
      "A modal tee that drapes rather than holds, with a slightly dropped shoulder.",
    description:
      "A modal tee that drapes rather than holds, with a slightly dropped shoulder and a hem that sits at the hip. The kind of plain top that quietly becomes the most worn thing in the drawer.",
    careInstructions: "Machine wash cold, do not tumble dry",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 105,
    price: inr(1190),
    fabric: Fabric.MODAL,
    pattern: Pattern.SOLID,
    fit: Fit.REGULAR,
    occasion: Occasion.EVERYDAY,
    bestSeller: true,
    primaryCategory: "short-tops",
    colourways: [
      { colour: "beige", stock: { XS: 5, S: 9, M: 10, L: 7, XL: 4 } },
      { colour: "black", stock: { XS: 4, S: 8, M: 9, L: 6, XL: 3, XXL: 2 } },
      { colour: "white", stock: { S: 6, M: 7, L: 5 } },
    ],
  },
  {
    articleNumber: "PR-CO-0015",
    slug: "chiffon-layer-kurta-set",
    name: "Chiffon Layer Kurta Set",
    shortDescription:
      "An embroidered chiffon kurta over a lining, with matching straight trousers.",
    description:
      "An embroidered chiffon kurta worn over its own lining, with matching straight trousers. The embroidery is tonal rather than contrasting, so it reads as texture in daylight and catches the light in the evening.",
    careInstructions: "Dry clean only, store on a padded hanger",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 30,
    price: inr(4890),
    fabric: Fabric.CHIFFON,
    pattern: Pattern.EMBROIDERED,
    fit: Fit.RELAXED,
    occasion: Occasion.FESTIVE,
    featured: true,
    primaryCategory: "co-ord-sets",
    alsoIn: ["semi-party-wear"],
    colourways: [
      { colour: "lavender", stock: { S: 3, M: 4, L: 3, XL: 1 } },
      { colour: "beige", stock: { S: 2, M: 3, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-TO-0016",
    slug: "studio-straight-shirt",
    name: "Studio Straight Shirt",
    shortDescription:
      "A crisp poplin shirt cut straight through the body, with a hidden placket.",
    description:
      "A crisp poplin shirt cut straight through the body, with a hidden placket so the front reads as one clean line. Long enough to tuck and short enough not to. The collar is fused lightly, so it stands without feeling stiff.",
    careInstructions: "Machine wash cold, hot iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 120,
    price: inr(1890),
    fabric: Fabric.COTTON_POPLIN,
    pattern: Pattern.SOLID,
    fit: Fit.STRAIGHT,
    occasion: Occasion.WORK,
    primaryCategory: "short-tops",
    colourways: [
      { colour: "white", stock: { XS: 3, S: 6, M: 8, L: 6, XL: 3 } },
      { colour: "blue", stock: { S: 4, M: 5, L: 4 } },
    ],
  },
  {
    articleNumber: "PR-DR-0017",
    slug: "batik-wave-sundress",
    name: "Batik Wave Sundress",
    shortDescription:
      "A fluid rayon sundress in a wave print, with a smocked back and adjustable straps.",
    description:
      "A fluid rayon sundress in a wave print, with a smocked back so one size covers a range and adjustable straps so the length does too. Packs down to almost nothing, which is the point.",
    careInstructions: "Machine wash cold on a gentle cycle, line dry",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 58,
    price: inr(2390),
    compareAtPrice: inr(2990),
    fabric: Fabric.RAYON,
    pattern: Pattern.PRINTED,
    fit: Fit.RELAXED,
    occasion: Occasion.HOLIDAY,
    seasonal: true,
    primaryCategory: "cotton-dresses",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "blue", stock: { S: 5, M: 7, L: 5, XL: 2 } },
      { colour: "green", stock: { S: 3, M: 4, L: 3 } },
      { colour: "pink", stock: { M: 0, L: 0 } },
    ],
  },
  {
    articleNumber: "PR-TO-0018",
    slug: "almond-satin-cami",
    name: "Almond Satin Cami",
    shortDescription:
      "A satin cami with a straight neckline and bias-cut sides, worn alone or as a layer.",
    description:
      "A satin cami with a straight neckline and bias-cut sides, so it skims instead of hanging flat. Worn alone in the evening, or under a jacket for everything before that.",
    careInstructions: "Hand wash cold, dry flat, cool iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 76,
    price: inr(1690),
    fabric: Fabric.SATIN,
    pattern: Pattern.SOLID,
    fit: Fit.FITTED,
    occasion: Occasion.EVENING,
    primaryCategory: "short-tops",
    alsoIn: ["semi-party-wear"],
    colourways: [
      { colour: "beige", stock: { XS: 4, S: 6, M: 6, L: 4 } },
      { colour: "black", stock: { XS: 3, S: 5, M: 5, L: 3 } },
      { colour: "lavender", stock: { S: 2, M: 2 } },
    ],
  },
  {
    articleNumber: "PR-DR-0019",
    slug: "long-weekend-linen-dress",
    name: "Long Weekend Linen Dress",
    shortDescription:
      "An oversized linen dress with side pockets and a hem that stops at the ankle.",
    description:
      "An oversized linen dress with deep side pockets and a hem that stops at the ankle. Cut with no waist at all, so it is worn loose or belted depending on the day. Heavy enough to hold its own shape.",
    careInstructions: "Machine wash cold, warm iron while damp",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 6,
    price: inr(3490),
    fabric: Fabric.LINEN,
    pattern: Pattern.SOLID,
    fit: Fit.OVERSIZED,
    occasion: Occasion.HOLIDAY,
    newArrival: true,
    bestSeller: true,
    seasonal: true,
    primaryCategory: "cotton-dresses",
    colourways: [
      { colour: "white", stock: { S: 4, M: 6, L: 5, XL: 3, XXL: 2 } },
      { colour: "green", stock: { S: 3, M: 4, L: 4, XL: 2 } },
      { colour: "black", stock: { M: 2, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-TO-0020",
    slug: "soft-hour-wrap-top",
    name: "Soft Hour Wrap Top",
    shortDescription:
      "A rayon wrap top with a deep V and a tie at the side. Between production runs.",
    description:
      "A rayon wrap top with a deep V and a tie at the side, cut so the crossover sits flat rather than gaping. Currently between production runs; it returns in the same colours.",
    careInstructions: "Machine wash cold on a gentle cycle, cool iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 66,
    price: inr(1590),
    fabric: Fabric.RAYON,
    pattern: Pattern.SOLID,
    fit: Fit.RELAXED,
    occasion: Occasion.BRUNCH,
    primaryCategory: "short-tops",
    // Entirely sold out: every size in every colour is at zero. This is what a
    // sold-out card, a struck-through swatch and a disabled size row are
    // checked against.
    colourways: [
      { colour: "pink", stock: { S: 0, M: 0, L: 0 } },
      { colour: "white", stock: { S: 0, M: 0, L: 0 } },
    ],
  },
  {
    articleNumber: "PR-SP-0021",
    slug: "ink-floral-party-dress",
    name: "Ink Floral Party Dress",
    shortDescription:
      "A dark floral georgette dress with a fitted bodice and a full, panelled skirt.",
    description:
      "A dark floral georgette dress with a fitted bodice and a full, panelled skirt. The print is small and dense on a near-black ground, so it reads as texture until you are close to it.",
    careInstructions: "Dry clean only",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 2,
    price: inr(4690),
    fabric: Fabric.GEORGETTE,
    pattern: Pattern.FLORAL,
    fit: Fit.A_LINE,
    occasion: Occasion.EVENING,
    newArrival: true,
    primaryCategory: "semi-party-wear",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "black", stock: { XS: 2, S: 4, M: 5, L: 3, XL: 1 } },
      { colour: "red", stock: { S: 2, M: 3, L: 2 } },
    ],
  },
  {
    articleNumber: "PR-CO-0022",
    slug: "weekday-poplin-co-ord",
    name: "Weekday Poplin Co-ord",
    shortDescription:
      "A poplin shirt and matching wide trousers, cut to be worn as a suit or split apart.",
    description:
      "A poplin shirt and matching wide trousers, cut to be worn as a suit on the days that need one and split apart on the days that do not. The trousers have real pockets and a flat front.",
    careInstructions: "Machine wash cold, hot iron",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 82,
    price: inr(3590),
    fabric: Fabric.COTTON_POPLIN,
    pattern: Pattern.SOLID,
    fit: Fit.REGULAR,
    occasion: Occasion.WORK,
    primaryCategory: "co-ord-sets",
    colourways: [
      { colour: "white", stock: { S: 3, M: 5, L: 4, XL: 2 } },
      { colour: "blue", stock: { S: 2, M: 4, L: 3 } },
      { colour: "black", stock: { M: 2, L: 2, XL: 1 } },
    ],
  },
  {
    articleNumber: "PR-TO-0023",
    slug: "handloom-check-top",
    name: "Handloom Check Top",
    shortDescription:
      "A handloom cotton top in a soft check, with a mandarin collar and wooden buttons.",
    description:
      "A handloom cotton top in a soft check, with a mandarin collar and wooden buttons. Woven on a handloom, so the check shifts very slightly across the panels, which is how you know it was not printed.",
    careInstructions: "Hand wash cold separately, line dry in shade",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 110,
    price: inr(1390),
    compareAtPrice: inr(1790),
    fabric: Fabric.COTTON,
    pattern: Pattern.CHECKED,
    fit: Fit.RELAXED,
    occasion: Occasion.EVERYDAY,
    primaryCategory: "short-tops",
    alsoIn: ["fresh-prints"],
    colourways: [
      { colour: "green", stock: { S: 5, M: 6, L: 5, XL: 2 } },
      { colour: "red", stock: { S: 3, M: 4, L: 3 } },
      { colour: "beige", stock: { M: 2, L: 0 } },
    ],
  },
  {
    articleNumber: "PR-SP-0024",
    slug: "midnight-embroidered-kurta",
    name: "Midnight Embroidered Kurta",
    shortDescription:
      "A straight chiffon kurta with tonal embroidery at the yoke. Between production runs.",
    description:
      "A straight chiffon kurta with tonal embroidery at the yoke and cuffs, fully lined through the body. Currently between production runs; the next run is cut in the same two colours.",
    careInstructions: "Dry clean only, store on a padded hanger",
    status: ProductStatus.ACTIVE,
    publishedDaysAgo: 92,
    price: inr(3990),
    fabric: Fabric.CHIFFON,
    pattern: Pattern.EMBROIDERED,
    fit: Fit.STRAIGHT,
    occasion: Occasion.FESTIVE,
    primaryCategory: "semi-party-wear",
    colourways: [
      { colour: "black", stock: { S: 0, M: 0, L: 0, XL: 0 } },
      { colour: "lavender", stock: { S: 0, M: 0, L: 0 } },
    ],
  },

  /* The two that must never appear in public. */
  {
    articleNumber: "PR-DR-0025",
    slug: "winter-wool-wrap-coat",
    name: "Winter Wool Wrap Coat",
    shortDescription:
      "Not published. A wool wrap coat being prepared for the winter edit.",
    description:
      "A wool wrap coat being prepared for the winter edit. This product is a DRAFT: it exists so that 'a draft is not public' can be tested rather than assumed. It must never appear in a listing, a search, a facet count, the sitemap, or at its own URL.",
    careInstructions: "Dry clean only",
    status: ProductStatus.DRAFT,
    publishedDaysAgo: null,
    price: inr(6490),
    fabric: Fabric.KNIT,
    pattern: Pattern.SOLID,
    fit: Fit.OVERSIZED,
    occasion: Occasion.EVERYDAY,
    featured: true,
    newArrival: true,
    primaryCategory: "cotton-dresses",
    colourways: [{ colour: "beige", stock: { S: 5, M: 5, L: 5 } }],
  },
  {
    articleNumber: "PR-DR-0026",
    slug: "last-season-cotton-shift",
    name: "Last Season Cotton Shift",
    shortDescription:
      "Withdrawn. A cotton shift from a previous season, kept for the record.",
    description:
      "A cotton shift from a previous season. This product is ARCHIVED rather than deleted, which is what withdrawing a product means once orders exist: the row stays so a past order can still name what was bought. It must never appear anywhere public.",
    careInstructions: "Machine wash cold, line dry",
    status: ProductStatus.ARCHIVED,
    publishedDaysAgo: 400,
    price: inr(1990),
    fabric: Fabric.COTTON,
    pattern: Pattern.SOLID,
    fit: Fit.STRAIGHT,
    occasion: Occasion.EVERYDAY,
    bestSeller: true,
    // Its primary collection is the disabled one, so a disabled category with
    // a product behind it is also covered.
    primaryCategory: "archive",
    colourways: [{ colour: "pink", stock: { S: 2, M: 2 } }],
  },
];
