import {
  buildMonthlyComparison,
  buildPeriodComparison,
  loadMonthlyData,
  loadPeriodData,
  NORMAL_YEARS,
  pairedAggregate,
} from '../data/compare';
import { addDays, daysBetween, shortLabel, todayIso, weekday } from '../data/dates';
import { COMPARE_METRICS, type CompareMetric } from '../data/metrics';
import { settings } from '../state';
import { ChartCard, fmt, seriesColor, themeColors } from './charts';

type Mode = 'period' | 'monthly';
type Preset = '7' | '30' | '90' | 'month' | 'custom';

/** Fixed color slot per comparison year — color follows the entity, never its rank. */
const OFFSETS: { n: number; label: string; slot: number }[] = [
  { n: 1, label: '작년', slot: 2 },
  { n: 2, label: '2년 전', slot: 3 },
  { n: 3, label: '3년 전', slot: 4 },
  { n: 5, label: '5년 전', slot: 5 },
  { n: 10, label: '10년 전', slot: 7 },
];
const CURRENT_SLOT = 1;
const MAX_DAYS = 365;

export class CompareView {
  private mode: Mode = 'period';
  private preset: Preset = '30';
  private offsets = new Set<number>([1]);
  private withNormal = true;
  private metrics = new Set<string>(['temperature_2m_mean', 'relative_humidity_2m_mean']);
  private cards: ChartCard[] = [];
  private requestId = 0;

  private els: {
    start: HTMLInputElement;
    end: HTMLInputElement;
    customRow: HTMLElement;
    periodControls: HTMLElement;
    summary: HTMLElement;
    grid: HTMLElement;
    status: HTMLElement;
  };

