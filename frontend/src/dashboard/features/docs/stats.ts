/** Classical statistics for the evidence card: confidence intervals for proportions and a two-proportion test. */

const Z95 = 1.959964;

export type Interval = { p: number; lo: number; hi: number; k: number; n: number };

/** Wilson score interval: stays inside 0..1 and behaves for small n, unlike the plain "p ± 1.96·se". */
export function wilson(k: number, n: number, z = Z95): Interval {
  if (n === 0) return { p: 0, lo: 0, hi: 1, k, n };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), k, n };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 for erf). */
function normalCdf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? erf : -erf));
}

/** Difference of two proportions with Wald interval and a pooled two-sided z-test. */
export function compareProportions(a: Interval, b: Interval) {
  const diff = a.p - b.p;
  const se = Math.sqrt((a.p * (1 - a.p)) / a.n + (b.p * (1 - b.p)) / b.n);
  const pooled = (a.k + b.k) / (a.n + b.n);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  const z = sePooled === 0 ? 0 : diff / sePooled;
  return { diff, lo: diff - Z95 * se, hi: diff + Z95 * se, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

export const pct = (x: number, digits = 0) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
export const fmtP = (p: number) => (p < 0.001 ? 'p < 0,001' : `p = ${p.toLocaleString('de-DE', { maximumFractionDigits: 3 })}`);
