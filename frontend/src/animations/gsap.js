// frontend/src/animations/gsap.js
// GSAP animation utilities. Requires window.gsap (loaded via assets/vendor/gsap.js).
// All helpers respect prefers-reduced-motion.

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isReduced() {
  return REDUCE;
}

const gsap = () => window.gsap;

// ---------- Entrance animations ----------
export function entranceFade(elements, { delay = 0, stagger = 0.08, duration = 0.6, y = 30 } = {}) {
  if (REDUCE || !gsap()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap().from(elements, {
      opacity: 0,
      y,
      duration,
      stagger,
      delay,
      ease: 'power3.out',
      onComplete: resolve,
    });
  });
}

export function entranceIn(elements, { delay = 0, stagger = 0.1, duration = 0.7, y = 40 } = {}) {
  return entranceFade(elements, { delay, stagger, duration, y });
}

// ---------- Staggered cards ----------
export function staggerCards(containerSelector, { delay = 0, stagger = 0.1, duration = 0.5 } = {}) {
  if (REDUCE || !gsap()) return Promise.resolve();
  const els = document.querySelectorAll(containerSelector + ' .card');
  if (!els.length) return Promise.resolve();
  return new Promise((resolve) => {
    gsap().from(els, {
      opacity: 0,
      y: 24,
      duration,
      stagger,
      delay,
      ease: 'power2.out',
      onComplete: resolve,
    });
  });
}

// ---------- Section reveals ----------
export function revealSection(selector, { delay = 0, duration = 0.7 } = {}) {
  if (REDUCE || !gsap()) return Promise.resolve();
  const el = document.querySelector(selector);
  if (!el) return Promise.resolve();
  return new Promise((resolve) => {
    gsap().from(el, { opacity: 0, y: 30, duration, delay, ease: 'power3.out', onComplete: resolve });
  });
}

// ---------- Navigation transitions ----------
export function navLinkHover(el) {
  if (REDUCE || !gsap()) return;
  gsap().to(el, { scale: 1.05, duration: 0.2, ease: 'power2.out' });
}
export function navLinkLeave(el) {
  if (REDUCE || !gsap()) return;
  gsap().to(el, { scale: 1, duration: 0.2, ease: 'power2.out' });
}

// ---------- Modal transitions ----------
export function modalOpen(modalEl) {
  if (REDUCE || !gsap()) {
    if (modalEl) modalEl.style.opacity = '1';
    return Promise.resolve();
  }
  modalEl.style.opacity = '1';
  return new Promise((resolve) => {
    gsap().fromTo(
      modalEl,
      { y: -20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out', onComplete: resolve }
    );
  });
}

export function modalClose(modalEl) {
  if (REDUCE || !gsap()) {
    if (modalEl) modalEl.style.opacity = '0';
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap().to(modalEl, { y: -20, opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: resolve });
  });
}

// ---------- Button interactions ----------
export function btnPress(el) {
  if (REDUCE || !gsap()) return;
  gsap().to(el, { scale: 0.95, duration: 0.1, ease: 'power2.in' });
}
export function btnRelease(el) {
  if (REDUCE || !gsap()) return;
  gsap().to(el, { scale: 1, duration: 0.2, ease: 'power2.out' });
}

// ---------- Dashboard element transitions ----------
export function fadeIn(el, { duration = 0.4, delay = 0 } = {}) {
  if (REDUCE || !gsap()) { if (el) el.style.opacity = '1'; return Promise.resolve(); }
  el.style.opacity = '1';
  return new Promise((resolve) => {
    gsap().fromTo(el, { opacity: 0 }, { opacity: 1, duration, delay, ease: 'power2.out', onComplete: resolve });
  });
}

export function slideUp(el, { duration = 0.5, delay = 0 } = {}) {
  if (REDUCE || !gsap()) { if (el) { el.style.opacity='1'; el.style.transform='none'; } return Promise.resolve(); }
  return new Promise((resolve) => {
    gsap().fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration, delay, ease: 'power3.out', onComplete: resolve });
  });
}
