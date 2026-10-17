import { MIN_PHOTOS, per100 } from './share.js';

// The ranked table: the top areas by share, among those with enough moth photos
const TOP_AREAS = 15;
const TABLE_MIN = 100;

const areaFor = ([lon, lat], regions) => regions.find(r => r.lat === Math.round(lat) && r.lon === Math.round(lon));

function cells(r) {
  const before = r.baseMoths >= MIN_PHOTOS ? Math.round(per100(r.baseBogong, r.baseMoths) * 10) / 10 : 'too few';
  return `<td>${Math.round(per100(r.bogong, r.moths))}</td><td>${before}</td><td>${r.people}</td>`;
}

const label = r => (r.oneLogger ? `${r.name}*` : r.name);

function yourRow(code, area) {
  if (!area) return `<tr><th scope="row">${code}</th><td colspan="3">Not in the NSW postcode list</td></tr>`;
  const name = `${code}: ${label(area)}`;
  if (area.moths < MIN_PHOTOS) return `<tr><th scope="row">${name}</th><td colspan="3">Too few moth records to say</td></tr>`;
  return `<tr><th scope="row">${name}</th>${cells(area)}</tr>`;
}

function spoken(code, area, year) {
  if (!area) return `${code} isn't in the NSW postcode list this uses.`;
  if (area.moths < MIN_PHOTOS) return `${code}: too few moth records in this area to say.`;
  return `${code}, around ${area.name}: ${Math.round(per100(area.bogong, area.moths))} Bogongs per 100 moths in spring ${year}.`;
}

export function initLookup(postcodes, regions, year) {
  const input = document.getElementById('postcode-search');
  const out = document.getElementById('postcode-result');
  const yours = document.querySelector('#region-table .your-area');
  const ranked = document.querySelector('#region-table .ranked');
  document.querySelector('#region-table caption').textContent =
    `The ${TOP_AREAS} areas with the highest share, of those with at least ${TABLE_MIN} moths photographed in spring ${year}`;

  const top = regions
    .filter(r => r.moths >= TABLE_MIN)
    .sort((a, b) => per100(b.bogong, b.moths) - per100(a.bogong, a.moths))
    .slice(0, TOP_AREAS);
  ranked.innerHTML = top.map(r => `<tr><th scope="row">${label(r)}</th>${cells(r)}</tr>`).join('');

  input.addEventListener('input', () => {
    const code = input.value.trim();
    const area = code.length === 4 && postcodes[code] ? areaFor(postcodes[code], regions) : null;
    yours.hidden = code.length < 4;
    if (code.length < 4) out.textContent = '';
    else {
      yours.innerHTML = yourRow(code, area);
      out.textContent = spoken(code, area, year);
    }
    [...ranked.rows].forEach((row, i) => row.classList.toggle('mine', top[i] === area));
  });
}
