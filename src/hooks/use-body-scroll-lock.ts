"use client";

import { useEffect } from "react";

/**
 * Freeze background scrolling while an overlay is open.
 *
 * The previous inline `overflow` value is restored on cleanup so the hook
 * composes safely with anything else that touches the document element.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
