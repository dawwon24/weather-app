import { cachedJson, HOUR } from './cache';
import { fetchRecentDaily, type Series } from './forecast';
import { addDays, daysBetween, todayIso } from '../data/dates';

const BASE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Historical daily data (ERA5 reanalysis, 1940 onward).
 * The model is pinned to ERA5: the default "best_match" switches to ECMWF IFS for
 * recent years, which biases year-over-year comparisons (humidity differs by 10%+).
 */
export async function fetchArchiveDaily(
  lat: number,
  lon: number,
  start: string,
  end: string,
  fields: string[],
): Promise<Series> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start,
    end_date: end,
    daily: fields.join(','),
    timezone: 'auto',
    wind_speed_unit: 'ms',
    models: 'era5',
  });
  // Old data never changes; recent days might still be revised.
  const ttl = end < addDays(todayIso(), -10) ? 24 * HOUR : 2 * HOUR;
  const data = await cachedJson<{ daily: Series }>(`${BASE}?${params}`, ttl);
  return data.daily;
}

/**
 * Daily data for a span that may reach today. The archive lags a few days and
 * sometimes returns nulls for the newest dates, so those are filled from the
 * forecast API's past_days.
 */
export async function fetchDailyUpToToday(
  lat: number,
  lon: number,
  start: string,
  end: string,
  fields: string[],
): Promise<Map<string, Record<string, number | null>>> {
  const today = todayIso();
  const clippedEnd = end > today ? today : end;
  const archiveP = fetchArchiveDaily(lat, lon, start, clippedEnd, fields);

  const recentFrom = start > addDays(today, -91) ? start : addDays(today, -91);
  const needRecent = clippedEnd >= addDays(today, -10);
  const recentP = needRecent
    ? fetchRecentDaily(lat, lon, fields, daysBetween(recentFrom, today) + 1).then((r) => r.daily)
    : Promise.resolve(null);

  const [archive, recent] = await Promise.all([archiveP, recentP.catch(() => null)]);
  const out = seriesToMap(archive, fields);
  if (recent) {
    const recentMap = seriesToMap(recent, fields);
    for (const [date, row] of recentMap) {
      if (date < start || date > clippedEnd) continue;
      const base = out.get(date) ?? {};
      for (const f of fields) {
        if (base[f] == null && row[f] != null) base[f] = row[f];
      }
      out.set(date, base);
    }
  }
  return out;
}

export function seriesToMap(s: Series, fields: string[]): Map<string, Record<string, number | null>> {
  const m = new Map<string, Record<string, number | null>>();
  s.time.forEach((t, i) => {
    const row: Record<string, number | null> = {};
    for (const f of fields) row[f] = s[f]?.[i] ?? null;
    m.set(t, row);
  });
  return m;
}
