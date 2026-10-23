import type { ForecastResponse } from '../api/forecast';
import type { Place } from '../data/korea-cities';
import { fmt } from './charts';
import { describe } from './weatherCode';

export function renderCurrent(el: HTMLElement, place: Place, f: ForecastResponse) {
  const c = f.current;
  const w = describe(c.weather_code, c.is_day);
  const ti = f.daily.time.indexOf(c.time.slice(0, 10));
  const hi = f.daily.temperature_2m_max[ti];
  const lo = f.daily.temperature_2m_min[ti];

  el.innerHTML = `
    <div class="now">
      <div class="now-place"><h2></h2><p class="sub"></p></div>
      <div class="now-temp">
        <span class="now-icon" aria-hidden="true">${w.icon}</span>
        <span class="hero">${fmt(c.temperature_2m, 1, '℃')}</span>
        <div class="now-desc">
          <span>${w.text}</span>
          <span class="muted">체감 ${fmt(c.apparent_temperature, 1, '℃')} · 습도 ${fmt(c.relative_humidity_2m, 0, '%')}</span>
          <span class="muted">최고 ${fmt(hi, 0, '℃')} · 최저 ${fmt(lo, 0, '℃')} · ${c.time.slice(11, 16)} 기준</span>
        </div>
      </div>
    </div>`;
  el.querySelector('h2')!.textContent = place.name;
  el.querySelector('.now-place .sub')!.textContent = place.detail;
}
