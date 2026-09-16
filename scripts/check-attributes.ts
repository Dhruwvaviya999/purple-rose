/**
 * Checks for the colour and size admin, against a real database.
 *
 * Run with `pnpm check:attributes`. It needs `DATABASE_URL` in `.env.local` or
 * `.env`, the migrations applied and `pnpm db:seed` run. Without a connection
 * it exits cleanly and says what is missing.
 *
 * **It writes.** Everything it creates is named with the `zzzcheck` marker and
 * deleted in a `finally`, including when a check fails. Seeded colours, sizes,
 * products and variants are never modified.
 *
 * ## What is proved here
 *
 * The write paths run through the real admin services, so validation,
 * uniqueness, reordering, the deactivation rules and the stale-write guard are
 * genuinely exercised — including the thing that matters most about
 * deactivation: that an existing variant keeps working when its colour or size
 * is withdrawn.
 *
 * Authorisation over HTTP is `pnpm check:admin:http`; the mechanical audit that
 * every action is guarded is `pnpm check:admin`. This script covers the third
 * angle: the guard applied to the two new action modules, and the policy that
 * a customer and an anonymous caller both fail it.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { AdminAuthorizationError, isAdmin } from "../src/lib/auth/admin-policy";
import {
  createColorSchema,
  createSizeSchema,
  hexColorSchema,
} from "../src/lib/validations/catalog-admin";
import {
  createColor,
  getAdminColor,
  listAdminColors,
  moveColor,
  setColorActive,
  updateColor,
} from "../src/lib/services/admin/color-admin-service";
import {
  createSize,
  getAdminSize,
  listAdminSizes,
  moveSize,
  setSizeActive,
  updateSize,
} from "../src/lib/services/admin/size-admin-service";
import {
  createVariant,
  createVariants,
} from "../src/lib/services/admin/variant-admin-service";
import { getProductFormOptions } from "../src/lib/services/admin/product-admin-service";
import { getCatalogMetrics } from "../src/lib/services/admin/catalog-dashboard-service";
import { listFilterGroups } from "../src/lib/services/product-service";
import { parseProductQuery } from "../src/features/storefront/product-query";

/** Everything this script makes carries this, and is deleted afterwards. */
const MARK = "zzzcheck";

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

/* ------------------------------------------------------------------ *
 * Offline
 * ------------------------------------------------------------------ */

