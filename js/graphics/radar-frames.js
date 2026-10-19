import { LUT } from './radar-palette.js';

// All frames of the night sit in one sprite sheet:
// red is the raw radar, green is the Bureau's rain-only (cleaned) radar.
export async function loadFrames(src, meta) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const sheet = g.getImageData(0, 0, img.width, img.height).data;
  const n = meta.size;
  const cache = new Map();
  return (i, channel) => {
    const key = i * 2 + channel;
    if (cache.has(key)) return cache.get(key);
    const out = new ImageData(n, n);
    const ox = (i % meta.cols) * n;
    const oy = Math.floor(i / meta.cols) * n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const b = sheet[((oy + y) * img.width + ox + x) * 4 + channel];
        if (b) out.data.set(LUT.subarray(b * 4, b * 4 + 4), (y * n + x) * 4);
      }
    }
    cache.set(key, out);
    return out;
  };
}
