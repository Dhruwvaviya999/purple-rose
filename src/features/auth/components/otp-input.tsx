"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Six-digit code entry.
 *
 * One real input, visually divided into six cells. Six separate boxes are the
 * more common look, but they fight paste, screen readers announce six unlabelled
 * fields, and focus juggling breaks backspace. A single field keeps the browser
 * and assistive technology behaving normally, keeps autofill from an SMS
 * working, and still reads as six cells.
 *
 * The input sits transparently over the cells, so the caret, selection, paste
 * and keyboard all belong to a normal text field.
 */

const CODE_LENGTH = 6;

type OtpInputProps = {
  name: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function OtpInput({
  name,
  describedBy,
  invalid = false,
  disabled = false,
}: OtpInputProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  // Anything pasted is reduced to digits, so "123 456" and "code: 123456" work.
  function handleChange(raw: string) {
    setValue(raw.replace(/\D/g, "").slice(0, CODE_LENGTH));
  }

  const cells = Array.from({ length: CODE_LENGTH }, (_, index) => index);
  const activeCell = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        6-digit verification code
      </label>

      <input
        id={inputId}
        name={name}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // `numeric` gives phones a digit keypad without the spinner and
        // locale quirks that `type="number"` brings.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={CODE_LENGTH}
        required
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus
        className="absolute inset-0 z-10 h-full w-full cursor-text rounded-control bg-transparent text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
      />

      <div aria-hidden="true" className="flex gap-2 sm:gap-2.5">
        {cells.map((index) => {
          const char = value[index] ?? "";
          const isActive = focused && index === activeCell && !disabled;

          return (
            <div
              key={index}
              className={cn(
                "flex h-14 flex-1 items-center justify-center rounded-control border bg-canvas font-sans text-xl font-medium text-ink transition-colors",
                invalid ? "border-plum-400" : "border-line-strong",
                isActive && "border-brand ring-2 ring-brand/25",
                disabled && "bg-surface text-ink-subtle",
              )}
            >
              {char || (
                <span className="text-ink-300" aria-hidden="true">
                  •
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
