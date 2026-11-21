import { cAdd, cDiv, cExp, cMul } from './complex';

const EULER_MASCHERONI = 0.5772156649015329;

export function sievePrimes(maxN: number): number[] {
  const limit = Math.max(2, Math.floor(maxN));
  const isPrime = new Uint8Array(limit + 1);
  isPrime.fill(1);
  isPrime[0] = 0;
  isPrime[1] = 0;
  for (let p = 2; p * p <= limit; p++) {
    if (isPrime[p]) {
      for (let m = p * p; m <= limit; m += p) {
        isPrime[m] = 0;
      }
    }
  }
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (isPrime[i]) primes.push(i);
  }
  return primes;
}

export function exactPrimePi(x: number, primes: number[]): number {
  let count = 0;
  for (let i = 0; i < primes.length; i++) {
    if (primes[i] <= x) count++;
    else break;
  }
  return count;
}

export function mobius(n: number): number {
  if (n === 1) return 1;
  let m = n;
  let primeFactors = 0;
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      m /= p;
      if (m % p === 0) return 0; // squared factor
      primeFactors++;
    }
  }
  if (m > 1) primeFactors++;
  return primeFactors % 2 === 0 ? 1 : -1;
}

/**
 * Logarithmic integral li(x) = PV \int_0^x dt / ln(t) for x > 1
 */
export function liReal(x: number): number {
  if (x <= 1) return 0;
  const u = Math.log(x);
  if (u <= 24) {
    let sum = EULER_MASCHERONI + Math.log(u);
    let term = u;
    for (let k = 1; k <= 65; k++) {
      sum += term / k;
      term *= u / (k + 1);
      if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
    }
    return sum;
  }
  // Asymptotic expansion for large u
  let sum = 1;
  let term = 1;
  for (let k = 1; k <= 12; k++) {
    term *= k / u;
    sum += term;
  }
  return (x / u) * sum;
}

/**
 * Offset logarithmic integral Li(x) = \int_2^x dt / ln(t)
 */
const LI_AT_2 = liReal(2);
export function LiOffset(x: number): number {
  return Math.max(0, liReal(x) - LI_AT_2);
}

/**
 * Real part of complex exponential integral Re(Ei(z)) for Re(z) > 0, Im(z) > 0.
 * Used for li(x^rho) + li(x^conj(rho)) = 2 * Re(Ei(rho * ln(x))).
 */
export function reEi(re: number, im: number): number {
  const r = Math.hypot(re, im);
  if (r <= 26) {
    let sumRe = EULER_MASCHERONI + Math.log(r);
    let termRe = re;
    let termIm = im;
    for (let k = 1; k <= 95; k++) {
      sumRe += termRe / k;
      // term_{k+1} = term_k * z / (k + 1)
      const nextRe = (termRe * re - termIm * im) / (k + 1);
      const nextIm = (termRe * im + termIm * re) / (k + 1);
      termRe = nextRe;
      termIm = nextIm;
      if (Math.hypot(termRe, termIm) < 1e-14) break;
    }
    return sumRe;
  }

  // Asymptotic expansion: Ei(z) ~ (e^z / z) * sum_{j=0}^{12} j! / z^j
  const z = { re, im };
  const expZ = cExp(z);
  let poly = { re: 1, im: 0 };
  let term = { re: 1, im: 0 };
  for (let j = 1; j <= 12; j++) {
    term = cDiv({ re: term.re * j, im: term.im * j }, z);
    poly = cAdd(poly, term);
  }
  const res = cMul(cDiv(expZ, z), poly);
  return res.re;
}

/**
 * Residual integral \int_y^\infty dt / (t * (t^2 - 1) * ln(t)) for y > 1.
 * Substitutes u = 1 / t in [0, 1/y].
 */
function residualIntegral(y: number): number {
  if (y <= 1.0001) return 0;
  const upper = 1 / y;
  const steps = 16;
  const h = upper / steps;
  let sum = 0;
  for (let i = 1; i <= steps; i++) {
    const u = (i - 0.5) * h; // midpoint rule avoids u=0 singularity
    const denom = (1 - u * u) * Math.log(1 / u);
    const val = u / denom;
    sum += val;
  }
  return sum * h;
}

/**
 * Computes Riemann's prime-power counting approximation Pi_N(y) using the first N zero pairs.
 */
export function riemannBigPiApprox(y: number, gammas: number[], numZeros: number): number {
  if (y <= 1.02) return 0;
  const lnY = Math.log(y);
  let total = liReal(y) - Math.LN2 + residualIntegral(y);

  const count = Math.min(numZeros, gammas.length);
  for (let k = 0; k < count; k++) {
    const g = gammas[k];
    total -= 2 * reEi(0.5 * lnY, g * lnY);
  }
  return total;
}

/**
 * Computes Riemann's explicit formula approximation for pi(x) via Mobius inversion:
 * pi_N(x) = sum_{m=1}^{floor(log2(x))} (mu(m)/m) * Pi_N(x^{1/m})
 */
export function riemannPiApprox(x: number, gammas: number[], numZeros: number): number {
  if (x < 1.5) return 0;
  const maxM = Math.max(1, Math.floor(Math.log2(x)));
  let total = 0;
  for (let m = 1; m <= maxM; m++) {
    const mu = mobius(m);
    if (mu === 0) continue;
    const rootX = Math.pow(x, 1 / m);
    if (rootX <= 1.02) continue;
    total += (mu / m) * riemannBigPiApprox(rootX, gammas, numZeros);
  }
  return total;
}

/**
 * First-order harmonic contribution of a single zero pair (1/2 ± i*gamma)
 * to pi(x): -2 * Re(Ei((1/2 + i*gamma) * ln(x)))
 */
export function singleZeroHarmonic(x: number, gamma: number): number {
  if (x <= 1.02) return 0;
  const lnX = Math.log(x);
  return -2 * reEi(0.5 * lnX, gamma * lnX);
}
