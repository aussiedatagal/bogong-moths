// Reports how far the reader has scrolled through a pinned section, from 0
// when it reaches the top of the screen to 1 a little before it starts to
// leave, so the last frame stays up for a moment.
const HOLD = 0.03;

export function watchScrub(section, onProgress) {
  let queued = false;

  function check() {
    queued = false;
    const { top, height } = section.getBoundingClientRect();
    const range = height - innerHeight;
    onProgress(Math.min(1, Math.max(0, -top / (range * (1 - HOLD)))));
  }

  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(check); }
  }, { passive: true });
  addEventListener('resize', check);
  check();
}
