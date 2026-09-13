# Mock storefront data — temporary

**Everything in this folder is placeholder data for building and checking the
user interface. None of it is real. It is deleted in Phase 5.**

The catalogue does not exist yet: there is no `Product` table, no `Category`
table and no product management. Without some data the grid, the cards, the
filters and the product page cannot be built or looked at, so this folder
supplies a small typed set and nothing else.

## Rules

- **Nothing under `src/components/` imports these files.** The only importers
  are the store layout, the three route files that render catalogue data, and
  the two editorial sections that need a placeholder photograph. That set is
  the seam, and it is short on purpose.
- **No business logic depends on these ids.** They are strings in a file, not
  keys in a database.
- **No service, action or component reads from here.** Presentation components
  receive data through props and do not know where it came from.
- **Do not grow it.** Eight products is enough to see two grid rows, a sale
  price, a sold-out state and a badge. Fifty would prove nothing more.

## Contents

| File | What it holds |
| --- | --- |
| `media.ts` | Every image URL used anywhere in the storefront |
| `categories.ts` | Four category tiles |
| `products.ts` | Eight products, typed as `ProductCardData` / `ProductDetailData` |
| `query.ts` | Filtering, sorting and paging over that array |

## Removing it in Phase 5

`query.ts` is the seam. It exposes the shape a listing needs:

```ts
listMockProducts({ category, sizes, colours, sale, inStock, sort, page })
findMockProductBySlug(slug)
listMockCategories()
```

Replace those with a service in `src/lib/services/` that runs the same query
against Prisma and maps rows to `ProductCardData` and `ProductDetailData`.
Change the imports in the store layout and the three catalogue routes. Delete
this folder. No component changes, because no component knows this folder
exists.

The images are development placeholders from Unsplash, declared in `media.ts`
and allowed in `next.config.ts`. When real photography arrives, both go.
