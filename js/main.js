import { watchSteps } from './scroller.js';
import * as migration from './graphics/migration.js';
import * as years from './graphics/years.js';
import { initLookup } from './lookup.js';

const load = name => fetch(`data/${name}.json`).then(r => r.json());

// The story has one sticky figure. Each step names the chart it shows
// (data-chart) and that chart's state (data-state).
const charts = {
  map: { chart: migration, data: ['states', 'sightings', 'basin', 'wind', 'surface', 'rain'] },
  bars: { chart: years, data: ['years', 'sightings'] },
};

async function start() {
  const files = {};
  for (const name of ['states', 'sightings', 'regions', 'basin', 'wind', 'surface', 'rain', 'years', 'postcodes']) files[name] = load(name);

  const section = document.getElementById('story');
  const desc = section.querySelector('.sticky .sr-only');
  const views = {};
  for (const graphic of section.querySelectorAll('.graphic')) {
    const { chart, data } = charts[graphic.dataset.chart];
    views[graphic.dataset.chart] = { graphic, view: chart.init(graphic, ...await Promise.all(data.map(d => files[d]))) };
  }

  let current = section.querySelector('.step');
  let said = '';
  const show = (step, progress) => {
    current = step;
    const { chart, state } = step.dataset;
    const { view } = views[chart];
    for (const [name, v] of Object.entries(views)) v.graphic.classList.toggle('is-shown', name === chart);
    const text = view.update(state) || '';
    if (`${chart}:${state}` !== said) desc.textContent = text;
    said = `${chart}:${state}`;
    if (progress !== undefined) step.classList.toggle('is-done', view.setProgress(progress));
  };
  show(current);
  watchSteps(section, show);

  for (const { graphic, view } of Object.values(views)) {
    let width = graphic.clientWidth;
    new ResizeObserver(() => {
      if (graphic.clientWidth === width) return;
      width = graphic.clientWidth;
      view.resize();
      said = '';
      show(current);
    }).observe(graphic);
  }

  const year = Number((await files.sightings).start.slice(0, 4));
  initLookup(await files.postcodes, await files.regions, year);
}

start();
