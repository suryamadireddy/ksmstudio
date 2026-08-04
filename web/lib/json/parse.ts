/**
 * JSON helpers for artifact parsing.
 *
 * Claude sometimes emits // line comments in fenced JSON. A naive global
 * replace of // through end-of-line also matches inside https:// URL
 * string values, truncates them, and leaves corrupted text persisted to
 * ideas.development when parse fails.
 */

export function stripJsonLineComments(text: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      // Keep the newline (if any) for the next loop iteration.
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

export function parseJsonAllowingLineComments(text: string): unknown {
  const stripped = stripJsonLineComments(text);
  try {
    return JSON.parse(stripped);
  } catch {
    return JSON.parse(text);
  }
}
