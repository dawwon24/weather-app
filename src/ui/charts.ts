import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartDataset,
  type Plugin,
} from 'chart.js';

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Categorical slot color (1-based), assigned by entity — never by rank. */
export const seriesColor = (slot: number) => cssVar(`--series-${slot}`);

export function themeColors() {
  return {
    text: cssVar('--text-primary'),
    textSecondary: cssVar('--text-secondary'),
    muted: cssVar('--text-muted'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    surface: cssVar('--surface-1'),
    band: cssVar('--band'),
    neutral: cssVar('--neutral-series'),
  };
}

/** Vertical crosshair at the hovered x position. */
const crosshair: Plugin = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = themeColors().axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/** Direct label at the end of each line series (used when there are 2–4 labeled series). */
const endLabels: Plugin = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const lines = chart.data.datasets
      .map((ds, i) => ({ ds, i, meta: chart.getDatasetMeta(i) }))
      .filter(({ ds, meta }) => (ds as { endLabel?: boolean }).endLabel && meta.type === 'line' && !meta.hidden);
    if (lines.length < 2 || lines.length > 4) return;
    const ctx = chart.ctx;
    const c = themeColors();
    ctx.save();
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = c.textSecondary;
    ctx.textBaseline = 'middle';
    const placed: number[] = [];
    for (const { ds, meta } of lines) {
      let idx = meta.data.length - 1;
      while (idx >= 0 && (ds.data[idx] == null || Number.isNaN((meta.data[idx] as { y: number }).y))) idx--;
      if (idx < 0) continue;
      const pt = meta.data[idx] as unknown as { x: number; y: number };
      let y = pt.y;
      // Nudge labels apart so they don't collide.
      for (const py of placed) if (Math.abs(py - y) < 14) y = py + (y >= py ? 14 : -14);
      placed.push(y);
      ctx.fillText(String(ds.label), Math.min(pt.x + 6, chart.chartArea.right + 6), y);
    }
    ctx.restore();
  },
};

export interface LineSeries {
  label: string;
  data: (number | null)[];
  color: string;
  dashed?: boolean;
  endLabel?: boolean;
}

export interface ChartSpec {
  labels: string[];
  kind: 'line' | 'bar';
  series: LineSeries[];
  unit: string;
  decimals: number;
  min?: number;
  max?: number;
  /** Optional shaded min–max band drawn behind the lines. */
  band?: { lower: (number | null)[]; upper: (number | null)[]; label: string };
  tooltipTitle?: (index: number) => string;
  stepped?: boolean;
}

export function fmt(v: number | null | undefined, decimals: number, unit = ''): string {
  if (v == null || Number.isNaN(v)) return '–';
  return `${v.toFixed(decimals)}${unit ? (unit === '%' || unit === '℃' ? unit : ' ' + unit) : ''}`;
}

const flag = (ds: ChartDataset, extra: Record<string, unknown>): ChartDataset => Object.assign(ds, extra);

export function buildConfig(spec: ChartSpec): ChartConfiguration {
  const c = themeColors();
  const hasEndLabels = spec.series.filter((s) => s.endLabel).length >= 2;
  const datasets: ChartDataset[] = [];

  if (spec.band) {
    // `isBand` is a custom flag read by the legend filter.
    datasets.push(
      flag({
        type: 'line',
        label: `${spec.band.label} 최저`,
        data: spec.band.lower,
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      }, { isBand: true }),
      flag({
        type: 'line',
        label: `${spec.band.label} 최고`,
        data: spec.band.upper,
        borderWidth: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        backgroundColor: c.band,
        fill: '-1',
      }, { isBand: true }),
    );
  }

  for (const s of spec.series) {
    if (spec.kind === 'bar') {
      datasets.push({
        type: 'bar',
        label: s.label,
        data: s.data,
        backgroundColor: s.color,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        borderColor: c.surface,
        borderWidth: { left: 1, right: 1 },
        maxBarThickness: 28,
      });
    } else {
      datasets.push(flag({
        type: 'line',
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        borderDash: s.dashed ? [5, 4] : undefined,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBorderColor: c.surface,
        pointHoverBorderWidth: 2,
        tension: 0.25,
        spanGaps: false,
        stepped: spec.stepped,
      }, { endLabel: s.endLabel }));
    }
  }

  const visibleSeries = spec.series.length + (spec.band ? 1 : 0);

  return {
    type: spec.kind,
    data: { labels: spec.labels, datasets },
    plugins: [crosshair, endLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { right: hasEndLabels ? 64 : 8, top: 4 } },
      scales: {
        x: {
          grid: { display: false },
          border: { color: c.axis },
          ticks: { color: c.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 16, font: { size: 11 } },
        },
        y: {
          min: spec.min,
          max: spec.max,
          beginAtZero: spec.kind === 'bar',
          grid: { color: c.grid },
          border: { display: false },
          ticks: {
            color: c.muted,
            font: { size: 11 },
            maxTicksLimit: 6,
            callback: (v) => `${v}${spec.unit && spec.unit !== 'hPa' && spec.unit !== 'm/s' && spec.unit !== 'mm' ? spec.unit : ''}`,
          },
        },
      },
      plugins: {
        legend: {
          display: visibleSeries >= 2,
          position: 'top',
          align: 'start',
          labels: {
            color: c.textSecondary,
            boxWidth: 12,
            boxHeight: 3,
            font: { size: 12 },
            filter: (item, data) => {
              const ds = data.datasets[item.datasetIndex!] as { isBand?: boolean };
              // Show the band once, under its own name.
              if (ds.isBand) {
                if (item.text.endsWith('최저')) return false;
                item.text = item.text.replace(/ 최고$/, ' 범위');
                item.fillStyle = c.band;
                item.strokeStyle = c.band;
              }
              return true;
            },
          },
        },
        tooltip: {
          backgroundColor: c.surface,
          titleColor: c.text,
          bodyColor: c.textSecondary,
          borderColor: c.axis,
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: (items) => (items.length && spec.tooltipTitle ? spec.tooltipTitle(items[0].dataIndex) : items[0]?.label ?? ''),
            label: (item) => `${item.dataset.label}: ${fmt(item.raw as number | null, spec.decimals, spec.unit)}`,
          },
        },
      },
    },
  };
}

