import type { ForecastResponse } from '../api/forecast';
import type { Place } from '../data/korea-cities';
import { fmt } from './charts';
import { describe, windDir } from './weatherCode';

function uvLevel(uv: number): string {
  if (uv < 3) return '낮음';
  if (uv < 6) return '보통';
  if (uv < 8) return '높음';
  if (uv < 11) return '매우 높음';
  return '위험';
}

export function renderCurrent(el: HTMLElement, place: Place, f: ForecastResponse) {
  const c = f.current;
  const w = describe(c.weather_code, c.is_day);
  const today = f.daily;
  const hi = today.temperature_2m_max?.[0];
  const lo = today.temperature_2m_min?.[0];
  const time = c.time.slice(11, 16);

  const stat = (label: string, value: string, note = '') =>
    `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${
      note ? `<span class="stat-note">${note}</span>` : ''
    }</div>`;

  el.innerHTML = `
    <div class="now">
      <div class="now-main">
        <div class="now-place"><h2></h2><p class="sub"></p></div>
        <div class="now-temp">
          <span class="now-icon" aria-hidden="true">${w.icon}</span>
          <span class="hero">${fmt(c.temperature_2m, 1, '℃')}</span>
        </div>
        <p class="now-desc">${w.text} · 최고 ${fmt(hi, 0, '℃')} / 최저 ${fmt(lo, 0, '℃')}</p>
        <p class="muted small">${time} 기준 · 해발 ${Math.round(f.elevation)}m</p>
      </div>
      <div class="now-stats">
        ${stat('습도', fmt(c.relative_humidity_2m, 0, '%'), `이슬점 ${fmt(c.dew_point_2m, 1, '℃')}`)}
        ${stat('체감온도', fmt(c.apparent_temperature, 1, '℃'))}
        ${stat('바람', fmt(c.wind_speed_10m, 1, 'm/s'), `${windDir(c.wind_direction_10m)} · 돌풍 ${fmt(c.wind_gusts_10m, 1, 'm/s')}`)}
        ${stat('강수', fmt(c.precipitation, 1, 'mm'))}
        ${stat('기압', fmt(c.pressure_msl, 0, 'hPa'))}
        ${stat('운량', fmt(c.cloud_cover, 0, '%'))}
        ${stat('자외선', fmt(c.uv_index, 1), uvLevel(c.uv_index))}
        ${stat('일출 · 일몰', `${today.sunrise[0].slice(11)} · ${today.sunset[0].slice(11)}`)}
      </div>
    </div>`;
  el.querySelector('h2')!.textContent = place.name;
  el.querySelector('.now-place .sub')!.textContent = place.detail;
}

export function renderDaily(el: HTMLElement, f: ForecastResponse) {
  const d = f.daily;
  const days = d.time.slice(0, 8);
  el.innerHTML = `<ol class="days">${days
    .map((t, i) => {
      const w = describe(d.weather_code[i] as number);
      const label = i === 0 ? '오늘' : i === 1 ? '내일' : `${Number(t.slice(8))}일 (${'일월화수목금토'[new Date(t + 'T00:00:00Z').getUTCDay()]})`;
      const pop = d.precipitation_probability_max?.[i];
      return `<li>
        <span class="day-name">${label}</span>
        <span class="day-icon" title="${w.text}" aria-label="${w.text}">${w.icon}</span>
        <span class="day-temp"><b>${fmt(d.temperature_2m_max[i], 0, '℃')}</b> / ${fmt(d.temperature_2m_min[i], 0, '℃')}</span>
        <span class="day-meta">습도 ${fmt(d.relative_humidity_2m_mean?.[i], 0, '%')}${pop != null ? ` · 비 ${pop}%` : ''}</span>
      </li>`;
    })
    .join('')}</ol>`;
}
