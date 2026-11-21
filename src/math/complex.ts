export interface Complex {
  re: number;
  im: number;
}

export const C_ZERO: Complex = { re: 0, im: 0 };
export const C_ONE: Complex = { re: 1, im: 0 };

export function c(re: number, im = 0): Complex {
  return { re, im };
}

export function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cScale(a: Complex, k: number): Complex {
  return { re: a.re * k, im: a.im * k };
}

export function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return { re: NaN, im: NaN };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

export function cAbs(z: Complex): number {
  return Math.hypot(z.re, z.im);
}

export function cArg(z: Complex): number {
  return Math.atan2(z.im, z.re);
}

export function cExp(z: Complex): Complex {
  const r = Math.exp(z.re);
  return {
    re: r * Math.cos(z.im),
    im: r * Math.sin(z.im),
  };
}

export function cLog(z: Complex): Complex {
  return {
    re: Math.log(Math.hypot(z.re, z.im)),
    im: Math.atan2(z.im, z.re),
  };
}

export function cSin(z: Complex): Complex {
  return {
    re: Math.sin(z.re) * Math.cosh(z.im),
    im: Math.cos(z.re) * Math.sinh(z.im),
  };
}

export function cPowRealBase(base: number, exponent: Complex): Complex {
  const lnB = Math.log(base);
  const r = Math.exp(exponent.re * lnB);
  const angle = exponent.im * lnB;
  return {
    re: r * Math.cos(angle),
    im: r * Math.sin(angle),
  };
}

// Lanczos approximation for ln(Gamma(z)) with g = 7, n = 9
const LANCZOS_G = 7;
const LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

const LN_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

export function cLogGamma(z: Complex): Complex {
  if (z.re < 0.5) {
    // Reflection formula: ln(Gamma(z)) = ln(pi) - ln(sin(pi*z)) - ln(Gamma(1-z))
    const oneMinusZ = { re: 1 - z.re, im: -z.im };
    const lg1mz = cLogGamma(oneMinusZ);
    const lsin = cLogSinPi(z);
    return {
      re: Math.log(Math.PI) - lsin.re - lg1mz.re,
      im: -lsin.im - lg1mz.im,
    };
  }

  const zm1 = { re: z.re - 1, im: z.im };
  let xRe = LANCZOS_P[0];
  let xIm = 0;

  for (let i = 1; i < LANCZOS_P.length; i++) {
    const denomRe = zm1.re + i;
    const denomIm = zm1.im;
    const denomSq = denomRe * denomRe + denomIm * denomIm;
    xRe += (LANCZOS_P[i] * denomRe) / denomSq;
    xIm -= (LANCZOS_P[i] * denomIm) / denomSq;
  }

  const t = { re: zm1.re + LANCZOS_G + 0.5, im: zm1.im };
  const logT = cLog(t);
  const zm1p5 = { re: zm1.re + 0.5, im: zm1.im };
  const prod = cMul(zm1p5, logT);
  const logX = cLog({ re: xRe, im: xIm });

  return {
    re: LN_SQRT_2PI + prod.re - t.re + logX.re,
    im: prod.im - t.im + logX.im,
  };
}

// Safe ln(sin(pi * z)) avoiding overflow for large |Im(z)|
function cLogSinPi(z: Complex): Complex {
  const absY = Math.abs(z.im);
  if (absY < 15) {
    const piZ = { re: Math.PI * z.re, im: Math.PI * z.im };
    return cLog(cSin(piZ));
  }
  // For large |y|, sin(pi*(x + iy)) ≈ ± (1/(2i)) * exp(pi*|y| ∓ i*pi*x)
  if (z.im > 0) {
    // sin(pi*z) ≈ -1/(2i) * exp(pi*y - i*pi*x) = (i/2) * exp(pi*y - i*pi*x)
    return {
      re: Math.PI * z.im - Math.LN2,
      im: Math.PI * 0.5 - Math.PI * z.re,
    };
  }
  // z.im < 0: sin(pi*z) ≈ (-i/2) * exp(-pi*y + i*pi*x)
  return {
    re: -Math.PI * z.im - Math.LN2,
    im: -Math.PI * 0.5 + Math.PI * z.re,
  };
}

// Precomputed B_{2k} / (2k)! for k = 1..6
const BERNOULLI_COEFFS = [
  1 / 12,
  -1 / 720,
  1 / 30240,
  -1 / 1209600,
  1 / 47900160,
  -691 / 1307674368000,
];

