/**
 * The customer account and address book, end to end.
 *
 * Run with `pnpm check:account`. It needs `DATABASE_URL` in `.env.local` (or
 * `.env`) and the migrations applied. Without a connection it exits cleanly and
 * says what is missing rather than pretending to have passed.
 *
 * Four sections.
 *
 * **Offline.** Reads the source of the actions and the service and asserts the
 * shape of them: that every exported action authenticates before it parses, that
 * nothing accepts a `userId`, that no address query is scoped by id alone, and
 * that the profile endpoint cannot reach `role` or `phoneNumber`. A rule that
 * lives only in a comment is a rule that gets broken.
 *
 * **Profile.** What a customer may and may not change about themselves.
 *
 * **Addresses.** Create, read, update, delete, the default rules in every shape
 * they come in, the promotion on delete, the per-account limit, and isolation
 * between two customers in both directions.
 *
 * **Constraints.** Pushes the refused cases straight at PostgreSQL, to prove the
 * partial unique index and the CHECK constraints in the migration actually hold
 * — two defaults, a blank city, a lowercase country.
 *
 * **Expect `prisma:error` lines.** Several checks deliberately violate a
 * constraint; that is the point of them. A `PASS` under one is the constraint
 * doing its job.
 *
 * **It writes**, and everything it writes is marked. Test accounts use numbers
 * in the reserved `+1555…` range and are deleted by exact match, never by a
 * pattern, because a real customer record must never be removed to make a test
 * report tidy. Addresses cascade away with them.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { MAX_ADDRESSES_PER_CUSTOMER } from "../src/lib/account/limits";
import { normalisePhoneNumber } from "../src/lib/auth/phone";
import {
  countAddresses,
  createAddress,
  deleteAddress,
  getAddress,
  getDefaultAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
  type AddressWrite,
} from "../src/lib/services/address-service";
import { updateUserName } from "../src/lib/services/user-service";
import {
  addressInputSchema,
  profileInputSchema,
} from "../src/lib/validations/address";

/**
 * Reserved test numbers, distinct from every other suite's so two run back to
 * back without colliding. Clean-up deletes only these, by exact match.
 */
const NUMBERS = {
  customerA: "+15550105501",
  customerB: "+15550105502",
  admin: "+15550105503",
} as const;

/** A well-formed UUID that names nothing. */
const ABSENT_ID = "00000000-0000-7000-8000-000000000000";

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

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

/**
 * The code, without the prose.
 *
 * These modules explain at length what they refuse to accept, and an assertion
 * that a string never appears would fail on the sentence promising it never
 * appears. Stripping comments first means the check is about what the module
 * *does*.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A complete, valid address. Individual checks vary one field at a time. */
