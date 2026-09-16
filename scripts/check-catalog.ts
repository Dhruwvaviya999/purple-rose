/**
 * Offline checks for the catalogue logic that does not touch the database.
 *
 * Run with `pnpm check:catalog`. It needs no connection and no environment.
 *
 * It covers the parts where a mistake is silent rather than loud: URL parsing,
 * which is the one place attacker-controlled text enters the system; the money
 * arithmetic, where a rounding error is a wrong price; the mapping from rows
 * to what a page renders, which is where colour-specific images and per-colour
 * size availability are decided; and the seed content, which is checked here
 * so a typo in a colour slug fails in a second rather than halfway through a
 * migration.
 *
 * Behaviour that needs real rows -- filtering, sorting, facet counts, paging,
 * slug lookup, seed idempotency -- is covered by `pnpm check:catalog:db`,
 * which needs a connection.
 *
 * The `--conditions=react-server` flag in the package script is what lets Node
 * import the modules marked `server-only`.
 */
// The filter builder reads `prisma.product.fields.price` to compare two
// columns in SQL. Touching `.fields` constructs the client, which wants a
// connection string, but never opens a socket. A throwaway value keeps this
// script offline; nothing here connects to it.
process.env.DATABASE_URL ??= "postgresql://offline:offline@127.0.0.1:5432/offline";

import {
  activeFilterCount,
  hasActiveFilters,
  parseProductQuery,
  productQueryParams,
} from "../src/features/storefront/product-query";
import {
  buildProductOrderBy,
  buildProductWhere,
} from "../src/lib/catalog/product-filters";
import {
  isOnSale,
  toProductCardData,
  toProductDetailData,
} from "../src/lib/catalog/product-mapper";
import {
  fabricVocabulary,
  fitVocabulary,
  occasionVocabulary,
  patternVocabulary,
  toToken,
  tokensToValues,
  type Vocabulary,
} from "../src/lib/catalog/vocabulary";
import { discountPercent, formatPrice } from "../src/lib/utils/format-price";
import { validateCatalogSeed } from "../prisma/catalog/seed";
import { colors, products, sizes } from "../prisma/catalog/data";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

console.log("\n== product query parsing ==");

const empty = parseProductQuery({});
check("an empty URL asks for page one", empty.page === 1, String(empty.page));
check("an empty URL sorts by the default", empty.sort === "featured", empty.sort);
check("an empty URL has no filters", !hasActiveFilters(empty));
check("an empty URL has no search term", empty.search === undefined);

const full = parseProductQuery({
  [productQueryParams.search]: "  pink   linen  ",
  [productQueryParams.category]: "cotton-dresses,fresh-prints",
  [productQueryParams.size]: ["M", "l"],
  [productQueryParams.colour]: "pink",
  [productQueryParams.fabric]: "cotton-poplin",
  [productQueryParams.fit]: "a-line",
  [productQueryParams.sale]: "true",
  [productQueryParams.inStock]: "1",
  [productQueryParams.newArrival]: "true",
  [productQueryParams.minPrice]: "1000",
  [productQueryParams.maxPrice]: "3000",
  [productQueryParams.sort]: "price-asc",
  [productQueryParams.page]: "3",
});

check("a comma list becomes several values", full.categories.length === 2);
check("repeated parameters become several values", full.sizes.length === 2);
check("tokens are lower-cased", full.sizes.every((s) => s === s.toLowerCase()));
check("a search term is trimmed and collapsed", full.search === "pink linen", full.search);
check('"1" counts as true for a flag', full.inStockOnly);
check("rupees become paise", full.minPrice === 100_000 && full.maxPrice === 300_000);
check("a known sort is kept", full.sort === "price-asc");
check("the page number is read", full.page === 3);
check(
  "every group counts once toward the filter badge",
  // search + 2 categories + 2 sizes + 1 colour + 1 fabric + 1 fit
  // + sale + in stock + new + one price range
  activeFilterCount(full) === 12,
  String(activeFilterCount(full)),
);

console.log("\n== hostile URLs are not trusted ==");

const hostile = parseProductQuery({
  [productQueryParams.category]: "'; DROP TABLE \"Product\"; --",
  [productQueryParams.size]: "../../etc/passwd",
  [productQueryParams.colour]: "a".repeat(200),
  [productQueryParams.sort]: "price-asc; DELETE FROM x",
  [productQueryParams.page]: "-4",
  [productQueryParams.minPrice]: "99999999",
});

