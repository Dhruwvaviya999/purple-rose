import type { ProductDetailData } from "@/types/commerce";
import { storefrontMedia } from "./media";

/**
 * TEMPORARY product data. See ./README.md.
 *
 * Eight garments, chosen to exercise every state the UI has to handle: a sale
 * price, a sold-out item, each badge, products with and without a second
 * photograph, and a spread of prices and categories wide enough that sorting
 * and filtering visibly do something.
 *
 * Prices are integers in paise, as everywhere else in the application.
 */
const inr = (rupees: number) => rupees * 100;

/** Smallest to largest. Facets are ordered by this, not by discovery order. */
export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** Most garments run the full range; `soldOut` marks the gaps. */
function sizes(soldOut: readonly string[] = []) {
  return STANDARD_SIZES.map((label) => ({
    label,
    value: label,
    available: !soldOut.includes(label),
  }));
}

export const mockProducts: readonly ProductDetailData[] = [
  {
    id: "mock-001",
    slug: "poppy-cotton-sundress",
    name: "Poppy Cotton Sundress",
    category: { slug: "cotton-dresses", name: "Cotton Dresses" },
    price: inr(2490),
    compareAtPrice: inr(3200),
    image: storefrontMedia.products.poppySundress,
    hoverImage: storefrontMedia.products.poppySundressAlt,
    badges: ["sale"],
    inStock: true,
    colours: [
      { name: "Ivory", slug: "ivory", hex: "#f3efe7", available: true },
      { name: "Dusty plum", slug: "dusty-plum", hex: "#a87bc9", available: true },
      { name: "Sage", slug: "sage", hex: "#9caa96", available: false },
    ],
    images: [
      storefrontMedia.products.poppySundress,
      storefrontMedia.products.poppySundressAlt,
      storefrontMedia.products.tieredMidi,
    ],
    description:
      "A loose sundress cut from lightweight cotton poplin, with a gathered waist that skims rather than clings. Deep side pockets, and straps that adjust so the fit stays where you put it.",
    details: [
      "100% cotton poplin",
      "Relaxed fit through the body",
      "Adjustable straps, side pockets",
      "Machine wash cold, line dry",
      "Model is 5'7\" and wears a size S",
    ],
    sizes: sizes(["XS"]),
  },
  {
    id: "mock-002",
    slug: "still-linen-co-ord",
    name: "Still Linen Co-ord",
    category: { slug: "co-ord-sets", name: "Co-ord Sets" },
    price: inr(3890),
    image: storefrontMedia.products.linenCoord,
    hoverImage: storefrontMedia.products.linenCoordAlt,
    badges: ["bestseller"],
    inStock: true,
    colours: [
      { name: "Oat", slug: "oat", hex: "#e0d7c7", available: true },
      { name: "Charcoal", slug: "charcoal", hex: "#3b3840", available: true },
    ],
    images: [
      storefrontMedia.products.linenCoord,
      storefrontMedia.products.linenCoordAlt,
    ],
    description:
      "A boxy linen top and wide tie-waist trousers, made to be worn together or split across the rest of your wardrobe. The linen softens with every wash.",
    details: [
      "100% washed linen",
      "Boxy top, wide-leg trousers with a tie waist",
      "Sold as a set",
      "Machine wash cold, warm iron",
      "Model is 5'9\" and wears a size M",
    ],
    sizes: sizes(),
  },
  {
    id: "mock-003",
    slug: "everyday-ribbed-top",
    name: "Everyday Ribbed Top",
    category: { slug: "short-tops", name: "Short Tops" },
    price: inr(1290),
    image: storefrontMedia.products.ribbedTop,
    hoverImage: storefrontMedia.products.ribbedTopAlt,
    badges: ["new"],
    inStock: true,
    colours: [
      { name: "Ivory", slug: "ivory", hex: "#f3efe7", available: true },
      { name: "Black", slug: "black", hex: "#1c1a21", available: true },
      { name: "Dusty plum", slug: "dusty-plum", hex: "#a87bc9", available: true },
      { name: "Terracotta", slug: "terracotta", hex: "#b5715a", available: true },
    ],
    images: [
      storefrontMedia.products.ribbedTop,
      storefrontMedia.products.ribbedTopAlt,
    ],
    description:
      "A close-fitting ribbed top with a clean round neck, cut to sit at the waistband. The one you reach for when nothing else is decided.",
    details: [
      "95% cotton, 5% elastane rib",
      "Fitted, stretches with wear",
      "Ends at the natural waist",
      "Machine wash cold, do not tumble dry",
      "Model is 5'6\" and wears a size S",
    ],
    sizes: sizes(["XXL"]),
  },
  {
    id: "mock-004",
    slug: "low-light-slip-dress",
    name: "Low Light Slip Dress",
    category: { slug: "semi-party-wear", name: "Semi-Party Wear" },
    price: inr(4250),
    image: storefrontMedia.products.eveningSlip,
    badges: ["featured"],
    inStock: true,
    colours: [
      { name: "Deep plum", slug: "deep-plum", hex: "#46255c", available: true },
      { name: "Ink", slug: "ink", hex: "#22222b", available: true },
    ],
    images: [storefrontMedia.products.eveningSlip],
    description:
      "A bias-cut slip in a heavy satin that holds its shape and catches the light without shouting. Straps are fixed, so nothing slides mid-evening.",
    details: [
      "Recycled satin, lined bodice",
      "Bias cut, falls close to the body",
      "Midi length, fixed straps",
      "Dry clean only",
      "Model is 5'8\" and wears a size M",
    ],
    sizes: sizes(["XS", "XXL"]),
  },
  {
    id: "mock-005",
    slug: "afternoon-tiered-midi",
    name: "Afternoon Tiered Midi",
    category: { slug: "cotton-dresses", name: "Cotton Dresses" },
    price: inr(2890),
    image: storefrontMedia.products.tieredMidi,
    badges: [],
    inStock: true,
    colours: [
      { name: "Sage", slug: "sage", hex: "#9caa96", available: true },
      { name: "Ivory", slug: "ivory", hex: "#f3efe7", available: true },
    ],
    images: [storefrontMedia.products.tieredMidi],
    description:
      "Three soft tiers in a fine cotton weave, gathered at the yoke so the volume sits low. Long enough to sit down in without thinking about it.",
    details: [
      "100% cotton voile, cotton lining",
      "Relaxed through the body, midi length",
      "Hidden side zip",
      "Machine wash cold, cool iron",
      "Model is 5'7\" and wears a size M",
    ],
    sizes: sizes(),
  },
  {
    id: "mock-006",
    slug: "block-print-day-top",
    name: "Block Print Day Top",
    category: { slug: "short-tops", name: "Short Tops" },
    price: inr(1690),
    compareAtPrice: inr(2100),
    image: storefrontMedia.products.blockPrintKurta,
    badges: ["sale"],
    inStock: true,
    colours: [
      { name: "Indigo", slug: "indigo", hex: "#3b4e6b", available: true },
      { name: "Madder", slug: "madder", hex: "#a44a3f", available: true },
    ],
    images: [storefrontMedia.products.blockPrintKurta],
    description:
      "Hand block printed on soft cotton, with long sleeves and a straight hem. Small irregularities in the print are how you know it was made by hand.",
    details: [
      "100% hand block printed cotton",
      "Straight fit, long sleeves",
      "Natural dyes; colour softens with washing",
      "Hand wash separately for the first wash",
      "Model is 5'5\" and wears a size S",
    ],
    sizes: sizes(["L", "XL"]),
  },
  {
    id: "mock-007",
    slug: "open-collar-shirt-dress",
    name: "Open Collar Shirt Dress",
    category: { slug: "cotton-dresses", name: "Cotton Dresses" },
    price: inr(3290),
    image: storefrontMedia.products.poplinShirtDress,
    badges: ["new"],
    inStock: false,
    colours: [
      { name: "Chalk", slug: "chalk", hex: "#efece6", available: false },
      { name: "Slate", slug: "slate", hex: "#6d7480", available: false },
    ],
    images: [storefrontMedia.products.poplinShirtDress],
    description:
      "A crisp poplin shirt dress with a removable belt, worn open over trousers or buttoned on its own. Currently between production runs.",
    details: [
      "100% cotton poplin",
      "Straight fit with a removable belt",
      "Button through, chest pocket",
      "Machine wash cold, warm iron",
      "Model is 5'8\" and wears a size M",
    ],
    sizes: sizes(["XS", "S", "M", "L", "XL", "XXL"]),
  },
  {
    id: "mock-008",
    slug: "quiet-knit-co-ord",
    name: "Quiet Knit Co-ord",
    category: { slug: "co-ord-sets", name: "Co-ord Sets" },
    price: inr(4590),
    image: storefrontMedia.products.knitCoord,
    badges: ["featured"],
    inStock: true,
    colours: [
      { name: "Stone", slug: "stone", hex: "#cfc7bb", available: true },
      { name: "Deep plum", slug: "deep-plum", hex: "#46255c", available: true },
    ],
    images: [storefrontMedia.products.knitCoord],
    description:
      "A fine-gauge knit top and matching skirt that travel well and do not crease. Warm enough for an over-air-conditioned office in June.",
    details: [
      "Viscose blend fine-gauge knit",
      "Slim top, straight midi skirt",
      "Sold as a set",
      "Hand wash cold, dry flat",
      "Model is 5'9\" and wears a size S",
    ],
    sizes: sizes(["XXL"]),
  },
] as const;