function checkOffline(): void {
  console.log("\n== hex colours ==");

  for (const [input, expected] of [
    ["#a87bc9", "#a87bc9"],
    ["#A87BC9", "#a87bc9"],
    ["  #abc  ", "#aabbcc"],
    ["#FFF", "#ffffff"],
  ] as const) {
    const result = hexColorSchema.safeParse(input);
    check(
      `"${input.trim()}" becomes ${expected}`,
      result.success && result.data === expected,
      result.success ? result.data : "rejected",
    );
  }

  // The value is rendered as an inline background-color, so only one
  // unambiguous shape is accepted. Everything that could carry a function
  // call, a URL or a semicolon into a style attribute is refused.
  for (const bad of [
    "red",
    "rgb(1,2,3)",
    "javascript:alert(1)",
    "url(evil.png)",
    "var(--x)",
    "#a87bc9; background: url(x)",
    "#12345",
    "#gggggg",
    "<script>",
    "",
  ]) {
    check(`"${bad}" is refused as a hex colour`, !hexColorSchema.safeParse(bad).success);
  }

  console.log("\n== attribute schemas ==");

  const badColor = createColorSchema.safeParse({
    name: "x",
    slug: "Not A Slug",
    hex: "notahex",
    position: "-1",
    isActive: undefined,
  });
  check("a wholly invalid colour is refused", !badColor.success);
  check(
    "and the refusal names several fields",
    !badColor.success &&
      new Set(badColor.error.issues.map((issue) => issue.path[0])).size >= 3,
  );

  const okColor = createColorSchema.safeParse({
    name: "Sea glass",
    slug: "sea-glass",
    hex: "#8fb8a8",
    position: "3",
    isActive: "on",
  });
  check("a valid colour parses", okColor.success);
  check("an unticked box means not offered", createColorSchema.safeParse({
    name: "Sea glass",
    slug: "sea-glass",
    hex: "#8fb8a8",
    position: "3",
    isActive: null,
  }).data?.isActive === false);

  const lowerCode = createSizeSchema.safeParse({
    code: "  m  ",
    name: "Medium",
    position: "2",
    isActive: "on",
    bustCm: "",
    waistCm: "",
    hipCm: "",
  });
  check("a size code is upper-cased and trimmed", lowerCode.success && lowerCode.data.code === "M");
  check(
    "blank measurements stay null rather than becoming zero",
    lowerCode.success &&
      lowerCode.data.bustCm === null &&
      lowerCode.data.waistCm === null &&
      lowerCode.data.hipCm === null,
  );

  const measured = createSizeSchema.safeParse({
    code: "L",
    name: "Large",
    position: "3",
    isActive: "on",
    bustCm: "97",
    waistCm: "79",
    hipCm: "104",
  });
  check("measurements parse as whole centimetres", measured.success && measured.data.bustCm === 97);

  for (const bad of ["-5", "9.5", "abc", "1000"]) {
    check(
      `"${bad}" is refused as a measurement`,
      !createSizeSchema.safeParse({
        code: "L",
        name: "Large",
        position: "3",
        isActive: "on",
        bustCm: bad,
        waistCm: "",
        hipCm: "",
      }).success,
    );
  }

  console.log("\n== authorisation ==");

  check("nobody is not an administrator", !isAdmin(null));
  check(
    "a customer is not an administrator",
    !isAdmin({ id: "x", phoneNumber: "+910000000000", name: null, role: Role.CUSTOMER }),
  );
  check(
    "an administrator is",
    isAdmin({ id: "x", phoneNumber: "+910000000000", name: null, role: Role.ADMIN }),
  );
  check(
    "the refusal carries no detail",
    new AdminAuthorizationError().message === "Administrator access is required.",
  );

  console.log("\n== the new action modules are guarded ==");

  // The same mechanical audit `pnpm check:admin` runs, applied here to the two
  // modules this phase added, so a guard cannot be forgotten in either.
  for (const file of ["colors.ts", "sizes.ts"]) {
    const source = readFileSync(
      join(process.cwd(), "src", "actions", "admin", file),
      "utf8",
    );

    check(`${file} declares "use server"`, source.trimStart().startsWith('"use server"'));

    const exported = [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    );
    check(`${file} exports actions`, exported.length > 0, String(exported.length));

    for (const name of exported) {
      const start = source.indexOf(`export async function ${name}`);
      const next = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      const guard = body.indexOf("await requireAdminActor()");
      const parse = body.indexOf("safeParse");

      check(`${file}: ${name} calls requireAdminActor`, guard !== -1);
      check(
        `${file}: ${name} guards before it parses input`,
        guard !== -1 && (parse === -1 || guard < parse),
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Against the database
 * ------------------------------------------------------------------ */

async function checkDatabase(): Promise<void> {
  try {
    console.log("\n== creating a colour ==");

    const colourResult = await createColor({
      name: `${MARK} sea glass`,
      slug: `${MARK}-sea-glass`,
      hex: "#8fb8a8",
      position: 900,
      isActive: true,
    });

    check("a colour is created", colourResult.ok);

    if (!colourResult.ok) {
      return;
    }

    const colourId = colourResult.data.id;
    const storedColour = await getAdminColor(colourId);

    check("it is really in the database", storedColour !== null);
    check("with the hex it was given", storedColour?.hex === "#8fb8a8");
    check("and nothing uses it yet", storedColour?.variantCount === 0);

    const duplicateColour = await createColor({
      name: "A different name",
      slug: `${MARK}-sea-glass`,
      hex: "#000000",
      position: 901,
      isActive: true,
    });
    check(
      "a duplicate colour slug is refused, on the slug field",
      !duplicateColour.ok &&
        duplicateColour.code === "slug-taken" &&
        duplicateColour.field === "slug",
    );
    check(
      "and the refusal mentions no database internals",
      !duplicateColour.ok &&
        !/prisma|constraint|unique|sql|column/i.test(duplicateColour.message),
      duplicateColour.ok ? "" : duplicateColour.message,
    );

    console.log("\n== creating a size ==");

    const sizeResult = await createSize({
      code: `${MARK}XL`.toUpperCase(),
      name: `${MARK} triple extra large`,
      position: 900,
      isActive: true,
      bustCm: 120,
      waistCm: 100,
      hipCm: 126,
    });

    check("a size is created", sizeResult.ok);

    if (!sizeResult.ok) {
      return;
    }

    const sizeId = sizeResult.data.id;
    const storedSize = await getAdminSize(sizeId);

    check("it is really in the database", storedSize !== null);
    check("with its measurements", storedSize?.bustCm === 120 && storedSize?.hipCm === 126);

    const duplicateSize = await createSize({
      code: `${MARK}XL`.toUpperCase(),
      name: "Something else",
      position: 901,
      isActive: true,
      bustCm: null,
      waistCm: null,
      hipCm: null,
    });
    check(
      "a duplicate size code is refused, on the code field",
      !duplicateSize.ok && duplicateSize.field === "code",
    );
    check(
      "and the refusal mentions no database internals",
      !duplicateSize.ok &&
        !/prisma|constraint|unique|sql|column/i.test(duplicateSize.message),
    );

    console.log("\n== updating, and the stale-write guard ==");

    const before = await prisma.color.findUniqueOrThrow({
      where: { id: colourId },
      select: { updatedAt: true },
    });

    const renamed = await updateColor({
      id: colourId,
      name: `${MARK} sea glass, renamed`,
      slug: `${MARK}-sea-glass`,
      hex: "#7fa898",
      position: 900,
      isActive: true,
      expectedUpdatedAt: before.updatedAt,
    });
    check("a colour is updated", renamed.ok);

    const afterRename = await getAdminColor(colourId);
    check("the name changed", afterRename?.name === `${MARK} sea glass, renamed`);
    check("the hex changed", afterRename?.hex === "#7fa898");
    check(
      "the slug did NOT follow the name",
      afterRename?.slug === `${MARK}-sea-glass`,
      afterRename?.slug,
    );

    const stale = await updateColor({
      id: colourId,
      name: "Written by a second administrator",
      slug: `${MARK}-sea-glass`,
      hex: "#000000",
      position: 900,
      isActive: true,
      expectedUpdatedAt: before.updatedAt,
    });
    check("a second administrator writing an old version is refused", !stale.ok && stale.code === "stale");
    check(
      "and the first administrator's work survived",
      (await getAdminColor(colourId))?.name === `${MARK} sea glass, renamed`,
    );

    const sizeBefore = await prisma.size.findUniqueOrThrow({
      where: { id: sizeId },
      select: { updatedAt: true },
    });

    const sizeRenamed = await updateSize({
      id: sizeId,
      code: `${MARK}XL`.toUpperCase(),
      name: `${MARK} renamed size`,
      position: 900,
      isActive: true,
      bustCm: null,
      waistCm: null,
      hipCm: null,
      expectedUpdatedAt: sizeBefore.updatedAt,
    });
    check("a size is updated", sizeRenamed.ok);

    const afterSizeRename = await getAdminSize(sizeId);
    check(
      "the code did NOT follow the name",
      afterSizeRename?.code === `${MARK}XL`.toUpperCase(),
      afterSizeRename?.code,
    );
    check(
      "measurements can be cleared back to null",
      afterSizeRename?.bustCm === null && afterSizeRename?.hipCm === null,
    );

    const staleSize = await updateSize({
      id: sizeId,
      code: `${MARK}XL`.toUpperCase(),
      name: "Second administrator",
      position: 900,
      isActive: true,
      bustCm: null,
      waistCm: null,
      hipCm: null,
      expectedUpdatedAt: sizeBefore.updatedAt,
    });
    check("a stale size write is refused too", !staleSize.ok && staleSize.code === "stale");

    console.log("\n== the product editor offers what is active ==");

    const offered = await getProductFormOptions();
    check(
      "the new colour is offered",
      offered.colors.some((colour) => colour.id === colourId),
    );
    check(
      "the new size is offered",
      offered.sizes.some((size) => size.id === sizeId),
    );
    check(
      "nothing in the form options is hardcoded: every size came from a row",
      offered.sizes.every((size) => typeof size.id === "string" && size.id.length > 10),
    );

    console.log("\n== a variant using them ==");

    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { slug: "asc" },
      select: { id: true, articleNumber: true, slug: true },
    });

    const variant = await createVariant({
      productId: product.id,
      colorId: colourId,
      sizeId: sizeId,
      sku: `${MARK}-VARIANT-1`.toUpperCase(),
      quantity: 4,
      lowStockThreshold: 1,
    });
    check("a variant can be built from the new attributes", variant.ok);

    if (!variant.ok) {
      return;
    }

    console.log("\n== deactivating, with a variant already using it ==");

    const offColour = await setColorActive(colourId, false);
    check("a colour in use can still be switched off", offColour.ok);

    const offSize = await setSizeActive(sizeId, false);
    check("a size in use can still be switched off", offSize.ok);

    // The point of the whole deactivation design: nothing that exists breaks.
    const survivingVariant = await prisma.productVariant.findUnique({
      where: { id: variant.data.id },
      select: { isActive: true, colorId: true, sizeId: true, inventory: { select: { quantity: true } } },
    });
    check("the existing variant still exists", survivingVariant !== null);
    check("it is still sellable", survivingVariant?.isActive === true);
    check("it still points at the withdrawn colour", survivingVariant?.colorId === colourId);
    check("it still points at the withdrawn size", survivingVariant?.sizeId === sizeId);
    check("and it kept its stock", survivingVariant?.inventory?.quantity === 4);

    const afterOff = await getProductFormOptions();
    check(
      "the withdrawn colour is no longer offered for new variants",
      !afterOff.colors.some((colour) => colour.id === colourId),
    );
    check(
      "the withdrawn size is no longer offered for new variants",
      !afterOff.sizes.some((size) => size.id === sizeId),
    );

    console.log("\n== the form is a snapshot; the database is authoritative ==");

    // The §33 case: an administrator's page was rendered before the colour was
    // withdrawn, and their submit must not quietly bring it back.
    const staleSubmit = await createVariant({
      productId: product.id,
      colorId: colourId,
      sizeId: (await prisma.size.findFirstOrThrow({
        where: { isActive: true },
        select: { id: true },
      })).id,
      sku: `${MARK}-VARIANT-STALE`.toUpperCase(),
      quantity: 1,
      lowStockThreshold: 1,
    });
    check(
      "a new variant in a withdrawn colour is refused",
      !staleSubmit.ok && staleSubmit.code === "invalid-reference",
      staleSubmit.ok ? "it was created" : staleSubmit.message,
    );
    check(
      "and nothing was written",
      (await prisma.productVariant.count({
        where: { sku: `${MARK}-VARIANT-STALE`.toUpperCase() },
      })) === 0,
    );

    const activeColour = await prisma.color.findFirstOrThrow({
      where: { isActive: true },
      select: { id: true },
    });

    const staleBulk = await createVariants({
      productId: product.id,
      variants: [
        {
          colorId: activeColour.id,
          sizeId: sizeId,
          sku: `${MARK}-BULK-STALE`.toUpperCase(),
          quantity: 1,
          lowStockThreshold: 1,
        },
      ],
    });
    check(
      "a bulk batch using a withdrawn size is refused whole",
      !staleBulk.ok && staleBulk.code === "invalid-reference",
    );
    check(
      "and nothing from it was written",
      (await prisma.productVariant.count({
        where: { sku: `${MARK}-BULK-STALE`.toUpperCase() },
      })) === 0,
    );

    console.log("\n== the shop filter follows the same rule ==");

    const groups = await listFilterGroups(parseProductQuery({}));
    const colourGroup = groups.find((group) => group.param === "colour");
    const sizeGroup = groups.find((group) => group.param === "size");

    check(
      "a withdrawn colour is not offered as a shop filter",
      !colourGroup?.options.some((option) => option.value === `${MARK}-sea-glass`),
    );
    check(
      "a withdrawn size is not offered as a shop filter",
      !sizeGroup?.options.some(
        (option) => option.value === `${MARK}xl`.toLowerCase(),
      ),
    );
    check("but the shop still offers the seeded colours", (colourGroup?.options.length ?? 0) > 0);
    check("and the seeded sizes", (sizeGroup?.options.length ?? 0) > 0);

    console.log("\n== reactivating ==");

    await setColorActive(colourId, true);
    await setSizeActive(sizeId, true);

    const afterOn = await getProductFormOptions();
    check(
      "the colour is offered again",
      afterOn.colors.some((colour) => colour.id === colourId),
    );
    check(
      "the size is offered again",
      afterOn.sizes.some((size) => size.id === sizeId),
    );
    check(
      "and the variant was never touched by any of it",
      (await prisma.productVariant.findUnique({
        where: { id: variant.data.id },
        select: { isActive: true },
      }))?.isActive === true,
    );

    console.log("\n== reordering ==");

    const moved = await moveColor(colourId, "up");
    check("a colour can be reordered", moved.ok);

    const colourPositions = await prisma.color.findMany({
      orderBy: { position: "asc" },
      select: { position: true },
    });
    check(
      "colour positions stay contiguous from zero",
      colourPositions.every((row, index) => row.position === index),
      colourPositions.map((row) => row.position).join(","),
    );

    const movedSize = await moveSize(sizeId, "up");
    check("a size can be reordered", movedSize.ok);

    const sizePositions = await prisma.size.findMany({
      orderBy: { position: "asc" },
      select: { position: true },
    });
    check(
      "size positions stay contiguous from zero",
      sizePositions.every((row, index) => row.position === index),
      sizePositions.map((row) => row.position).join(","),
    );

    // Moving the first one up is a no-op rather than an error, because the
    // button is disabled there and a duplicate submit should do nothing.
    const first = await prisma.color.findFirstOrThrow({
      orderBy: { position: "asc" },
      select: { id: true },
    });
    check("moving the first colour up does nothing, quietly", (await moveColor(first.id, "up")).ok);

    console.log("\n== the lists ==");

    const colours = await listAdminColors();
    const sizes = await listAdminSizes();

    check("colours are listed in position order", colours.every((row, index) => index === 0 || row.position >= (colours[index - 1]?.position ?? 0)));
    check("sizes are listed in position order", sizes.every((row, index) => index === 0 || row.position >= (sizes[index - 1]?.position ?? 0)));

    const listedColour = colours.find((row) => row.id === colourId);
    check("the usage count is on the row", listedColour?.variantCount === 1, String(listedColour?.variantCount));

    const search = await listAdminColors(MARK);
    check("colours can be searched", search.length >= 1 && search.every((row) => row.name.includes(MARK) || row.slug.includes(MARK)));

    console.log("\n== the dashboard counts attributes ==");

    const metrics = await getCatalogMetrics();
    check("colours are counted", metrics.colors.total > 0);
    check("active colours are a subset", metrics.colors.active <= metrics.colors.total);
    check("sizes are counted", metrics.sizes.total > 0);
    check("active sizes are a subset", metrics.sizes.active <= metrics.sizes.total);

    console.log("\n== the seeded catalogue is untouched ==");

    const [products, activeProducts, seededVariants] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.productVariant.count({ where: { sku: { startsWith: "PR-" } } }),
    ]);

    check("all 26 seeded products are still there", products === 26, String(products));
    check("24 of them are still live", activeProducts === 24, String(activeProducts));
    check("the 219 seeded variants are still there", seededVariants === 219, String(seededVariants));
  } finally {
    await cleanUp();
  }
}

