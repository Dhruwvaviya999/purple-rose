import type { Metadata } from "next";

import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { EmptyState } from "@/components/shared/empty-state";
import { CompassIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-line">
        <Container className="flex h-16 items-center">
          <BrandWordmark />
        </Container>
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-20">
        <EmptyState
          icon={<CompassIcon />}
          title="We could not find that page"
          titleAs="h1"
          description="The link may be out of date, or the page may not have been published yet."
          action={
            <>
              <ButtonLink href="/">Back to home</ButtonLink>
              <ButtonLink href="/shop" variant="secondary">
                Go to the shop
              </ButtonLink>
            </>
          }
        />
      </main>
    </div>
  );
}