function zetaRightHalfPlane(s: Complex, mode: 'fast' | 'high'): Complex {
  // Handle proximity to pole s = 1
  const dRe = s.re - 1;
  const dIm = s.im;
  if (dRe * dRe + dIm * dIm < 1e-18) {
    return { re: 1e9, im: 0 };
  }

  const absT = Math.abs(s.im);
  const N =
    mode === 'fast'
      ? Math.max(10, Math.ceil(absT / 3.2 + 7))
      : Math.max(18, Math.ceil(absT / 2.2 + 12));
  const M = mode === 'fast' ? 4 : 6;

  // 1. Direct partial sum: sum_{n=1}^{N-1} n^{-s}
  let sumRe = 1;
  let sumIm = 0;
  for (let n = 2; n < N; n++) {
    const lnN = Math.log(n);
    const mag = Math.exp(-s.re * lnN);
    const ang = -s.im * lnN;
    sumRe += mag * Math.cos(ang);
    sumIm += mag * Math.sin(ang);
  }

  const lnBigN = Math.log(N);
  // N^{-s}
  const nPowMinusSMag = Math.exp(-s.re * lnBigN);
  const nPowMinusSAng = -s.im * lnBigN;
  const nPowMinusS: Complex = {
    re: nPowMinusSMag * Math.cos(nPowMinusSAng),
    im: nPowMinusSMag * Math.sin(nPowMinusSAng),
  };

  // N^{1-s} / (s - 1) = N * N^{-s} / (s - 1)
  const nPow1MinusS: Complex = {
    re: N * nPowMinusS.re,
    im: N * nPowMinusS.im,
  };
  const poleTerm = cDiv(nPow1MinusS, { re: s.re - 1, im: s.im });

  sumRe += poleTerm.re + 0.5 * nPowMinusS.re;
  sumIm += poleTerm.im + 0.5 * nPowMinusS.im;

  // 2. Euler-Maclaurin correction terms
  // term_k = (B_{2k}/(2k)!) * s(s+1)...(s+2k-2) * N^{-(s+2k-1)}
  const invNSq = 1 / (N * N);
  let factor = cDiv(cMul(s, nPowMinusS), { re: N, im: 0 }); // s * N^{-(s+1)}
  sumRe += BERNOULLI_COEFFS[0] * factor.re;
  sumIm += BERNOULLI_COEFFS[0] * factor.im;

  for (let k = 1; k < M; k++) {
    const a = { re: s.re + (2 * k - 1), im: s.im };
    const b = { re: s.re + 2 * k, im: s.im };
    factor = cScale(cMul(factor, cMul(a, b)), invNSq);
    const coeff = BERNOULLI_COEFFS[k];
    sumRe += coeff * factor.re;
    sumIm += coeff * factor.im;
  }

  return { re: sumRe, im: sumIm };
}

/**
 * Computes the Riemann zeta function zeta(s) across the entire complex plane
 * via Euler-Maclaurin summation for Re(s) >= 0.25 and the Riemann functional
 * equation in log-space for Re(s) < 0.25.
 */
export function zeta(s: Complex, mode: 'fast' | 'high' = 'high'): Complex {
  if (!Number.isFinite(s.re) || !Number.isFinite(s.im)) {
    return { re: NaN, im: NaN };
  }

  if (s.re >= -0.05) {
    return zetaRightHalfPlane(s, mode);
  }

  // Functional equation: zeta(s) = 2^s * pi^{s-1} * sin(pi*s/2) * Gamma(1-s) * zeta(1-s)
  const oneMinusS: Complex = { re: 1 - s.re, im: -s.im };
  const zeta1mS = zetaRightHalfPlane(oneMinusS, mode);

  // Check exact trivial zeros: s = -2, -4, -6, ...
  if (Math.abs(s.im) < 1e-13 && s.re < -0.5 && Math.abs(s.re / 2 - Math.round(s.re / 2)) < 1e-13) {
    return { re: 0, im: 0 };
  }

  // Compute log(2^s * pi^{s-1} * sin(pi*s/2) * Gamma(1-s)) safely in log-space
  const halfS: Complex = { re: s.re * 0.5, im: s.im * 0.5 };
  const logSinHalf = cLogSinPi(halfS);
  const logGamma1mS = cLogGamma(oneMinusS);

  const ln2 = Math.LN2;
  const lnPi = Math.log(Math.PI);

  const logPrefactorRe =
    s.re * ln2 + (s.re - 1) * lnPi + logSinHalf.re + logGamma1mS.re;
  const logPrefactorIm =
    s.im * ln2 + s.im * lnPi + logSinHalf.im + logGamma1mS.im;

  const prefactor = cExp({ re: logPrefactorRe, im: logPrefactorIm });
  return cMul(prefactor, zeta1mS);
}

/**
 * Riemann-Siegel theta function:
 * theta(t) = Im(ln(Gamma(1/4 + i*t/2))) - (t/2)*ln(pi)
 */
export function riemannSiegelTheta(t: number): number {
  const lg = cLogGamma({ re: 0.25, im: t * 0.5 });
  return lg.im - 0.5 * t * Math.log(Math.PI);
}

/**
 * Real-valued Hardy Z-function along the critical line s = 1/2 + i*t:
 * Z(t) = exp(i * theta(t)) * zeta(1/2 + i*t)
 */
export function hardyZ(t: number): number {
  const theta = riemannSiegelTheta(t);
  const z = zeta({ re: 0.5, im: t }, 'high');
  return Math.cos(theta) * z.re - Math.sin(theta) * z.im;
}

export function formatComplex(z: Complex, digits = 4): string {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return 'Pol / ∞';
  const absVal = cAbs(z);
  if (absVal > 1e6) return '∞ (Polstelle)';
  const reStr = Math.abs(z.re) < 0.5 * Math.pow(10, -digits) ? (0).toFixed(digits) : z.re.toFixed(digits);
  const imAbs = Math.abs(z.im);
  const imStr = imAbs < 0.5 * Math.pow(10, -digits) ? (0).toFixed(digits) : imAbs.toFixed(digits);
  const sign = z.im >= 0 ? '+' : '−';
  return `${reStr} ${sign} ${imStr}i`;
}
