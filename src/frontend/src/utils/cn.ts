import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts, so a consumer's
 * `className="p-8"` wins over a primitive's default `p-6` regardless of the
 * order the CSS was emitted in.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