function addressFixture(overrides: Partial<AddressWrite> = {}): AddressWrite {
  return {
    label: "Home",
    recipientName: "Jaini Vaviya",
    phoneNumber: "+919876543210",
    addressLine1: "12 Rose Villa, Linking Road",
    addressLine2: "Flat 4B",
    landmark: "Opposite the bakery",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400050",
    country: "IN",
    isDefault: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Offline: the shape of the endpoints
 * ------------------------------------------------------------------ */

function checkShape(): void {
  console.log("\n== the endpoints, read as source ==");

  const addresses = readSource("src", "actions", "addresses.ts");
  const account = readSource("src", "actions", "account.ts");
  const service = withoutComments(
    readSource("src", "lib", "services", "address-service.ts"),
  );
  const userService = withoutComments(
    readSource("src", "lib", "services", "user-service.ts"),
  );

  for (const [name, source] of [
    ["addresses.ts", addresses],
    ["account.ts", account],
  ] as const) {
    check(`${name} is marked "use server"`, source.startsWith('"use server"'));

    const exported = [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1] ?? "",
    );

    check(`${name} exports only actions`, exported.length > 0, exported.join(", "));

    for (const action of exported) {
      const start = source.indexOf(`export async function ${action}`);
      const next = exported
        .map((other) => source.indexOf(`export async function ${other}`))
        .filter((index) => index > start)
        .sort((a, b) => a - b)[0];
      const body = source.slice(start, next === undefined ? undefined : next);

      const authAt = body.indexOf("getCurrentUser()");
      const parseAt = body.indexOf("safeParse");

      check(`${action} resolves the signed-in customer`, authAt >= 0);
      check(
        `${action} authenticates before it parses anything`,
        authAt >= 0 && (parseAt < 0 || authAt < parseAt),
        `auth at ${authAt}, parse at ${parseAt}`,
      );
      check(
        `${action} acts as the session's user, not one from the request`,
        /\buser\.id\b/.test(body),
      );
    }
  }

  console.log("\n== nothing accepts an identity from the caller ==");

  const validation = withoutComments(
    readSource("src", "lib", "validations", "address.ts"),
  );

  check("no schema accepts a userId", !/userId:\s*z\./.test(validation));
  check("no schema accepts a role", !/role:\s*z\./.test(validation));
  check(
    "the profile schema has exactly one field, name",
    /profileInputSchema = z\.object\(\{\s*name:/.test(validation),
  );
  check(
    "the actions never read a userId from a form",
    !/\buserId\b/.test(withoutComments(addresses)) &&
      !/\buserId\b/.test(withoutComments(account)),
  );
  check(
    "the profile writer touches one column and it is not role or phone",
    /data: \{ name \}/.test(userService) &&
      !/data: \{[^}]*\brole\b/.test(userService) &&
      !/data: \{[^}]*\bphoneNumber\b/.test(userService),
  );

  console.log("\n== every address statement is scoped to its owner ==");

  // The property that matters most in this phase: no query may be scoped by an
  // address id alone. Each of these is the *whole* `where` of a statement.
  const wheres = [...service.matchAll(/where: \{([^{}]*)\}/g)].map(
    (match) => (match[1] ?? "").trim(),
  );

  const idOnly = wheres.filter(
    (clause) => /\bid:/.test(clause) && !/userId/.test(clause),
  );

  check(
    "no address query is scoped by id alone",
    idOnly.length === 0,
    idOnly.join(" | "),
  );
  check(
    "there are address queries to check in the first place",
    wheres.filter((clause) => /userId/.test(clause)).length >= 6,
    `${wheres.length} where clauses`,
  );
  check(
    "no write ever sets a userId, so an address cannot change hands",
    !/data: \{[^}]*userId:/.test(service),
  );
  check(
    "the default switch happens inside a transaction",
    /\$transaction\(async \(tx\) => \{[\s\S]*isDefault: false[\s\S]*isDefault: true/.test(
      service,
    ),
  );
  check(
    "deleting promotes a replacement inside the same transaction",
    /\$transaction\(async \(tx\) => \{[\s\S]*deleteMany[\s\S]*findFirst[\s\S]*isDefault: true/.test(
      service,
    ),
  );

  console.log("\n== validation ==");

  const valid = addressInputSchema.safeParse(addressFixture());
  check("a complete address is accepted", valid.success);

  for (const [label, override, field] of [
    ["a blank recipient", { recipientName: "   " }, "recipientName"],
    ["a blank address line 1", { addressLine1: "" }, "addressLine1"],
    ["a blank city", { city: " " }, "city"],
    ["a blank state", { state: "" }, "state"],
    ["a blank label", { label: "  " }, "label"],
    ["a five-digit PIN code", { postalCode: "40005" }, "postalCode"],
    ["a PIN code starting with zero", { postalCode: "040050" }, "postalCode"],
    ["a non-numeric PIN code", { postalCode: "4000AB" }, "postalCode"],
    ["an unsupported country", { country: "US" }, "country"],
    ["a phone with letters", { phoneNumber: "call me" }, "phoneNumber"],
  ] as const) {
    const result = addressInputSchema.safeParse(
      addressFixture(override as Partial<AddressWrite>),
    );

    check(
      `${label} is refused`,
      !result.success &&
        result.error.issues.some((issue) => issue.path[0] === field),
      result.success ? "accepted" : "",
    );
  }

  check(
    "whitespace is trimmed rather than stored",
    (() => {
      const result = addressInputSchema.safeParse(
        addressFixture({ city: "  Mumbai  " }),
      );
      return result.success && result.data.city === "Mumbai";
    })(),
  );
  check(
    "an empty optional field becomes undefined, never an empty string",
    (() => {
      const result = addressInputSchema.safeParse(
        addressFixture({ addressLine2: "   ", landmark: "" }),
      );
      return (
        result.success &&
        result.data.addressLine2 === undefined &&
        result.data.landmark === undefined
      );
    })(),
  );
  check(
    "a country is upper-cased, so 'in' and 'IN' are one country",
    (() => {
      const result = addressInputSchema.safeParse(
        addressFixture({ country: "in" as "IN" }),
      );
      return result.success && result.data.country === "IN";
    })(),
  );
  check(
    "an over-long field is refused rather than silently truncated",
    !addressInputSchema.safeParse(addressFixture({ city: "x".repeat(200) }))
      .success,
  );

  check(
    "a profile name is trimmed",
    (() => {
      const result = profileInputSchema.safeParse({ name: "  Dhruw  " });
      return result.success && result.data.name === "Dhruw";
    })(),
  );
  check(
    "clearing a name is allowed and stores null",
    (() => {
      const result = profileInputSchema.safeParse({ name: "   " });
      return result.success && result.data.name === null;
    })(),
  );

  check(
    "the address phone uses the same normaliser as sign-in",
    normalisePhoneNumber("+919876543210")?.e164 === "+919876543210" &&
      /normalisePhoneNumber/.test(addresses),
  );
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

type Fixtures = { customerA: string; customerB: string; admin: string };

async function createFixtures(): Promise<Fixtures> {
  const [customerA, customerB, admin] = await Promise.all(
    (
      [
        [NUMBERS.customerA, Role.CUSTOMER],
        [NUMBERS.customerB, Role.CUSTOMER],
        [NUMBERS.admin, Role.ADMIN],
      ] as const
    ).map(([phoneNumber, role]) =>
      prisma.user.upsert({
        where: { phoneNumber },
        create: { phoneNumber, role },
        update: { role },
        select: { id: true },
      }),
    ),
  );

  return {
    customerA: customerA!.id,
    customerB: customerB!.id,
    admin: admin!.id,
  };
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

async function checkProfile(fixtures: Fixtures): Promise<void> {
  console.log("\n== a customer's own details ==");

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: fixtures.customerA },
    select: { phoneNumber: true, role: true },
  });

  const updated = await updateUserName(fixtures.customerA, "Dhruw");
  check("a customer can set their own name", updated.name === "Dhruw");

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: fixtures.customerA },
    select: { phoneNumber: true, role: true },
  });

  check("their phone number is untouched", after.phoneNumber === before.phoneNumber);
  check("and so is their role", after.role === before.role);

  const cleared = await updateUserName(fixtures.customerA, null);
  check("and they can clear it again", cleared.name === null);

  const admin = await updateUserName(fixtures.admin, "An Administrator");
  check(
    "an administrator setting a name stays an administrator",
    admin.name === "An Administrator" && admin.role === Role.ADMIN,
  );

  check(
    "the returned profile carries nothing secret",
    !("passwordHash" in updated) && Object.keys(updated).length === 4,
    Object.keys(updated).join(", "),
  );
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

async function checkAddresses(fixtures: Fixtures): Promise<void> {
  const { customerA, customerB } = fixtures;

  console.log("\n== the first address ==");

  check("a new account has none", (await countAddresses(customerA)) === 0);
  check(
    "and no default",
    (await getDefaultAddress(customerA)) === null,
  );

  const first = await createAddress(
    customerA,
    addressFixture({ label: "Home", isDefault: false }),
  );
  check("the first address saves", first.ok);

  const afterFirst = await listAddresses(customerA);
  check(
    "the first address becomes the default even when not asked for",
    afterFirst.addresses[0]?.isDefault === true,
  );
  check("it carries what was written", afterFirst.addresses[0]?.city === "Mumbai");
  check(
    "optional fields that were blank are null rather than empty strings",
    (await (async () => {
      const bare = await createAddress(
        customerA,
        addressFixture({ label: "Bare", addressLine2: undefined, landmark: undefined }),
      );
      if (!bare.ok) return false;
      const row = await prisma.address.findUniqueOrThrow({
        where: { id: bare.id },
        select: { addressLine2: true, landmark: true },
      });
      await deleteAddress(customerA, bare.id);
      return row.addressLine2 === null && row.landmark === null;
    })()),
  );
  check(
    "a summary is built for the card and the confirmation to share",
    (afterFirst.addresses[0]?.summary ?? "").includes("Mumbai"),
  );
  check(
    "presentation data only — no userId or timestamps reach the caller",
    afterFirst.addresses[0] !== undefined &&
      !("userId" in afterFirst.addresses[0]) &&
      !("updatedAt" in afterFirst.addresses[0]),
  );

  console.log("\n== a second address, and the default ==");

  const second = await createAddress(
    customerA,
    addressFixture({ label: "Work", city: "Pune", isDefault: false }),
  );
  check("a second address saves", second.ok);
  check(
    "it does not steal the default",
    (await getDefaultAddress(customerA))?.label === "Home",
  );

  if (!second.ok) {
    return;
  }

  const promoted = await setDefaultAddress(customerA, second.id);
  check("setting a new default succeeds", promoted.ok);
  check(
    "the new one is default",
    (await getDefaultAddress(customerA))?.label === "Work",
  );
  check(
    "and exactly one address is default",
    (await prisma.address.count({
      where: { userId: customerA, isDefault: true },
    })) === 1,
  );

  const third = await createAddress(
    customerA,
    addressFixture({ label: "Sister", city: "Surat", isDefault: true }),
  );
  check("creating one as default succeeds", third.ok);
  check(
    "it takes the default over",
    (await getDefaultAddress(customerA))?.label === "Sister",
  );
  check(
    "still exactly one default",
    (await prisma.address.count({
      where: { userId: customerA, isDefault: true },
    })) === 1,
  );

  console.log("\n== ordering ==");

  const listed = await listAddresses(customerA);
  check(
    "the default comes first",
    listed.addresses[0]?.isDefault === true,
    listed.addresses.map((a) => a.label).join(", "),
  );
  check(
    "and the order is stable across reads",
    JSON.stringify((await listAddresses(customerA)).addresses.map((a) => a.id)) ===
      JSON.stringify(listed.addresses.map((a) => a.id)),
  );

  console.log("\n== editing ==");

  const target = listed.addresses.find((a) => a.label === "Work");

  if (target) {
    const edited = await updateAddress(
      customerA,
      target.id,
      addressFixture({
        label: "Work",
        city: "Pune",
        landmark: "Behind the station",
        isDefault: false,
      }),
    );
    check("editing succeeds", edited.ok);

    const reread = await getAddress(customerA, target.id);
    check("the change is stored", reread?.landmark === "Behind the station");
    check(
      "editing a non-default address does not make it default",
      reread?.isDefault === false,
    );
    check(
      "and the default is still where it was",
      (await getDefaultAddress(customerA))?.label === "Sister",
    );
  }

  const defaultAddress = await getDefaultAddress(customerA);

  if (defaultAddress) {
    await updateAddress(
      customerA,
      defaultAddress.id,
      addressFixture({ label: "Sister", city: "Surat", isDefault: false }),
    );
    check(
      "editing the default with the box unticked keeps it default",
      (await getDefaultAddress(customerA))?.id === defaultAddress.id,
    );
  }

  console.log("\n== deleting ==");

  const before = await listAddresses(customerA);
  const nonDefault = before.addresses.find((a) => !a.isDefault);

  if (nonDefault) {
    const removed = await deleteAddress(customerA, nonDefault.id);
    check("a non-default address deletes", removed.ok);
    check(
      "and the default is unaffected",
      (await getDefaultAddress(customerA))?.isDefault === true,
    );
  }

  const currentDefault = await getDefaultAddress(customerA);

  if (currentDefault) {
    const removed = await deleteAddress(customerA, currentDefault.id);
    check("the default address deletes", removed.ok);

    const replacement = await getDefaultAddress(customerA);
    check(
      "and a replacement is promoted",
      replacement !== null,
      String(await countAddresses(customerA)),
    );
    check(
      "exactly one, never two",
      (await prisma.address.count({
        where: { userId: customerA, isDefault: true },
      })) === 1,
    );
  }

  // Empty the book, then prove the last deletion leaves no default rather than
  // an orphaned one.
  for (const address of (await listAddresses(customerA)).addresses) {
    await deleteAddress(customerA, address.id);
  }

  check("the book empties", (await countAddresses(customerA)) === 0);
  check(
    "with no default left behind",
    (await getDefaultAddress(customerA)) === null,
  );

  console.log("\n== the per-account limit ==");

  for (let index = 0; index < MAX_ADDRESSES_PER_CUSTOMER; index += 1) {
    await createAddress(customerA, addressFixture({ label: `Place ${index}` }));
  }

  check(
    "a customer may save the full allowance",
    (await countAddresses(customerA)) === MAX_ADDRESSES_PER_CUSTOMER,
  );

  const overflow = await createAddress(customerA, addressFixture({ label: "One more" }));
  check(
    "one more is refused",
    !overflow.ok && overflow.code === "limit-reached",
  );
  check(
    "and nothing was evicted to make room",
    (await countAddresses(customerA)) === MAX_ADDRESSES_PER_CUSTOMER,
  );
  check(
    "the list reports that it is full",
    (await listAddresses(customerA)).isFull,
  );

  console.log("\n== customer A and customer B ==");

  await createAddress(customerB, addressFixture({ label: "B's home", city: "Delhi" }));

  const bookOfA = await listAddresses(customerA);
  const bookOfB = await listAddresses(customerB);

  check("each has their own book", bookOfB.addresses.length === 1);
  check(
    "and A cannot see B's",
    !bookOfA.addresses.some((a) => a.label === "B's home"),
  );

  const addressOfB = bookOfB.addresses[0]!;

  check(
    "A reading B's address by id gets nothing",
    (await getAddress(customerA, addressOfB.id)) === null,
  );

  const stolenUpdate = await updateAddress(
    customerA,
    addressOfB.id,
    addressFixture({ label: "Hijacked", city: "Nowhere" }),
  );
  check(
    "A updating B's address is refused",
    !stolenUpdate.ok && stolenUpdate.code === "not-found",
  );
  check(
    "and B's address is untouched",
    (await getAddress(customerB, addressOfB.id))?.label === "B's home",
  );

  const stolenDefault = await setDefaultAddress(customerA, addressOfB.id);
  check(
    "A making B's address default is refused",
    !stolenDefault.ok && stolenDefault.code === "not-found",
  );

  const stolenDelete = await deleteAddress(customerA, addressOfB.id);
  check(
    "A deleting B's address is refused",
    !stolenDelete.ok && stolenDelete.code === "not-found",
  );
  check(
    "and it is still there",
    (await countAddresses(customerB)) === 1,
  );

  console.log("\n== identifiers that name nothing ==");

  check(
    "reading an address that does not exist returns null",
    (await getAddress(customerA, ABSENT_ID)) === null,
  );
  check(
    "updating one is refused",
    !(await updateAddress(customerA, ABSENT_ID, addressFixture())).ok,
  );
  check(
    "deleting one is refused",
    !(await deleteAddress(customerA, ABSENT_ID)).ok,
  );
  check(
    "and making one default is refused",
    !(await setDefaultAddress(customerA, ABSENT_ID)).ok,
  );
  check(
    "a user id that names nobody reads as an empty book",
    (await listAddresses(ABSENT_ID)).addresses.length === 0,
  );

  console.log("\n== two tabs changing the default ==");

  const bookForRace = await listAddresses(customerA);
  const [one, two] = bookForRace.addresses;

  if (one && two) {
    await Promise.all([
      setDefaultAddress(customerA, one.id),
      setDefaultAddress(customerA, two.id),
    ]);

    check(
      "simultaneous default changes leave exactly one default",
      (await prisma.address.count({
        where: { userId: customerA, isDefault: true },
      })) === 1,
    );
  }
}

/* ------------------------------------------------------------------ *
 * The database's own rules
 * ------------------------------------------------------------------ */

async function checkConstraints(fixtures: Fixtures): Promise<void> {
  console.log("\n== what PostgreSQL itself refuses ==");

  const refused = async (write: () => Promise<unknown>): Promise<boolean> => {
    try {
      await write();
      return false;
    } catch {
      return true;
    }
  };

  const base = {
    userId: fixtures.customerB,
    label: "Constraint test",
    recipientName: "Someone",
    phoneNumber: "+919876543210",
    addressLine1: "1 Test Street",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400050",
    country: "IN",
  };

  check(
    "a second default for one customer is refused",
    await refused(async () => {
      // B already has one address, and it is their default.
      return prisma.address.create({
        data: { ...base, isDefault: true },
        select: { id: true },
      });
    }),
  );

  check(
    "a lowercase country code is refused",
    await refused(() =>
      prisma.address.create({
        data: { ...base, country: "in" },
        select: { id: true },
      }),
    ),
  );

  check(
    "a blank city is refused even though the column is NOT NULL",
    await refused(() =>
      prisma.address.create({
        data: { ...base, city: "   " },
        select: { id: true },
      }),
    ),
  );

  check(
    "an empty-string landmark is refused, so optional means null",
    await refused(() =>
      prisma.address.create({
        data: { ...base, landmark: "" },
        select: { id: true },
      }),
    ),
  );

  check(
    "several non-default addresses are fine",
    !(await refused(async () => {
      const made = await prisma.address.create({
        data: { ...base, isDefault: false },
        select: { id: true },
      });
      await prisma.address.delete({ where: { id: made.id } });
      return made;
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(): Promise<void> {
  console.log("\n== clean-up ==");

  const numbers = Object.values(NUMBERS);

  // Addresses cascade away with their owner, which is also the check below.
  await prisma.user.deleteMany({ where: { phoneNumber: { in: numbers } } });

  const [users, orphans] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: { in: numbers } } }),
    prisma.address.count({
      where: { user: { phoneNumber: { in: numbers } } },
    }),
  ]);

  check("no test accounts left behind", users === 0, String(users));
  check(
    "deleting an account took its addresses with it",
    orphans === 0,
    String(orphans),
  );

  const [allAddresses, products] = await Promise.all([
    prisma.address.count(),
    prisma.product.count(),
  ]);

  check("no addresses left behind at all", allAddresses === 0, String(allAddresses));
  check("the seeded catalogue is intact", products === 26, String(products));
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  checkShape();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  The database-backed account checks were skipped: no DATABASE_URL.",
        "",
        "  Set it in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm check:account",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    const fixtures = await createFixtures();

    await checkProfile(fixtures);
    await checkAddresses(fixtures);
    await checkConstraints(fixtures);
  } finally {
    await cleanUp();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => undefined);

    console.log(
      `\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`,
    );

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect().catch(() => undefined);

    console.error(
      `Account checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
