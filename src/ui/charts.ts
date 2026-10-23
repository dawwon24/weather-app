import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type Plugin,
} from 'chart.js';

Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Categorical slot color (1-based), assigned by entity — never by rank. */
export const seriesColor = (slot: number) => cssVar(`--series-${slot}`);

/** `#rrggbb` → `rgba(...)`; canvas doesn't understand color-mix(). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function themeColors() {
  return {
    text: cssVar('--text-primary'),
    textSecondary: cssVar('--text-secondary'),
    muted: cssVar('--text-muted'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    surface: cssVar('--surface-1'),
    surface2: cssVar('--surface-2'),
    band: cssVar('--band'),
    neutral: cssVar('--neutral-series'),
  };
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif';

export function fmt(v: number | null | undefined, decimals: number, unit = ''): string {
  if (v == null || Number.isNaN(v)) return '–';
  return `${v.toFixed(decimals)}${unit}`;
}

/** Shared tooltip look. */
export function tooltipStyle() {
  const c = themeColors();
  return {
    backgroundColor: c.surface,
    titleColor: c.text,
    bodyColor: c.textSecondary,
    footerColor: c.muted,
    footerFont: { weight: 'normal' as const },
    borderColor: c.axis,
    borderWidth: 1,
    padding: 10,
    boxPadding: 4,
    usePointStyle: true,
  };
}

/**
 * Shades the column of `todayIndex` so "today" anchors the eye — past on its left,
 * forecast on its right.
 */
export function todayColumn(todayIndex: () => number): Plugin {
  return {
    id: 'todayColumn',
    beforeDatasetsDraw(chart) {
      const i = todayIndex();
      const x = chart.scales.x;
      if (i < 0 || !x) return;
      const w = x.width / chart.data.labels!.length;
      const cx = x.getPixelForValue(i);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = themeColors().surface2;
      ctx.fillRect(cx - w / 2, top, w, bottom - top);
      ctx.restore();
    },
  };
}

export interface TableData {
  head: string[];
  rows: string[][];
}

/** A chart card with a title, the canvas, and a "table view" toggle (accessibility fallback). */
export class ChartCard {
  readonly el: HTMLElement;
  readonly extra: HTMLElement;
  private chart: Chart | null = null;
  private canvasWrap: HTMLElement;
  private tableWrap: HTMLElement;
  private table: TableData | null = null;
  private showingTable = false;

  constructor(title: string, opts: { height?: number } = {}) {
    this.el = document.createElement('section');
    this.el.className = 'card chart-card';
    this.el.innerHTML = `
      <header class="chart-head">
        <h3></h3>
        <button type="button" class="ghost small" aria-pressed="false">표 보기</button>
      </header>
      <div class="chart-extra"></div>
      <div class="chart-wrap"><canvas role="img"></canvas></div>
      <div class="table-wrap" hidden></div>`;
    this.el.querySelector('h3')!.textContent = title;
    this.el.querySelector('canvas')!.setAttribute('aria-label', `${title} 그래프`);
    this.extra = this.el.querySelector('.chart-extra')!;
    this.canvasWrap = this.el.querySelector('.chart-wrap')!;
    if (opts.height) this.canvasWrap.style.height = `${opts.height}px`;
    this.tableWrap = this.el.querySelector('.table-wrap')!;
    const btn = this.el.querySelector<HTMLButtonElement>('.chart-head button')!;
    btn.addEventListener('click', () => {
      this.showingTable = !this.showingTable;
      btn.textContent = this.showingTable ? '그래프 보기' : '표 보기';
      btn.setAttribute('aria-pressed', String(this.showingTable));
      this.canvasWrap.hidden = this.showingTable;
      this.tableWrap.hidden = !this.showingTable;
      if (this.showingTable) this.renderTable();
    });
  }

  render(config: ChartConfiguration, table: TableData) {
    this.table = table;
    this.chart?.destroy();
    this.chart = new Chart(this.el.querySelector('canvas')!, config);
    if (this.showingTable) this.renderTable();
  }

  private renderTable() {
    const t = this.table;
    if (!t) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.tableWrap.innerHTML = `<table><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
      .map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  }

  destroy() {
    this.chart?.destroy();
    this.chart = null;
  }
}
