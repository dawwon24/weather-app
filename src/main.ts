import './styles.css';
import { fetchForecast, type ForecastResponse } from './api/forecast';
import { onPlaceChange, save, setPlace, settings, type Tab } from './state';
import { CompareView } from './ui/compareView';
import { renderCurrent, renderDaily } from './ui/currentCard';
import { ForecastView } from './ui/forecastCharts';
import { KoreaView } from './ui/koreaMap';
import { initSearch } from './ui/search';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---------- Theme ----------
const themeBtn = $('#theme-toggle');
function applyTheme() {
  const t = settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'auto' ? '🌓 자동' : t === 'dark' ? '🌙 다크' : '☀️ 라이트';
}
themeBtn.addEventListener('click', () => {
  settings.theme = settings.theme === 'auto' ? 'light' : settings.theme === 'light' ? 'dark' : 'auto';
  save();
  applyTheme();
  rerenderCharts();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => rerenderCharts());
applyTheme();

// ---------- Views ----------
const search = initSearch($('#search-bar'), {
  onPickOnMap: () => {
    selectTab('korea');
    koreaView.focusMap();
  },
});
const forecastView = new ForecastView($('#forecast-charts'));
const compareView = new CompareView($('#panel-compare'));
const koreaView = new KoreaView($('#panel-korea'), (p) => {
  setPlace({ name: p.name, detail: p.detail, lat: p.lat, lon: p.lon });
  selectTab('forecast');
});

let forecast: ForecastResponse | null = null;
const tabsLoaded = new Set<Tab>();

function rerenderCharts() {
  forecastView.render();
  if (tabsLoaded.has('compare')) compareView.load();
}

// ---------- Tabs ----------
const tabs = document.querySelectorAll<HTMLButtonElement>('[role=tab]');
function selectTab(tab: Tab) {
  settings.tab = tab;
  save();
  tabs.forEach((t) => {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#panel-${t.dataset.tab}`).hidden = !on;
  });
  if (tab === 'compare' && !tabsLoaded.has('compare')) {
    tabsLoaded.add('compare');
    compareView.load();
  }
  if (tab === 'korea') koreaView.show();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.tab as Tab));
  t.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.focus();
    selectTab(next.dataset.tab as Tab);
  });
});

// ---------- Data ----------
const status = $('#status');
let loadSeq = 0;
async function loadPlace() {
  const my = ++loadSeq;
  const place = settings.place;
  search.renderFavorites();
  document.title = `${place.name} 날씨`;
  status.textContent = '날씨를 불러오는 중…';
  status.classList.remove('error');
  try {
    const f = await fetchForecast(place.lat, place.lon);
    if (my !== loadSeq) return;
    forecast = f;
    status.textContent = '';
    renderCurrent($('#current'), place, f);
    renderDaily($('#daily'), f);
    forecastView.setData(f);
  } catch (e) {
    if (my !== loadSeq) return;
    status.textContent = `날씨를 불러오지 못했어요: ${(e as Error).message}`;
    status.classList.add('error');
  }
  if (tabsLoaded.has('compare')) compareView.load();
  koreaView.markHere();
}

onPlaceChange(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadPlace();
});

// Refresh current conditions every 10 minutes while the page is open.
setInterval(() => {
  if (forecast && document.visibilityState === 'visible') loadPlace();
}, 10 * 60_000);

selectTab(settings.tab);
loadPlace();