check("a SQL fragment is not a token", hostile.categories.length === 0);
check("a path traversal is not a token", hostile.sizes.length === 0);
check("an over-long token is dropped", hostile.colours.length === 0);
check("an unknown sort falls back", hostile.sort === "featured", hostile.sort);
check("a negative page becomes page one", hostile.page === 1, String(hostile.page));
check("an absurd price bound is dropped", hostile.minPrice === undefined);

// Built from character codes rather than escapes, so the bytes under test
// are unambiguous in this source file: a NUL and a newline.
const messyTerm = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(10) + "c";
const controlChars = parseProductQuery({ [productQueryParams.search]: messyTerm });
check(
  "control characters are stripped from a term",
  controlChars.search === "a b c",
  JSON.stringify(controlChars.search),
);

const longTerm = parseProductQuery({ [productQueryParams.search]: "x".repeat(400) });
check(
  "a term is length-capped",
  (longTerm.search?.length ?? 0) === 80,
  String(longTerm.search?.length),
);

console.log("\n== attribute vocabularies ==");

/** Generic so each vocabulary keeps its own value type through the checks. */
function checkVocabulary<TValue extends string>(vocabulary: Vocabulary<TValue>) {
  check(
    `${vocabulary.param}: every value has a label`,
    vocabulary.values.every((value) => Boolean(vocabulary.labels[value])),
  );
  check(
    `${vocabulary.param}: every token is URL-safe`,
    vocabulary.values.every((value) => /^[a-z0-9-]+$/.test(toToken(value))),
  );
  check(
    `${vocabulary.param}: tokens round-trip back to values`,
    tokensToValues(vocabulary, vocabulary.values.map(toToken)).length ===
      vocabulary.values.length,
  );
  check(
    `${vocabulary.param}: an unknown token resolves to nothing`,
    tokensToValues(vocabulary, ["not-a-real-value"]).length === 0,
  );
}

checkVocabulary(fabricVocabulary);
checkVocabulary(patternVocabulary);
checkVocabulary(fitVocabulary);
checkVocabulary(occasionVocabulary);

check(
  "an underscore in an enum becomes a hyphen in a URL",
  toToken("COTTON_POPLIN") === "cotton-poplin",
  toToken("COTTON_POPLIN"),
);

console.log("\n== money ==");

check("a genuine reduction is a sale", isOnSale(249000, 320000));
check("no previous price is not a sale", !isOnSale(249000, null));
check("an equal previous price is not a sale", !isOnSale(249000, 249000));
check("a lower previous price is not a sale", !isOnSale(249000, 200000));
check(
  "the saving is rounded down, never up",
  discountPercent(249000, 320000) === 22,
  String(discountPercent(249000, 320000)),
);
check("no saving is claimed without a reduction", discountPercent(249000, undefined) === null);
check(
  "paise are rendered as whole rupees",
  formatPrice(249000).replaceAll(String.fromCharCode(160), " ") === "₹2,490",
  formatPrice(249000),
);
check(
  "every seeded price is an exact integer in paise",
  products.every(
    (product) =>
      Number.isInteger(product.price) &&
      product.price > 0 &&
      (product.compareAtPrice === undefined ||
        Number.isInteger(product.compareAtPrice)),
  ),
);

console.log("\n== filter construction ==");

const where = buildProductWhere(full);
check("only active products are ever asked for", where.status === "ACTIVE");
check("a category filter goes through the join table", Boolean(where.categories));
check(
  "size and colour are one constraint on one variant",
  JSON.stringify(where.variants).includes("size") &&
    JSON.stringify(where.variants).includes("color"),
);
check("a price range becomes bounds on the price column", Boolean(where.price));
check("a merchandising flag becomes a column match", where.newArrival === true);

const withoutColour = buildProductWhere(full, ["colour"]);
check(
  "excluding the colour group drops the colour constraint",
  !JSON.stringify(withoutColour.variants).includes("slug"),
);
check(
  "excluding the colour group keeps the size constraint",
  JSON.stringify(withoutColour.variants).includes("code"),
);

const unknownFabric = buildProductWhere(
  parseProductQuery({ [productQueryParams.fabric]: "unobtainium" }),
);
check(
  "an unknown attribute token matches nothing rather than everything",
  JSON.stringify(unknownFabric.fabric) === '{"in":[]}',
  JSON.stringify(unknownFabric.fabric),
);

