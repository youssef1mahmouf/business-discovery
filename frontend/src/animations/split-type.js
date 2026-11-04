// frontend/src/animations/split-type.js
// SplitType text animation helper. Used sparingly for hero headings only.
// Imports default export from vendored SplitType ESM build.

import SplitType from '../../assets/vendor/split-type.js';

const instances = [];

export function splitHeading(selector, { types = 'chars' } = {}) {
  const els = typeof selector === 'string' ? document.querySelectorAll(selector) : [selector];
  const created = [];
  els.forEach((el) => {
    if (!el) return;
    // Avoid double-splitting
    if (el.dataset.splitType === 'done') return;
    try {
      const instance = new SplitType(el, { types });
      instances.push(instance);
      el.dataset.splitType = 'done';
      created.push(instance);
    } catch (e) {
      console.warn('SplitType failed on', selector, e);
    }
  });
  return created;
}

export function splitReveal(selector, gsapRef, { delay = 0, stagger = 0.03, duration = 0.5 } = {}) {
  const instances = splitHeading(selector);
  if (!gsapRef || instances.length === 0) return Promise.resolve();
  const chars = instances.flatMap((i) => i.chars || []);
  if (!chars.length) return Promise.resolve();
  return new Promise((resolve) => {
    gsapRef.from(chars, {
      opacity: 0,
      y: 30,
      duration,
      stagger,
      delay,
      ease: 'power3.out',
      onComplete: resolve,
    });
  });
}

export function revertAll() {
  instances.forEach((inst) => {
    try { inst.revert(); } catch (e) { /* ignore */ }
  });
  instances.length = 0;
  document.querySelectorAll('[data-split-type="done"]').forEach((el) => {
    delete el.dataset.splitType;
  });
}

export function getInstances() {
  return instances;
}
