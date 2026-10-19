// Plain equirectangular projection, squashed by cos(latitude) so south-east
// Australia keeps its shape. Good enough at this scale.
export function projection([west, south, east, north], width, height, pad = 12) {
  const k = Math.cos(((south + north) / 2) * Math.PI / 180);
  const scale = Math.min((width - pad * 2) / ((east - west) * k), (height - pad * 2) / (north - south));
  const x0 = (width - (east - west) * k * scale) / 2;
  const y0 = (height - (north - south) * scale) / 2;
  const project = ([lon, lat]) => [x0 + (lon - west) * k * scale, y0 + (north - lat) * scale];
  project.invert = ([x, y]) => [west + (x - x0) / (k * scale), north - (y - y0) / scale];
  project.scale = scale;
  return project;
}

export function pathData(geometry, project) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.map(rings => rings.map(ring =>
    'M' + ring.map(p => project(p).map(v => v.toFixed(1)).join(',')).join('L') + 'Z'
  ).join('')).join('');
}
