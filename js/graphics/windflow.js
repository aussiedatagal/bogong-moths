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

  // Without motion, one long streamline from each point of an even grid,
  // fading in from its tail to an arrowhead, shows which way the wind blows
  function streamlines() {
    const gap = 36;
    const steps = 100;
    for (let gy = gap / 2; gy < height; gy += gap) {
      for (let gx = gap / 2; gx < width; gx += gap) {
        const x0 = gx + (Math.random() - 0.5) * gap * 0.6;
        const y0 = gy + (Math.random() - 0.5) * gap * 0.6;
        let [lon, lat] = project.invert([x0, y0]);
        if (lon < west || lon > east || lat < south || lat > north) continue;
        const line = [project([lon, lat])];
        for (let k = 0; k < steps; k++) {
          const [u, v] = at(lon, lat);
          lon += (u * SPEED) / Math.cos((lat * Math.PI) / 180);
          lat += v * SPEED;
          if (lon < west || lon > east || lat < south || lat > north) break;
          line.push(project([lon, lat]));
        }
        if (line.length < 10) continue;
        for (let k = 1; k < line.length; k++) {
          ctx.globalAlpha = 0.15 + 0.85 * (k / line.length);
          ctx.beginPath();
          ctx.moveTo(...line[k - 1]);
          ctx.lineTo(...line[k]);
          ctx.stroke();
        }
        const [x, y] = line.at(-1);
        const [px, py] = line.at(-4);
        const angle = Math.atan2(y - py, x - px);
        ctx.beginPath();
        for (const side of [-1, 1]) {
          ctx.moveTo(x, y);
          ctx.lineTo(x - 5 * Math.cos(angle + side * 0.5), y - 5 * Math.sin(angle + side * 0.5));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
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
        // reduced motion: draw streamlines instead of animating
        ctx.clearRect(0, 0, width, height);
        streamlines();
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
