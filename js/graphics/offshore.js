import { loadFrames } from './radar-frames.js';

// Sydney's and Newcastle's radars stitched into one map, playing one night from 6pm to dawn on
// a loop, also under reduced motion (the drift is the story). Echo fades out towards the edge of
// each radar's range instead of stopping at a hard circle.

const NIGHT_SECONDS = 24;
const HOLD_SECONDS = 2.5;

const clock = utc => {
  const t = new Date(`${utc}Z`);
  const local = t.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
  return local.replace(' ', '').toLowerCase();
};

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  parent?.appendChild(e);
  return e;
}

export function init(container, night, coast) {
  container.classList.add('offshore-view');
  const canvas = el('canvas', {}, container);
  const time = el('div', { className: 'radar-clock' }, container);
  const timeText = el('span', {}, time);
  const sunText = el('span', { className: 'radar-sun' }, time);
  const css = getComputedStyle(document.documentElement);
  const colour = name => css.getPropertyValue(name).trim();
  const { width: fw, height: fh, bounds } = night.mosaic;
  const [west, south, east, north] = bounds;
  const last = night.mosaic.timesUtc.length - 1;

  // edge fade: full strength to 92 km from the nearest radar, gone by 100 km
  const fade = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    const lat = north - (y + 0.5) * (north - south) / fh;
    for (let x = 0; x < fw; x++) {
      const lon = west + (x + 0.5) * (east - west) / fw;
      const d = Math.min(...night.mosaic.radars.map(([rl, ra]) =>
        Math.hypot((lon - rl) * 111.32 * Math.cos(ra * Math.PI / 180), (lat - ra) * 110.57)));
      fade[y * fw + x] = Math.max(0, Math.min(1, (100 - d) / 8));
    }
  }

  let frames = null, g, base, tile, width, height, px, visible = false, frame = null, i = 0, pos = 0, hold = 0, lastNow = null;
  const faded = new Map();
  const frameAt = k => {
    if (!faded.has(k)) {
      const img = frames(k, 0), d = img.data;
      for (let p = 0; p < fade.length; p++) d[p * 4 + 3] *= fade[p];
      faded.set(k, img);
    }
    return faded.get(k);
  };

  function resize() {
    width = container.clientWidth;
    height = Math.max(240, container.clientHeight);
    const kx = Math.cos(((south + north) / 2) * Math.PI / 180);
    const scale = Math.min(width / ((east - west) * kx), height / (north - south));
    const mw = (east - west) * kx * scale, mh = (north - south) * scale;
    width = Math.round(mw); height = Math.round(mh);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    g = canvas.getContext('2d'); g.setTransform(ratio, 0, 0, ratio, 0, 0);
    px = (lon, lat) => [(lon - west) * kx * scale, (north - lat) * scale];
    base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
    const b = base.getContext('2d'); b.setTransform(ratio, 0, 0, ratio, 0, 0);
    b.fillStyle = colour('--land'); b.strokeStyle = colour('--land-edge');
    for (const ring of coast) {
      b.beginPath(); ring.forEach(([lon, lat], k) => b[k ? 'lineTo' : 'moveTo'](...px(lon, lat))); b.fill(); b.stroke();
    }
    tile = document.createElement('canvas'); tile.width = fw; tile.height = fh;
    draw();
  }

  function labels() {
    g.font = `600 12px ${colour('--body')}`;
    for (const p of night.places) {
      const [x, y] = px(p.lon, p.lat), left = p.align === 'left';
      g.textAlign = left ? 'left' : 'right';
      const tx = left ? x + 6 : x - 6;
      g.fillStyle = colour('--ink');
      g.beginPath(); g.arc(x, y, 2.5, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.strokeText(p.name, tx, y + 4);
      g.fillText(p.name, tx, y + 4);
    }
  }

  function draw() {
    if (!g) return;
    g.clearRect(0, 0, width, height);
    g.drawImage(base, 0, 0, width, height);
    if (frames) {
      tile.getContext('2d').putImageData(frameAt(i), 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(tile, 0, 0, width, height);
    }
    labels();
    const utc = night.mosaic.timesUtc[i];
    timeText.textContent = clock(utc);
    sunText.textContent = i < 3 ? 'sunset' : i > last - 3 ? 'dawn' : 'night';
  }

  function tick(now) {
    const dt = lastNow == null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    if (hold > 0) { hold -= dt; if (hold <= 0) pos = 0; }
    else {
      pos = Math.min(last, pos + dt * last / NIGHT_SECONDS);
      if (pos >= last) hold = HOLD_SECONDS;
    }
    i = Math.floor(pos);
    draw();
    frame = visible ? requestAnimationFrame(tick) : null;
  }

  resize();
  const near = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    loadFrames(night.mosaic.sprite, night.mosaic).then(f => { frames = f; draw(); });
  }, { rootMargin: '150% 0px' });
  near.observe(container);

  return {
    update: () => night.description,
    resize,
    // start the night again each time the reader arrives
    pause: hidden => {
      const arriving = !visible && !hidden;
      visible = !hidden;
      if (arriving) { i = 0; pos = 0; hold = 0; lastNow = null; }
      if (visible && !frame) frame = requestAnimationFrame(tick);
    },
  };
}
