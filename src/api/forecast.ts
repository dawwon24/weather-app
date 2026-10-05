import { cachedJson, MINUTE } from './cache';
import { DAILY_FORECAST_FIELDS, HOURLY_FIELDS } from '../data/metrics';

const BASE = 'https://api.open-meteo.com/v1/forecast';

export type Series = Record<string, (number | null)[]> & { time: string[] };

export interface Current {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  weather_code: number;
  cloud_cover: number;
  pressure_msl: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  uv_index: number;
  dew_point_2m: number;
}

export interface ForecastResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  utc_offset_seconds: number;
  current: Current;
  hourly: Series;
  daily: Series & { sunrise: string[]; sunset: string[] };
}

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'dew_point_2m',
];

const round = (n: number) => n.toFixed(4);

export function fetchForecast(lat: number, lon: number): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    latitude: round(lat),
    longitude: round(lon),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FORECAST_FIELDS.join(','),
    timezone: 'auto',
    forecast_days: '8',
    wind_speed_unit: 'ms',
  });
  return cachedJson<ForecastResponse>(`${BASE}?${params}`, 10 * MINUTE);
}

/** Recent past days from the forecast API — fills the gap the archive may not cover yet. */
export function fetchRecentDaily(lat: number, lon: number, fields: string[], pastDays: number) {
  const params = new URLSearchParams({
    latitude: round(lat),
    longitude: round(lon),
    daily: fields.join(','),
    timezone: 'auto',
    past_days: String(Math.min(92, Math.max(1, pastDays))),
    forecast_days: '1',
    wind_speed_unit: 'ms',
  });
  return cachedJson<{ daily: Series }>(`${BASE}?${params}`, 30 * MINUTE);
}

export interface PointNow {
  temperature_2m: number;
  relative_humidity_2m: number;
  weather_code: number;
  is_day: number;
}

/** Current conditions for many points in one request (the API accepts comma-separated coordinates). */
export async function fetchManyCurrent(points: { lat: number; lon: number }[]): Promise<PointNow[]> {
  const params = new URLSearchParams({
    latitude: points.map((p) => round(p.lat)).join(','),
    longitude: points.map((p) => round(p.lon)).join(','),
    current: 'temperature_2m,relative_humidity_2m,weather_code,is_day',
    timezone: 'auto',
  });
  const data = await cachedJson<{ current: PointNow }[] | { current: PointNow }>(`${BASE}?${params}`, 10 * MINUTE);
  return (Array.isArray(data) ? data : [data]).map((d) => d.current);
}
