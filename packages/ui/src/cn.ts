import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// The shadcn class combiner: clsx resolves conditionals/arrays, tailwind-merge dedupes conflicting Tailwind
// utilities so a consumer's `className` override wins instead of both classes landing in the list
// (e.g. passing `max-w-5xl` to a Container defaulting to `max-w-7xl` keeps only `max-w-5xl`).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
