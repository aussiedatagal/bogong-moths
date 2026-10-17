import { el, text, frame } from '../svg.js';
import { projection, pathData } from '../geo.js';
import { num, dayLabel } from '../format.js';
import { initWindflow } from './windflow.js';
import { drawSurface, colour, LEGEND, rainColour, RAIN_LEGEND } from './surface.js';

const EXTENT = [138.5, -39.4, 154.2, -26.2];
const STRIP = 50;
// Close-up on south-east NSW for the share steps: centre and how far to zoom in
const ZOOM = { at: [150.2, -34.6], k: 2.4 };

const CITIES = [
  { name: 'Sydney', at: [151.21, -33.87], dx: 8, anchor: 'start' },
  { name: 'Canberra', at: [149.13, -35.28], dx: 8, anchor: 'start' },
  { name: 'Melbourne', at: [144.96, -37.81], dx: -8, anchor: 'end' },
  { name: 'Brisbane', at: [153.03, -27.47], dx: -8, anchor: 'end' },
];
const ALPS = [148.3, -36.45];
const NOTES = [
  { name: 'Blue Mountains', at: [150.3, -33.7], dx: -8, anchor: 'end' },
  { name: 'Wollongong', at: [150.89, -34.42], dx: 8, anchor: 'start' },
  { name: 'Nowra', at: [150.6, -34.88], dx: 8, anchor: 'start' },
  { name: 'Batemans Bay', at: [150.18, -35.71], dx: 8, anchor: 'start' },
];

const STATES = {
  route: { basin: true },
  replay: { replay: true },
  share: { surface: true, zoom: true },
  rain: { rain: true, outline: true },
  wind: { surface: true, wind: true },
};

// Day by which half the season's sightings had come in
function halfwayDay(daily) {
  const half = daily.reduce((a, b) => a + b, 0) / 2;
  let seen = 0;
  return daily.findIndex(n => (seen += n) >= half);
}

// Each map on the page needs its own clip path ids
let maps = 0;

const countBy = values => values.reduce((n, v) => ({ ...n, [v]: (n[v] || 0) + 1 }), {});

