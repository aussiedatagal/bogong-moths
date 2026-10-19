import { loadFrames } from './radar-frames.js';
import { legend } from './radar-palette.js';

// Sydney's rain radar through one dry night: the raw radar plays from late
// afternoon to 2am, with the Bureau's rain-only view and Bogong sightings
// as toggles, and two gauges comparing radar "rain" with rain gauges.

// Labels that would sit under the gauges go on the left of their dot
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

export function init(container, night, land) {
  container.classList.add('radar-view');
  const stage = el('div', { className: 'radar-stage' }, container);
  const canvas = el('canvas', {}, stage);
  const ctx = canvas.getContext('2d');
  const time = el('div', { className: 'radar-clock' }, stage);
  const timeText = el('span', {}, time);
  const sunText = el('span', { className: 'radar-sun' }, time);
  const gauges = el('div', { className: 'radar-gauges' }, stage);
  const gauge = label => {
    const g = el('div', { className: 'radar-gauge' }, gauges);
    const fill = el('i', {}, el('div', { className: 'tube' }, g));
    const text = el('p', {}, g);
    const value = el('b', {}, text);
    text.append(label);
    return { fill, value };
  };
  const radarGauge = gauge('radar');
  const rainGauge = gauge('rain gauges');
  const key = el('div', { className: 'radar-key' }, stage);
  key.innerHTML = '<span>light</span><i></i><span>heavy</span>';
  key.querySelector('i').style.background = legend;

  const controls = el('div', { className: 'radar-controls' }, container);
  const play = el('button', { type: 'button', className: 'radar-play' }, controls);
  const slider = el('input', { type: 'range', min: 0, max: night.times.length - 1, value: 0 }, controls);
  slider.setAttribute('aria-label', 'Time of night');
  const toggles = el('div', { className: 'radar-toggles' }, container);
  const toggle = text => {
    const b = el('button', { type: 'button', className: 'radar-toggle', textContent: text }, toggles);
    b.setAttribute('aria-pressed', 'false');
    return b;
  };
  const filterBtn = toggle("Bureau's rain filter");
  const mothBtn = toggle('Bogong sightings');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sunset = night.times.indexOf('18:00');
  const R = night.radiusKm;
  let frame = null;
  let base = null;
  let side = 0;
  let i = reduceMotion ? night.times.indexOf('22:00') : 0;
  let filtered = false;
  let moths = false;
  let wanted = !reduceMotion;
  let visible = false;
  let timer = null;

  const toPx = (x, y) => [(x + R) / (2 * R) * canvas.width, (y + R) / (2 * R) * canvas.height];

  function drawBase() {
    base = document.createElement('canvas');
    base.width = base.height = canvas.width;
    const g = base.getContext('2d');
    g.fillStyle = getComputedStyle(container).getPropertyValue('--bg') || '#0f141d';
    g.fillRect(0, 0, base.width, base.height);
    g.fillStyle = g.strokeStyle = getComputedStyle(container).getPropertyValue('--land') || '#1c2431';
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
      tile.getContext('2d').putImageData(frame(i, filtered ? 1 : 0), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tile, 0, 0, canvas.width, canvas.height);
    }
    if (moths) {
      ctx.strokeStyle = '#f0b24a';
      ctx.lineWidth = 1.4 * s;
      for (const [x, y] of night.sightings) {
        const [px, py] = toPx(x, y);
        ctx.beginPath();
        ctx.arc(px, py, 3.2 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.font = `700 ${Math.round(13 * s)}px "Atkinson Hyperlegible", sans-serif`;
    ctx.textBaseline = 'middle';
    for (const [name, [x, y]] of Object.entries(night.places)) {
      const [px, py] = toPx(x, y);
      ctx.fillStyle = '#ece7db';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 * s, 0, Math.PI * 2);
      ctx.fill();
      const left = LABEL_LEFT.has(name);
      const tx = left ? px - 6 * s : px + 6 * s;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(15, 20, 29, 0.85)';
      ctx.strokeText(name, tx, py);
      ctx.fillText(name, tx, py);
    }

    timeText.textContent = clock(night.times[i]);
    sunText.textContent = i < sunset - 1 ? 'before sunset' : i <= sunset + 1 ? 'sunset' : 'after dark';
    slider.value = i;
    const share = (i + 1) / night.times.length;
    const full = night.facts.radarMm;
    const radarNow = (filtered ? night.facts.cleanMm : full) * share;
    radarGauge.fill.style.height = `${radarNow / full * 100}%`;
    radarGauge.value.textContent = `${radarNow.toFixed(1)} mm`;
  }

  rainGauge.fill.style.height = `${night.facts.gaugeMm / night.facts.radarMm * 100}%`;
  rainGauge.value.textContent = `${night.facts.gaugeMm} mm`;

  function run() {
    const go = wanted && visible && frame;
    play.textContent = wanted ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(wanted));
    if (go && !timer) {
      timer = setInterval(() => { i = (i + 1) % night.times.length; draw(); }, 110);
    } else if (!go && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  play.addEventListener('click', () => { wanted = !wanted; run(); });
  slider.addEventListener('input', () => { wanted = false; run(); i = +slider.value; draw(); });
  for (const [btn, set] of [[filterBtn, v => (filtered = v)], [mothBtn, v => (moths = v)]]) {
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      set(on);
      draw();
    });
  }

  // The frames are a few MB, so fetch them only when the reader gets close
  const near = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    loadFrames('data/radar_20260930.png', night).then(f => { frame = f; draw(); run(); });
  }, { rootMargin: '150% 0px' });
  near.observe(container);

  function resize() {
    const controlsH = controls.offsetHeight + toggles.offsetHeight + 16;
    side = Math.max(200, Math.min(container.clientWidth, container.clientHeight - controlsH));
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
      return `Animated rain radar over Sydney on the night of 30 September ${night.date.slice(0, 4)}. After sunset the radar fills with light "rain" over the whole city while rain gauges recorded almost nothing.`;
    },
    resize,
    pause: hidden => { visible = !hidden; run(); },
  };
}
