/** Make a required initialization/generation invariant explicit at its boundary. */
export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
