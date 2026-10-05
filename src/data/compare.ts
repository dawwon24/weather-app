import { fetchDailyUpToToday } from '../api/archive';
import { COMPARE_FIELDS, type CompareMetric } from './metrics';
import { dateRange, shiftYears, todayIso } from './dates';

type DayMap = Map<string, Record<string, number | null>>;

export interface PeriodComparison {
  dates: string[]; // current-period dates (x axis)
  current: (number | null)[];
  years: { offset: number; year: number; values: (number | null)[] }[];
  normal?: { mean: (number | null)[]; min: (number | null)[]; max: (number | null)[]; yearsUsed: number };
}

export const NORMAL_YEARS = 10;

/** Fetch everything needed for a period comparison in one archive span. */
export async function loadPeriodData(
  lat: number,
  lon: number,
  start: string,
  end: string,
  offsets: number[],
  withNormal: boolean,
): Promise<DayMap> {
  const maxBack = Math.max(withNormal ? NORMAL_YEARS : 0, ...offsets, 0);
  return fetchDailyUpToToday(lat, lon, shiftYears(start, -maxBack), end, COMPARE_FIELDS);
}

export function buildPeriodComparison(
  data: DayMap,
  start: string,
  end: string,
  metric: CompareMetric,
  offsets: number[],
  withNormal: boolean,
): PeriodComparison {
  const dates = dateRange(start, end);
  const get = (d: string) => data.get(d)?.[metric.field] ?? null;
  const today = todayIso();

  const result: PeriodComparison = {
    dates,
    current: dates.map((d) => (d > today ? null : get(d))),
    years: offsets.map((n) => ({
      offset: n,
      year: Number(start.slice(0, 4)) - n,
      // A shifted Feb 29 lands on Feb 28; skip it so that day isn't counted twice.
      values: dates.map((d) => (d.endsWith('02-29') && !shiftYears(d, -n).endsWith('02-29') ? null : get(shiftYears(d, -n)))),
    })),
  };

  if (withNormal) {
    const mean: (number | null)[] = [];
    const min: (number | null)[] = [];
    const max: (number | null)[] = [];
    let yearsUsed = 0;
    for (const d of dates) {
      const vals: number[] = [];
      for (let k = 1; k <= NORMAL_YEARS; k++) {
        const v = get(shiftYears(d, -k));
        if (v != null) vals.push(v);
      }
      yearsUsed = Math.max(yearsUsed, vals.length);
      if (vals.length) {
        mean.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        min.push(Math.min(...vals));
        max.push(Math.max(...vals));
      } else {
        mean.push(null);
        min.push(null);
        max.push(null);
      }
    }
    result.normal = { mean, min, max, yearsUsed };
  }
  return result;
}

/** Aggregate of a series over the days where both sides have values. */
export function pairedAggregate(
  a: (number | null)[],
  b: (number | null)[],
  how: 'mean' | 'sum',
): { a: number; b: number; n: number } | null {
  let sa = 0;
  let sb = 0;
  let n = 0;
  a.forEach((v, i) => {
    const w = b[i];
    if (v != null && w != null) {
      sa += v;
      sb += w;
      n++;
    }
  });
  if (!n) return null;
  return how === 'mean' ? { a: sa / n, b: sb / n, n } : { a: sa, b: sb, n };
}

// ---------- Monthly mode ----------

export interface MonthlyComparison {
  months: number[]; // 1..12
  years: { year: number; values: (number | null)[]; partialMonth?: number }[];
  /** Mean / min / max of the monthly values over the last NORMAL_YEARS complete years. */
  normal?: { mean: (number | null)[]; min: (number | null)[]; max: (number | null)[] };
}

export async function loadMonthlyData(lat: number, lon: number, years: number[], withNormal: boolean): Promise<DayMap> {
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const first = Math.min(...years, withNormal ? thisYear - NORMAL_YEARS : thisYear);
  return fetchDailyUpToToday(lat, lon, `${first}-01-01`, today, COMPARE_FIELDS);
}

function monthlyValues(data: DayMap, metric: CompareMetric, year: number, upToMonth = 12): (number | null)[] {
  const buckets = Array.from({ length: 12 }, () => [] as number[]);
  const prefix = `${year}-`;
  for (const [d, row] of data) {
    const v = row[metric.field];
    if (d.startsWith(prefix) && v != null) buckets[Number(d.slice(5, 7)) - 1].push(v);
  }
  return buckets.map((vals, i) => {
    if (i + 1 > upToMonth || !vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return metric.monthly === 'sum' ? sum : sum / vals.length;
  });
}

export function buildMonthlyComparison(
  data: DayMap,
  metric: CompareMetric,
  years: number[],
  withNormal: boolean,
): MonthlyComparison {
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  const result: MonthlyComparison = {
    months: Array.from({ length: 12 }, (_, i) => i + 1),
    years: years.map((year) => ({
      year,
      values: monthlyValues(data, metric, year, year === thisYear ? thisMonth : 12),
      partialMonth: year === thisYear ? thisMonth : undefined,
    })),
  };

  if (withNormal) {
    const perYear = Array.from({ length: NORMAL_YEARS }, (_, k) => monthlyValues(data, metric, thisYear - 1 - k));
    const mean: (number | null)[] = [];
    const min: (number | null)[] = [];
    const max: (number | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const vals = perYear.map((y) => y[i]).filter((v): v is number => v != null);
      mean.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      min.push(vals.length ? Math.min(...vals) : null);
      max.push(vals.length ? Math.max(...vals) : null);
    }
    result.normal = { mean, min, max };
  }
  return result;
}
