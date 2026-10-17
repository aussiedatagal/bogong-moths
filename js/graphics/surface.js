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

// Rain as % of average: dry sand below 100, grey at average, deepening blue above
const RAIN_STOPS = [[75, [150, 118, 78]], [100, [64, 70, 82]], [150, [52, 118, 190]], [200, [150, 205, 255]]];
export const RAIN_LEGEND = RAIN_STOPS.map(([v]) => v);
export const rainColour = ramp(RAIN_STOPS);

// Places with few moth photos nearby fade out instead of showing a noisy share
const photoFade = weight => Math.min(1, Math.max(0, (weight - 30) / 120));

// One pixel per grid point, stretched over the map so the browser smooths it
export function drawSurface(parent, surface, project, { paint = colour, fade = photoFade, cls = 'surface', clip = 'land-clip' } = {}) {
  const { cols, rows, share, weight, step, extent: [west, , , north] } = surface;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  share.forEach((v, i) => {
    if (v === null) return;
    img.data.set([...paint(v), Math.round(255 * fade(weight[i]))], i * 4);
  });
  ctx.putImageData(img, 0, 0);

  const [x0, y0] = project([west - step / 2, north + step / 2]);
  const [x1, y1] = project([west + (cols - 0.5) * step, north - (rows - 0.5) * step]);
  return el('image', {
    href: canvas.toDataURL(), x: x0, y: y0, width: x1 - x0, height: y1 - y0,
    preserveAspectRatio: 'none', 'clip-path': `url(#${clip})`, class: cls,
  }, parent);
}
