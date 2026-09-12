import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and let later Tailwind utilities win over
 * earlier conflicting ones. Used by every UI primitive so callers can pass a
 * `className` override without fighting the component's own classes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
