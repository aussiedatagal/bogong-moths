import { loadFrames } from './radar-frames.js';
import { legend } from './radar-palette.js';

// Sydney's rain radar through one dry night: the raw radar plays from late
// afternoon to 2am on a loop, with two buckets underneath comparing the rain the radar
// suggests with the rain the gauges measured.

// Labels that would sit under the clock or key go on the left of their dot
const LABEL_LEFT = new Set(['Gosford']);

const clock = t => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  parent?.appendChild(e);
  return e;
}

function bucket(parent, label) {
  const b = el('div', { className: 'radar-bucket' }, parent);
  const fill = el('i', {}, el('div', { className: 'tube' }, b));
  const text = el('p', {}, b);
  const value = el('b', {}, text);
  text.append(label);
  return { fill, value };
}

export function init(container, night, land) {
  container.classList.add('radar-view');
  const stage = el('div', { className: 'radar-stage' }, container);
  const canvas = el('canvas', {}, stage);
  const ctx = canvas.getContext('2d');
  const time = el('div', { className: 'radar-clock' }, stage);
  const timeText = el('span', {}, time);
  const sunText = el('span', { className: 'radar-sun' }, time);
  const key = el('div', { className: 'radar-key' }, stage);
  key.innerHTML = '<span>light</span><i></i><span>heavy</span>';
  key.querySelector('i').style.background = legend;

  const buckets = el('div', { className: 'radar-buckets' }, container);
  const radarBucket = bucket(buckets, "Supposed rainfall, according to BOM's radar");
  const gaugeBucket = bucket(buckets, "Actual rainfall, measured by BOM's rain gauges");

  const controls = el('div', { className: 'radar-controls' }, container);
  const play = el('button', { type: 'button', className: 'radar-play' }, controls);
  const slider = el('input', { type: 'range', min: 0, max: night.times.length - 1, value: 0 }, controls);
  slider.setAttribute('aria-label', 'Time of night');
  el('a', { className: 'radar-download', href: 'img/sydney-radar-30-sep.gif', download: 'sydney-radar-30-sep.gif', textContent: 'Download GIF' }, controls);
  const sunset = night.times.indexOf('18:00');
  const last = night.times.length - 1;
  const R = night.radiusKm;
  let frame = null;
  let base = null;
  let i = 0;
  let wanted = true;
  let touched = false;
  let visible = false;
  let timer = null;

  const toPx = (x, y) => [(x + R) / (2 * R) * canvas.width, (y + R) / (2 * R) * canvas.height];

  function drawBase() {
    const css = getComputedStyle(container);
    base = document.createElement('canvas');
    base.width = base.height = canvas.width;
    const g = base.getContext('2d');
    g.fillStyle = css.getPropertyValue('--bg').trim() || '#0f141d';
    g.fillRect(0, 0, base.width, base.height);
    g.fillStyle = g.strokeStyle = css.getPropertyValue('--land').trim() || '#1c2431';
    g.lineWidth = 1.5;
    for (const ring of land) {
      g.beginPath();
      ring.forEach(([x, y], k) => (k ? g.lineTo(...toPx(x, y)) : g.moveTo(...toPx(x, y))));
      g.closePath();
      g.fill();
      g.stroke();
    }
  }

  const tile = document.createElement('canvas');
  tile.width = tile.height = night.size;

  function draw() {
    if (!base) return;
    const s = canvas.width / 400;
    ctx.drawImage(base, 0, 0);
    if (frame) {
      tile.getContext('2d').putImageData(frame(i, 0), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tile, 0, 0, canvas.width, canvas.height);
    }
    ctx.font = `700 ${Math.round(13 * s)}px "Atkinson Hyperlegible", sans-serif`;
    ctx.textBaseline = 'middle';
    for (const [name, [x, y]] of Object.entries(night.places)) {
      const [px, py] = toPx(x, y);
      const left = LABEL_LEFT.has(name);
      const tx = left ? px - 6 * s : px + 6 * s;
      ctx.fillStyle = '#ece7db';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = left ? 'right' : 'left';
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(15, 20, 29, 0.85)';
      ctx.strokeText(name, tx, py);
      ctx.fillText(name, tx, py);
    }

    timeText.textContent = clock(night.times[i]);
    sunText.textContent = i < sunset - 1 ? 'before sunset' : i <= sunset + 1 ? 'sunset' : 'after dark';
    slider.value = i;
    const full = night.facts.radarMm;
    const radarNow = night.facts.radarRunning[i];
    radarBucket.fill.style.height = `${radarNow / full * 100}%`;
    radarBucket.value.textContent = `${radarNow.toFixed(1)} mm`;
  }

  gaugeBucket.fill.style.height = `${night.facts.gaugeMm / night.facts.radarMm * 100}%`;
  gaugeBucket.value.textContent = `${night.facts.gaugeMm} mm`;

  function step() {
    i = i === last ? 0 : i + 1;
    draw();
  }

  function run() {
    const go = wanted && visible && frame;
    play.textContent = wanted ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(wanted));
    if (go && !timer) timer = setInterval(step, 110);
    else if (!go && timer) { clearInterval(timer); timer = null; }
  }

  play.addEventListener('click', () => {
    touched = true;
    wanted = !wanted;
    run();
  });
  slider.addEventListener('input', () => { touched = true; wanted = false; run(); i = +slider.value; draw(); });

  // The frames are a few MB, so fetch them only when the reader gets close
  const near = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    loadFrames('data/radar_20260930.png', night).then(f => { frame = f; draw(); run(); });
  }, { rootMargin: '150% 0px' });
  near.observe(container);

  // On wide screens the buckets and controls line up under the map, so measure twice:
  // their height depends on their width. On phones they keep the full width.
  const wide = window.matchMedia('(min-width: 900px)');
  function fit() {
    const below = buckets.offsetHeight + controls.offsetHeight + 16;
    const side = Math.max(200, Math.min(container.clientWidth, container.clientHeight - below));
    buckets.style.width = controls.style.width = wide.matches ? `${side}px` : '';
    return side;
  }

  function resize() {
    fit();
    const side = fit();
    stage.style.width = stage.style.height = `${side}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(side * dpr);
    drawBase();
    draw();
  }
  resize();

  return {
    update: () => {
      draw();
      return `Animated rain radar over Sydney on the night of 30 September ${night.date.slice(0, 4)}. After sunset the radar fills with light "rain" over the whole city, adding up to ${night.facts.radarMm} mm, while rain gauges measured ${night.facts.gaugeMm} mm.`;
    },
    resize,
    // Each time the reader arrives, start again from late afternoon unless they've taken over
    pause: hidden => {
      const arriving = !visible && !hidden;
      visible = !hidden;
      if (arriving && !touched) { i = 0; wanted = true; draw(); }
      run();
    },
  };
}
