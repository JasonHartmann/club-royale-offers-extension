/* ═══════════════════════════════════════════════════════════
   Percex Technologies — Landing Page Scripts
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Sticky nav background on scroll ────────────────────── */
  const nav = document.getElementById('nav');
  const onScroll = () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile menu toggle ─────────────────────────────────── */
  const toggle = document.getElementById('navToggle');
  const links = document.querySelector('.nav__links');
  toggle.addEventListener('click', () => {
    links.classList.toggle('nav__links--open');
  });
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('nav__links--open'));
  });

  /* ── Scroll-reveal (IntersectionObserver) ───────────────── */
  const revealTargets = document.querySelectorAll(
    '.section__header, .about__text, .value-card, .product-card--featured, ' +
    '.upcoming-card, .step-card, .contact__body'
  );

  revealTargets.forEach(el => el.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach(el => observer.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('reveal--visible'));
  }

  /* ── Smooth-scroll for anchor links (fallback) ──────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
})();
