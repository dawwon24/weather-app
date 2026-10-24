import { localMatches, reverseGeocode, searchPlaces } from '../api/geocode';
import type { Place } from '../data/korea-cities';
import { samePlace, save, setPlace, settings } from '../state';

/** Header: place search (opened by the 🔍 toggle) with suggestions, favorite chips, and "my location". */
export function initSearch(root: HTMLElement, toggle: HTMLButtonElement) {
  root.innerHTML = `
    <div class="search" id="search-box" hidden>
      <input type="search" placeholder="동네·도시 검색 (예: 역삼동, 부산, Tokyo)" autocomplete="off"
        role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" aria-label="지역 검색">
      <ul id="search-results" role="listbox" hidden></ul>
    </div>
    <div class="place-actions">
      <div class="favorites" aria-label="즐겨찾기"></div>
      <button type="button" class="ghost" data-locate>📍 내 위치</button>
    </div>
    <p class="locate-msg" role="alert" hidden></p>`;

  const input = root.querySelector('input')!;
  const list = root.querySelector('ul')!;
  const locate = root.querySelector<HTMLButtonElement>('[data-locate]')!;
  const favBox = root.querySelector<HTMLElement>('.favorites')!;
  const box = root.querySelector<HTMLElement>('.search')!;

  let results: Place[] = [];
  let active = -1;
  let timer = 0;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };

  const show = (items: Place[], message = '') => {
    results = items;
    active = -1;
    list.replaceChildren();
    if (message) {
      const li = document.createElement('li');
      li.className = 'msg';
      li.textContent = message;
      list.append(li);
    }
    items.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `sr-${i}`;
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="r-name"></span><span class="r-detail"></span>`;
      li.querySelector('.r-name')!.textContent = p.name;
      li.querySelector('.r-detail')!.textContent = p.detail;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        choose(p);
      });
      list.append(li);
    });
    list.hidden = !items.length && !message;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };

  const setOpen = (open: boolean) => {
    box.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else {
      input.value = '';
      close();
    }
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));

  const choose = (p: Place) => {
    setOpen(false);
    setPlace(p);
  };

  const highlight = (i: number) => {
    active = i;
    list.querySelectorAll('[role=option]').forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    input.setAttribute('aria-activedescendant', i >= 0 ? `sr-${i}` : '');
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    show(localMatches(q), '검색 중…');
    timer = window.setTimeout(async () => {
      const my = ++seq;
      try {
        const found = await searchPlaces(q);
        if (my !== seq) return;
        show(found, found.length ? '' : '검색 결과가 없어요.');
      } catch (e) {
        if (my === seq) show(localMatches(q), (e as Error).message);
      }
    }, 450);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      highlight((active + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      highlight((active - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (active >= 0) choose(results[active]);
      else if (results.length) choose(results[0]);
    } else if (e.key === 'Escape') {
      if (!list.hidden) close();
      else {
        setOpen(false);
        toggle.focus();
      }
    }
  });
  input.addEventListener('blur', (e) => {
    // Leaving an empty box folds it back to the 🔍 button; the toggle handles its own click.
    if (e.relatedTarget === toggle) return;
    setTimeout(() => (input.value.trim() ? close() : setOpen(false)), 100);
  });

  const locateMsg = root.querySelector<HTMLElement>('.locate-msg')!;
  const showLocateError = (text: string) => {
    locateMsg.replaceChildren(text + ' ');
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ghost small';
    dismiss.textContent = '닫기';
    dismiss.addEventListener('click', () => (locateMsg.hidden = true));
    locateMsg.append(dismiss);
    locateMsg.hidden = false;
  };
  const resetLocate = () => {
    locate.disabled = false;
    locate.textContent = '📍 내 위치';
  };

  locate.addEventListener('click', () => {
    locateMsg.hidden = true;
    if (!navigator.geolocation) {
      showLocateError('이 브라우저는 위치 기능을 지원하지 않아요.');
      return;
    }
    if (!window.isSecureContext) {
      showLocateError('위치 기능은 https 또는 localhost 주소에서만 동작해요.');
      return;
    }
    locate.disabled = true;
    locate.textContent = '📍 찾는 중…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        resetLocate();
        // Desktop browsers without GPS estimate position from Wi-Fi/IP and can be kilometers off.
        if (pos.coords.accuracy > 5000) {
          showLocateError(`위치 정확도가 낮아요(오차 약 ${Math.round(pos.coords.accuracy / 1000)}km). 위치가 다르면 검색으로 찾아 주세요.`);
        }
        setPlace(p);
      },
      (err) => {
        resetLocate();
        if (err.code === err.PERMISSION_DENIED) {
          showLocateError('위치 권한이 거부됐어요. 주소창 왼쪽의 아이콘을 눌러 위치 권한을 허용하거나, Windows 설정 > 개인 정보 > 위치가 켜져 있는지 확인해 주세요.');
        } else {
          showLocateError(
            '위치를 확인하지 못했어요. PC는 GPS가 없어 Wi-Fi나 네트워크 정보로 위치를 추정하는데, 휴대폰 테더링이나 프록시를 쓰면 이 추정이 실패할 수 있어요.',
          );
        }
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  });

  const renderFavorites = () => {
    favBox.replaceChildren();
    const cur = settings.place;
    const isFav = settings.favorites.some((f) => samePlace(f, cur));

    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'chip star';
    star.setAttribute('aria-pressed', String(isFav));
    star.textContent = isFav ? '★ 즐겨찾기됨' : '☆ 즐겨찾기';
    star.title = isFav ? '즐겨찾기에서 빼기' : '현재 지역을 즐겨찾기에 추가';
    star.addEventListener('click', () => {
      if (isFav) settings.favorites = settings.favorites.filter((f) => !samePlace(f, cur));
      else settings.favorites = [...settings.favorites, cur].slice(-8);
      save();
      renderFavorites();
    });
    favBox.append(star);

    for (const f of settings.favorites) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = f.name;
      b.title = f.detail;
      b.setAttribute('aria-pressed', String(samePlace(f, cur)));
      b.addEventListener('click', () => setPlace(f));
      favBox.append(b);
    }
  };

  return { renderFavorites };
}
