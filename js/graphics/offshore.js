// One night of the Newcastle radar as drifting dots: each dot starts inside the radar's
// range and moves the way the radar measured the echo moving, every half hour. Plays the
// night from 6pm to dawn on a loop, also under reduced motion (the movement is the story).

const NIGHT_SECONDS = 24;  // the whole night in 24 seconds
const HOLD_SECONDS = 3;    // pause on dawn before starting again
const LIFE = 120;          // minutes of night each dot is followed (limits how far past the radar range it goes)
const BOUNDS = [150.85, -33.95, 152.75, -32.35];

const clock = minutes => {
  const t = 18 * 60 + Math.round(minutes / 10) * 10, h = Math.floor(t / 60) % 24, m = t % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
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
  const steps = night.times.length - 1;
  const echoes = night.series.filter(Boolean).map(s => s.echo);
  const [low, high] = [Math.min(...echoes), Math.max(...echoes)];
  let g, base, project, pxPerKm, width, height;
  let dots = [], minutes = 0, hold = 0, last = null, frame = null, visible = false;

  // measured motion and echo at a moment of the night, straight-line between readings
  function reading(m) {
    const i = Math.min(steps - 1, Math.floor(m / 30)), f = m / 30 - i;
    const a = night.series[i], b = night.series[i + 1] || a;
    if (!a || !b) return null;
    const mix = k => a[k] + (b[k] - a[k]) * f;
    return { u: mix('u'), v: mix('v'), amount: (mix('echo') - low) / (high - low || 1) };
  }

  function resize() {
    width = container.clientWidth;
    height = Math.max(240, container.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    g = canvas.getContext('2d'); g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const [west, south, east, north] = BOUNDS, kx = Math.cos(((south + north) / 2) * Math.PI / 180);
    const scale = Math.min(width / ((east - west) * kx), height / (north - south));
    const ox = (width - (east - west) * kx * scale) / 2, oy = (height - (north - south) * scale) / 2;
    project = (lon, lat) => [ox + (lon - west) * kx * scale, oy + (north - lat) * scale];
    pxPerKm = scale / 111.2;
    base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
    const b = base.getContext('2d'); b.setTransform(ratio, 0, 0, ratio, 0, 0);
    b.fillStyle = colour('--land'); b.strokeStyle = colour('--land-edge');
    for (const ring of coast) {
      b.beginPath(); ring.forEach(([lon, lat], i) => b[i ? 'lineTo' : 'moveTo'](...project(lon, lat))); b.fill(); b.stroke();
    }
    const [rx, ry] = project(night.radar.lon, night.radar.lat);
    b.setLineDash([3, 4]); b.strokeStyle = colour('--muted'); b.globalAlpha = 0.5;
    b.beginPath(); b.arc(rx, ry, night.radar.rangeKm * pxPerKm, 0, 2 * Math.PI); b.stroke();
    b.setLineDash([]); b.globalAlpha = 1;
    b.font = `600 12px ${colour('--body')}`; b.fillStyle = colour('--ink');
    for (const p of night.places) {
      const [x, y] = project(p.lon, p.lat);
      b.beginPath(); b.arc(x, y, 2.5, 0, 2 * Math.PI); b.fill();
      b.textAlign = 'right'; b.fillText(p.name, x - 6, y + 4);
    }
    draw();
  }

  function step(dm) {
    const s = reading(minutes);
    if (s) {
      for (let n = Math.floor(s.amount * dm * 1.6 + Math.random()); n > 0; n--) {
        const a = Math.random() * 2 * Math.PI, d = night.radar.rangeKm * Math.sqrt(Math.random());
        dots.push({ x: d * Math.sin(a), y: d * Math.cos(a), age: 0, mark: 0, trail: [] });
      }
      for (const p of dots) {
        p.x += s.u * dm / 60; p.y += s.v * dm / 60; p.age += dm;
        if (!p.trail.length || p.age - p.mark >= 4) { p.trail.push([p.x, p.y]); p.mark = p.age; }
        else p.trail[p.trail.length - 1] = [p.x, p.y];
        if (p.trail.length > 30) p.trail.shift();
      }
    }
    dots = dots.filter(p => p.age < LIFE);
  }

  function draw() {
    if (!g) return;
    g.clearRect(0, 0, width, height);
    g.drawImage(base, 0, 0, width, height);
    const [rx, ry] = project(night.radar.lon, night.radar.lat);
    g.strokeStyle = g.fillStyle = colour('--moth'); g.lineWidth = 1.4; g.lineCap = 'round';
    for (const p of dots) {
      const fade = Math.min(1, (LIFE - p.age) / 60, p.age / 10);
      g.globalAlpha = fade * 0.7;
      g.beginPath();
      p.trail.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](rx + x * pxPerKm, ry - y * pxPerKm));
      g.stroke();
      const [hx, hy] = p.trail.at(-1) || [p.x, p.y];
      g.globalAlpha = fade;
      g.beginPath(); g.arc(rx + hx * pxPerKm, ry - hy * pxPerKm, 1.6, 0, 2 * Math.PI); g.fill();
    }
    g.globalAlpha = 1;
    timeText.textContent = clock(minutes);
    sunText.textContent = minutes < 20 ? 'sunset' : minutes > steps * 30 - 40 ? 'dawn' : 'night';
  }

  function tick(now) {
    const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (hold > 0) {
      hold -= dt;
      if (hold <= 0) { minutes = 0; dots = []; }
    } else {
      const dm = dt * steps * 30 / NIGHT_SECONDS;
      minutes = Math.min(steps * 30, minutes + dm);
      step(dm);
      if (minutes >= steps * 30) hold = HOLD_SECONDS;
    }
    draw();
    frame = visible ? requestAnimationFrame(tick) : null;
  }

  resize();
  return {
    update: () => `Animated map of the coast from Sydney to Port Stephens on the night of 9 to 10 October. Dots show the radar echo drifting south-west down the coast through the evening, then turning south-east out to sea before dawn.`,
    resize,
    // Start the night again each time the reader arrives
    pause: hidden => {
      const arriving = !visible && !hidden;
      visible = !hidden;
      if (arriving) { minutes = 0; dots = []; hold = 0; last = null; }
      if (visible && !frame) frame = requestAnimationFrame(tick);
    },
  };
}
