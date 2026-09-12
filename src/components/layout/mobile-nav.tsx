"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { headerPlaceholders, primaryNav } from "@/config/navigation";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { CloseIcon, MenuIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/typography";

const PANEL_ID = "mobile-navigation-panel";

/**
 * Slide-over navigation for small screens.
 *
 * This is the only client component in the storefront shell: it owns the open
 * state, closes on Escape and on navigation, locks background scroll and moves
 * focus into and back out of the panel.
 *
 * The overlay is rendered into `document.body` rather than in place. A fixed
 * overlay nested inside the header would be positioned against the header if
 * any ancestor ever gained a transform, filter or containment, so it is kept
 * out of that subtree entirely. The portal is only reached after a click, so
 * `document` is always available by then.
 */
export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  /** Dismiss and hand focus back to the trigger that opened the panel. */
  function dismiss() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  const overlay = (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Click-away surface. Keyboard users close with Escape or the close
          button, so this is kept out of the tab order. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-ink-950/25"
        onClick={dismiss}
      />

      <div
        id={PANEL_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-canvas shadow-raised"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <span className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
            Menu
          </span>
          <IconButton ref={closeRef} label="Close menu" onClick={dismiss}>
            <CloseIcon />
          </IconButton>
        </div>

        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
          <ul className="space-y-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-control py-3 font-display text-2xl font-light text-ink transition-colors hover:text-brand-strong"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-6 space-y-1 border-t border-line pt-6">
            {Object.entries(headerPlaceholders).map(([key, item]) => (
              <li key={key}>
                <span
                  title={item.note}
                  className="flex items-center justify-between py-2.5 font-sans text-sm text-ink-subtle"
                >
                  {item.label}
                  <span aria-hidden="true" className="text-xs">
                    Soon
                  </span>
                  <span className="sr-only">— {item.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line px-5 py-6">
          <Text size="sm" className="mb-3">
            Sign-in uses your phone number. It opens in a later release.
          </Text>
          <ButtonLink
            href="/login"
            variant="secondary"
            className="w-full"
            onClick={() => setIsOpen(false)}
          >
            Go to sign in
          </ButtonLink>
        </div>
      </div>
    </div>
  );

  return (
    <div className="md:hidden">
      <IconButton
        ref={triggerRef}
        label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </IconButton>

      {isOpen ? createPortal(overlay, document.body) : null}
    </div>
  );
}
