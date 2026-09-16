"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { CloseIcon } from "@/components/shared/icons";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils/cn";

/**
 * A centred dialog, for a question that has to be answered before anything
 * else happens.
 *
 * The sibling of `Drawer`, with the same behavioural guarantees and for the
 * same reason: the hard part of a dialog is the behaviour, and a second
 * hand-written copy of it is a second chance to get it wrong. It is a separate
 * component rather than a `variant` on the drawer because the two differ in
 * what they are *for* — a drawer is a place you go, a dialog is a question you
 * answer — and conflating them would give the drawer a modal mode nothing asks
 * for.
 *
 * What it guarantees:
 *
 * - **Rendered into `document.body`**, so no ancestor's transform, filter or
 *   containment can reposition a fixed overlay.
 * - **Escape closes**, and focus returns to whatever opened it.
 * - **Focus starts inside**, on the close button.
 * - **Everything else is `inert`** while it is open, so the keyboard, the
 *   pointer and a screen reader's virtual cursor all stay in the dialog. That
 *   is the browser doing containment properly; a hand-rolled Tab cycle catches
 *   the keyboard and misses the other two.
 * - **Background scrolling is locked.**
 * - **Labelled by its own heading** through `aria-labelledby`, and described
 *   by its body, so it is announced as what it asks rather than as "dialog".
 *
 * `window.confirm()` is deliberately not used anywhere in the admin area. It
 * cannot be styled, cannot explain consequences in more than one line, and
 * blocks the whole browser tab.
 */
type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Shown as the dialog's heading and used to name it. */
  title: string;
  /** What will happen, and whether it can be undone. */
  description?: ReactNode;
  children?: ReactNode;
  /** The actions. The primary one should be last, nearest the thumb. */
  footer?: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  returnFocusRef,
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // `useId` rather than a random string: it is stable across renders and the
  // same on the server and the client, so the heading and the `aria-labelledby`
  // that points at it cannot disagree after hydration.
  const titleId = useId();

  useBodyScrollLock(open);

  const requestClose = useCallback(() => {
    onClose();
    // Queued to the next frame: the trigger is still `inert` until this
    // render commits, and focusing an inert element does nothing.
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
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-ink-950/40"
        onClick={requestClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex w-full max-w-lg flex-col rounded-t-card bg-canvas shadow-raised sm:rounded-card",
          "max-h-[85vh]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <h2
            id={titleId}
            className="font-sans text-base font-medium text-ink"
          >
            {title}
          </h2>
          <IconButton ref={closeRef} label="Close" onClick={requestClose}>
            <CloseIcon />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {description ? (
            <div className="font-sans text-sm leading-relaxed text-ink-muted">
              {description}
            </div>
          ) : null}
          {children}
        </div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
