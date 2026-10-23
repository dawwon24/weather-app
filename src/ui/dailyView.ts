import type { ChartConfiguration, Plugin } from 'chart.js';
import { fetchArchiveDaily } from '../api/archive';
import { FUTURE_DAYS, PAST_DAYS, type ForecastResponse } from '../api/forecast';
import { fetchNormals, NORMAL_YEARS, type Normals } from '../data/normals';
import { save, settings, type RangeId } from '../state';
import { ChartCard, FONT, fmt, seriesColor, themeColors, todayColumn, tooltipStyle, withAlpha } from './charts';
import { describe } from './weatherCode';

export const RANGES: { id: RangeId; label: string; past: number }[] = [
  { id: '2w', label: '2주', past: 7 },
  { id: '1m', label: '1달', past: 23 },
  { id: '3m', label: '3달', past: PAST_DAYS },
];

// Fixed color per entity: temperature warm, rain blue, humidity green.
const TEMP_SLOT = 2;
const POP_SLOT = 1;
const HUMID_SLOT = 3;
/** Forecast marks are drawn as a lighter fill of the same hue. */
const FORECAST_ALPHA = 0.3;

const WEEKDAYS = '일월화수목금토';
const wd = (iso: string) => WEEKDAYS[new Date(iso + 'T00:00:00Z').getUTCDay()];
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

interface Span {
  dates: string[];
  /** Index of today inside `dates`. */
  today: number;
  max: (number | null)[];
  min: (number | null)[];
  code: (number | null)[];
  humidity: (number | null)[];
  pop: (number | null)[];
  normMax: (number | null)[] | null;
  normMin: (number | null)[] | null;
}

/** Daily view: one bar per day (low → high), past and forecast on the same axis, normal range behind. */
export class DailyView {
  private f: ForecastResponse | null = null;
  private normals: Normals | null = null;
  private normalsSeq = 0;
  private tempCard = new ChartCard('일별 기온', { height: 320 });
  private humidCard = new ChartCard('습도 · 강수확률', { height: 170 });
  private summary = document.createElement('div');
  private legend = document.createElement('div');
  private humidLegend = document.createElement('div');
  private todayIdx = -1;

  constructor(root: HTMLElement) {
    const seg = document.createElement('div');
    seg.className = 'segmented';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', '그래프 기간');
    for (const r of RANGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.label;
      b.setAttribute('aria-pressed', String(settings.range === r.id));
      b.addEventListener('click', () => {
        settings.range = r.id;
        save();
        seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.render();
      });
      seg.append(b);
    }
    this.tempCard.el.querySelector('.chart-head')!.insertBefore(seg, this.tempCard.el.querySelector('.chart-head button'));

    this.summary.className = 'summary';
    this.legend.className = 'legend';
    this.humidLegend.className = 'legend';
    this.tempCard.extra.append(this.summary, this.legend);
    this.humidCard.extra.append(this.humidLegend);
    root.append(this.tempCard.el, this.humidCard.el);
  }

  setData(f: ForecastResponse) {
    const samePlace = this.f && this.f.latitude === f.latitude && this.f.longitude === f.longitude && this.f.daily.time[0] === f.daily.time[0];
    this.f = f;
    if (!samePlace) {
      this.normals = null;
      const my = ++this.normalsSeq;
      fetchNormals(f.latitude, f.longitude, f.daily.time)
        .then((n) => {
          if (my !== this.normalsSeq) return;
          this.normals = n;
          this.render();
        })
        .catch(() => {
          // Without normals the chart is still complete; the band just isn't drawn.
        });
    }
    // Every refresh brings a fresh response with the gap again; the archive answer is cached.
    this.backfill(f);
    this.render();
  }

