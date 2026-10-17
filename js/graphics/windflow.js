// Wind streaks on a canvas over the map. Particles drift with the wind,
// read off the 2 degree grid by bilinear interpolation.
const SPEED = 0.0006; // degrees per frame for each km/h

export function initWindflow(container, wind, project, width, height) {
  const canvas = document.createElement('canvas');
  canvas.className = 'windflow';
  const ratio = devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);

  const lons = [...new Set(wind.grid.map(g => g[0]))].sort((a, b) => a - b);
  const lats = [...new Set(wind.grid.map(g => g[1]))].sort((a, b) => a - b);
  const index = new Map(wind.grid.map((g, i) => [g.join(), i]));
  const [west, east, south, north] = [lons[0], lons.at(-1), lats[0], lats.at(-1)];
  const count = Math.round((width * height) / 450);
  let field = wind.grid.map(() => [0, 0]);
  let frame = null;

  const spawn = () => ({
    lon: west + Math.random() * (east - west),
    lat: south + Math.random() * (north - south),
    age: Math.floor(Math.random() * 80),
  });
  let particles = Array.from({ length: count }, spawn);

  function at(lon, lat) {
    const i = Math.min(lons.length - 2, Math.floor((lon - west) / 2));
    const j = Math.min(lats.length - 2, Math.floor((lat - south) / 2));
    const fx = (lon - lons[i]) / 2;
    const fy = (lat - lats[j]) / 2;
    const v = (a, b) => field[index.get(`${lons[a]},${lats[b]}`)];
    const [p, q, r, s] = [v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)];
    return [0, 1].map(k =>
      (p[k] * (1 - fx) + q[k] * fx) * (1 - fy) + (r[k] * (1 - fx) + s[k] * fx) * fy);
  }

  function step() {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    for (let n = 0; n < particles.length; n++) {
      const pt = particles[n];
      const [u, v] = at(pt.lon, pt.lat);
      const lon = pt.lon + (u * SPEED) / Math.cos((pt.lat * Math.PI) / 180);
      const lat = pt.lat + v * SPEED;
      const [x1, y1] = project([pt.lon, pt.lat]);
      const [x2, y2] = project([lon, lat]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      Object.assign(pt, { lon, lat, age: pt.age + 1 });
      if (pt.age > 90 || lon < west || lon > east || lat < south || lat > north) particles[n] = spawn();
    }
    ctx.stroke();
  }

  // Without motion the streaks don't show which way the wind blows,
  // so the still version gets a small arrowhead on each one
  function arrowheads() {
    ctx.beginPath();
    for (const pt of particles) {
      const [u, v] = at(pt.lon, pt.lat);
      if (!u && !v) continue;
      const [x, y] = project([pt.lon, pt.lat]);
      const [x2, y2] = project([pt.lon + u * 0.01, pt.lat + v * 0.01]);
      const angle = Math.atan2(y2 - y, x2 - x);
      for (const side of [-1, 1]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3.5 * Math.cos(angle + side * 0.45), y - 3.5 * Math.sin(angle + side * 0.45));
      }
    }
    ctx.stroke();
  }

  function loop() {
    step();
    frame = requestAnimationFrame(loop);
  }

  ctx.strokeStyle = getComputedStyle(container).getPropertyValue('--wind').trim() || '#8fc3e8';
  ctx.lineWidth = 1.3;

  return {
    setField(vectors) { field = vectors; },
    start(still) {
      if (frame) return;
      if (still) {
        // reduced motion: draw short static streaks instead of animating
        ctx.clearRect(0, 0, width, height);
        particles = Array.from({ length: count }, spawn);
        for (let k = 0; k < 30; k++) step();
        arrowheads();
        return;
      }
      loop();
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = null;
      ctx.clearRect(0, 0, width, height);
    },
    remove() {
      this.stop();
      canvas.remove();
    },
  };
}