export function init(container, states, sightings, basin, wind, surface, rain) {
  const uid = ++maps;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const year = sightings.start.slice(0, 4);
  const windNights = `${dayLabel(wind.nights[0], 0)} to ${dayLabel(wind.nights[1], 0)}`;
  const halfway = halfwayDay(sightings.daily);
  let zoomed, place, rainLayer, svg, labels, counter, strip, marker, dots, bars, basinPath, shareLayer, flow, project, width, mapHeight;
  let time = 0;
  let drawn = {};

  function build() {
    ({ svg, width } = frame(container));
    mapHeight = svg.viewBox.baseVal.height - STRIP;
    project = projection(EXTENT, width, mapHeight);

    const defs = el('defs', {}, svg);
    const clip = el('clipPath', { id: `map-clip-${uid}` }, defs);
    el('rect', { width, height: mapHeight }, clip);
    const landClip = el('clipPath', { id: `land-clip-${uid}` }, defs);
    for (const s of states) el('path', { d: pathData(s.geometry, project) }, landClip);
    el('path', { d: pathData(basin, project) }, el('clipPath', { id: `basin-clip-${uid}` }, defs));
    const head = el('marker', { id: `arrow-${uid}`, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
    el('path', { d: 'M0,0L10,5L0,10Z', class: 'arrow-head' }, head);

    zoomed = el('g', { class: 'zoom' }, el('g', { 'clip-path': `url(#map-clip-${uid})` }, svg));
    for (const s of states) el('path', { d: pathData(s.geometry, project), class: 'land' }, zoomed);
    // layers start hidden and update() fades in the ones the step needs
    basinPath = el('path', { d: pathData(basin, project), class: 'basin off' }, zoomed);
    shareLayer = drawSurface(zoomed, surface, project, { cls: 'surface off', clip: `land-clip-${uid}` });
    rainLayer = drawSurface(zoomed, rain, project, { paint: rainColour, fade: w => 0.9 * w, cls: 'rain off', clip: `basin-clip-${uid}` });
    dots = null;

    labels = el('g', { class: 'labels' }, svg);
    counter = el('g', { class: 'counter' }, svg);
    counter.date = text(counter, '', { x: 8, y: 30, class: 'counter-date' });
    counter.count = text(counter, '', { x: 8, y: 50, class: 'counter-count' });

    strip = el('g', { class: 'strip', transform: `translate(0,${mapHeight + 6})` }, svg);
    bars = buildStrip(strip);
    flow?.remove();
    flow = initWindflow(container, wind, project, width, mapHeight);
    flow.setField(wind.surge);
    drawn = {};
  }

  // Only the replay map gets the thousands of dots
  function drawDots() {
    dots = sightings.points.map(([lon, lat, day]) => {
      const [x, y] = project([lon, lat]);
      return el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.6, class: 'sighting', 'data-day': day }, zoomed);
    });
    spreadThroughDays(dots);
  }

  function buildStrip(g) {
    const max = Math.max(...sightings.daily);
    const h = STRIP - 22;
    const bw = (width - 8) / sightings.days;
    const out = sightings.daily.map((n, i) => {
      const bh = (n / max) * h;
      return el('rect', { x: 4 + i * bw, y: h - bh, width: Math.max(bw - 1, 1), height: bh, class: 'day', 'data-day': i }, g);
    });
    text(g, dayLabel(sightings.start, 0), { x: 4, y: h + 14, class: 'muted small' });
    text(g, dayLabel(sightings.start, sightings.days - 1), { x: width - 4, y: h + 14, 'text-anchor': 'end', class: 'muted small' });
    text(g, 'Sightings per day', { x: width / 2, y: h + 14, 'text-anchor': 'middle', class: 'muted small' });
    marker = el('line', { x1: 0, x2: 0, y1: -4, y2: h + 2, class: 'today' }, g);
    marker.step = bw;
    return out;
  }

  function drawLabels(cfg) {
    labels.innerHTML = '';
    // zoomed in, some cities fall off the map
    const onMap = ([x, y]) => x >= 0 && x <= width && y >= 0 && y <= mapHeight;
    for (const c of CITIES) {
      const [x, y] = place(c.at);
      if (!onMap([x, y])) continue;
      el('circle', { cx: x, cy: y, r: 3, class: 'city' }, labels);
      text(labels, c.name, { x: x + c.dx, y: y + 4, 'text-anchor': c.anchor, class: 'place' });
    }
    const [ax, ay] = place(ALPS);
    el('path', { d: `M${ax - 7},${ay + 5}L${ax},${ay - 7}L${ax + 7},${ay + 5}Z`, class: 'alps' }, labels);
    text(labels, 'Snowy', { x: ax - 10, y: ay - 6, 'text-anchor': 'end', class: 'place' });
    text(labels, 'Mountains', { x: ax - 10, y: ay + 9, 'text-anchor': 'end', class: 'place' });
    if (cfg.basin) {
      el('rect', { x: 8, y: 12, width: 16, height: 12, class: 'basin' }, labels);
      text(labels, 'Main breeding area:', { x: 30, y: 23, class: 'place key-title' });
      text(labels, 'the Murray-Darling Basin', { x: 30, y: 40, class: 'place' });
      const [bx, by] = place([145.4, -31.4]);
      text(labels, 'Breeding area', { x: bx, y: by, 'text-anchor': 'middle', class: 'place area-label' });
      const [sx, sy] = place([147.2, -32.6]);
      el('path', { d: `M${sx},${sy}Q${sx - 10},${(sy + ay) / 2} ${ax - 4},${ay - 12}`, class: 'route', 'marker-end': `url(#arrow-${uid})` }, labels);
    }
    if (cfg.surface) {
      for (const c of cfg.notes || cfg.zoom || width >= 500 ? NOTES : []) {
        const [x, y] = place(c.at);
        el('circle', { cx: x, cy: y, r: 2.5, class: 'city' }, labels);
        text(labels, c.name, { x: x + c.dx, y: y + 4, 'text-anchor': c.anchor, class: 'place small' });
      }
      text(labels, 'Bogongs per 100 moths,', { x: 8, y: 24, class: 'place' });
      text(labels, `spring ${year} so far`, { x: 8, y: 40, class: 'place' });
      drawLegend(el('g', { transform: `translate(4,${mapHeight + 10})` }, labels), LEGEND, colour, v => (v === 40 ? '40+' : String(v)), 'Faint: few photos');
    }
    if (cfg.rain) {
      text(labels, 'Autumn and winter rain over', { x: 8, y: 24, class: 'place' });
      text(labels, 'the breeding area, % of average', { x: 8, y: 40, class: 'place' });
      drawLegend(el('g', { transform: `translate(4,${mapHeight + 10})` }, labels), RAIN_LEGEND, rainColour, v => (v === 75 ? '' : v === 200 ? '200%+' : `${v}%`), 'Outline: breeding area');
    }
    if (cfg.wind) {
      text(labels, 'Blue: night wind about 1.5 km up,', { x: 8, y: 60, class: 'place wind-note' });
      text(labels, windNights, { x: 8, y: 76, class: 'place wind-note' });
    }
  }

  function setZoom(on) {
    const [cx, cy] = project(ZOOM.at);
    const k = on ? ZOOM.k : 1;
    const tx = on ? width / 2 - cx * k : 0;
    const ty = on ? mapHeight / 2 - cy * k : 0;
    zoomed.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    place = ll => project(ll).map((v, i) => v * k + (i ? ty : tx));
  }

  function drawLegend(g, stops, paint, label, note) {
    const w = Math.min(220, width - 140);
    const [lo, hi] = [stops[0], stops.at(-1)];
    const id = `ramp-${lo}-${uid}`;
    const grad = el('linearGradient', { id }, el('defs', {}, g));
    for (const v of stops) el('stop', { offset: (v - lo) / (hi - lo), 'stop-color': `rgb(${paint(v)})` }, grad);
    el('rect', { width: w, height: 10, fill: `url(#${id})` }, g);
    for (const v of stops) {
      text(g, label(v), { x: (w * (v - lo)) / (hi - lo), y: 26, 'text-anchor': v === lo ? 'start' : v === hi ? 'end' : 'middle', class: 'muted small' });
    }
    text(g, note, { x: w + 10, y: 9, class: 'muted small' });
  }

  // Give each dot its own moment within its day, so scrolling adds them one
  // at a time instead of a day at once. Sorted by that moment for showTime.
  function spreadThroughDays(list) {
    const perDay = countBy(list.map(d => +d.dataset.day));
    const seen = {};
    for (const d of list) {
      const day = +d.dataset.day;
      seen[day] = (seen[day] || 0) + 1;
      d.at = day + seen[day] / (perDay[day] + 1);
    }
    list.sort((a, b) => a.at - b.at);
  }

  function showTime() {
    if (drawn.shown === undefined) {
      for (const d of dots) d.classList.add('off');
      drawn.shown = 0;
    }
    let shown = drawn.shown;
    while (shown < dots.length && dots[shown].at <= time) dots[shown++].classList.remove('off');
    while (shown > 0 && dots[shown - 1].at > time) dots[--shown].classList.add('off');
    drawn.shown = shown;

    const day = Math.min(Math.floor(time), sightings.days - 1);
    for (const b of bars) b.classList.toggle('dim', +b.dataset.day > day);
    counter.date.textContent = dayLabel(sightings.start, day);
    const x = 4 + time * marker.step;
    marker.setAttribute('x1', x);
    marker.setAttribute('x2', x);
    counter.count.textContent = `${num(shown)} sighting${shown === 1 ? '' : 's'} so far`;
  }

  function update(state) {
    const cfg = STATES[state] || STATES.route;
    if (drawn.state !== state) {
      basinPath.classList.toggle('off', !cfg.basin && !cfg.outline);
      basinPath.classList.toggle('outline', !!cfg.outline);
      shareLayer.classList.toggle('off', !cfg.surface);
      rainLayer.classList.toggle('off', !cfg.rain);
      if (cfg.replay && !dots) drawDots();
      strip.classList.toggle('off', !cfg.replay);
      counter.classList.toggle('off', !cfg.replay);
      if (cfg.wind) flow.start(still);
      else flow.stop();
      setZoom(cfg.zoom);
      drawLabels(cfg);
      drawn = { state };
    }
    if (cfg.replay) showTime();

    if (cfg.basin) return 'Map of south-east Australia. The Murray-Darling Basin is shaded as the main breeding area, with an arrow to the Snowy Mountains.';
    if (cfg.replay) return `Map of Bogong sightings that moves through the days from 1 September as you scroll. By ${dayLabel(sightings.start, sightings.days - 1)} there were ${num(dots.length)}, most after ${dayLabel(sightings.start, halfway)} and most where people live.`;
    const share = `Smoothed map of Bogongs per 100 moths in spring ${year}, brightest in the Blue Mountains and the Illawarra, with Sydney and the NSW South Coast close behind. Areas with few photos are faint.`;
    if (cfg.rain) return `Map of autumn and winter rain over the Bogong breeding area in ${year} as a share of the 2010 to 2025 average, mostly above average and up to about double in places.`;
    return cfg.wind ? `${share} Blue streaks show the night wind about 1.5 km up from ${windNights}.` : share;
  }

  // Returns true once the replay has reached the last day
  function setProgress(p) {
    time = p * sightings.days;
    if (STATES[drawn.state]?.replay) showTime();
    return time >= sightings.days - 1;
  }

  // Off screen the wind stops animating
  function pause(off) {
    if (!STATES[drawn.state]?.wind) return;
    if (off) flow.stop();
    else flow.start(still);
  }

  build();
  return { update, setProgress, pause, resize: build };
}
