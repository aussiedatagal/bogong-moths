import { loadFrames } from './radar-frames.js';

// Sydney's and Newcastle's radars stitched into one map, playing one night from 6pm to dawn on
// a loop, also under reduced motion (the drift is the story). Echo fades out towards the edge of
// each radar's range instead of stopping at a hard circle.

const NIGHT_SECONDS = 24;
const HOLD_SECONDS = 2.5;
const SWARM_KM2 = 2500;    // outline the swarm once this much echo sits more than 8 km offshore
const PX_PER_KMH = 3;      // arrow length
const ANCHOR = [151.5, -33.85]; // where the arrows start when there's no outline

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

  // offset: pixels to the side of the line, so two arrows from one point sit side by side
  function arrow(x0, y0, [u, v], stroke, text, below, offset = 0) {
    const len = Math.hypot(u, v) * PX_PER_KMH, a = Math.atan2(v, u);
    const x = x0 + Math.sin(a) * offset, y = y0 + Math.cos(a) * offset;
    const tx = x + Math.cos(a) * len, ty = y - Math.sin(a) * len;
    g.strokeStyle = g.fillStyle = stroke; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
    const h = 9, s1 = a + Math.PI * 0.85, s2 = a - Math.PI * 0.85;
    g.beginPath(); g.moveTo(tx + Math.cos(a) * 3, ty - Math.sin(a) * 3);
    g.lineTo(tx + Math.cos(s1) * h, ty - Math.sin(s1) * h); g.lineTo(tx + Math.cos(s2) * h, ty - Math.sin(s2) * h);
    g.closePath(); g.fill();
    g.font = `600 12px ${colour('--body')}`; g.textAlign = 'left';
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
    const lx = tx + 6, ly = ty + (below ? 14 : -6);
    g.strokeText(text, lx, ly); g.fillText(text, lx, ly);
  }

  function notes() {
    const n = night.notes?.[i];
    if (!n) return;
    let at = px(...ANCHOR);
    if (n.swarm && n.swarm[4] >= SWARM_KM2) {
      const [lon, lat, sdx, sdy] = n.swarm, [cx, cy] = px(lon, lat);
      const [ex] = px(lon + sdx, lat), [, ey] = px(lon, lat - sdy);
      g.setLineDash([6, 5]); g.strokeStyle = colour('--moth'); g.lineWidth = 2;
      g.beginPath(); g.ellipse(cx, cy, Math.max(20, ex - cx), Math.max(20, ey - cy), 0, 0, 2 * Math.PI); g.stroke();
      g.setLineDash([]);
      g.font = `600 13px ${colour('--body')}`; g.textAlign = 'center'; g.fillStyle = colour('--moth');
      g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
      g.strokeText('Swarm over the ocean', cx, cy + (ey - cy) + 18); g.fillText('Swarm over the ocean', cx, cy + (ey - cy) + 18);
      at = [cx, cy];
    }
    const kmh = ([u, v]) => Math.round(Math.hypot(u, v));
    if (n.wind) arrow(...at, n.wind, colour('--wind'), `Wind ${kmh(n.wind)} km/h`, true, 10);
    if (n.move) arrow(...at, n.move, colour('--moth'), `Swarm ${kmh(n.move)} km/h`, false);
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
    notes();
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
