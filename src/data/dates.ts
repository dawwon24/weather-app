// Calendar helpers on ISO date strings (YYYY-MM-DD), computed in UTC to avoid DST drift.

const toDate = (iso: string) => new Date(iso + 'T00:00:00Z');
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function todayIso(): string {
  const d = new Date();
  const local = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return toIso(local);
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Same month-day `n` years earlier; Feb 29 maps to Feb 28 in non-leap years. */
export function shiftYears(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4)) + n;
  let md = iso.slice(5);
  if (md === '02-29' && !isLeap(y)) md = '02-28';
  return `${String(y).padStart(4, '0')}-${md}`;
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function shortLabel(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekday(iso: string): string {
  return WEEKDAYS[toDate(iso).getUTCDay()];
}
