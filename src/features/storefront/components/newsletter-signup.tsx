import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, Input, Label } from "@/components/ui/input";
import { Heading, Text } from "@/components/ui/typography";

/**
 * Newsletter sign-up.
 *
 * The interface, without the sending. There is no email provider, no list to
 * add anyone to and no action to receive a submission, so the fieldset is
 * disabled and a note says why.
 *
 * This is the same pattern the sign-in page used before authentication was
 * built: show the real shape of the form, exercise the real control styles,
 * and never accept an address we would then drop. A field that swallowed an
 * email and said "thank you" would be the worst option here.
 *
 * A server component. There is nothing to interact with yet.
 */
const NOTICE_ID = "newsletter-availability";

export function NewsletterSignup() {
  return (
    <Section surface="brand" spacing="md">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <Heading as="h2" level="lg">
            First look, no noise
          </Heading>

          <Text className="mt-4">
            One email when a collection lands, and nothing in between.
          </Text>

          <div className="mt-8 text-left">
            <fieldset disabled aria-describedby={NOTICE_ID}>
              <legend className="sr-only">Subscribe to the newsletter</legend>

              <Field>
                <Label htmlFor="newsletter-email">Email address</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="newsletter-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="sm:flex-1"
                  />
                  <Button size="md" className="shrink-0">
                    Subscribe
                  </Button>
                </div>
                <FieldHint>We do not share your address.</FieldHint>
              </Field>
            </fieldset>

            <p
              id={NOTICE_ID}
              className="mt-5 rounded-control border border-plum-200 bg-canvas px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
            >
              Sign-up is not switched on yet. It opens once email sending is
              set up, so nothing is collected in the meantime.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
