-- Integrity rules that Prisma's schema language cannot express.
--
-- Phase 5 deferred these: nothing wrote stock or prices except the seed, which
-- validates its own input, so there was no unguarded path to protect. Phase 6
-- adds one -- an administrator typing into a form -- so the rules move into the
-- database, where they hold whatever the application does.
--
-- The application still validates the same rules in Zod, because a constraint
-- violation is a 500 and a validation error is a message next to the field.
-- These are the backstop, not the user interface.

-- Stock is a count of physical garments. There is no such thing as minus three.
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantity_non_negative"
  CHECK ("quantity" >= 0);

ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_lowStockThreshold_non_negative"
  CHECK ("lowStockThreshold" >= 0);

-- Money is an integer in paise. A negative price is not a discount, it is a bug.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_price_non_negative"
  CHECK ("price" >= 0);

-- A compare-at price exists only to show a reduction. If it is not higher than
-- the selling price it is either absent or wrong, and "on sale" is defined as
-- exactly this comparison everywhere else in the codebase.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_compareAtPrice_is_a_reduction"
  CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" > "price");
