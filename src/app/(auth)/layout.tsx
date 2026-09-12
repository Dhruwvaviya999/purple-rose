import type { ReactNode } from "react";

import { siteConfig } from "@/config/site";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { Container } from "@/components/ui/container";
import { Text } from "@/components/ui/typography";

/**
 * Authentication shell: a focused, chrome-light surface. Kept outside the
 * storefront group so sign-in screens never carry the shop header, cart or
 * navigation.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <Container className="flex h-16 items-center">
          <BrandWordmark />
        </Container>
      </header>

      <main className="flex flex-1 items-center justify-center bg-surface px-5 py-14 sm:py-20">
        {children}
      </main>

      <footer className="border-t border-line">
        <Container className="py-6">
          <Text size="sm" tone="subtle">
            &copy; {new Date().getFullYear()} {siteConfig.legalName}
          </Text>
        </Container>
      </footer>
    </div>
  );
}
