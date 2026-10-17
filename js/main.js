import { watchSteps } from './scroller.js';
import * as migration from './graphics/migration.js';
import * as years from './graphics/years.js';
import { initLookup } from './lookup.js';

const load = name => fetch(`data/${name}.json`).then(r => r.json());

const sections = [
  { id: 'sightings', chart: migration, data: ['states', 'sightings', 'basin', 'wind', 'surface', 'rain'] },
  { id: 'years', chart: years, data: ['years', 'sightings'] },
  { id: 'map', chart: migration, data: ['states', 'sightings', 'basin', 'wind', 'surface', 'rain'] },
];

async function start() {
  const files = {};
  for (const name of ['states', 'sightings', 'regions', 'basin', 'wind', 'surface', 'rain', 'years', 'postcodes']) files[name] = load(name);

  for (const { id, chart, data } of sections) {
    const section = document.getElementById(id);
    const graphic = section.querySelector('.graphic');
    const desc = section.querySelector('.sticky .sr-only');
    const args = await Promise.all(data.map(d => files[d]));
    const view = chart.init(graphic, ...args);
    let state = section.querySelector('.step').dataset.state;
    const show = (s, progress) => {
      if (s !== state || !desc.textContent) desc.textContent = view.update(s) || '';
      else view.update(s);
      state = s;
      section.dataset.state = s;
      if (progress === undefined) return;
      const done = view.setProgress(progress);
      section.querySelector('.step[data-scrub]').classList.toggle('is-done', done);
    };
    show(state);
    watchSteps(section, show);
    let width = graphic.clientWidth;
    new ResizeObserver(() => {
      if (graphic.clientWidth === width) return;
      width = graphic.clientWidth;
      view.resize();
      show(state);
    }).observe(graphic);
  }

  const year = Number((await files.sightings).start.slice(0, 4));
  initLookup(await files.postcodes, await files.regions, year);
}

start();