/** A chart card with a title, the canvas, and a "table view" toggle (accessibility fallback). */
export class ChartCard {
  readonly el: HTMLElement;
  private chart: Chart | null = null;
  private canvasWrap: HTMLElement;
  private tableWrap: HTMLElement;
  private spec: ChartSpec | null = null;
  private showingTable = false;

  constructor(title: string, subtitle = '') {
    this.el = document.createElement('section');
    this.el.className = 'card chart-card';
    this.el.innerHTML = `
      <header class="chart-head">
        <div><h3></h3><p class="sub"></p></div>
        <button type="button" class="ghost small" aria-pressed="false">표 보기</button>
      </header>
      <div class="chart-wrap"><canvas role="img"></canvas></div>
      <div class="table-wrap" hidden></div>`;
    this.el.querySelector('h3')!.textContent = title;
    this.el.querySelector('.sub')!.textContent = subtitle;
    this.el.querySelector('canvas')!.setAttribute('aria-label', `${title} 그래프`);
    this.canvasWrap = this.el.querySelector('.chart-wrap')!;
    this.tableWrap = this.el.querySelector('.table-wrap')!;
    const btn = this.el.querySelector('button')!;
    btn.addEventListener('click', () => {
      this.showingTable = !this.showingTable;
      btn.textContent = this.showingTable ? '그래프 보기' : '표 보기';
      btn.setAttribute('aria-pressed', String(this.showingTable));
      this.canvasWrap.hidden = this.showingTable;
      this.tableWrap.hidden = !this.showingTable;
      if (this.showingTable) this.renderTable();
    });
  }

  setSubtitle(text: string) {
    this.el.querySelector('.sub')!.textContent = text;
  }

  render(spec: ChartSpec) {
    this.spec = spec;
    this.chart?.destroy();
    const canvas = this.el.querySelector('canvas')!;
    this.chart = new Chart(canvas, buildConfig(spec));
    if (this.showingTable) this.renderTable();
  }

  private renderTable() {
    const spec = this.spec;
    if (!spec) return;
    const cols = [...spec.series.map((s) => s.label)];
    if (spec.band) cols.push(`${spec.band.label} 최저`, `${spec.band.label} 최고`);
    const rows = spec.labels.map((l, i) => {
      const vals = spec.series.map((s) => s.data[i]);
      if (spec.band) vals.push(spec.band.lower[i], spec.band.upper[i]);
      const title = spec.tooltipTitle ? spec.tooltipTitle(i) : l;
      return `<tr><th scope="row">${title}</th>${vals.map((v) => `<td>${fmt(v, spec.decimals)}</td>`).join('')}</tr>`;
    });
    this.tableWrap.innerHTML = `<table><thead><tr><th>${spec.unit ? `단위: ${spec.unit}` : ''}</th>${cols
      .map((c) => `<th scope="col">${c}</th>`)
      .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  destroy() {
    this.chart?.destroy();
    this.chart = null;
  }
}
