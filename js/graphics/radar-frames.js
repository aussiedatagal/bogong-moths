import { LUT } from './radar-palette.js';

// All frames of the night sit in one sprite sheet:
// red is the raw radar, green is the Bureau's rain-only (cleaned) radar.
// Frames are meta.size square, or meta.width by meta.height.
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
  const w = meta.width || meta.size, h = meta.height || meta.size;
  const cache = new Map();
  return (i, channel) => {
    const key = i * 2 + channel;
    if (cache.has(key)) return cache.get(key);
    const out = new ImageData(w, h);
    const ox = (i % meta.cols) * w;
    const oy = Math.floor(i / meta.cols) * h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const b = sheet[((oy + y) * img.width + ox + x) * 4 + channel];
        if (b) out.data.set(LUT.subarray(b * 4, b * 4 + 4), (y * w + x) * 4);
      }
    }
    cache.set(key, out);
    return out;
  };
}
