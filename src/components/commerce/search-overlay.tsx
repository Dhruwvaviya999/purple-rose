"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { productQueryParams } from "@/features/storefront/product-query";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { CloseIcon, SearchIcon } from "@/components/shared/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Container } from "@/components/ui/container";
import { Text } from "@/components/ui/typography";

/**
 * Search.
 *
 * A panel that drops from the top rather than a page, because searching is
 * something you do from wherever you are and expect to return from. Full width
 * on a phone, where the keyboard takes most of the screen anyway.
 *
 * Submitting navigates to `/shop?q=…`. The search itself runs on the server,
 * against the database, and its results are the ordinary listing with the
 * ordinary filters still available beside them. That is deliberate: a shopper
 * who searches "linen" almost always wants to narrow by size or price next,
 * and a separate results page would have to grow its own copy of all of it.
 *
 * Nothing is queried as you type. A request per keystroke would be a request
 * per keystroke, and the listing it lands on is a real, shareable URL rather
 * than a dropdown that vanishes.
 *
 * The states are real and all reachable: idle with suggestions, typing, and a
 * prompt to submit once there is enough of a term to look for.
 *
 * Suggestions arrive as props from the server, so no catalogue data is
 * bundled into the browser to render them.
 */

/** The minimum a suggestion needs. Widened when categories become real. */
export type SearchSuggestion = { slug: string; name: string };

/** Below this, a term is treated as still being typed. */
const MIN_TERM_LENGTH = 2;

export function SearchOverlay({
  suggestions,
}: {
  suggestions: readonly SearchSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Everything else goes inert while the panel is open, so the keyboard, the
  // pointer and a screen reader all stay inside it.
  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    const marked = Array.from(document.body.children).filter(
      (element) => element !== panel && !element.hasAttribute("inert"),
    );

    for (const element of marked) {
      element.setAttribute("inert", "");
    }

    return () => {
      for (const element of marked) {
        element.removeAttribute("inert");
      }
    };
  }, [open]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const trimmed = term.trim();
  const stage =
    trimmed.length === 0
      ? "idle"
      : trimmed.length < MIN_TERM_LENGTH
        ? "typing"
        : "ready";

  /**
   * Hand the term to the listing.
   *
   * `encodeURIComponent` so a term with an ampersand or a hash arrives whole;
   * the server then re-parses and length-caps it in `parseProductQuery`,
   * because nothing built in a browser is trusted on arrival.
   */
  function submit() {
    if (trimmed.length < MIN_TERM_LENGTH) {
      return;
    }

    const href =
      `/shop?${productQueryParams.search}=${encodeURIComponent(trimmed)}` as Route;

    setOpen(false);
    setTerm("");
    router.push(href);
  }

  return (
    <>
      <IconButton
        ref={triggerRef}
        label="Search"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
      </IconButton>

      {open
        ? createPortal(
            <div ref={panelRef} className="fixed inset-0 z-50">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute inset-0 bg-ink-950/30"
                onClick={close}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                className="absolute inset-x-0 top-0 max-h-full overflow-y-auto overscroll-contain bg-canvas shadow-raised"
              >
                <Container className="py-5 sm:py-7">
                  <div className="flex items-center gap-3">
                    <form
                      role="search"
                      className="flex flex-1 items-center gap-3 rounded-control border border-line-strong bg-canvas px-4 focus-within:border-ink"
                      onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                      }}
                    >
                      <SearchIcon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-ink-subtle"
                      />
                      <label htmlFor="storefront-search" className="sr-only">
                        Search for a piece
                      </label>
                      <input
                        id="storefront-search"
                        ref={inputRef}
                        type="search"
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        placeholder="Dresses, co-ords, cotton…"
                        autoComplete="off"
                        className="h-12 w-full min-w-0 bg-transparent font-sans text-base text-ink outline-none placeholder:text-ink-subtle sm:h-14"
                      />
                      {term ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTerm("");
                            inputRef.current?.focus();
                          }}
                          className="shrink-0 rounded-control p-1 font-sans text-sm text-ink-subtle transition-colors hover:text-ink"
                        >
                          Clear
                        </button>
                      ) : null}
                    </form>

                    <IconButton label="Close search" onClick={close}>
                      <CloseIcon />
                    </IconButton>
                  </div>

                  {/* One live region for every outcome, so a change is
                      announced once rather than by three competing regions. */}
                  <div aria-live="polite" className="mt-6 sm:mt-8">
                    {stage === "idle" ? (
                      <SearchSuggestions
                        suggestions={suggestions}
                        onNavigate={close}
                      />
                    ) : null}

                    {stage === "typing" ? (
                      <Text size="sm">Keep typing to search.</Text>
                    ) : null}

                    {stage === "ready" ? (
                      <SearchPrompt term={trimmed} onSubmit={submit} />
                    ) : null}
                  </div>
                </Container>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** What to offer before anything is typed: the categories that exist. */
function SearchSuggestions({
  suggestions,
  onNavigate,
}: {
  suggestions: readonly SearchSuggestion[];
  onNavigate: () => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
        Browse
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {suggestions.map((category) => (
          <li key={category.slug}>
            <Link
              href={{ pathname: "/shop", query: { category: category.slug } }}
              onClick={onNavigate}
              className="inline-flex rounded-full border border-line-strong px-4 py-2 font-sans text-sm text-ink transition-colors hover:border-ink-400 hover:bg-surface"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ready to search.
 *
 * No results are shown here. Counting matches would mean a query on every
 * keystroke to render a number the listing is about to render properly, and
 * the listing is one key away. The button and Enter do the same thing.
 */
function SearchPrompt({
  term,
  onSubmit,
}: {
  term: string;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-5 py-8 text-center sm:px-8">
      <h2 className="font-sans text-base font-medium text-ink">
        Search the catalogue for{" "}
        <span className="text-brand-strong">“{term}”</span>
      </h2>
      <Text size="sm" className="mx-auto mt-2 max-w-md">
        Names, collections and colours are all searched. Press Enter, or use the
        button below.
      </Text>
      <button
        type="button"
        onClick={onSubmit}
        className="mt-5 inline-flex items-center rounded-control bg-ink px-5 py-2.5 font-sans text-sm text-canvas transition-colors hover:bg-ink-900"
      >
        Show matching pieces
      </button>
    </div>
  );
}
