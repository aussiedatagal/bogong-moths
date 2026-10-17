import { el, text, frame } from '../svg.js';
import { per100 } from '../share.js';
import { dayLabel } from '../format.js';

// Only the last few years get a value label, the earlier ones are all near zero
const LABELLED = 3;

function shareLabel(v) {
  if (v === 0) return '0%';
  return v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

export function init(container, years, sightings) {
  let bars, title, plot;
  const heading = `Moths photographed around Sydney, ${dayLabel(sightings.start, 0)} to ${dayLabel(sightings.start, sightings.days - 1)}`;
  const labelled = years.slice(-LABELLED).map(y => y.year);

  function build() {
    const { svg, width, height } = frame(container);
    plot = { left: 4, right: width - 4, top: 62, bottom: height - 24 };
    title = text(svg, '', { x: plot.left, y: 18, class: 'chart-title' });
    el('rect', { x: plot.left, y: 30, width: 12, height: 12, class: 'bar' }, svg);
    text(svg, 'Bogongs', { x: plot.left + 18, y: 41, class: 'small' });
    el('rect', { x: plot.left + 90, y: 30, width: 12, height: 12, class: 'bar-total' }, svg);
    text(svg, 'Other moths', { x: plot.left + 108, y: 41, class: 'small' });
    const band = (plot.right - plot.left) / years.length;
    bars = years.map((y, i) => {
      const x = plot.left + i * band + band * 0.15;
      const w = band * 0.7;
      const g = el('g', { class: 'year' }, svg);
      const total = el('rect', { x, width: w, y: plot.bottom, height: 0, class: 'bar-total mark' }, g);
      const bogong = el('rect', { x, width: w, y: plot.bottom, height: 0, class: 'bar mark' }, g);
      const label = text(g, '', { x: x + w / 2, y: plot.bottom, 'text-anchor': 'middle', class: 'value' });
      text(g, String(y.year), { x: x + w / 2, y: plot.bottom + 16, 'text-anchor': 'middle', class: 'muted small' });
      return { y, total, bogong, label };
    });
  }

  function setBar(rect, h) {
    rect.setAttribute('y', plot.bottom - h);
    rect.setAttribute('height', h);
  }

  // Every year fills the full height, so the gold slice is the Bogong share
  function update() {
    const full = plot.bottom - plot.top;
    title.textContent = heading;
    for (const b of bars) {
      const { bogong, moths } = b.y;
      const gold = (full * bogong) / moths;
      setBar(b.total, full);
      setBar(b.bogong, gold);
      b.label.setAttribute('y', plot.bottom - gold - 5);
      b.label.textContent = labelled.includes(b.y.year) ? shareLabel(per100(bogong, moths)) : '';
    }
    const [y25, y26] = years.slice(-2);
    return `Bar chart where each spring's moths photographed around Sydney fill the full height, with Bogongs as a slice. ${y26.year} is ${shareLabel(per100(y26.bogong, y26.moths))}, ${y25.year} was ${shareLabel(per100(y25.bogong, y25.moths))}.`;
  }

  build();
  return { update, resize: build };
}
