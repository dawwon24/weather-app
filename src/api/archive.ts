import { cachedJson, HOUR } from './cache';
import type { Series } from './forecast';
import { addDays, todayIso } from '../data/dates';

const BASE = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Historical daily data (ERA5 reanalysis, 1940 onward).
 * The model is pinned to ERA5: the default "best_match" switches to ECMWF IFS for
 * recent years, which would make older and newer years inconsistent.
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
    models: 'era5',
  });
  // Old data never changes; recent days might still be revised.
  const ttl = end < addDays(todayIso(), -10) ? 24 * HOUR : 2 * HOUR;
  const data = await cachedJson<{ daily: Series }>(`${BASE}?${params}`, ttl);
  return data.daily;
}
