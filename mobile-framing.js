// Text wraps differently with viewport size and font loading. Anchor the portrait
// to the measured copy so both the poster and video clear its final line.
(() => {
  const portrait = matchMedia('(max-width: 900px) and (orientation: portrait)');
  const hero = document.querySelector('.hero');
  const copy = hero.querySelector('.hero__copy');

  function alignScene() {
    if (portrait.matches) {
      const bottom = copy.getBoundingClientRect().bottom - hero.getBoundingClientRect().top;
      document.documentElement.style.setProperty('--hero-copy-bottom', bottom + 'px');
    }
  }

  const observer = new ResizeObserver(alignScene);
  observer.observe(hero);
  observer.observe(copy);
  portrait.addEventListener('change', alignScene);
  alignScene();
})();
