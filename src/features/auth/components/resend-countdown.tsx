"use client";

import { useEffect, useState } from "react";

/**
 * Counts down to the moment a new code may be requested.
 *
 * This is UX only. The cooldown is enforced in the OTP service against the
 * database, so hiding or re-enabling this button changes nothing on the server.
 */
export function useResendCountdown(availableAt: number): number {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    // Recompute from the timestamp rather than decrementing, so a backgrounded
    // tab does not drift.
    function tick() {
      setSecondsLeft(Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)));
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [availableAt]);

  return secondsLeft;
}
