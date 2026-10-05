import type { Place } from './data/korea-cities';
import { KOREA_CITIES } from './data/korea-cities';

export type Tab = 'forecast' | 'compare' | 'korea';

export interface Settings {
  place: Place;
  favorites: Place[];
  tab: Tab;
  forecastCharts: string[] | null; // null = defaults
  theme: 'auto' | 'light' | 'dark';
}

const KEY = 'weather-app:settings';
const seoul = KOREA_CITIES[0];

const defaults: Settings = {
  place: { name: seoul.name, detail: seoul.detail, lat: seoul.lat, lon: seoul.lon },
  favorites: [],
  tab: 'forecast',
  forecastCharts: null,
  theme: 'auto',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
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
