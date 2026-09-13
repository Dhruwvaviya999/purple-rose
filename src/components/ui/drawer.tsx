"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { CloseIcon } from "@/components/shared/icons";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils/cn";

/**
 * A slide-over panel: navigation, filters, the bag.
 *
 * One implementation rather than one per drawer, because the hard part is the
 * behaviour, not the markup, and three hand-written copies of it would be
 * three chances to get it wrong.
 *
 * What it guarantees:
 *
 * - **Rendered into `document.body`.** A fixed overlay nested inside the
 *   header would be positioned against the header the moment any ancestor
 *   gained a transform, filter or containment. Keeping it out of that subtree
 *   removes the whole class of bug.
 * - **Escape closes**, and focus returns to whatever opened it.
 * - **Focus starts inside** the panel, on the close button.
 * - **The rest of the page is `inert`** while it is open, so Tab, the mouse
 *   and a screen reader's virtual cursor all stay in the panel. This is the
 *   browser doing containment properly; a hand-rolled Tab cycle catches the
 *   keyboard and misses the other two.
 * - **Background scrolling is locked.**
 */
type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Named for assistive technology, and shown in the panel header. */
  title: string;
  /** Hide the visible title when the panel has its own heading. */
  hideTitle?: boolean;
  side?: "left" | "right";
  children: ReactNode;
  /** Pinned below the scrolling body: totals, an apply button. */
  footer?: ReactNode;
  /** Returned to when the drawer closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  id?: string;
};

export function Drawer({
  open,
  onClose,
  title,
  hideTitle = false,
  side = "right",
  children,
  footer,
  returnFocusRef,
  className,
  id,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(open);

  /**
   * Close, then hand focus back to whatever opened the panel, so a keyboard
   * user is not dropped at the top of the document. Queued to the next frame
   * because the trigger is still `inert` until this render commits.
   *
   * Every close path goes through this, including Escape. Calling `onClose`
   * on its own would shut the panel and leave focus on `document.body`.
   */
  const requestClose = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  // Take everything else on the page out of the accessibility tree and out of
  // reach while the panel is open. Only elements this effect marked are
  // cleared again, so anything already inert for its own reasons stays that way.
  useEffect(() => {
    if (!open) {
      return;
    }

    const overlay = overlayRef.current;
    const marked = Array.from(document.body.children).filter(
      (element) => element !== overlay && !element.hasAttribute("inert"),
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

  if (!open) {
    return null;
  }

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50">
      {/* Click-away surface. Keyboard users close with Escape or the close
          button, so it stays out of the tab order. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-ink-950/30"
        onClick={requestClose}
      />

      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 flex w-full max-w-sm flex-col bg-canvas shadow-raised",
          side === "right" ? "right-0" : "left-0",
          className,
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <p
            className={cn(
              "font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle",
              hideTitle && "sr-only",
            )}
          >
            {title}
          </p>
          <IconButton
            ref={closeRef}
            label={`Close ${title.toLowerCase()}`}
            onClick={requestClose}
          >
            <CloseIcon />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-line px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