  /**
   * The forecast API's past_days only reaches back ~2 months; older days come back
   * null. Fill those from the ERA5 archive (which itself lags ~5 days, so the two meet).
   */
  private async backfill(f: ForecastResponse) {
    const d = f.daily;
    const today = f.current.time.slice(0, 10);
    const fields = ['temperature_2m_max', 'temperature_2m_min', 'relative_humidity_2m_mean'];
    const missing = d.time.filter((t, i) => t < today && fields.some((field) => d[field]?.[i] == null));
    if (!missing.length) return;
    try {
      const a = await fetchArchiveDaily(f.latitude, f.longitude, missing[0], missing[missing.length - 1], fields);
      if (f !== this.f) return;
      const index = new Map(a.time.map((t, i) => [t, i]));
      d.time.forEach((t, i) => {
        const j = index.get(t);
        if (j == null) return;
        for (const field of fields) if (d[field][i] == null) d[field][i] = a[field]?.[j] ?? null;
      });
      this.render();
    } catch {
      // Leave the gap; the rest of the chart is unaffected.
    }
  }

  private span(): Span | null {
    const f = this.f;
    if (!f) return null;
    const d = f.daily;
    let ti = d.time.indexOf(f.current.time.slice(0, 10));
    if (ti < 0) ti = PAST_DAYS;
    const past = RANGES.find((r) => r.id === settings.range)?.past ?? 7;
    const from = Math.max(0, ti - past);
    const to = Math.min(d.time.length, ti + FUTURE_DAYS + 1);
    const cut = (a: (number | null)[] | undefined) => (a ?? []).slice(from, to);
    return {
      dates: d.time.slice(from, to),
      today: ti - from,
      max: cut(d.temperature_2m_max),
      min: cut(d.temperature_2m_min),
      code: cut(d.weather_code),
      humidity: cut(d.relative_humidity_2m_mean),
      // A "probability" of a day that already happened is meaningless.
      pop: cut(d.precipitation_probability_max).map((v, i) => (from + i < ti ? null : v)),
      normMax: this.normals ? this.normals.max.slice(from, to) : null,
      normMin: this.normals ? this.normals.min.slice(from, to) : null,
    };
  }

  render() {
    const w = this.span();
    if (!w) return;
    this.todayIdx = w.today;
    this.renderSummary();
    this.renderLegend(w);
    this.renderTemp(w);
    this.renderHumidity(w);
  }

  /** Headline numbers: today vs the same weekday last week, and vs normal. */
  private renderSummary() {
    const f = this.f!;
    const d = f.daily;
    let ti = d.time.indexOf(f.current.time.slice(0, 10));
    if (ti < 0) ti = PAST_DAYS;
    const hi = d.temperature_2m_max[ti];
    const lo = d.temperature_2m_min[ti];

    const delta = (label: string, a: number | null | undefined, b: number | null | undefined) => {
      if (a == null || b == null) return `<span class="delta">${label} –</span>`;
      const diff = Math.round(a - b);
      if (diff === 0) return `<span class="delta">${label} 비슷</span>`;
      return `<span class="delta ${diff > 0 ? 'up' : 'down'}">${label} ${Math.abs(diff)}℃ ${diff > 0 ? '높음' : '낮음'}</span>`;
    };
    const lw = ti - 7;
    const rows = [
      `<p class="sum-today"><b>오늘</b> 최고 <b>${fmt(hi, 0, '℃')}</b> · 최저 <b>${fmt(lo, 0, '℃')}</b></p>`,
      lw >= 0
        ? `<p><span class="sum-label">지난주 ${wd(d.time[lw])}요일(${md(d.time[lw])})보다</span>${delta('최고', hi, d.temperature_2m_max[lw])}${delta('최저', lo, d.temperature_2m_min[lw])}</p>`
        : '',
      this.normals
        ? `<p><span class="sum-label">평년보다</span>${delta('최고', hi, this.normals.max[ti])}${delta('최저', lo, this.normals.min[ti])}</p>`
        : '',
    ];
    this.summary.innerHTML = rows.join('');
  }

