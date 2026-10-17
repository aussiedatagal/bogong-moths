// Active step = last one whose top is above the trigger line (lower on phones,
// where the graphic covers the top of the screen). Steps marked data-scrub also
// report how far the reader has scrolled through them, from 0 to 1.
export function watchSteps(section, onStep) {
  const steps = [...section.querySelectorAll('.step')];
  let current = -1;
  let queued = false;

  function progress(step, line) {
    const { top, height } = step.getBoundingClientRect();
    const distance = height - innerHeight * 0.45;
    return Math.min(1, Math.max(0, (line - top) / distance));
  }

  function check() {
    queued = false;
    const line = innerHeight * (matchMedia('(min-width: 900px)').matches ? 0.5 : 0.75);
    let index = 0;
    steps.forEach((s, i) => { if (s.getBoundingClientRect().top < line) index = i; });
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
  addEventListener('resize', check);
  check();
}
