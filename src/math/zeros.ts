import { hardyZ, riemannSiegelTheta } from './complex';

export interface ZetaZero {
  index: number;
  gamma: number;
  spacing: number | null;
  theta: number;
}

let cachedZeros: ZetaZero[] | null = null;

function refineRootBrent(a: number, b: number, fa: number, fb: number): number {
  let x0 = a;
  let x1 = b;
  let f0 = fa;
  let f1 = fb;

  for (let iter = 0; iter < 48; iter++) {
    const mid = 0.5 * (x0 + x1);
    if (Math.abs(x1 - x0) < 1e-12) return mid;

    // Try secant step if it stays strictly inside bracket
    let next = mid;
    if (Math.abs(f1 - f0) > 1e-15) {
      const sec = x1 - (f1 * (x1 - x0)) / (f1 - f0);
      if (sec > Math.min(x0, x1) && sec < Math.max(x0, x1)) {
        next = sec;
      }
    }

    const fn = hardyZ(next);
    if (Math.abs(fn) < 1e-14) return next;

    if ((f0 < 0 && fn < 0) || (f0 > 0 && fn > 0)) {
      x0 = next;
      f0 = fn;
    } else {
      x1 = next;
      f1 = fn;
    }
  }
  return 0.5 * (x0 + x1);
}

/**
 * Computes and caches the first 100 non-trivial Riemann zeta zeros
 * rho_n = 1/2 + i*gamma_n by locating sign changes of Hardy's Z(t).
 */
export function getFirstHundredZeros(): ZetaZero[] {
  if (cachedZeros) return cachedZeros;

  const zeros: ZetaZero[] = [];
  const step = 0.12;
  let tPrev = 10.0;
  let zPrev = hardyZ(tPrev);

  for (let t = tPrev + step; t <= 245.0 && zeros.length < 100; t += step) {
    const zCurr = hardyZ(t);
    if (zPrev === 0) {
      zeros.push({
        index: zeros.length + 1,
        gamma: tPrev,
        spacing: zeros.length > 0 ? tPrev - zeros[zeros.length - 1].gamma : null,
        theta: riemannSiegelTheta(tPrev),
      });
    } else if ((zPrev < 0 && zCurr > 0) || (zPrev > 0 && zCurr < 0)) {
      const root = refineRootBrent(tPrev, t, zPrev, zCurr);
      zeros.push({
        index: zeros.length + 1,
        gamma: root,
        spacing: zeros.length > 0 ? root - zeros[zeros.length - 1].gamma : null,
        theta: riemannSiegelTheta(root),
      });
    }
    tPrev = t;
    zPrev = zCurr;
  }

  cachedZeros = zeros;
  return cachedZeros;
}