  private renderLegend(w: Span) {
    const temp = seriesColor(TEMP_SLOT);
    const item = (style: string, text: string, title = '') =>
      `<span class="legend-item"${title ? ` title="${title}"` : ''}><span class="swatch" style="${style}"></span>${text}</span>`;
    this.legend.innerHTML = [
      item(`background:${temp}`, '지난 날 (분석값)'),
      item(`background:${withAlpha(temp, FORECAST_ALPHA)};border:1.5px solid ${temp}`, '예보'),
      w.normMax ? item(`background:var(--band)`, `평년 범위`, `지난 ${NORMAL_YEARS}년 같은 시기 평균 최고~최저 (ERA5 재분석)`) : '',
    ].join('');
    this.humidLegend.innerHTML = [
      item(`background:${seriesColor(HUMID_SLOT)};height:3px`, '평균 습도'),
      item(`background:${seriesColor(POP_SLOT)}`, '강수확률 (예보)'),
    ].join('');
  }

  private labels(w: Span): string[][] {
    const n = w.dates.length;
    return w.dates.map((d, i) => {
      if (n <= 16) {
        const icon = w.code[i] != null ? describe(w.code[i]!).icon : '';
        return [i === w.today ? '오늘' : wd(d), md(d), icon];
      }
      return [i === w.today ? '오늘' : md(d)];
    });
  }

  private renderTemp(w: Span) {
    const c = themeColors();
    const temp = seriesColor(TEMP_SLOT);
    const isForecast = (i: number) => i > w.today;
    const bars = w.dates.map((_, i) => (w.max[i] != null && w.min[i] != null ? [w.min[i]!, w.max[i]!] : null));

    const all = [...w.max, ...w.min, ...(w.normMax ?? []), ...(w.normMin ?? [])].filter((v): v is number => v != null);
    // Room for the value labels, snapped to 5℃ so the axis bounds are round ticks.
    const yMin = all.length ? Math.floor((Math.min(...all) - 2) / 5) * 5 : undefined;
    const yMax = all.length ? Math.ceil((Math.max(...all) + 2) / 5) * 5 : undefined;

    // Max above each bar, min below it — only while bars are wide enough to hold a number.
    const valueLabels: Plugin = {
      id: 'valueLabels',
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        const first = meta.data[0] as unknown as { width?: number } | undefined;
        if (!first?.width || first.width < 16) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = `11px ${FONT}`;
        ctx.textAlign = 'center';
        meta.data.forEach((el, i) => {
          const b = el as unknown as { x: number; y: number; base: number };
          if (bars[i] == null) return;
          ctx.fillStyle = isForecast(i) ? c.muted : c.textSecondary;
          ctx.textBaseline = 'bottom';
          ctx.fillText(fmt(w.max[i], 0), b.x, Math.min(b.y, b.base) - 3);
          ctx.textBaseline = 'top';
          ctx.fillText(fmt(w.min[i], 0), b.x, Math.max(b.y, b.base) + 3);
        });
        ctx.restore();
      },
    };

    const datasets: ChartConfiguration['data']['datasets'] = [
      {
        type: 'bar',
        label: '기온',
        data: bars as never,
        order: 1,
        backgroundColor: w.dates.map((_, i) => (isForecast(i) ? withAlpha(temp, FORECAST_ALPHA) : temp)),
        borderColor: w.dates.map((_, i) => (isForecast(i) ? temp : 'transparent')),
        borderWidth: w.dates.map((_, i) => (isForecast(i) ? 1.5 : 0)),
        borderSkipped: false,
        borderRadius: 4,
        barPercentage: 0.62,
        categoryPercentage: 0.9,
        maxBarThickness: 26,
      },
    ];
    if (w.normMax && w.normMin) {
      const band = { type: 'line' as const, pointRadius: 0, pointHoverRadius: 0, borderWidth: 0, tension: 0.3, order: 2 };
      datasets.push(
        { ...band, label: '평년 최저', data: w.normMin, fill: false },
        { ...band, label: '평년 최고', data: w.normMax, fill: '-1', backgroundColor: c.band },
      );
    }

