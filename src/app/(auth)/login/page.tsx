import type { Metadata } from "next";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldHint, Input, Label } from "@/components/ui/input";
import { Heading, Text } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Purple Rose with your phone number. Authentication opens in a later release.",
  robots: { index: false, follow: false },
};

const NOTICE_ID = "sign-in-availability";

/**
 * Structural placeholder for phone + OTP sign-in.
 *
 * The form shape is rendered so the control styles are exercised and the
 * layout is settled, but the whole fieldset is disabled and there is no form
 * action: no credential is collected and no request is made.
 */
export default function LoginPage() {
  return (
    <Card variant="raised" padding="lg" className="w-full max-w-md">
      <Heading as="h1" level="lg">
        Sign in
      </Heading>

      <Text size="sm" className="mt-3">
        Purple Rose accounts use your phone number and a one-time code. No
        password to remember.
      </Text>

      <div className="mt-8">
        <fieldset disabled aria-describedby={NOTICE_ID} className="space-y-4">
          <legend className="sr-only">Phone number sign-in</legend>

          <Field>
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Mobile number"
            />
            <FieldHint>
              We will text a six-digit code. Standard message rates apply.
            </FieldHint>
          </Field>

          <Button size="lg" className="w-full">
            Send code
          </Button>
        </fieldset>

        <p
          id={NOTICE_ID}
          role="note"
          className="mt-5 rounded-control border border-line bg-surface px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
        >
          Sign-in is not switched on yet. Accounts and one-time codes arrive
          with the authentication release.
        </p>
      </div>

      <div className="mt-7 border-t border-line pt-6">
        <ButtonLink href="/" variant="link" size="sm" className="px-0">
          Return to Purple Rose
        </ButtonLink>
      </div>
    </Card>
  );
}
