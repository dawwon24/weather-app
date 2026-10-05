import type { ForecastResponse } from '../api/forecast';
import { FORECAST_CHARTS } from '../data/metrics';
import { settings, save } from '../state';
import { ChartCard, seriesColor } from './charts';

type Range = '48h' | '7d';

/** Forecast view: one small chart per enabled metric group (same unit per chart — no dual axes). */
export class ForecastView {
  private cards: ChartCard[] = [];
  private data: ForecastResponse | null = null;
  private range: Range = '48h';
  private grid: HTMLElement;
  private toggles: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="예보 기간">
          <button type="button" data-range="48h" aria-pressed="true">48시간</button>
          <button type="button" data-range="7d" aria-pressed="false">7일</button>
        </div>
        <div class="chips" role="group" aria-label="표시할 지표"></div>
      </div>
      <div class="chart-grid"></div>`;
    this.grid = root.querySelector('.chart-grid')!;
    this.toggles = root.querySelector('.chips')!;

    root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
      b.addEventListener('click', () => {
        this.range = b.dataset.range as Range;
        root.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.render();
      }),
    );

    const enabled = this.enabled();
    for (const def of FORECAST_CHARTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = def.title;
      btn.setAttribute('aria-pressed', String(enabled.includes(def.id)));
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(on));
        const now = new Set(this.enabled());
        if (on) now.add(def.id);
        else now.delete(def.id);
        settings.forecastCharts = FORECAST_CHARTS.map((d) => d.id).filter((id) => now.has(id));
        save();
        this.render();
      });
      this.toggles.append(btn);
    }
  }

  private enabled(): string[] {
    return settings.forecastCharts ?? FORECAST_CHARTS.filter((d) => d.defaultOn).map((d) => d.id);
  }

  setData(f: ForecastResponse) {
    this.data = f;
    this.render();
  }

  render() {
    const f = this.data;
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.grid.replaceChildren();
    if (!f) return;

    const enabled = this.enabled();
    let labels: string[];
    let titles: string[];
    let slice: [number, number];
    if (this.range === '48h') {
      // Start at the current hour.
      const nowHour = f.current.time.slice(0, 13);
      const start = Math.max(0, f.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour));
      slice = [start, start + 48];
      const times = f.hourly.time.slice(...slice);
      labels = times.map((t) => (t.endsWith('T00:00') ? `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}` : `${Number(t.slice(11, 13))}시`));
      titles = times.map((t) => `${Number(t.slice(5, 7))}월 ${Number(t.slice(8, 10))}일 ${Number(t.slice(11, 13))}시`);
    } else {
      slice = [0, 8];
      const times = f.daily.time.slice(...slice);
      labels = times.map((t, i) => (i === 0 ? '오늘' : `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}`));
      titles = times.map((t) => `${Number(t.slice(5, 7))}월 ${Number(t.slice(8, 10))}일 (${'일월화수목금토'[new Date(t + 'T00:00:00Z').getUTCDay()]})`);
    }

    if (!enabled.length) {
      this.grid.innerHTML = `<p class="empty">위에서 볼 지표를 하나 이상 선택해 주세요.</p>`;
      return;
    }

    for (const def of FORECAST_CHARTS) {
      if (!enabled.includes(def.id)) continue;
      const defs = this.range === '48h' ? def.hourly : def.daily;
      const source = this.range === '48h' ? f.hourly : f.daily;
      const card = new ChartCard(def.title, def.unit ? `단위: ${def.unit}` : '');
      this.grid.append(card.el);
      card.render({
        labels,
        kind: def.kind,
        unit: def.unit,
        decimals: def.decimals,
        min: def.min,
        max: def.max,
        tooltipTitle: (i) => titles[i],
        series: defs.map((s, i) => ({
          label: s.label,
          data: (source[s.field] ?? []).slice(...slice),
          // Secondary series in the same chart (체감온도, 돌풍, 최저) keep a fixed slot per position.
          color: seriesColor(def.id === 'temp' && this.range === '7d' ? (i === 0 ? 2 : 1) : i + 1),
          endLabel: defs.length > 1,
        })),
      });
      this.cards.push(card);
    }
  }
}
