import { el } from '../svg.js';

// Bogongs per 100 moths -> colour: dark brown, red, orange, then yellow from 40
const ramp = stops => value => {
  const i = stops.findIndex(([v]) => v > value);
  if (i === -1) return stops.at(-1)[1];
  if (i === 0) return stops[0][1];
  const [v0, c0] = stops[i - 1];
  const [v1, c1] = stops[i];
  const t = (value - v0) / (v1 - v0);
  return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
};

const SHARE_STOPS = [[0, [43, 42, 40]], [10, [92, 58, 44]], [20, [150, 64, 46]], [30, [214, 116, 44]], [40, [255, 214, 112]]];
export const LEGEND = SHARE_STOPS.map(([v]) => v);
export const colour = ramp(SHARE_STOPS);

// Rain as % of average, one band per 10% from 80%, in the colours of the
// Bureau of Meteorology's rain radar (light to heavy)
const RADAR = [
  [245, 245, 255], [180, 180, 255], [120, 120, 255], [20, 20, 255], [0, 216, 195],
  [0, 150, 144], [0, 102, 102], [255, 255, 0], [255, 200, 0], [255, 150, 0],
  [255, 100, 0], [255, 0, 0], [200, 0, 0], [120, 0, 0], [40, 0, 0],
];
export const RAIN_BANDS = RADAR.map((rgb, i) => [80 + i * 10, rgb]);
export const rainColour = value => (RAIN_BANDS.findLast(([v]) => v <= value) || RAIN_BANDS[0])[1];

// Places with few moth photos nearby fade out instead of showing a noisy share
const photoFade = weight => Math.min(1, Math.max(0, (weight - 30) / 120));

// Bilinear value at a fractional grid position, from the corners that have data
function sample(values, cols, rows, x, y) {
  const i = Math.min(Math.floor(x), cols - 1);
  const j = Math.min(Math.floor(y), rows - 1);
  const fx = x - i;
  const fy = y - j;
  let sum = 0;
  let total = 0;
  for (const [di, dj, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const v = values[Math.min(j + dj, rows - 1) * cols + Math.min(i + di, cols - 1)];
    if (v === null || w === 0) continue;
    sum += v * w;
    total += w;
  }
  return total ? sum / total : null;
}

// One pixel per grid point (or `fine` pixels, interpolated, so stepped colour
// bands get smooth edges), stretched over the map so the browser smooths it
export function drawSurface(parent, surface, project, { paint = colour, fade = photoFade, cls = 'surface', clip, fine = 1 } = {}) {
  const { cols, rows, share, weight, step, extent: [west, , , north] } = surface;
  const canvas = document.createElement('canvas');
  canvas.width = cols * fine;
  canvas.height = rows * fine;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const gx = (x + 0.5) / fine - 0.5;
      const gy = (y + 0.5) / fine - 0.5;
      const v = fine === 1 ? share[y * cols + x] : sample(share, cols, rows, Math.max(0, gx), Math.max(0, gy));
      if (v === null) continue;
      const w = fine === 1 ? weight[y * cols + x] : sample(weight, cols, rows, Math.max(0, gx), Math.max(0, gy));
      img.data.set([...paint(v), Math.round(255 * fade(w))], (y * canvas.width + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);

  const [x0, y0] = project([west - step / 2, north + step / 2]);
  const [x1, y1] = project([west + (cols - 0.5) * step, north - (rows - 0.5) * step]);
  return el('image', {
    href: canvas.toDataURL(), x: x0, y: y0, width: x1 - x0, height: y1 - y0,
    preserveAspectRatio: 'none', 'clip-path': `url(#${clip})`, class: cls,
  }, parent);
}
