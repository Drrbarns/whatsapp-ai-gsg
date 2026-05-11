// ============================================================================
// Detect when a customer corrects (or first declares) their name in chat.
//
// Conservative on purpose — false positives are worse than false negatives,
// because we'll go on to address them by the wrong name. We only fire when
// the message is clearly a name statement and short enough that it can't
// plausibly be a longer sentence that happens to contain a name pattern.
// ============================================================================

const PATTERNS: Array<RegExp> = [
  // "I'm Samuel, not Yempeez" / "Im Samuel not Yempeez"
  /\bi['’]?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,?\s*not\s+\S+)/i,
  // "My name is Samuel"
  /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  // "Call me KK" / "Call me Samuel"
  /\bcall\s+me\s+([A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]+)?)\b/i,
  // "It's Samuel" / "Its Samuel" — only on a very short message
  /^it['’]?s\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/i,
  // "Actually I'm Samuel"
  /\bactually(?:\s*,)?\s+i['’]?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
];

const STOPWORDS = new Set([
  "looking",
  "shopping",
  "trying",
  "buying",
  "ordering",
  "thinking",
  "asking",
  "wondering",
  "interested",
  "ready",
  "fine",
  "good",
  "ok",
  "okay",
  "sorry",
  "here",
  "back",
  "tired",
  "hungry",
  "thirsty",
  "lost",
  "new",
  "the",
  "an",
  "a",
]);

/**
 * Returns the corrected name if the message is clearly a name statement,
 * otherwise null. Capitalises to a clean Display Form.
 */
export function detectNameCorrection(message: string): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  // Don't analyse long messages — too risky.
  if (trimmed.length > 80) return null;

  for (const re of PATTERNS) {
    const m = trimmed.match(re);
    if (!m) continue;
    const raw = m[1]?.trim();
    if (!raw) continue;
    const firstWord = raw.split(/\s+/)[0]?.toLowerCase();
    if (firstWord && STOPWORDS.has(firstWord)) continue;
    // Title-case it.
    return raw
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }
  return null;
}
