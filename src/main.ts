import './styles.css';
import { fetchForecast, type ForecastResponse } from './api/forecast';
import { onPlaceChange, save, settings } from './state';
import { renderCurrent } from './ui/currentCard';
import { DailyView } from './ui/dailyView';
import { initSearch } from './ui/search';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---------- Theme ----------
const themeBtn = $('#theme-toggle');
function applyTheme() {
  const t = settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'auto' ? '🌓' : t === 'dark' ? '🌙' : '☀️';
  const label = `테마: ${t === 'auto' ? '자동' : t === 'dark' ? '다크' : '라이트'} (눌러서 바꾸기)`;
  themeBtn.title = label;
  themeBtn.setAttribute('aria-label', label);
}
themeBtn.addEventListener('click', () => {
  settings.theme = settings.theme === 'auto' ? 'light' : settings.theme === 'light' ? 'dark' : 'auto';
  save();
  applyTheme();
  dailyView.render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => dailyView.render());
applyTheme();

// ---------- Views ----------
const search = initSearch($('#search-bar'), $<HTMLButtonElement>('#search-toggle'), $('#header-actions'));
const dailyView = new DailyView($('#daily'));

// ---------- Data ----------
let forecast: ForecastResponse | null = null;
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
    dailyView.setData(f);
  } catch (e) {
    if (my !== loadSeq) return;
    status.textContent = `날씨를 불러오지 못했어요: ${(e as Error).message}`;
    status.classList.add('error');
  }
}

onPlaceChange(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadPlace();
});

// Refresh current conditions every 10 minutes while the page is open.
setInterval(() => {
  if (forecast && document.visibilityState === 'visible') loadPlace();
}, 10 * 60_000);

loadPlace();
