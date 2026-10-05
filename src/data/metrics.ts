// Single source of truth for every metric the app can chart.
// Adding a metric here makes it available in the forecast and comparison views.

export type ChartKind = 'line' | 'bar';

/** One series inside a forecast chart (same unit as its siblings — no dual axes). */
export interface SeriesDef {
  field: string; // Open-Meteo hourly/daily field name
  label: string;
}

/** Forecast chart: a group of same-unit series drawn on one axis. */
export interface ForecastChartDef {
  id: string;
  title: string;
  unit: string;
  kind: ChartKind;
  hourly: SeriesDef[];
  daily: SeriesDef[];
  min?: number;
  max?: number;
  defaultOn: boolean;
  decimals: number;
}

export const FORECAST_CHARTS: ForecastChartDef[] = [
  {
    id: 'temp',
    title: '기온',
    unit: '℃',
    kind: 'line',
    hourly: [
      { field: 'temperature_2m', label: '기온' },
      { field: 'apparent_temperature', label: '체감온도' },
    ],
    daily: [
      { field: 'temperature_2m_max', label: '최고' },
      { field: 'temperature_2m_min', label: '최저' },
    ],
    defaultOn: true,
    decimals: 1,
  },
  {
    id: 'humidity',
    title: '습도',
    unit: '%',
    kind: 'line',
    hourly: [{ field: 'relative_humidity_2m', label: '상대습도' }],
    daily: [{ field: 'relative_humidity_2m_mean', label: '평균 습도' }],
    min: 0,
    max: 100,
    defaultOn: true,
    decimals: 0,
  },
  {
    id: 'precip',
    title: '강수량',
    unit: 'mm',
    kind: 'bar',
    hourly: [{ field: 'precipitation', label: '강수량' }],
    daily: [{ field: 'precipitation_sum', label: '강수 합계' }],
    min: 0,
    defaultOn: true,
    decimals: 1,
  },
  {
    id: 'pop',
    title: '강수확률',
    unit: '%',
    kind: 'line',
    hourly: [{ field: 'precipitation_probability', label: '강수확률' }],
    daily: [{ field: 'precipitation_probability_max', label: '최대 강수확률' }],
    min: 0,
    max: 100,
    defaultOn: false,
    decimals: 0,
  },
  {
    id: 'dew',
    title: '이슬점',
    unit: '℃',
    kind: 'line',
    hourly: [{ field: 'dew_point_2m', label: '이슬점' }],
    daily: [{ field: 'dew_point_2m_mean', label: '평균 이슬점' }],
    defaultOn: false,
    decimals: 1,
  },
  {
    id: 'wind',
    title: '바람',
    unit: 'm/s',
    kind: 'line',
    hourly: [
      { field: 'wind_speed_10m', label: '풍속' },
      { field: 'wind_gusts_10m', label: '돌풍' },
    ],
    daily: [
      { field: 'wind_speed_10m_max', label: '최대 풍속' },
      { field: 'wind_gusts_10m_max', label: '최대 돌풍' },
    ],
    min: 0,
    defaultOn: false,
    decimals: 1,
  },
  {
    id: 'pressure',
    title: '해면기압',
    unit: 'hPa',
    kind: 'line',
    hourly: [{ field: 'pressure_msl', label: '기압' }],
    daily: [{ field: 'pressure_msl_mean', label: '평균 기압' }],
    defaultOn: false,
    decimals: 0,
  },
  {
    id: 'cloud',
    title: '운량',
    unit: '%',
    kind: 'line',
    hourly: [{ field: 'cloud_cover', label: '운량' }],
    daily: [{ field: 'cloud_cover_mean', label: '평균 운량' }],
    min: 0,
    max: 100,
    defaultOn: false,
    decimals: 0,
  },
  {
    id: 'uv',
    title: '자외선 지수',
    unit: '',
    kind: 'line',
    hourly: [{ field: 'uv_index', label: '자외선' }],
    daily: [{ field: 'uv_index_max', label: '최대 자외선' }],
    min: 0,
    defaultOn: false,
    decimals: 1,
  },
];

export const HOURLY_FIELDS = [...new Set(FORECAST_CHARTS.flatMap((c) => c.hourly.map((s) => s.field)))];
export const DAILY_FORECAST_FIELDS = [
  'weather_code',
  'sunrise',
  'sunset',
  ...new Set(FORECAST_CHARTS.flatMap((c) => c.daily.map((s) => s.field))),
];

/** Daily metric used by the past-comparison view (available in both archive & forecast APIs). */
export interface CompareMetric {
  field: string;
  label: string;
  unit: string;
  decimals: number;
  /** How daily values roll up into a month. */
  monthly: 'mean' | 'sum';
  /** Wording for "higher" / "lower" in the summary. */
  more: string;
  less: string;
}

export const COMPARE_METRICS: CompareMetric[] = [
  { field: 'temperature_2m_mean', label: '평균 기온', unit: '℃', decimals: 1, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'temperature_2m_max', label: '최고 기온', unit: '℃', decimals: 1, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'temperature_2m_min', label: '최저 기온', unit: '℃', decimals: 1, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'relative_humidity_2m_mean', label: '평균 습도', unit: '%', decimals: 0, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'dew_point_2m_mean', label: '평균 이슬점', unit: '℃', decimals: 1, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'precipitation_sum', label: '강수량', unit: 'mm', decimals: 1, monthly: 'sum', more: '많음', less: '적음' },
  { field: 'wind_speed_10m_max', label: '최대 풍속', unit: 'm/s', decimals: 1, monthly: 'mean', more: '강함', less: '약함' },
  { field: 'pressure_msl_mean', label: '평균 기압', unit: 'hPa', decimals: 1, monthly: 'mean', more: '높음', less: '낮음' },
  { field: 'cloud_cover_mean', label: '평균 운량', unit: '%', decimals: 0, monthly: 'mean', more: '많음', less: '적음' },
];

export const COMPARE_FIELDS = COMPARE_METRICS.map((m) => m.field);
