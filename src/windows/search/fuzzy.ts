/**
 * Subsequence fuzzy scorer. Given a query and a target string, returns a
 * score (higher = better) plus the indices of matched characters in the
 * target, or null if the query doesn't match.
 *
 * Matching is case-insensitive. Scoring rewards:
 *   - full prefix matches
 *   - contiguous runs of matched characters
 *   - matches at word boundaries (start, after space/separator)
 *   - shorter targets (per-char normalization)
 *
 * Empty query returns null — callers decide what to show (recents, all, nothing).
 */

export type FuzzyMatch = {
  score: number;
  indices: number[];
};

const WORD_BOUNDARY = /[\s\-_/›:·]/;

export function fuzzyScore(query: string, target: string): FuzzyMatch | null {
  if (!query) return null;
  if (!target) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let streak = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      streak = 0;
      continue;
    }
    indices.push(ti);

    // Base point per matched char.
    let gain = 1;
    // Contiguous run bonus — grows with streak length.
    if (streak > 0) gain += 2 + streak;
    // Word-boundary bonus.
    if (ti === 0 || WORD_BOUNDARY.test(t[ti - 1])) gain += 3;
    // Prefix match bonus — very strong at index 0.
    if (ti === qi) gain += 2;

    score += gain;
    streak++;
    qi++;
  }

  if (qi < q.length) return null;

  // Normalize slightly against target length so short, exact-ish matches
  // outrank long haystacks that happen to contain every letter.
  score += Math.max(0, 8 - Math.floor(t.length / 4));

  return { score, indices };
}

/**
 * Render target text with matched indices highlighted. Returns an array of
 * `{ text, match }` segments — caller wraps matches in its own element.
 */
export type HighlightSegment = { text: string; match: boolean };

export function highlight(
  target: string,
  indices: number[]
): HighlightSegment[] {
  if (indices.length === 0) return [{ text: target, match: false }];
  const out: HighlightSegment[] = [];
  const set = new Set(indices);
  let i = 0;
  while (i < target.length) {
    const isMatch = set.has(i);
    let j = i + 1;
    while (j < target.length && set.has(j) === isMatch) j++;
    out.push({ text: target.slice(i, j), match: isMatch });
    i = j;
  }
  return out;
}