    const titles = w.dates.map((d, i) => {
      const tag = i === w.today ? ' · 오늘' : isForecast(i) ? ' · 예보' : '';
      return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${wd(d)})${tag}`;
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: { labels: this.labels(w), datasets },
      plugins: [todayColumn(() => this.todayIdx), valueLabels],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 4 } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: c.axis },
            ticks: {
              color: (ctx) => (ctx.index === w.today ? c.text : c.muted),
              font: (ctx) => ({ size: 11, weight: ctx.index === w.today ? 'bold' : 'normal' }),
              maxRotation: 0,
              autoSkip: true,
              autoSkipPadding: 12,
            },
          },
          y: {
            min: yMin,
            max: yMax,
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, font: { size: 11 }, stepSize: 5, maxTicksLimit: 9, callback: (v) => `${v}℃` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            filter: (item) => item.datasetIndex === 0,
            callbacks: {
              title: (items) => (items.length ? titles[items[0].dataIndex] : ''),
              label: (item) => {
                const i = item.dataIndex;
                return ` 최고 ${fmt(w.max[i], 1, '℃')} · 최저 ${fmt(w.min[i], 1, '℃')}`;
              },
              footer: (items) => {
                const i = items[0]?.dataIndex;
                if (i == null) return '';
                const out: string[] = [];
                if (w.code[i] != null) out.push(describe(w.code[i]!).text);
                if (w.normMax) out.push(`평년 ${fmt(w.normMax[i], 0, '℃')} / ${fmt(w.normMin![i], 0, '℃')}`);
                return out;
              },
            },
          },
        },
      },
    };

    this.tempCard.render(config, {
      head: ['날짜', '최고', '최저', ...(w.normMax ? ['평년 최고', '평년 최저'] : [])],
      rows: w.dates.map((_, i) => [
        titles[i],
        fmt(w.max[i], 1, '℃'),
        fmt(w.min[i], 1, '℃'),
        ...(w.normMax ? [fmt(w.normMax[i], 1, '℃'), fmt(w.normMin![i], 1, '℃')] : []),
      ]),
    });
  }

  private renderHumidity(w: Span) {
    const c = themeColors();
    const humid = seriesColor(HUMID_SLOT);
    const labels = w.dates.map((d, i) => (i === w.today ? '오늘' : md(d)));
    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: '평균 습도',
            data: w.humidity,
            order: 1,
            borderColor: humid,
            backgroundColor: humid,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderColor: c.surface,
            pointHoverBorderWidth: 2,
            tension: 0.25,
            // Forecast part dashed, like the lighter forecast bars above.
            segment: { borderDash: (ctx) => (ctx.p1DataIndex > w.today ? [5, 4] : undefined) },
          },
          {
            type: 'bar',
            label: '강수확률',
            data: w.pop,
            order: 2,
            backgroundColor: withAlpha(seriesColor(POP_SLOT), 0.55),
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: 'bottom',
            barPercentage: 0.62,
            maxBarThickness: 26,
          },
        ],
      },
      plugins: [todayColumn(() => this.todayIdx)],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            border: { color: c.axis },
            ticks: { color: c.muted, font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, font: { size: 11 }, stepSize: 50, callback: (v) => `${v}%` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            filter: (item) => item.raw != null,
            callbacks: { label: (item) => ` ${item.dataset.label} ${fmt(item.raw as number, 0, '%')}` },
          },
        },
      },
    };
    this.humidCard.render(config, {
      head: ['날짜', '평균 습도', '강수확률'],
      rows: w.dates.map((d, i) => [`${md(d)} (${wd(d)})`, fmt(w.humidity[i], 0, '%'), fmt(w.pop[i], 0, '%')]),
    });
  }
}
