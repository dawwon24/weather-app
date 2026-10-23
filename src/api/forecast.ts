import { cachedJson, MINUTE } from './cache';

const BASE = 'https://api.open-meteo.com/v1/forecast';

export type Series = Record<string, (number | null)[]> & { time: string[] };

export interface Current {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  weather_code: number;
}

export interface ForecastResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  utc_offset_seconds: number;
  current: Current;
  daily: Series;
}

const CURRENT_FIELDS = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code'];

export const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'relative_humidity_2m_mean',
  'precipitation_probability_max',
];

/** Longest look-back the UI offers; one request covers every range. */
export const PAST_DAYS = 83;
/** Days after today. */
export const FUTURE_DAYS = 7;

const round = (n: number) => n.toFixed(4);

/**
 * Current conditions plus one continuous daily series: PAST_DAYS of recent past
 * (model analysis close to observations), today, and FUTURE_DAYS of forecast.
 */
export function fetchForecast(lat: number, lon: number): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    latitude: round(lat),
    longitude: round(lon),
    current: CURRENT_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    timezone: 'auto',
    past_days: String(PAST_DAYS),
    forecast_days: String(FUTURE_DAYS + 1),
  });
  return cachedJson<ForecastResponse>(`${BASE}?${params}`, 10 * MINUTE);
}
