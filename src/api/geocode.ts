import { cachedJson, HOUR } from './cache';
import { KOREA_CITIES, type Place } from '../data/korea-cities';

const OM_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

const HANGUL = /[가-힣]/;

// Nominatim's usage policy: at most 1 request per second.
let lastNominatim = 0;
async function nominatimJson<T>(url: string): Promise<T> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  return cachedJson<T>(url, 24 * HOUR, { headers: { Accept: 'application/json' } });
}

interface OmResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
}

async function searchOpenMeteo(q: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: q, count: '8', language: 'ko', format: 'json' });
  const data = await cachedJson<{ results?: OmResult[] }>(`${OM_GEO}?${params}`, 24 * HOUR);
  return (data.results ?? []).map((r) => ({
    name: r.admin3 && r.country === '대한민국' ? r.admin3 : r.name,
    detail: [r.admin1, r.admin2, r.country].filter(Boolean).join(' '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

interface NomAddress {
  country?: string;
  province?: string;
  state?: string;
  city?: string;
  county?: string;
  town?: string;
  borough?: string;
  city_district?: string;
  district?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  village?: string;
}

interface NomResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NomAddress;
}

function nomDetail(a: NomAddress | undefined, exclude: string): string {
  if (!a) return '';
  const parts = [a.province ?? a.state, a.city ?? a.county ?? a.town, a.borough ?? a.city_district ?? a.district];
  return [...new Set(parts.filter((p): p is string => !!p && p !== exclude))].join(' ');
}

async function searchNominatim(q: string): Promise<Place[]> {
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    'accept-language': 'ko',
    addressdetails: '1',
    limit: '8',
  });
  const data = await nominatimJson<NomResult[]>(`${NOMINATIM}/search?${params}`);
  return data.map((r) => {
    const name = r.name || r.display_name.split(',')[0];
    return { name, detail: nomDetail(r.address, name) || r.display_name, lat: Number(r.lat), lon: Number(r.lon) };
  });
}

/** Instant matches from the built-in city list (no network). */
export function localMatches(q: string): Place[] {
  const t = q.trim();
  if (!t) return [];
  return KOREA_CITIES.filter((c) => c.name.startsWith(t) || c.short.startsWith(t)).map(({ name, detail, lat, lon }) => ({
    name,
    detail,
    lat,
    lon,
  }));
}

/**
 * Search places. Korean neighborhood names (동/읍/면) are matched better by
 * OpenStreetMap, so Hangul queries prefer Nominatim; Open-Meteo covers the rest.
 */
export async function searchPlaces(q: string): Promise<Place[]> {
  const t = q.trim();
  if (t.length < 1) return [];
  const sources = HANGUL.test(t) ? [searchNominatim(t), searchOpenMeteo(t)] : [searchOpenMeteo(t), searchNominatim(t)];
  const settled = await Promise.allSettled(sources);
  const all = [...localMatches(t)];
  for (const s of settled) if (s.status === 'fulfilled') all.push(...s.value);
  if (all.length === 0 && settled.every((s) => s.status === 'rejected')) {
    throw new Error('지역 검색 서비스에 연결할 수 없어요.');
  }
  // De-duplicate places within ~2 km of each other.
  const out: Place[] = [];
  for (const p of all) {
    if (!out.some((o) => Math.abs(o.lat - p.lat) < 0.02 && Math.abs(o.lon - p.lon) < 0.02)) out.push(p);
  }
  return out.slice(0, 10);
}

/** Coordinates → neighborhood name (for "my location"). */
export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  const fallback: Place = { name: '내 위치', detail: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon };
  try {
    const params = new URLSearchParams({
      lat: lat.toFixed(5),
      lon: lon.toFixed(5),
      format: 'jsonv2',
      'accept-language': 'ko',
      zoom: '16',
      addressdetails: '1',
    });
    const r = await nominatimJson<NomResult>(`${NOMINATIM}/reverse?${params}`);
    const a = r.address ?? {};
    const name = a.quarter ?? a.suburb ?? a.neighbourhood ?? a.village ?? a.town ?? a.city_district ?? a.city;
    if (!name) return fallback;
    return { name, detail: nomDetail(a, name), lat, lon };
  } catch {
    return fallback;
  }
}
