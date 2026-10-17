// Active step = last one whose top is above the trigger line (lower on phones,
// where the graphic covers the top of the screen). Steps marked data-scrub also
// report how far the reader has scrolled through them, from 0 to 1.
export function watchSteps(section, onStep) {
  const steps = [...section.querySelectorAll('.step')];
  let current = -1;
  let queued = false;

  // The held last card and the sticky graphic must let go at the same moment,
  // so they scroll away together. On phones the sticky block ends where the
  // card ends; side by side, the card's bottom lines up with the graphic's.
  function fit() {
    const last = steps.at(-1);
    const sticky = section.querySelector('.sticky');
    if (matchMedia('(min-width: 900px)').matches) {
      section.style.removeProperty('--stick');
      last.style.top = `${sticky.offsetHeight - last.offsetHeight}px`;
    } else {
      last.style.removeProperty('top');
      section.style.setProperty('--stick', `${parseFloat(getComputedStyle(last).top) + last.offsetHeight}px`);
    }
    // The card is held for the room after it, less any distance it is pushed
    // down to reach its held spot (a short section starts with it above that spot)
    const prev = last.previousElementSibling;
    const natural = last.parentElement.offsetTop + (prev ? prev.offsetTop + prev.offsetHeight + parseFloat(getComputedStyle(prev).marginBottom) : 0)
      + parseFloat(getComputedStyle(last).marginTop);
    const held = parseFloat(getComputedStyle(last).top);
    section.style.setProperty('--dwell', `${innerHeight * 0.35 + Math.max(0, held - natural)}px`);
  }

  // 0 when the step reaches the trigger line, 1 just before its held card
  // starts moving off, so the last frame shows while the card is still
  function progress(step, line) {
    const { top, height } = step.getBoundingClientRect();
    const card = step.querySelector('.card');
    const leaves = parseFloat(getComputedStyle(card).top) + card.offsetHeight - height;
    const end = leaves + innerHeight * 0.05;
    return Math.min(1, Math.max(0, (line - top) / (line - end)));
  }

  // The last card is held in place, sometimes below the trigger line
  const reached = (s, line) => {
    const top = s.getBoundingClientRect().top;
    return top < line || (s === steps.at(-1) && top <= parseFloat(getComputedStyle(s).top) + 1);
  };

  function check() {
    queued = false;
    const line = innerHeight * (matchMedia('(min-width: 900px)').matches ? 0.5 : 0.85);
    let index = 0;
    steps.forEach((s, i) => { if (reached(s, line)) index = i; });
    const step = steps[index];
    const scrub = 'scrub' in step.dataset ? progress(step, line) : undefined;
    if (index === current && scrub === undefined) return;
    if (index !== current) {
      current = index;
      steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
    }
    onStep(step.dataset.state, scrub);
  }

  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(check); }
  }, { passive: true });
  addEventListener('resize', () => { fit(); check(); });
  document.fonts.ready.then(fit);
  fit();
  check();
}
