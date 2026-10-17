// Active step = last one whose top is above the trigger line. On phones that is
// the bottom edge, so the graphic changes as the next card comes into view.
// Steps marked data-scrub also report how far the reader has scrolled through
// them, from 0 to 1.
export function watchSteps(section, onStep) {
  const steps = [...section.querySelectorAll('.step')];
  let current = -1;
  let queued = false;

  // 0 when the step reaches the trigger line, 1 just before its held card
  // starts moving off, so the last frame shows while the card is still
  function progress(step, line) {
    const { top, height } = step.getBoundingClientRect();
    const card = step.querySelector('.card');
    const leaves = parseFloat(getComputedStyle(card).top) + card.offsetHeight - height;
    const end = leaves + innerHeight * 0.05;
    return Math.min(1, Math.max(0, (line - top) / (line - end)));
  }

  function check() {
    queued = false;
    const line = innerHeight * (matchMedia('(min-width: 900px)').matches ? 0.5 : 0.97);
    let index = 0;
    steps.forEach((s, i) => { if (s.getBoundingClientRect().top < line) index = i; });
    const step = steps[index];
    const scrub = 'scrub' in step.dataset ? progress(step, line) : undefined;
    if (index === current && scrub === undefined) return;
    if (index !== current) {
      current = index;
      steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
    }
    onStep(step, scrub);
  }

  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(check); }
  }, { passive: true });
  addEventListener('resize', check);
  check();
}
