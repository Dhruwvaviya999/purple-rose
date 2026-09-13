import { requireAdmin } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";

/**
 * Admin overview.
 *
 * A structural placeholder: no store data is connected, so no metrics are
 * shown. Reporting appears once orders and inventory exist.
 *
 * The role is checked here as well as in the layout. That is not redundant.
 * A layout and the page beneath it render concurrently, so a layout that
 * throws does not reliably stop the page from producing output, and the page
 * payload can still reach the client. Every admin page must make its own
 * check, and every admin query must be guarded where the data is read.
 */
const upcoming = [
  {
    title: "Catalogue",
    body: "Create and edit products, variants, sizes and imagery, backed by PostgreSQL.",
  },
  {
    title: "Inventory",
    body: "Stock per variant, low-stock thresholds and restock history.",
  },
  {
    title: "Orders",
    body: "Order lifecycle, fulfilment status and customer correspondence.",
  },
  {
    title: "Promotions",
    body: "Coupon rules, validity windows and usage limits.",
  },
] as const;

export default async function AdminOverviewPage() {
  await requireAdmin("/admin");

  return (
    <div className="space-y-10">
      <div className="max-w-2xl">
        <Badge variant="neutral">Foundation</Badge>
        <Heading as="h1" level="lg" className="mt-4">
          Admin overview
        </Heading>
        <Text className="mt-4">
          The admin area is scaffolded and routed. Management screens are added
          once the database and authentication layers are in place, so there is
          nothing to administer yet.
        </Text>
      </div>

      <section aria-labelledby="admin-upcoming" className="space-y-5">
        <h2
          id="admin-upcoming"
          className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
        >
          Planned sections
        </h2>

        <ul className="grid gap-4 sm:grid-cols-2">
          {upcoming.map((item) => (
            <li key={item.title}>
              <Card padding="md" className="h-full">
                <CardHeader>
                  <Heading as="h3" level="sm">
                    {item.title}
                  </Heading>
                  <Text size="sm">{item.body}</Text>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
