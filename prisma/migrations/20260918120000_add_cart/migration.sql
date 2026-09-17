-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestTokenHash" VARCHAR(64),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_guestTokenHash_key" ON "Cart"("guestTokenHash");

-- CreateIndex
CREATE INDEX "Cart_expiresAt_idx" ON "Cart"("expiresAt");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma's schema language cannot express.
--
-- Same reasoning as 20260916180000_catalog_check_constraints: the application
-- validates all of these in Zod and in the cart service, because a constraint
-- violation is a 500 and a validation failure is a sentence the shopper can
-- act on. These are the backstop that holds whatever the application does.

-- A bag is owned by an account or by a guest token, never by both and never by
-- neither. Both null is a bag nobody can reach; both set is a bag with two
-- claimants and an ambiguous merge. This is the constraint that makes the
-- "exactly one owner" rule true rather than merely intended.
ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_exactly_one_owner"
  CHECK (("userId" IS NULL) <> ("guestTokenHash" IS NULL));

-- A guest bag expires; an account bag does not. Tying the two together stops a
-- guest bag being created without an end date and quietly living forever, and
-- stops an account bag being given one and vanishing from under its owner.
ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_guest_carts_expire"
  CHECK (("guestTokenHash" IS NULL) = ("expiresAt" IS NULL));

-- A line with none of something is a removal that did not finish. The ceiling
-- here is a sanity figure, deliberately well above the per-line maximum in
-- lib/cart/config.ts: the business limit is merchandising policy and should be
-- changeable without a migration, while "four billion dresses" is a bug in any
-- shop and belongs in the database.
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_is_positive_and_sane"
  CHECK ("quantity" >= 1 AND "quantity" <= 999);

-- Money is an integer in paise, and a negative price is not a discount.
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_unitPrice_non_negative"
  CHECK ("unitPrice" >= 0);
