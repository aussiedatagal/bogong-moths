const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export function text(parent, str, attrs = {}) {
  const t = el('text', attrs, parent);
  if (attrs.fill) t.style.fill = attrs.fill;   // the stylesheet sets a default text fill
  t.textContent = str;
  return t;
}

// Fresh svg sized to its container, rebuilt on resize by the caller
export function frame(container) {
  container.innerHTML = '';
  const { width, height } = container.getBoundingClientRect();
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' }, container);
  return { svg, width, height };
}
