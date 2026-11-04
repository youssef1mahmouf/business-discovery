// frontend/src/animations/lenis.js
// Lenis smooth-scroll integration. Single RAF loop, lifecycle-managed.
// Respects prefers-reduced-motion.

import Lenis from '../../assets/vendor/lenis.mjs';

let lenisInstance = null;
let rafId = null;

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isReduced() {
  return REDUCE;
}

function raf(time) {
  if (lenisInstance) lenisInstance.raf(time);
  rafId = requestAnimationFrame(raf);
}

export function initLenis(opts = {}) {
  if (REDUCE) return null;
  if (lenisInstance) return lenisInstance;
  const options = { duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), ...opts };
  lenisInstance = new Lenis(options);
  rafId = requestAnimationFrame(raf);
  return lenisInstance;
}

export function destroyLenis() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (lenisInstance) {
    lenisInstance.destroy();
    lenisInstance = null;
  }
}

export function getLenis() {
  return lenisInstance;
}
