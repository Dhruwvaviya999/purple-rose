import { announcement } from "@/config/storefront";
import { Container } from "@/components/ui/container";

/**
 * The store-wide message above the header.
 *
 * A server component with no dismiss control. Dismissal would mean client
 * state, storage and a decision about how long it stays gone, for one line of
 * text; if the message is not worth reading it should not be there.
 *
 * The text comes from storefront configuration, not from here.
 */
export function AnnouncementBar() {
  if (!announcement.message) {
    return null;
  }

  return (
    <div className="bg-ink-900 text-canvas">
      <Container className="flex min-h-9 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 py-1.5 text-center">
        <p className="font-sans text-xs font-medium tracking-wide">
          {announcement.message}
        </p>
        {announcement.detail ? (
          <p className="font-sans text-xs text-ink-300">{announcement.detail}</p>
        ) : null}
      </Container>
    </div>
  );
}
