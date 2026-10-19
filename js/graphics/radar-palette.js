// Bureau of Meteorology rain radar colours, one per rain-rate step (mm/h)
const STEPS = [0.2, 0.5, 1.5, 2.5, 4, 6, 10, 15, 20, 35, 50, 80, 120, 200, 300];
const COLOURS = [
  [245, 245, 255], [180, 180, 255], [120, 120, 255], [20, 20, 255], [0, 216, 195],
  [0, 150, 144], [0, 102, 102], [255, 255, 0], [255, 200, 0], [255, 150, 0],
  [255, 100, 0], [255, 0, 0], [200, 0, 0], [120, 0, 0], [40, 0, 0],
];

// Rain rate from reflectivity, Marshall-Palmer Z = 200 R^1.6
const rainRate = dbz => Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);

// Stored byte ((dBZ + 10) * 4) to RGBA, clear below 0.2 mm/h
export const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let b = 1; b < 256; b++) {
    const r = rainRate(b / 4 - 10);
    let i = -1;
    while (i + 1 < STEPS.length && r >= STEPS[i + 1]) i++;
    if (i >= 0) lut.set([...COLOURS[i], 235], b * 4);
  }
  return lut;
})();

export const legend = `linear-gradient(90deg, ${COLOURS.slice(0, 10).map(c => `rgb(${c})`).join(', ')})`;