/**
 * Remove everything this script made.
 *
 * Order matters: the variant references the colour and the size, both of which
 * are `onDelete: Restrict`, so the variant goes first. Runs in a `finally`, so
 * a failed assertion does not leave rows in Neon.
 */
async function cleanUp(): Promise<void> {
  console.log("\n== clean-up ==");

  await prisma.productVariant.deleteMany({
    where: { sku: { startsWith: MARK.toUpperCase() } },
  });
  await prisma.color.deleteMany({ where: { slug: { startsWith: MARK } } });
  await prisma.size.deleteMany({ where: { code: { startsWith: MARK.toUpperCase() } } });

  const [colours, sizes, variants] = await Promise.all([
    prisma.color.count({ where: { slug: { startsWith: MARK } } }),
    prisma.size.count({ where: { code: { startsWith: MARK.toUpperCase() } } }),
    prisma.productVariant.count({ where: { sku: { startsWith: MARK.toUpperCase() } } }),
  ]);

  check("no test colours left behind", colours === 0, String(colours));
  check("no test sizes left behind", sizes === 0, String(sizes));
  check("no test variants left behind", variants === 0, String(variants));

  // The seeded palette and run must be exactly as they were.
  const [seededColours, seededSizes] = await Promise.all([
    prisma.color.count(),
    prisma.size.count(),
  ]);
  check("the seeded palette is intact", seededColours === 8, String(seededColours));
  check("the seeded size run is intact", seededSizes === 6, String(seededSizes));

  // Reordering shifted the seeded rows; leave them contiguous and in order.
  await renumber();
}

/** Put positions back to 0..n-1 after the reorder checks. */
async function renumber(): Promise<void> {
  const colours = await prisma.color.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  for (const [position, row] of colours.entries()) {
    await prisma.color.update({ where: { id: row.id }, data: { position } });
  }

  const sizes = await prisma.size.findMany({
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: { id: true },
  });

  for (const [position, row] of sizes.entries()) {
    await prisma.size.update({ where: { id: row.id }, data: { position } });
  }
}

async function main(): Promise<void> {
  checkOffline();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  The database-backed attribute checks were skipped: no DATABASE_URL.",
        "",
        "  Set it in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm db:seed",
        "    pnpm check:attributes",
        "",
      ].join("\n"),
    );
    return;
  }

  await checkDatabase();
}

main()
  .then(async () => {
    if (process.env.DATABASE_URL?.trim()) {
      await prisma.$disconnect().catch(() => undefined);
    }

    console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    if (process.env.DATABASE_URL?.trim()) {
      await prisma.$disconnect().catch(() => undefined);
    }

    console.error(
      `Attribute checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
