const norm = (s: string) => s.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const tokSim = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

/** 0..1 similarity, order-insensitive ("ADAMU/MUSA MR" ≈ "Musa Adamu"); tolerant of small typos. */
export function nameSimilarity(a: string, b: string): number {
  const A = norm(a).filter((t) => !["MR", "MRS", "MS", "MISS", "ALHAJI", "HAJIA"].includes(t));
  const B = norm(b).filter((t) => !["MR", "MRS", "MS", "MISS", "ALHAJI", "HAJIA"].includes(t));
  if (!A.length || !B.length) return 0;
  const used = new Set<number>();
  let score = 0;
  for (const ta of A) {
    let best = 0, bi = -1;
    B.forEach((tb, i) => { if (used.has(i)) return; const s = tokSim(ta, tb); if (s > best) { best = s; bi = i; } });
    if (best >= 0.8 && bi >= 0) { used.add(bi); score += best; }
  }
  return score / Math.max(A.length, B.length);
}

export const NAME_MATCH_THRESHOLD = 0.85;
