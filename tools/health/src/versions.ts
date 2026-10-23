export type Version = [number, number, number];

/** Pull the first "1.2.3" or "1.2" out of any text. Returns null if there is none. */
export function parseVersion(text: string): Version | null {
  const match = text.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** True if `actual` is greater than or equal to `minimum`. */
export function isAtLeast(actual: Version, minimum: Version): boolean {
  for (let i = 0; i < 3; i++) {
    const a = actual[i] ?? 0;
    const m = minimum[i] ?? 0;
    if (a !== m) return a > m;
  }
  return true;
}
