const fmt = new Intl.NumberFormat('en-AU');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const num = n => fmt.format(n);

// built by hand because browsers disagree on short month names ("Sep" or "Sept")
export function dayLabel(start, offset) {
  const d = new Date(start + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
