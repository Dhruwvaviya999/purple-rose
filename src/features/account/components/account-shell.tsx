import type { ReactNode } from "react";

import type { Route } from "next";

import { Breadcrumbs, type Crumb } from "@/components/commerce/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";
import { AccountNav, type AccountSection } from "./account-nav";

/**
 * The frame every account page renders inside.
 *
 * One component rather than the same heading, breadcrumb and navigation copied
 * onto five pages, which is five chances for them to drift apart.
 *
 * Deliberately built from the storefront's own `Section`, `Container`,
 * `Heading` and `Text` — the account area is part of the shop, not a dashboard
 * bolted onto it. The admin console has its own chrome for a reason; a customer
 * managing their address should still feel like they are in the same shop they
 * were just browsing.
 */
export function AccountShell({
  current,
  title,
  description,
  breadcrumb,
  actions,
  children,
}: {
  current: AccountSection;
  title: string;
  description?: string;
  /** Trail after "Account". Omitted on the overview, which is the root. */
  breadcrumb?: readonly Crumb[];
  /** Optional controls beside the heading, such as "Add an address". */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Section spacing="sm">
      <Container>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            ...(breadcrumb
              ? [{ label: "Account", href: "/account" as Route }, ...breadcrumb]
              : [{ label: "Account" }]),
          ]}
        />

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <Heading as="h1" level="xl">
              {title}
            </Heading>

            {description ? (
              <Text size="lg" className="mt-3">
                {description}
              </Text>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>

        <div className="mt-9 lg:flex lg:items-start lg:gap-12">
          <AccountNav current={current} />

          <div className="mt-8 min-w-0 flex-1 lg:mt-0">{children}</div>
        </div>
      </Container>
    </Section>
  );
}
