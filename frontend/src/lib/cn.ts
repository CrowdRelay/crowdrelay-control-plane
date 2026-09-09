import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with conditional logic.
 * Combines clsx (conditional class composition) with tailwind-merge
 * (deduplication of conflicting Tailwind utilities).
 *
 * Usage:
 *   cn('px-2 py-1', condition && 'bg-primary', 'px-4')
 *   // → 'py-1 bg-primary px-4' (px-2 overridden by px-4)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
