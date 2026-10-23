/**
 * Models routinely wrap JSON in markdown fences, or add a sentence before/after it.
 * This pulls out the first well-formed JSON value it can find. Throws if none parses.
 */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1] ?? text, text] : [text];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // fall through to brace-matching below
    }
    const start = trimmed.search(/[[{]/);
    if (start === -1) continue;
    const opener = trimmed[start] as string;
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === opener) depth++;
      else if (trimmed[i] === closer) {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(start, i + 1);
          try {
            return JSON.parse(slice) as T;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error(`no valid JSON found in: ${text.slice(0, 200)}`);
}
