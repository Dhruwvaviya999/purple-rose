"use client";

import { useEffect } from "react";

import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { EmptyState } from "@/components/shared/empty-state";
import { AlertIcon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/**
 * Application-level error boundary.
 *
 * The user sees a recovery action and nothing else: no message, stack or
 * digest is rendered. The digest is logged so the failure can be matched to
 * the corresponding server-side log entry.
 */
export default function GlobalRouteError({ error, retry }: ErrorProps) {
  useEffect(() => {
    console.error("Unhandled application error", {
      digest: error.digest,
    });
  }, [error.digest]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-line">
        <Container className="flex h-16 items-center">
          <BrandWordmark />
        </Container>
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-20">
        <EmptyState
          icon={<AlertIcon />}
          title="Something went wrong on our side"
          titleAs="h1"
          description="This one is on us. Try again in a moment, or head back to the home page."
          action={
            <>
              <Button onClick={retry}>Try again</Button>
              <ButtonLink href="/" variant="secondary">
                Back to home
              </ButtonLink>
            </>
          }
        />
      </main>
    </div>
  );
}
