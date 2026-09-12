import Link from "next/link";

import { footerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { isNavLink } from "@/types/navigation";
import { BrandWordmark } from "./brand-wordmark";
import { Container } from "@/components/ui/container";
import { Text } from "@/components/ui/typography";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container className="py-14 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-12">
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
                        className="font-sans text-sm text-ink-muted transition-colors hover:text-brand-strong"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        title={item.note}
                        className="font-sans text-sm text-ink-subtle"
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
              className="transition-colors hover:text-brand-strong"
            >
              {siteConfig.contact.email}
            </a>
          </Text>
        </div>
      </Container>
    </footer>
  );
}
