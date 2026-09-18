-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "recipientName" VARCHAR(120) NOT NULL,
    "phoneNumber" VARCHAR(16) NOT NULL,
    "addressLine1" VARCHAR(200) NOT NULL,
    "addressLine2" VARCHAR(200),
    "landmark" VARCHAR(120),
    "city" VARCHAR(80) NOT NULL,
    "state" VARCHAR(80) NOT NULL,
    "postalCode" VARCHAR(16) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma's schema language cannot express.
--
-- Same reasoning as 20260916180000_catalog_check_constraints and the bag's
-- constraints: the application validates all of these in Zod and enforces the
-- default rule in a transaction, because a constraint violation is a 500 and a
-- validation failure is a sentence next to a field. These are the backstop that
-- holds whatever the application does.

-- At most one default address per customer.
--
-- A partial unique index is the right tool and the only one that actually makes
-- this true: an ordinary unique index on ("userId", "isDefault") would allow one
-- default and one non-default and nothing more, which is the opposite of what is
-- wanted. Indexing only the rows where the flag is set leaves the false ones
-- unconstrained and caps the true ones at one.
--
-- Prisma's schema language has no syntax for a partial index, so this lives here
-- and `schema.prisma` does not describe it. That is a deliberate, contained
-- divergence: `prisma migrate dev` diffs the schema against the migration
-- history and does not manage indexes it was never told about, exactly as it
-- does not manage the CHECK constraints added in earlier phases. Documented in
-- docs/customer-account/README.md.
CREATE UNIQUE INDEX "Address_one_default_per_user"
  ON "Address" ("userId")
  WHERE "isDefault";

-- A country is an ISO 3166-1 alpha-2 code. Two uppercase letters, so "IN" and
-- never "India", "in" or "Bharat" — three spellings of one country is three
-- countries to every query that groups by it.
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_country_is_iso_alpha2"
  CHECK ("country" ~ '^[A-Z]{2}$');

-- The required text fields are required after trimming, not merely present. A
-- row whose city is three spaces satisfies NOT NULL and satisfies nobody else.
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_required_text_is_not_blank"
  CHECK (
    length(btrim("label")) > 0
    AND length(btrim("recipientName")) > 0
    AND length(btrim("phoneNumber")) > 0
    AND length(btrim("addressLine1")) > 0
    AND length(btrim("city")) > 0
    AND length(btrim("state")) > 0
    AND length(btrim("postalCode")) > 0
  );

-- The optional ones are absent or meaningful, never an empty string pretending
-- to be a value. The application normalises "" to NULL; this makes it true.
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_optional_text_is_null_or_meaningful"
  CHECK (
    ("addressLine2" IS NULL OR length(btrim("addressLine2")) > 0)
    AND ("landmark" IS NULL OR length(btrim("landmark")) > 0)
  );
