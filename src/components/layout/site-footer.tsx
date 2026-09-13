import Link from "next/link";

import { footerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { isNavLink } from "@/types/navigation";
import { Container } from "@/components/ui/container";
import { Text } from "@/components/ui/typography";
import { BrandWordmark } from "./brand-wordmark";

/**
 * Storefront footer.
 *
 * A server component. Each group is its own `nav` landmark with a heading, so
 * a screen reader can jump between them instead of walking one long list.
 *
 * Nothing here links to a page that does not exist. Items whose feature is not
 * built carry a `note` in the navigation config instead of an `href`, and
 * render as plain text with the reason available to assistive technology. That
 * is why there are no social links: no accounts have been created, and a link
 * to an invented handle is worse than no link.
 *
 * There is no newsletter form here either. It lives once, on the home page,
 * rather than twice on every page.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container className="py-14 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-12">
          <div className="max-w-sm">
            <BrandWordmark />
            <Text size="sm" className="mt-4">
              {siteConfig.description}
            </Text>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-labelledby={`footer-${group.title}`}>
              <h2
                id={`footer-${group.title}`}
                className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
              >
                {group.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    {isNavLink(item) ? (
                      <Link
                        href={item.href}
                        className="inline-block py-1 font-sans text-sm text-ink-muted transition-colors hover:text-brand-strong"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        title={item.note}
                        className="inline-block py-1 font-sans text-sm text-ink-subtle"
                      >
                        {item.label}
                        <span className="sr-only"> — {item.note}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Text size="sm" tone="subtle">
            &copy; {year} {siteConfig.legalName}. All rights reserved.
          </Text>
          <Text size="sm" tone="subtle">
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="inline-block py-1 transition-colors hover:text-brand-strong"
            >
              {siteConfig.contact.email}
            </a>
          </Text>
        </div>
      </Container>
    </footer>
  );
}