  constructor(private root: HTMLElement) {
    const today = todayIso();
    root.innerHTML = `
      <div class="toolbar column">
        <div class="row">
          <div class="segmented" role="group" aria-label="비교 방식">
            <button type="button" data-mode="period" aria-pressed="true">기간 비교</button>
            <button type="button" data-mode="monthly" aria-pressed="false">월별 비교</button>
          </div>
          <div class="period-controls row">
            <label class="field">기간
              <select data-preset>
                <option value="7">최근 7일</option>
                <option value="30" selected>최근 30일</option>
                <option value="90">최근 90일</option>
                <option value="month">이번 달</option>
                <option value="custom">직접 지정</option>
              </select>
            </label>
            <span class="custom-row row" hidden>
              <input type="date" data-start aria-label="시작일" min="1950-01-01" max="${today}">
              <span>~</span>
              <input type="date" data-end aria-label="종료일" min="1950-01-01" max="${today}">
            </span>
          </div>
        </div>
        <div class="row">
          <span class="field-label">비교 대상</span>
          <div class="chips" data-offsets role="group" aria-label="비교할 연도"></div>
        </div>
        <div class="row">
          <span class="field-label">지표</span>
          <div class="chips" data-metrics role="group" aria-label="비교할 지표"></div>
        </div>
      </div>
      <p class="status" role="status" aria-live="polite"></p>
      <div class="summary"></div>
      <div class="chart-grid"></div>
      <p class="muted small note">과거 데이터는 모든 연도를 같은 기준으로 비교하려고 ERA5 재분석 자료(약 25km 격자)를 써요. 그래서 동네 단위 값은 주변 지역 평균에 가까워요. ERA5는 약 6일 늦게 갱신되기 때문에 최근 며칠은 예보 모델 값으로 채우고, 이 값은 조금 다를 수 있어요.</p>`;

    this.els = {
      start: root.querySelector('[data-start]')!,
      end: root.querySelector('[data-end]')!,
      customRow: root.querySelector('.custom-row')!,
      periodControls: root.querySelector('.period-controls')!,
      summary: root.querySelector('.summary')!,
      grid: root.querySelector('.chart-grid')!,
      status: root.querySelector('.status')!,
    };
    this.els.start.value = addDays(today, -29);
    this.els.end.value = today;

    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.mode = b.dataset.mode as Mode;
        root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.els.periodControls.hidden = this.mode !== 'period';
        this.renderOffsetChips();
        this.load();
      }),
    );

    root.querySelector<HTMLSelectElement>('[data-preset]')!.addEventListener('change', (e) => {
      this.preset = (e.target as HTMLSelectElement).value as Preset;
      this.els.customRow.hidden = this.preset !== 'custom';
      this.load();
    });
    this.els.start.addEventListener('change', () => this.load());
    this.els.end.addEventListener('change', () => this.load());

    const metricChips = root.querySelector('[data-metrics]')!;
    for (const m of COMPARE_METRICS) {
      metricChips.append(
        this.chip(m.label, this.metrics.has(m.field), (on) => {
          if (on) this.metrics.add(m.field);
          else this.metrics.delete(m.field);
          this.load();
        }),
      );
    }
    this.renderOffsetChips();
  }

  private chip(label: string, on: boolean, onToggle: (on: boolean) => void, slot?: number): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(on));
    if (slot) {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = `var(--series-${slot})`;
      b.append(sw);
    }
    b.append(label);
    b.addEventListener('click', () => {
      const next = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(next));
      onToggle(next);
    });
    return b;
  }

  private renderOffsetChips() {
    const box = this.root.querySelector('[data-offsets]')!;
    box.replaceChildren();
    for (const o of OFFSETS) {
      box.append(
        this.chip(
          o.label,
          this.offsets.has(o.n),
          (on) => {
            if (on) this.offsets.add(o.n);
            else this.offsets.delete(o.n);
            this.load();
          },
          o.slot,
        ),
      );
    }
    const c = this.chip(`${NORMAL_YEARS}년 평균`, this.withNormal, (on) => {
      this.withNormal = on;
      this.load();
    });
    c.title = `지난 ${NORMAL_YEARS}년의 평균선과 최저~최고 범위(회색 영역)`;
    c.insertBefore(Object.assign(document.createElement('span'), { className: 'swatch band' }), c.lastChild);
    box.append(c);
  }

  private period(): { start: string; end: string } | string {
    const today = todayIso();
    switch (this.preset) {
      case '7':
        return { start: addDays(today, -6), end: today };
      case '30':
        return { start: addDays(today, -29), end: today };
      case '90':
        return { start: addDays(today, -89), end: today };
      case 'month':
        return { start: today.slice(0, 8) + '01', end: today };
      case 'custom': {
        const start = this.els.start.value;
        const end = this.els.end.value;
        if (!start || !end) return '시작일과 종료일을 선택해 주세요.';
        if (start > end) return '시작일이 종료일보다 늦어요.';
        if (end > today) return '종료일은 오늘 이후로 지정할 수 없어요.';
        if (daysBetween(start, end) + 1 > MAX_DAYS) return `기간은 최대 ${MAX_DAYS}일까지 지정할 수 있어요.`;
        return { start, end };
      }
    }
  }

  private clear() {
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.els.grid.replaceChildren();
    this.els.summary.replaceChildren();
  }

  private setStatus(text: string, isError = false) {
    this.els.status.textContent = text;
    this.els.status.classList.toggle('error', isError);
  }

  async load() {
    const id = ++this.requestId;
    const place = settings.place;
    const metrics = COMPARE_METRICS.filter((m) => this.metrics.has(m.field));
    const offsets = [...this.offsets].sort((a, b) => a - b);

    if (!metrics.length) {
      this.clear();
      this.setStatus('비교할 지표를 하나 이상 선택해 주세요.');
      return;
    }

    try {
      if (this.mode === 'period') {
        const p = this.period();
        if (typeof p === 'string') {
          this.clear();
          this.setStatus(p, true);
          return;
        }
        this.setStatus('과거 데이터를 불러오는 중…');
        const data = await loadPeriodData(place.lat, place.lon, p.start, p.end, offsets, this.withNormal);
        if (id !== this.requestId) return;
        this.clear();
        this.setStatus('');
        const summaries: [string, string][] = [];
        for (const m of metrics) {
          const cmp = buildPeriodComparison(data, p.start, p.end, m, offsets, this.withNormal);
          this.renderPeriodChart(m, cmp);
          summaries.push(this.periodSummaryRow(m, cmp));
        }
        this.renderSummary(p, summaries);
      } else {
        const thisYear = Number(todayIso().slice(0, 4));
        const years = [thisYear, ...offsets.map((n) => thisYear - n)];
        this.setStatus('월별 데이터를 불러오는 중…');
        const data = await loadMonthlyData(place.lat, place.lon, years, this.withNormal);
        if (id !== this.requestId) return;
        this.clear();
        this.setStatus('');
        for (const m of metrics) this.renderMonthlyChart(m, buildMonthlyComparison(data, m, years, this.withNormal), thisYear);
      }
    } catch (e) {
      if (id !== this.requestId) return;
      this.clear();
      this.setStatus(`데이터를 불러오지 못했어요: ${(e as Error).message}`, true);
    }
  }

  private renderPeriodChart(m: CompareMetric, cmp: ReturnType<typeof buildPeriodComparison>) {
    const thisYear = cmp.dates[0].slice(0, 4);
    const card = new ChartCard(m.label, `${shortLabel(cmp.dates[0])} ~ ${shortLabel(cmp.dates[cmp.dates.length - 1])} · 단위: ${m.unit}`);
    this.els.grid.append(card.el);
    const series = [
      { label: `${thisYear}년`, data: cmp.current, color: seriesColor(CURRENT_SLOT), endLabel: true },
      ...cmp.years.map((y) => ({
        label: `${y.year}년`,
        data: y.values,
        color: seriesColor(OFFSETS.find((o) => o.n === y.offset)!.slot),
        endLabel: true,
      })),
    ];
    if (cmp.normal) {
      series.push({ label: `${NORMAL_YEARS}년 평균`, data: cmp.normal.mean, color: themeColors().neutral, endLabel: true, dashed: true } as never);
    }
    const isPrecip = m.monthly === 'sum';
    card.render({
      labels: cmp.dates.map(shortLabel),
      kind: isPrecip && series.length <= 3 ? 'bar' : 'line',
      unit: m.unit,
      decimals: m.decimals,
      min: isPrecip ? 0 : undefined,
      series,
      band: cmp.normal ? { lower: cmp.normal.min, upper: cmp.normal.max, label: `${NORMAL_YEARS}년` } : undefined,
      tooltipTitle: (i) => `${shortLabel(cmp.dates[i])} (${weekday(cmp.dates[i])})`,
    });
    this.cards.push(card);
  }

  private periodSummaryRow(m: CompareMetric, cmp: ReturnType<typeof buildPeriodComparison>): [string, string] {
    const how = m.monthly;
    const refs = cmp.years.map((y) => ({ name: `${y.year}년`, values: y.values }));
    if (cmp.normal) refs.push({ name: `${NORMAL_YEARS}년 평균`, values: cmp.normal.mean });
    const cells = refs.map((r) => {
      const agg = pairedAggregate(cmp.current, r.values, how);
      if (!agg) return `<td>–</td>`;
      const diff = agg.a - agg.b;
      const word = Math.abs(diff) < 10 ** -m.decimals ? '비슷함' : diff > 0 ? m.more : m.less;
      const sign = diff > 0 ? '+' : '';
      return `<td><span class="val">${fmt(agg.b, m.decimals, m.unit)}</span><span class="diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${sign}${fmt(diff, m.decimals, m.unit)} ${word}</span></td>`;
    });
    const cur = cmp.current.filter((v): v is number => v != null);
    const curAgg = cur.length ? (how === 'sum' ? cur.reduce((a, b) => a + b, 0) : cur.reduce((a, b) => a + b, 0) / cur.length) : null;
    const head = `<tr><th scope="col">${how === 'sum' ? '기간 합계' : '기간 평균'}</th><th scope="col">올해</th>${refs
      .map((r) => `<th scope="col">${r.name}</th>`)
      .join('')}</tr>`;
    return [head, `<tr><th scope="row">${m.label}</th><td><span class="val strong">${fmt(curAgg, m.decimals, m.unit)}</span></td>${cells.join('')}</tr>`];
  }

  private renderSummary(p: { start: string; end: string }, rows: [string, string][]) {
    if (!this.offsets.size && !this.withNormal) {
      this.els.summary.innerHTML = `<p class="muted">비교 대상을 선택하면 차이를 요약해서 보여드려요.</p>`;
      return;
    }
    this.els.summary.innerHTML = `
      <section class="card">
        <h3>${settings.place.name} · ${shortLabel(p.start)} ~ ${shortLabel(p.end)} 요약</h3>
        <p class="muted small">차이는 올해 값 기준이에요. 같은 날짜끼리 짝지어 계산해요.</p>
        <div class="table-scroll"><table class="summary-table"><thead>${rows[0][0]}</thead><tbody>${rows.map((r) => r[1]).join('')}</tbody></table></div>
      </section>`;
  }

  private renderMonthlyChart(m: CompareMetric, cmp: ReturnType<typeof buildMonthlyComparison>, thisYear: number) {
    const card = new ChartCard(`월별 ${m.label}`, `${m.monthly === 'sum' ? '월 합계' : '월 평균'} · 단위: ${m.unit} · ${new Date().getMonth() + 1}월은 오늘까지`);
    this.els.grid.append(card.el);
    const isBar = m.monthly === 'sum';
    const series = cmp.years.map((y) => ({
      label: `${y.year}년`,
      data: y.values,
      color: seriesColor(y.year === thisYear ? CURRENT_SLOT : OFFSETS.find((o) => o.n === thisYear - y.year)!.slot),
      endLabel: !isBar,
      dashed: false,
    }));
    if (cmp.normal) {
      series.push({ label: `${NORMAL_YEARS}년 평균`, data: cmp.normal.mean, color: themeColors().neutral, endLabel: !isBar, dashed: true });
    }
    card.render({
      labels: cmp.months.map((n) => `${n}월`),
      kind: isBar ? 'bar' : 'line',
      unit: m.unit,
      decimals: m.decimals,
      min: isBar ? 0 : undefined,
      series,
      // A min–max band reads poorly behind bars; bars get the average as its own bar instead.
      band: cmp.normal && !isBar ? { lower: cmp.normal.min, upper: cmp.normal.max, label: `${NORMAL_YEARS}년` } : undefined,
    });
    this.cards.push(card);
  }
}