console.log("\n== sorting ==");

for (const sort of ["featured", "newest", "price-asc", "price-desc", "name-asc"] as const) {
  const order = buildProductOrderBy(sort);
  check(
    `${sort}: ends with a stable tiebreak`,
    JSON.stringify(order.at(-1)) === '{"id":"asc"}',
    JSON.stringify(order.at(-1)),
  );
}

check(
  "price-asc orders by price ascending first",
  JSON.stringify(buildProductOrderBy("price-asc")[0]) === '{"price":"asc"}',
);
check(
  "featured leads with the featured flag",
  JSON.stringify(buildProductOrderBy("featured")[0]) === '{"featured":"desc"}',
);

console.log("\n== mapping rows to what a page renders ==");

const category = { slug: "cotton-dresses", name: "Cotton Dresses" };
const IVORY = "colour-ivory";
const PLUM = "colour-plum";

function variant(
  colourId: string,
  slug: string,
  name: string,
  hex: string,
  size: string,
  quantity: number,
) {
  return {
    sku: `SKU-${slug}-${size}`,
    colorId: colourId,
    color: { slug, name, hex },
    size: { code: size },
    inventory: { quantity },
  };
}

const detailRow = {
  id: "product-1",
  slug: "test-dress",
  name: "Test Dress",
  articleNumber: "PR-DR-9999",
  shortDescription: "Short.",
  description: "Long description.",
  price: 249000,
  compareAtPrice: 320000,
  featured: true,
  newArrival: false,
  bestSeller: false,
  fabric: "COTTON_POPLIN" as const,
  pattern: "FLORAL" as const,
  fit: "A_LINE" as const,
  occasion: "EVERYDAY" as const,
  careInstructions: "Machine wash cold",
  seoTitle: null,
  seoDescription: null,
  publishedAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  primaryCategory: category,
  categories: [{ category: { id: "cat-1", ...category } }],
  images: [
    { url: "ivory-front.jpg", alt: "Ivory front", width: 800, height: 1000, colorId: IVORY },
    { url: "ivory-back.jpg", alt: "Ivory back", width: 800, height: 1000, colorId: IVORY },
    { url: "plum-front.jpg", alt: "Plum front", width: 800, height: 1000, colorId: PLUM },
    { url: "fabric.jpg", alt: "Fabric detail", width: 800, height: 1000, colorId: null },
  ],
  // Ivory is cut XS to M; plum is cut M to L, and its M is gone.
  variants: [
    variant(IVORY, "ivory", "Ivory", "#f3efe7", "XS", 3),
    variant(IVORY, "ivory", "Ivory", "#f3efe7", "S", 5),
    variant(IVORY, "ivory", "Ivory", "#f3efe7", "M", 2),
    variant(PLUM, "plum", "Plum", "#46255c", "M", 0),
    variant(PLUM, "plum", "Plum", "#46255c", "L", 4),
  ],
};

const detail = toProductDetailData(detailRow);

check("the card price comes straight off the row", detail.price === 249000);
check("a reduction produces a sale badge", detail.badges.includes("sale"));
check("a featured flag produces a featured badge", detail.badges.includes("featured"));
check("stock anywhere means the product is in stock", detail.inStock);
check("the article number reaches the page", detail.articleNumber === "PR-DR-9999");
check(
  "the details are built from the structured columns",
  detail.details.some((line) => line === "Fabric — Cotton poplin") &&
    detail.details.some((line) => line === "Fit — A-line"),
  detail.details.join(" / "),
);

check("both colours are offered", detail.colourOptions.length === 2);

const ivory = detail.colourOptions.find((option) => option.slug === "ivory");
const plum = detail.colourOptions.find((option) => option.slug === "plum");

check(
  "ivory shows its own photographs, then the shared one",
  ivory?.images.map((image) => image.src).join(",") ===
    "ivory-front.jpg,ivory-back.jpg,fabric.jpg",
  ivory?.images.map((image) => image.src).join(","),
);
check(
  "plum shows its own photograph, and never ivory's",
  plum?.images.map((image) => image.src).join(",") === "plum-front.jpg,fabric.jpg",
  plum?.images.map((image) => image.src).join(","),
);

