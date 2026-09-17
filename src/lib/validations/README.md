# Validations

Input schemas, kept separate from both presentation and persistence so the
same rules can be reused by a form, a Server Action and a Route Handler.

Rules:

- A schema is the single definition of what a valid input looks like. Derive
  TypeScript types from the schema rather than declaring them twice.
- Schemas describe inputs at the boundary. Database shapes come from the ORM.
- Group by domain, for example `auth.ts`, `cart.ts`, `checkout.ts`,
  `product.ts`.

## What is here

| Schema                | Covers                                                |
| --------------------- | ----------------------------------------------------- |
| `auth.ts`             | Phone input, one-time codes, the sign-in return path   |
| `catalog-admin.ts`    | Every admin catalogue mutation                         |
| `wishlist.ts`         | The one input a wishlist mutation takes: a product id  |

`wishlist.ts` is worth reading as an example of the rule above about boundaries.
It has a single field. There is no `userId` and no `wishlistId`, because who is
asking is decided by the session rather than by the request, and a schema field
for an identity would be an authorisation input the caller controls. The
absence is the design.
