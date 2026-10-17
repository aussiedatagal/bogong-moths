import { watchScrub } from './scroller.js';
import * as migration from './graphics/migration.js';
import * as years from './graphics/years.js';
import { initLookup } from './lookup.js';

const load = name => fetch(`data/${name}.json`).then(r => r.json());

// Each graphic names its chart (data-chart) and what that chart shows
// (data-state). The replay is scrubbed by scrolling, the rest stay put.
const charts = {
  map: { chart: migration, data: ['states', 'sightings', 'basin', 'wind', 'surface', 'rain'] },
  bars: { chart: years, data: ['years', 'sightings'] },
};

function describe(graphic, text) {
  graphic.querySelector('svg')?.setAttribute('aria-label', text || '');
}

async function start() {
  const files = {};
  for (const name of ['states', 'sightings', 'regions', 'basin', 'wind', 'surface', 'rain', 'years', 'postcodes']) files[name] = load(name);

  const replay = document.getElementById('replay');
  let progress = 0;
  const views = [];
  // Draw one chart at a time and let the browser paint in between, so the
  // first map shows as soon as it's ready instead of after all six
  for (const graphic of document.querySelectorAll('.graphic')) {
    const { chart, data } = charts[graphic.dataset.chart];
    const view = chart.init(graphic, ...await Promise.all(data.map(d => files[d])));
    const show = () => describe(graphic, view.update(graphic.dataset.state));
    show();
    views.push({ graphic, view, show });
    if (replay.contains(graphic)) {
      watchScrub(replay, p => {
        progress = p;
        replay.classList.toggle('is-done', view.setProgress(p));
      });
    }
    await new Promise(r => setTimeout(r));
  }

  const scrubbed = views.find(v => replay.contains(v.graphic));

  // only animate the charts that are on screen
  const seen = new IntersectionObserver(entries => {
    for (const e of entries) views.find(v => v.graphic === e.target).view.pause?.(!e.isIntersecting);
  });

  for (const v of views) {
    seen.observe(v.graphic);
    // the height moves too once the web font changes the card's size
    let size = `${v.graphic.clientWidth}x${v.graphic.clientHeight}`;
    new ResizeObserver(() => {
      const now = `${v.graphic.clientWidth}x${v.graphic.clientHeight}`;
      if (now === size) return;
      size = now;
      v.view.resize();
      v.show();
      if (v === scrubbed) v.view.setProgress(progress);
    }).observe(v.graphic);
  }

  const year = Number((await files.sightings).start.slice(0, 4));
  initLookup(await files.postcodes, await files.regions, year);
}

start();
