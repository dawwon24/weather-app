import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchManyCurrent } from '../api/forecast';
import { reverseGeocode } from '../api/geocode';
import { KOREA_CITIES, type Place } from '../data/korea-cities';
import { settings } from '../state';
import { cssVar } from './charts';
import { describe } from './weatherCode';

/** Korea overview: current temperature for major cities on a map, plus a sortable list. */
export class KoreaView {
  private map: L.Map | null = null;
  private layer = L.layerGroup();
  private hereMarker: L.CircleMarker | null = null;
  private loadedAt = 0;

  constructor(
    private root: HTMLElement,
    private onPick: (p: Place) => void,
  ) {
    root.innerHTML = `
      <p class="status" role="status" aria-live="polite"></p>
      <p class="muted small map-hint">지도의 아무 곳이나 누르면 그 위치의 날씨를 볼 수 있어요.</p>
      <div class="korea-layout">
        <div class="card map-card"><div class="map" aria-label="전국 주요 도시 기온 지도"></div></div>
        <section class="card city-list"><h3>주요 도시 현재 날씨</h3><ol></ol></section>
      </div>
      <p class="muted small note">도시를 누르면 그 지역 날씨로 이동해요. 지도: © OpenStreetMap 기여자</p>`;
  }

  /** Leaflet must be created while the container is visible. */
  show() {
    if (!this.map) {
      this.map = L.map(this.root.querySelector<HTMLElement>('.map')!, { zoomSnap: 0.25, scrollWheelZoom: false }).setView([36.1, 127.8], 6.75);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '© OpenStreetMap',
      }).addTo(this.map);
      this.layer.addTo(this.map);
      // City names only fit once zoomed in; below that, pins show icon + temperature.
      const mapEl = this.map.getContainer();
      const syncNames = () => mapEl.classList.toggle('show-names', this.map!.getZoom() >= 7.5);
      this.map.on('zoomend', syncNames);
      syncNames();
      this.map.on('click', (e: L.LeafletMouseEvent) => this.pickAt(e.latlng));
    } else {
      this.map.invalidateSize();
    }
    this.markHere();
    if (Date.now() - this.loadedAt > 10 * 60_000) this.load();
  }

  /** Click anywhere on the map → reverse-geocode and offer to switch there. */
  private async pickAt(at: L.LatLng) {
    if (!this.map) return;
    const box = document.createElement('div');
    box.className = 'pick-popup';
    box.textContent = '주소 확인 중…';
    const popup = L.popup().setLatLng(at).setContent(box).openOn(this.map);
    const place = await reverseGeocode(at.lat, at.lng);
    if (!popup.isOpen()) return;
    box.replaceChildren();
    const name = document.createElement('b');
    name.textContent = place.name;
    const detail = document.createElement('span');
    detail.className = 'muted small';
    detail.textContent = place.detail;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'ghost small';
    go.textContent = '이 위치 날씨 보기';
    go.addEventListener('click', () => {
      this.map?.closePopup();
      this.onPick(place);
    });
    box.append(name, detail, document.createElement('br'), go);
    popup.update();
  }

  /** Scroll the map into view so the user can pick a spot. */
  focusMap() {
    this.root.querySelector('.map-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  markHere() {
    if (!this.map) return;
    const p = settings.place;
    this.hereMarker?.remove();
    this.hereMarker = L.circleMarker([p.lat, p.lon], { radius: 7, weight: 2, color: '#fff', fillColor: cssVar('--series-1'), fillOpacity: 1 })
      .bindTooltip(`현재 선택: ${p.name}`)
      .addTo(this.map);
  }

  private async load() {
    const status = this.root.querySelector('.status')!;
    status.textContent = '전국 날씨를 불러오는 중…';
    status.classList.remove('error');
    try {
      const now = await fetchManyCurrent(KOREA_CITIES);
      this.loadedAt = Date.now();
      status.textContent = '';
      this.layer.clearLayers();
      const list = this.root.querySelector('.city-list ol')!;
      list.replaceChildren();

      const rows = KOREA_CITIES.map((c, i) => ({ c, w: now[i] })).filter((r) => r.w);
      for (const { c, w } of rows) {
        const d = describe(w.weather_code, w.is_day);
        const html = `<div class="pin"><span class="pin-icon">${d.icon}</span><b>${Math.round(w.temperature_2m)}°</b><span class="pin-name">${c.short}</span></div>`;
        const marker = L.marker([c.lat, c.lon], {
          icon: L.divIcon({ className: 'city-pin', html, iconSize: [0, 0] }),
          title: `${c.name} ${w.temperature_2m}℃ 습도 ${w.relative_humidity_2m}%`,
          keyboard: true,
        });
        marker.bindTooltip(`${c.name} · ${d.text}<br>기온 ${w.temperature_2m}℃ · 습도 ${w.relative_humidity_2m}%`, { direction: 'top', offset: [0, -14] });
        marker.on('click', () => this.onPick(c));
        this.layer.addLayer(marker);
      }

      for (const { c, w } of [...rows].sort((a, b) => b.w.temperature_2m - a.w.temperature_2m)) {
        const d = describe(w.weather_code, w.is_day);
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" class="city-row">
            <span class="city-name"></span>
            <span aria-label="${d.text}" title="${d.text}">${d.icon}</span>
            <span class="city-temp">${w.temperature_2m.toFixed(1)}℃</span>
            <span class="city-hum">습도 ${w.relative_humidity_2m}%</span>
          </button>`;
        li.querySelector('.city-name')!.textContent = c.name;
        li.querySelector('button')!.addEventListener('click', () => this.onPick(c));
        list.append(li);
      }
    } catch (e) {
      status.textContent = `전국 날씨를 불러오지 못했어요: ${(e as Error).message}`;
      status.classList.add('error');
    }
  }
}
