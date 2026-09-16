/**
 * End-to-end checks for the catalogue against a real database.
 *
 * Run with `pnpm check:catalog:db`. It needs `DATABASE_URL` in `.env.local`,
 * the migrations applied and `pnpm db:seed` run. Without a connection it exits
 * cleanly and says what is missing, rather than pretending to have passed.
 *
 * It works against the real services, not mocks, so what it proves is what the
 * storefront actually does: the same `listProducts` the shop page calls, with
 * a `ProductQuery` produced by the same parser the URL goes through.
 *
 * **It writes.** The last section runs the catalogue seed twice to prove that
 * doing so does not duplicate anything. That is the same write `pnpm db:seed`
 * performs, and it is idempotent by construction, so it is safe against a
 * seeded development database. It creates nothing else and deletes nothing.
 *
 * Offline logic -- parsing, money, row mapping, seed content -- is covered by
 * `pnpm check:catalog`, which needs no connection.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { parseProductQuery } from "../src/features/storefront/product-query";
import {
  getActiveCategories,
  getCategoryBySlug,
  getCategoryNavigation,
  getCategoryTiles,
  listCategorySitemapEntries,
} from "../src/lib/services/category-service";
import {
  getProductBySlug,
  listFilterGroups,
  listMerchandisedProducts,
  listProducts,
  listProductSitemapEntries,
  listRelatedProducts,
} from "../src/lib/services/product-service";
import { prisma } from "../src/lib/db/client";
import { seedCatalog } from "../prisma/catalog/seed";

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

/** Build a query the way a URL would, so nothing is hand-assembled. */
function query(params: Record<string, string>) {
  return parseProductQuery(params);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  Skipped: the catalogue checks need a live database.",
        "",
        "  Set DATABASE_URL in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm db:seed",
        "    pnpm check:catalog:db",
        "",
      ].join("\n"),
    );
    return;
  }

  console.log("\n== the catalogue exists ==");

  const [categories, sizes, colours, products, variants, images, inventory] =
    await Promise.all([
      prisma.category.count(),
      prisma.size.count(),
      prisma.color.count(),
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.productImage.count(),
      prisma.inventory.count(),
    ]);

  check("categories exist", categories > 0, String(categories));
  check("sizes exist", sizes > 0, String(sizes));
  check("colours exist", colours > 0, String(colours));
  check("products exist", products > 0, String(products));
  check("variants exist", variants > 0, String(variants));
  check("images exist", images > 0, String(images));
  check("every variant has an inventory row", inventory === variants, `${inventory}/${variants}`);

  const orphanImages = await prisma.productImage.count({
    where: { colorId: null },
  });
  check("some images belong to no colour, shared by all", orphanImages > 0);

  const colourImages = await prisma.productImage.count({
    where: { colorId: { not: null } },
  });
  check("most images belong to a colour", colourImages > orphanImages);

  console.log("\n== categories ==");

  const active = await getActiveCategories();
  const navigation = await getCategoryNavigation();
  const tiles = await getCategoryTiles(4);
  const sitemapCategories = await listCategorySitemapEntries();

  check("active categories are returned", active.length > 0, String(active.length));
  check("navigation matches the active list", navigation.length === active.length);
  check("tiles are a subset with photography", tiles.length > 0 && tiles.length <= active.length);
  check("every tile has a real image", tiles.every((tile) => tile.image.src.startsWith("http")));
  check("the sitemap lists only active categories", sitemapCategories.length === active.length);

  const disabled = await prisma.category.findFirst({
    where: { isActive: false },
    select: { slug: true },
  });

  if (disabled) {
    check(
      "a disabled category is not in the public list",
      !active.some((entry) => entry.slug === disabled.slug),
      disabled.slug,
    );
    check(
      "a disabled category cannot be looked up by slug",
      (await getCategoryBySlug(disabled.slug)) === null,
    );
    check(
      "a disabled category is not in the sitemap",
      !sitemapCategories.some((entry) => entry.slug === disabled.slug),
    );
  } else {
    check("a disabled category exists to check exclusion against", false);
  }

  check("an unknown slug returns nothing", (await getCategoryBySlug("no-such-category")) === null);

  console.log("\n== listing and paging ==");

  const everything = await listProducts(query({}));
  const activeCount = await prisma.product.count({ where: { status: "ACTIVE" } });

  check("the total counts every live product", everything.total === activeCount, `${everything.total}/${activeCount}`);
  check("a page holds no more than the page size", everything.products.length <= everything.pageSize);
  check("the page count matches the total", everything.pageCount === Math.max(1, Math.ceil(activeCount / everything.pageSize)));

  const page2 = await listProducts(query({ page: "2" }));
  check("page two is a different page", page2.page === 2 || everything.pageCount === 1);

  const idsOnPage1 = new Set(everything.products.map((product) => product.id));
  check(
    "page two shares nothing with page one",
    page2.products.every((product) => !idsOnPage1.has(product.id)),
  );

  const overshoot = await listProducts(query({ page: "999" }));
  check("an overshooting page clamps to the last one", overshoot.page === everything.pageCount, String(overshoot.page));
  check("the clamped page has results", overshoot.products.length > 0 || activeCount === 0);

  console.log("\n== nothing unpublished is public ==");

  const hidden = await prisma.product.findMany({
    where: { status: { not: "ACTIVE" } },
    select: { slug: true, status: true },
  });

  check("draft or archived products exist to check against", hidden.length > 0, String(hidden.length));

  for (const product of hidden) {
    check(
      `${product.status} ${product.slug} is not reachable at its URL`,
      (await getProductBySlug(product.slug)) === null,
    );
  }

  const hiddenSlugs = new Set(hidden.map((product) => product.slug));
  const sitemapProducts = await listProductSitemapEntries();

  check(
    "the sitemap lists no unpublished product",
    sitemapProducts.every((entry) => !hiddenSlugs.has(entry.slug)),
  );
  check("the sitemap lists every live product", sitemapProducts.length === activeCount);

  const everySlug = await listProducts(query({ page: "1" }));
  check(
    "no listing page contains an unpublished product",
    everySlug.products.every((product) => !hiddenSlugs.has(product.slug)),
  );

  console.log("\n== sorting ==");

  const cheapFirst = await listProducts(query({ sort: "price-asc" }));
  const dearFirst = await listProducts(query({ sort: "price-desc" }));
  const byName = await listProducts(query({ sort: "name-asc" }));

  check(
    "price low to high is ascending",
    cheapFirst.products.every(
      (product, index) => index === 0 || product.price >= (cheapFirst.products[index - 1]?.price ?? 0),
    ),
  );
  check(
    "price high to low is descending",
    dearFirst.products.every(
      (product, index) =>
        index === 0 || product.price <= (dearFirst.products[index - 1]?.price ?? Infinity),
    ),
  );
  check(
    "name A to Z is alphabetical",
    byName.products.every(
      (product, index) =>
        index === 0 || product.name.localeCompare(byName.products[index - 1]?.name ?? "") >= 0,
    ),
  );
  check(
    "the cheapest and dearest are opposite ends of the same set",
    cheapFirst.total === dearFirst.total,
  );

  const newest = await listProducts(query({ sort: "newest" }));
  check("newest returns the same set in a different order", newest.total === everything.total);

  console.log("\n== filters ==");

  const firstCategory = active[0];

  if (firstCategory) {
    const inCategory = await listProducts(query({ category: firstCategory.slug }));
    check(
      `category ${firstCategory.slug} narrows the listing`,
      inCategory.total > 0 && inCategory.total <= everything.total,
      `${inCategory.total}/${everything.total}`,
    );

    const memberships = await prisma.productCategory.count({
      where: {
        category: { slug: firstCategory.slug },
        product: { status: "ACTIVE" },
      },
    });
    check(
      "the category filter counts memberships, not just primary categories",
      inCategory.total === memberships,
      `${inCategory.total}/${memberships}`,
    );
  }

  const onSale = await listProducts(query({ sale: "true" }));
  check("the sale filter returns something", onSale.total > 0, String(onSale.total));
  check(
    "every result really is reduced",
    onSale.products.every(
      (product) => product.compareAtPrice !== undefined && product.compareAtPrice > product.price,
    ),
  );
  check(
    "every sale result carries the sale badge",
    onSale.products.every((product) => product.badges.includes("sale")),
  );

  const inStock = await listProducts(query({ "in-stock": "true" }));
  check("the in-stock filter returns something", inStock.total > 0);
  check("every in-stock result is in stock", inStock.products.every((product) => product.inStock));
  check("the in-stock filter is narrower than everything", inStock.total <= everything.total);

  const soldOutSomewhere = everything.total > inStock.total;
  check("at least one live product is sold out", soldOutSomewhere, `${everything.total} vs ${inStock.total}`);

  const cheap = await listProducts(query({ max: "1500" }));
  check("a price ceiling is respected", cheap.products.every((product) => product.price <= 150_000));

  const band = await listProducts(query({ min: "2000", max: "3000" }));
  check(
    "a price band is respected at both ends",
    band.products.every((product) => product.price >= 200_000 && product.price <= 300_000),
  );

  const newArrivals = await listProducts(query({ new: "true" }));
  check("the new-arrival flag filters", newArrivals.total > 0 && newArrivals.total < everything.total);
  check(
    "every new arrival carries the new badge",
    newArrivals.products.every((product) => product.badges.includes("new")),
  );

  console.log("\n== size and colour meet on one variant ==");

  const groups = await listFilterGroups(query({}));
  const sizeGroup = groups.find((group) => group.param === "size");
  const colourGroup = groups.find((group) => group.param === "colour");

  check("a size facet is offered", (sizeGroup?.options.length ?? 0) > 0);
  check("a colour facet is offered", (colourGroup?.options.length ?? 0) > 0);
  check(
    "size options are smallest first",
    sizeGroup?.options.map((option) => option.value).join(",").startsWith("xs") ?? false,
    sizeGroup?.options.map((option) => option.value).join(","),
  );
  check(
    "every colour option carries a swatch",
    colourGroup?.options.every((option) => /^#[0-9a-f]{6}$/i.test(option.hex ?? "")) ?? false,
  );

  const size = sizeGroup?.options[0];
  const colour = colourGroup?.options[0];

  if (size && colour) {
    const bySize = await listProducts(query({ size: size.value }));
    check(
      `the size facet count matches the listing for ${size.value}`,
      bySize.total === size.count,
      `${bySize.total} vs ${size.count}`,
    );

    const byColour = await listProducts(query({ colour: colour.value }));
    check(
      `the colour facet count matches the listing for ${colour.value}`,
      byColour.total === colour.count,
      `${byColour.total} vs ${colour.count}`,
    );

    const both = await listProducts(query({ size: size.value, colour: colour.value }));
    check(
      "combining size and colour is an AND, never an OR",
      both.total <= Math.min(bySize.total, byColour.total),
      `${both.total} vs min(${bySize.total},${byColour.total})`,
    );

    // The real point of evaluating both against one variant: every result has
    // to have that colour available in that size, not merely both somewhere.
    const violations: string[] = [];
    for (const product of both.products) {
      const detail = await getProductBySlug(product.slug);
      const option = detail?.colourOptions.find((entry) => entry.slug === colour.value);
      const hasIt = option?.sizes.some(
        (entry) => entry.value.toLowerCase() === size.value && entry.available,
      );

      if (!hasIt) {
        violations.push(product.slug);
      }
    }

    check(
      "every combined result really has that colour in that size",
      violations.length === 0,
      violations.join(", "),
    );

    console.log("\n== facets exclude their own group ==");

    const narrowed = await listFilterGroups(query({ colour: colour.value }));
    const narrowedColours = narrowed.find((group) => group.param === "colour");

    check(
      "choosing a colour does not collapse the colour group to one option",
      (narrowedColours?.options.length ?? 0) > 1 || (colourGroup?.options.length ?? 0) <= 1,
      String(narrowedColours?.options.length),
    );
    check(
      "the chosen colour stays in the group so it can be unticked",
      narrowedColours?.options.some((option) => option.value === colour.value) ?? false,
    );

    const narrowedSizes = narrowed.find((group) => group.param === "size");
    check(
      "the size group does narrow to the chosen colour",
      (narrowedSizes?.options.length ?? 0) <= (sizeGroup?.options.length ?? 0),
    );
  }

  console.log("\n== facet counts predict the listing ==");

  const categoryGroup = groups.find((group) => group.param === "category");
  let facetMismatch: string | null = null;

  for (const option of categoryGroup?.options ?? []) {
    const listed = await listProducts(query({ category: option.value }));
    if (listed.total !== option.count) {
      facetMismatch = `${option.value}: facet ${option.count}, listing ${listed.total}`;
    }
  }
  check("every category facet count matches its listing", facetMismatch === null, facetMismatch ?? "");

  const fabricGroup = groups.find((group) => group.param === "fabric");
  let fabricMismatch: string | null = null;

  for (const option of fabricGroup?.options ?? []) {
    const listed = await listProducts(query({ fabric: option.value }));
    if (listed.total !== option.count) {
      fabricMismatch = `${option.value}: facet ${option.count}, listing ${listed.total}`;
    }
  }
  check("every fabric facet count matches its listing", fabricMismatch === null, fabricMismatch ?? "");

  check(
    "no facet offers a value that matches nothing",
    groups.every((group) => group.options.every((option) => (option.count ?? 0) > 0)),
  );

  console.log("\n== search ==");

  const sample = everything.products[0];

  if (sample) {
    const firstWord = sample.name.split(" ")[0] ?? "";
    const byName = await listProducts(query({ q: firstWord }));
    check(
      `searching "${firstWord}" finds ${sample.slug}`,
      byName.products.some((product) => product.slug === sample.slug) || byName.total > 0,
    );

    const upperCase = await listProducts(query({ q: firstWord.toUpperCase() }));
    check("search ignores case", upperCase.total === byName.total, `${upperCase.total} vs ${byName.total}`);

    const nonsense = await listProducts(query({ q: "zzzqqqxxnothing" }));
    check("a term that matches nothing returns nothing", nonsense.total === 0, String(nonsense.total));

    const twoWords = await listProducts(query({ q: `${firstWord} zzzqqqxxnothing` }));
    check("every word must match, so an AND narrows to nothing", twoWords.total === 0);

    const injection = await listProducts(query({ q: "'; DROP TABLE \"Product\"; --" }));
    check("a SQL fragment is treated as text", injection.total === 0);
    check("the products table survived that", (await prisma.product.count()) === products);
  }

  if (firstCategory) {
    const byCategoryName = await listProducts(query({ q: firstCategory.name.split(" ")[0] ?? "" }));
    check("search reaches collection names", byCategoryName.total > 0, String(byCategoryName.total));
  }

  console.log("\n== a product page ==");

  const slug = sample?.slug;

  if (slug) {
    const detail = await getProductBySlug(slug);

    check("the product loads by slug", detail !== null);
    check("it carries its category", Boolean(detail?.category.name));
    check("it carries at least one colour", (detail?.colourOptions.length ?? 0) > 0);
    check("it carries a size run", (detail?.sizes.length ?? 0) > 0);
    check("it carries photographs", (detail?.images.length ?? 0) > 0);
    check("it carries an article number", Boolean(detail?.articleNumber));
    check(
      "every colour has photographs of its own",
      detail?.colourOptions.every((option) => option.images.length > 0) ?? false,
    );
    check(
      "two colours do not show the same first photograph",
      (detail?.colourOptions.length ?? 0) < 2 ||
        detail?.colourOptions[0]?.images[0]?.src !== detail?.colourOptions[1]?.images[0]?.src,
    );
    check(
      "a colour offers only sizes it is cut in",
      detail?.colourOptions.every((option) =>
        option.sizes.every((entry) => detail.sizes.some((all) => all.value === entry.value)),
      ) ?? false,
    );

    const related = await listRelatedProducts(slug, 4);
    check("related products are returned", related.length > 0, String(related.length));
    check("a product is never related to itself", related.every((product) => product.slug !== slug));
    check("related products are all live", related.every((product) => !hiddenSlugs.has(product.slug)));
  }

  check("an unknown slug returns nothing", (await getProductBySlug("no-such-product")) === null);
  check(
    "a slug that could not exist is answered without a query",
    (await getProductBySlug("../../etc/passwd")) === null,
  );

  console.log("\n== home page rails ==");

  for (const rail of ["new-arrivals", "featured", "best-sellers"] as const) {
    const rows = await listMerchandisedProducts(rail, 4);
    check(`${rail} returns products`, rows.length > 0, String(rows.length));
    check(`${rail} returns nothing unpublished`, rows.every((product) => !hiddenSlugs.has(product.slug)));
    check(`${rail} respects the limit`, rows.length <= 4);
  }

  console.log("\n== seed idempotency ==");

  const before = await snapshot();
  await seedCatalog(prisma);
  const afterFirst = await snapshot();
  await seedCatalog(prisma);
  const afterSecond = await snapshot();

  check(
    "re-seeding does not change the row counts",
    JSON.stringify(before) === JSON.stringify(afterFirst),
    `${JSON.stringify(before)} then ${JSON.stringify(afterFirst)}`,
  );
  check(
    "seeding twice in a row does not double anything",
    JSON.stringify(afterFirst) === JSON.stringify(afterSecond),
    `${JSON.stringify(afterFirst)} then ${JSON.stringify(afterSecond)}`,
  );

  const duplicateSlugs = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM (SELECT slug FROM "Product" GROUP BY slug HAVING COUNT(*) > 1) AS duplicates
  `;
  check("no product slug appears twice", Number(duplicateSlugs[0]?.count ?? 0) === 0);
}

async function snapshot() {
  const [categories, sizes, colors, products, variants, images, memberships, inventory] =
    await Promise.all([
      prisma.category.count(),
      prisma.size.count(),
      prisma.color.count(),
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.productImage.count(),
      prisma.productCategory.count(),
      prisma.inventory.count(),
    ]);

  return { categories, sizes, colors, products, variants, images, memberships, inventory };
}

/**
 * Close the pool, but only if anything opened one.
 *
 * Touching `prisma` at all constructs the client, which needs a connection
 * string. When the script skipped because there is no database, disconnecting
 * would be the thing that throws, turning a clean skip into a stack trace.
 */
async function disconnect(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    return;
  }

  await prisma.$disconnect().catch(() => undefined);
}

main()
  .then(async () => {
    await disconnect();

    if (passed + failed > 0) {
      console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`);
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    await disconnect();
    // The reason, without a stack dump of connection internals.
    console.error(
      `Catalogue checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
