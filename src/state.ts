import type { Place } from './data/korea-cities';
import { KOREA_CITIES } from './data/korea-cities';

export type RangeId = '2w' | '1m' | '3m';

export interface Settings {
  place: Place;
  favorites: Place[];
  range: RangeId;
  theme: 'auto' | 'light' | 'dark';
}

const KEY = 'weather-app:settings';
const seoul = KOREA_CITIES[0];

const defaults: Settings = {
  place: { name: seoul.name, detail: seoul.detail, lat: seoul.lat, lon: seoul.lon },
  favorites: [],
  range: '2w',
  theme: 'auto',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    // Keys from older versions (tab, forecastCharts) are simply ignored.
    const saved = JSON.parse(raw);
    const s = { ...defaults, ...saved };
    if (!['2w', '1m', '3m'].includes(s.range)) s.range = defaults.range;
    return s;
  } catch {
    return { ...defaults };
  }
}

export const settings: Settings = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}

export const samePlace = (a: Place, b: Place) => Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005;

type Listener = () => void;
const listeners = new Set<Listener>();
export const onPlaceChange = (fn: Listener) => listeners.add(fn);

export function setPlace(p: Place) {
  settings.place = p;
  save();
  listeners.forEach((fn) => fn());
}