check(
  "the size run is the union, in size order",
  detail.sizes.map((size) => size.value).join(",") === "XS,S,M,L",
  detail.sizes.map((size) => size.value).join(","),
);
check(
  "ivory offers XS, S and M and disables L",
  ivory?.sizes
    .filter((size) => size.available)
    .map((size) => size.value)
    .join(",") === "XS,S,M",
  ivory?.sizes.map((s) => `${s.value}:${s.available}`).join(" "),
);
check(
  "plum offers only L, because its M is gone",
  plum?.sizes
    .filter((size) => size.available)
    .map((size) => size.value)
    .join(",") === "L",
  plum?.sizes.map((s) => `${s.value}:${s.available}`).join(" "),
);
check(
  "a colour with stock somewhere is selectable",
  ivory?.available === true && plum?.available === true,
);

const soldOut = toProductCardData({
  ...detailRow,
  images: detailRow.images.slice(0, 2),
  variants: detailRow.variants.map((entry) => ({
    color: entry.color,
    inventory: { quantity: 0 },
  })),
});

check("a product with no stock anywhere is out of stock", !soldOut.inStock);
check(
  "every colour of a sold-out product is struck through",
  soldOut.colours.every((colour) => !colour.available),
);
check(
  "the card takes its image from the first photograph",
  soldOut.image.src === "ivory-front.jpg",
  soldOut.image.src,
);
check(
  "the second photograph becomes the hover image",
  soldOut.hoverImage?.src === "ivory-back.jpg",
  soldOut.hoverImage?.src,
);

const noImages = toProductCardData({
  ...detailRow,
  images: [],
  variants: detailRow.variants.map((entry) => ({
    color: entry.color,
    inventory: entry.inventory,
  })),
});
check(
  "a product with no photograph still renders rather than throwing",
  noImages.image.src.startsWith("data:image/svg+xml"),
);

console.log("\n== seed content ==");

let seedError: string | null = null;
try {
  validateCatalogSeed();
} catch (error) {
  seedError = error instanceof Error ? error.message : String(error);
}
check("the seed passes its own integrity checks", seedError === null, seedError ?? "");

const active = products.filter((product) => product.status === "ACTIVE");
check(
  "there are enough live products to fill more than one page",
  active.length > 12,
  String(active.length),
);
check(
  "a draft and an archived product exist, so exclusion can be checked",
  products.some((product) => product.status === "DRAFT") &&
    products.some((product) => product.status === "ARCHIVED"),
);
check(
  "at least one product is reduced",
  active.some((product) => product.compareAtPrice !== undefined),
);
check(
  "at least one live product is entirely sold out",
  active.some((product) =>
    product.colourways.every((colourway) =>
      Object.values(colourway.stock).every((quantity) => quantity === 0),
    ),
  ),
);
check(
  "at least one product is in more than one collection",
  active.some((product) => (product.alsoIn?.length ?? 0) > 0),
);
check(
  "at least one product is cut in different sizes per colour",
  active.some((product) => {
    const runs = product.colourways.map((colourway) =>
      Object.keys(colourway.stock).sort().join(","),
    );
    return new Set(runs).size > 1;
  }),
);
check(
  "every merchandising flag is used by something live",
  active.some((p) => p.featured) &&
    active.some((p) => p.newArrival) &&
    active.some((p) => p.bestSeller) &&
    active.some((p) => p.seasonal),
);
check(
  "every size in the run is cut by something",
  sizes.every((size) =>
    active.some((product) =>
      product.colourways.some((colourway) => size.code in colourway.stock),
    ),
  ),
);
check(
  "every colour in the palette is used by something",
  colors.every((color) =>
    active.some((product) =>
      product.colourways.some((colourway) => colourway.colour === color.slug),
    ),
  ),
);

/**
 * The same SKU rule the seed writes with. A collision here would mean two
 * variants racing for one unique row and the seed failing halfway.
 */
const skus = new Set<string>();
let duplicateSku: string | null = null;

for (const product of products) {
  for (const colourway of product.colourways) {
    for (const code of Object.keys(colourway.stock)) {
      const colour = colourway.colour.replaceAll("-", "").slice(0, 3).toUpperCase();
      const sku = `${product.articleNumber}-${colour}-${code}`;

      if (skus.has(sku)) {
        duplicateSku = sku;
      }
      skus.add(sku);
    }
  }
}

check("every generated SKU is unique", duplicateSku === null, duplicateSku ?? "");
check(
  "no generated SKU exceeds its column",
  [...skus].every((sku) => sku.length <= 48),
);

console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exitCode = 1;
}
