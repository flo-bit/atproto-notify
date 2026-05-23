/** Compact relative time, e.g. "now", "2m", "3h", "5d", "2w". Accepts ms or ISO. */
export function relativeTime(input: number | string): string {
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (Number.isNaN(ms)) {
    return '';
  }
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(day / 365)}y`;
}
