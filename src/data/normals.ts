import { fetchArchiveDaily } from '../api/archive';
import { addDays, shiftYears } from './dates';

export const NORMAL_YEARS = 10;
/** Each day's normal also averages ±SMOOTH neighbouring days, so 10 years don't give a jagged band. */
const SMOOTH = 3;

export interface Normals {
  max: (number | null)[];
  min: (number | null)[];
}

/** Average daily high / low for each date over the previous NORMAL_YEARS years. */
export async function fetchNormals(lat: number, lon: number, dates: string[]): Promise<Normals> {
  const first = addDays(shiftYears(dates[0], -NORMAL_YEARS), -SMOOTH);
  const last = addDays(shiftYears(dates[dates.length - 1], -1), SMOOTH);
  const s = await fetchArchiveDaily(lat, lon, first, last, ['temperature_2m_max', 'temperature_2m_min']);

  const index = new Map(s.time.map((t, i) => [t, i]));
  const avg = (field: string, d: string) => {
    let sum = 0;
    let n = 0;
    for (let k = 1; k <= NORMAL_YEARS; k++) {
      const base = shiftYears(d, -k);
      for (let o = -SMOOTH; o <= SMOOTH; o++) {
        const i = index.get(addDays(base, o));
        const v = i == null ? null : s[field]?.[i];
        if (v != null) {
          sum += v;
          n++;
        }
      }
    }
    return n ? sum / n : null;
  };
  return {
    max: dates.map((d) => avg('temperature_2m_max', d)),
    min: dates.map((d) => avg('temperature_2m_min', d)),
  };
}
