/* ===== 地點 ===== */
let placesSessionUnavailable = false,
  lastPlacesProject = '';
$('#nearBtn').onclick = () => {
  if (effectiveMapsKey() && !settings.osm && !placesSessionUnavailable) googleNearby();
  else osmNearby();
};
function resetGoogleLoader() {
  gmapsReady = false;
  storeAC = null;
  googleLoadPromise = null;
  placesSessionUnavailable = false;
  const old = document.getElementById('gmapsScript');
  if (old) old.remove();
}
function mapCurrentOrigin() {
  return /^https?:$/.test(location.protocol)
    ? location.origin
    : location.protocol + '//' + (location.host || '(本機檔案)');
}
function recommendedMapReferrer() {
  return /^https?:$/.test(location.protocol) ? location.origin.replace(/\/$/, '') + '/*' : '';
}
function extractGoogleProject(m) {
  const x = String(m || '').match(/project\s+(\d{6,})/i);
  if (x) {
    lastPlacesProject = x[1];
    return x[1];
  }
  return lastPlacesProject || '';
}
function placesErrorText(e) {
  const m = String(e?.message || e || '未知錯誤'),
    proj = extractGoogleProject(m);
  if (
    /has not been used|is disabled|ApiNotActivated|not activated|SERVICE_DISABLED|PERMISSION_DENIED/i.test(
      m,
    )
  ) {
    placesSessionUnavailable = true;
    return `Places API (New) 尚未啟用${proj ? '於 Google Cloud 專案 ' + proj : ''}；已暫時改用 OpenStreetMap`;
  }
  if (/Billing|billing/i.test(m)) return 'Google Maps 專案尚未啟用計費';
  if (/RefererNotAllowed|referrer|referer|REQUEST_DENIED/i.test(m)) {
    const r = recommendedMapReferrer();
    return r
      ? 'API 金鑰未允許目前來源 ' +
          mapCurrentOrigin() +
          '；請在 Google Cloud 的「網站」限制加入 ' +
          r
      : '目前不是 HTTPS/HTTP 網址，Google 的網站來源限制無法正確驗證；請用 GitHub Pages 等 HTTPS 網址開啟';
  }
  if (/InvalidKey|API key|key invalid/i.test(m))
    return 'Google Maps API 金鑰無效或 API 限制設定不符';
  return m.slice(0, 260);
}
function ensureGoogle() {
  const key = effectiveMapsKey();
  if (!key) return Promise.reject(new Error('網站尚未設定 Google Places；將使用 OpenStreetMap'));
  if (!/^https?:$/.test(location.protocol))
    return Promise.reject(
      new Error(
        '目前不是 HTTPS/HTTP 網址；Google Maps 的網站來源限制通常無法驗證本機 content:// 或 file:// 頁面',
      ),
    );
  const ready = async () => {
    if (!window.google?.maps?.importLibrary)
      throw new Error('Google Maps JavaScript API 未完整載入');
    const lib = await google.maps.importLibrary('places');
    if (!lib?.Place?.searchNearby)
      throw new Error('目前專案無法使用 Places API (New) Nearby Search');
    gmapsReady = true;
    attachAC();
    return lib;
  };
  if (window.google?.maps?.importLibrary) return ready();
  if (googleLoadPromise) return googleLoadPromise;
  googleLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    window.gm_authFailure = () => {
      if (settled) return;
      settled = true;
      resetGoogleLoader();
      reject(
        new Error(
          'Google Maps API 驗證失敗：請檢查金鑰、Authorized referrer、Billing 與 Places API (New)',
        ),
      );
    };
    const sc = document.createElement('script');
    sc.id = 'gmapsScript';
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=zh-TW&region=TW&v=weekly&loading=async`;
    sc.async = true;
    sc.onload = () => {
      if (settled) return;
      ready()
        .then((x) => {
          settled = true;
          resolve(x);
        })
        .catch((e) => {
          settled = true;
          googleLoadPromise = null;
          reject(e);
        });
    };
    sc.onerror = () => {
      if (settled) return;
      settled = true;
      googleLoadPromise = null;
      reject(new Error('Google Maps JavaScript API 載入失敗'));
    };
    document.head.appendChild(sc);
  });
  return googleLoadPromise;
}
const COMMON_CHAIN_PATTERNS = [
  ['7-ELEVEN', /(?:7\s*[-－]?\s*ELEVEN|統一超商)/i],
  ['全聯', /(?:全聯福利中心|PX\s*MART|全聯)/i],
  ['全家', /(?:Family\s*Mart|全家便利商店|全家)/i],
  ['萊爾富', /(?:Hi[- ]?Life|萊爾富)/i],
  ['OKmart', /(?:OK\s*mart|OK便利商店)/i],
  ['家樂福', /(?:Carrefour|家樂福)/i],
  ['星巴克', /(?:Starbucks|星巴克)/i],
  ['路易莎', /(?:Louisa|路易莎)/i],
  ['麥當勞', /(?:McDonald'?s?|麥當勞)/i],
  ['摩斯漢堡', /(?:MOS\s*Burger|摩斯漢堡|摩斯)/i],
  ['康是美', /康是美/i],
  ['屈臣氏', /(?:Watsons|屈臣氏)/i],
];
function cleanBranchName(x) {
  return String(x || '')
    .replace(/^[\s・｜|—–-]+/, '')
    .replace(/^(?:PX\s*MART|Family\s*Mart|福利中心|便利商店|超市|門市|分店)\s*/i, '')
    .replace(/\s+(?:PX\s*MART|Family\s*Mart)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function inferChainBranch(name) {
  const raw = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return { chain: '', branch: '', recognized: false };
  for (const [canon, re] of COMMON_CHAIN_PATTERNS) {
    const m = raw.match(re);
    if (m) {
      let tail = raw.slice((m.index || 0) + m[0].length);
      for (const [, r2] of COMMON_CHAIN_PATTERNS) tail = tail.replace(r2, ' ');
      tail = cleanBranchName(tail);
      return { chain: canon, branch: tail, recognized: true };
    }
  }
  for (const c of chainCatalog().sort((a, b) => b.length - a.length)) {
    const i = raw.toLowerCase().indexOf(c.toLowerCase());
    if (i >= 0)
      return { chain: c, branch: cleanBranchName(raw.slice(i + c.length)), recognized: true };
  }
  return { chain: '', branch: raw, recognized: false };
}
function stripTaiwanAddressPrefix(name) {
  let x = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d{3,6}\s*/, '');
  const re =
    /^(?:(?:臺|台)北市|新北市|桃園市|(?:(?:臺|台)中市)|(?:(?:臺|台)南市)|高雄市|基隆市|新竹市|嘉義市|.{1,3}縣)(?:.{1,7}[區鄉鎮市])?(?:.{1,7}[里村])?[^\s]{1,16}?(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?(?:\d+巷)?(?:\d+弄)?(?:\d+號)?\s*/;
  const y = x.replace(re, '').trim();
  if (y !== x) return y.length >= 2 ? y : x;
  const re2 =
    /^(?:(?:臺|台)北市|新北市|桃園市|(?:臺|台)中市|(?:臺|台)南市|高雄市|基隆市|新竹市|嘉義市|.{1,3}[縣市])(?:.{1,4}?[鄉鎮市區])(?:.{1,4}?[里村])?/;
  const z = x.replace(re2, '').trim();
  return z !== x && z.length >= 2 ? z : x;
}
function shortPlaceName(name) {
  const raw = String(name || '')
      .replace(/\s+/g, ' ')
      .trim(),
    stripped = stripTaiwanAddressPrefix(raw),
    x = inferChainBranch(stripped);
  if (x.recognized) return x.chain + (x.branch ? ' ' + x.branch : '');
  return stripped;
}
function chainNameOfRecord(r) {
  if (r?.storeChain) return r.storeChain;
  const x = inferChainBranch(r?.store || '');
  return x.recognized ? x.chain : '';
}
function placeTypeToCategory(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return '';
  const inn = (arr) => arr.some((k) => t === k || t.includes(k));
  if (
    inn([
      'convenience',
      'restaurant',
      'cafe',
      'coffee',
      'bakery',
      'meal_takeaway',
      'meal_delivery',
      'fast_food',
      'food_court',
      'bar',
      'pub',
      'ice_cream',
      'deli',
      'food',
    ])
  )
    return '餐食';
  if (inn(['gas_station', 'fuel', 'parking', 'transit', 'bus_station', 'train_station', 'subway']))
    return '交通';
  if (inn(['pharmacy', 'drugstore', 'chemist', 'doctor', 'hospital', 'clinic', 'dentist']))
    return '醫療';
  if (
    inn([
      'movie',
      'cinema',
      'book',
      'fitness',
      'sports',
      'gym',
      'stadium',
      'amusement',
      'bowling',
      'karaoke',
    ])
  )
    return '娛樂';
  if (inn(['home_goods', 'furniture', 'hardware', 'laundry', 'dry_cleaning', 'florist']))
    return '居家';
  if (
    inn([
      'supermarket',
      'grocery',
      'food_store',
      'marketplace',
      'discount_store',
      'variety_store',
      'department_store',
      'shopping_mall',
    ])
  )
    return '日用品';
  return '';
}
function applyPlaceTypeCategory(type) {
  if (getKind() !== 'expense' || selCat) return;
  const c = placeTypeToCategory(type);
  if (c && catsExpense.includes(c)) {
    selCat = c;
    selSub = null;
    renderChipSelectors();
    renderSubChips();
  }
}
function applyPlaceNameToStore(name, type = '') {
  const n = shortPlaceName(name),
    x = inferChainBranch(n);
  if (storeMode === 'chain') {
    if (x.recognized) {
      setChainValue(x.chain);
      $('#f-chain').value = x.chain;
      $('#f-branch').value = x.branch;
    } else {
      $('#f-chain').value = '';
      $('#f-branch').value = n;
    }
    refreshBranchList();
  } else $('#f-store').value = n;
  refreshStoreItems();
  smartFillFromStore();
  applyPlaceTypeCategory(type);
}
let storeSuggestTimer = null,
  storeSuggestSeq = 0;
function renderStoreSuggestions(names) {
  const box = $('#storeSuggest');
  if (!box) return;
  const uniq = [...new Set((names || []).map(shortPlaceName).filter(Boolean))].slice(0, 6);
  box.innerHTML = uniq
    .map((n, i) => `<button type="button" data-si="${i}">${esc(n)}</button>`)
    .join('');
  box.querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        applyPlaceNameToStore(uniq[+b.dataset.si]);
        box.innerHTML = '';
      }),
  );
}
async function fetchShortStoreSuggestions(q) {
  if (!hasAdvancedAccess() || storeMode !== 'single' || q.trim().length < 2) {
    renderStoreSuggestions([]);
    return;
  }
  const seq = ++storeSuggestSeq;
  try {
    const lib = await ensureGoogle();
    if (seq !== storeSuggestSeq) return;
    const A = lib.AutocompleteSuggestion || google.maps.places.AutocompleteSuggestion;
    if (!A?.fetchAutocompleteSuggestions) return;
    const { suggestions } = await A.fetchAutocompleteSuggestions({
      input: q.trim(),
      language: 'zh-TW',
      region: 'tw',
    });
    if (seq !== storeSuggestSeq) return;
    const names = (suggestions || [])
      .map((s) => {
        const p = s.placePrediction || {};
        return (
          p.structuredFormat?.mainText?.text ||
          p.structuredFormat?.mainText?.toString?.() ||
          p.structuredFormatting?.main_text ||
          p.text?.text ||
          p.text?.toString?.() ||
          ''
        );
      })
      .filter(Boolean);
    renderStoreSuggestions(names);
  } catch (e) {
    console.warn('short autocomplete failed', e);
  }
}
function attachAC() {
  if (storeAC) return;
  storeAC = { mode: 'short-custom' };
  $('#f-store').addEventListener('input', () => {
    clearTimeout(storeSuggestTimer);
    const q = $('#f-store').value;
    storeSuggestTimer = setTimeout(() => fetchShortStoreSuggestions(q), 450);
  });
}
function currentCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('此裝置不支援定位'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? '定位權限未允許' : '無法取得目前位置')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 },
    );
  });
}
async function searchGooglePlacesAt(lat, lng) {
  const placesLib = await ensureGoogle();
  const spendingTypes = [
    'restaurant',
    'cafe',
    'coffee_shop',
    'bakery',
    'meal_takeaway',
    'fast_food_restaurant',
    'convenience_store',
    'supermarket',
    'grocery_store',
    'food_store',
    'department_store',
    'discount_store',
    'shopping_mall',
    'store',
    'pharmacy',
    'drugstore',
    'gas_station',
    'book_store',
    'clothing_store',
    'electronics_store',
    'home_goods_store',
    'beauty_salon',
    'hair_salon',
    'laundry',
    'movie_theater',
  ];
  const req = {
    fields: ['displayName', 'location', 'primaryType'],
    includedPrimaryTypes: spendingTypes,
    locationRestriction: { center: { lat, lng }, radius: APP_CONFIG.mapsRadiusMeters },
    maxResultCount: 12,
    rankPreference:
      placesLib.SearchNearbyRankPreference?.DISTANCE ||
      placesLib.SearchNearbyRankPreference?.POPULARITY,
  };
  const { places } = await placesLib.Place.searchNearby(req);
  return (places || [])
    .map((p) => ({
      name: typeof p.displayName === 'string' ? p.displayName : p.displayName?.text || '',
      address: '',
      type: p.primaryType || '',
    }))
    .filter((x) => x.name);
}
async function googleNearby() {
  const btn = $('#nearBtn');
  if (placesSessionUnavailable) return osmNearby();
  btn.textContent = '📍 定位中…';
  btn.disabled = true;
  try {
    const c = await currentCoords();
    btn.textContent = '📍 搜尋附近…';
    const items = await searchGooglePlacesAt(c.lat, c.lng);
    if (!items.length)
      throw new Error(`Google Places 在 ${APP_CONFIG.mapsRadiusMeters} 公尺內沒有回傳地點`);
    showNearChips(items);
    const d = $('#placesDiag');
    if (d)
      d.textContent = `Google Places 正常 · ${APP_CONFIG.mapsRadiusMeters} 公尺內找到 ${items.length} 個地點 · 定位誤差約 ${Math.round(c.accuracy || 0)} m`;
  } catch (e) {
    console.warn('Google nearby failed', e);
    const msg = placesErrorText(e),
      d = $('#placesDiag');
    if (d) d.textContent = 'Google Places：' + msg;
    toast('Google 地點服務目前不可用，已改用 OpenStreetMap');
    try {
      const c = await currentCoords();
      await osmNearbyAt(c.lat, c.lng, true);
    } catch (_) {}
  } finally {
    btn.textContent = '📍 找附近店家';
    btn.disabled = false;
  }
}
async function testGooglePlaces() {
  const b = $('#testPlacesBtn'),
    d = $('#placesDiag');
  if (!b || !d) return;
  b.disabled = true;
  b.textContent = '測試中…';
  placesSessionUnavailable = false;
  if (!hasAdvancedAccess()) {
    d.textContent = '目前未登入白名單 Google 帳號；附近店家會使用 OpenStreetMap。';
    b.disabled = false;
    b.textContent = '測試地點服務';
    return;
  }
  if (!APP_CONFIG.mapsApiKey) {
    d.textContent = '網站尚未設定 Google Places；附近店家會使用 OpenStreetMap。';
    b.disabled = false;
    b.textContent = '測試地點服務';
    return;
  }
  d.textContent = '正在檢查 Google Places 與定位…';
  try {
    const c = await currentCoords(),
      items = await searchGooglePlacesAt(c.lat, c.lng);
    d.textContent = items.length
      ? `✓ Google Places 可用，${APP_CONFIG.mapsRadiusMeters} 公尺內找到 ${items.length} 個地點`
      : 'Google Places 已連線，但目前範圍沒有結果';
  } catch (e) {
    d.textContent = '△ ' + placesErrorText(e) + '；實際找店時會自動改用 OpenStreetMap。';
  } finally {
    b.disabled = false;
    b.textContent = '測試地點服務';
  }
}
function openPlacesApiConsole() {
  const proj = lastPlacesProject || '919564958801';
  window.open(
    `https://console.cloud.google.com/apis/library/places.googleapis.com?project=${encodeURIComponent(proj)}`,
    '_blank',
    'noopener',
  );
}
async function fetchOverpass(q) {
  const urls = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let last = null;
  for (const base of urls) {
    try {
      const ctl = new AbortController(),
        to = setTimeout(() => ctl.abort(), 16000);
      const r = await fetch(base + '?data=' + encodeURIComponent(q), {
        cache: 'no-store',
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('Overpass unavailable');
}
async function osmNearby() {
  const btn = $('#nearBtn');
  btn.textContent = '📍 定位中…';
  btn.disabled = true;
  try {
    const c = await currentCoords();
    await osmNearbyAt(c.lat, c.lng, false);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.textContent = '📍 找附近店家';
    btn.disabled = false;
  }
}
async function osmNearbyAt(la, lo, fromFallback = false) {
  const btn = $('#nearBtn');
  btn.textContent = '📍 搜尋附近…';
  btn.disabled = true;
  const q = `[out:json][timeout:15];(nwr(around:250,${la},${lo})["name"]["shop"];nwr(around:250,${la},${lo})["name"]["amenity"~"restaurant|cafe|fast_food|food_court|bar|pub|pharmacy|fuel|marketplace|cinema|ice_cream"];nwr(around:250,${la},${lo})["name"]["leisure"~"fitness_centre|sports_centre"];);out center tags 100;`;
  try {
    const d = await fetchOverpass(q),
      seen = new Set(),
      items = [];
    (d.elements || []).forEach((e) => {
      const n = e.tags && (e.tags['name:zh-Hant'] || e.tags['name:zh'] || e.tags.name);
      const ela = e.lat ?? e.center?.lat,
        elo = e.lon ?? e.center?.lon;
      if (!n || !Number.isFinite(ela) || !Number.isFinite(elo)) return;
      const dx = (elo - lo) * 111000 * Math.cos((la * Math.PI) / 180),
        dy = (ela - la) * 111000,
        dist = Math.hypot(dx, dy),
        key = n + '|' + Math.round(dist / 30);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        name: n,
        address: '',
        dist,
        type: e.tags.shop || e.tags.amenity || e.tags.leisure || '',
      });
    });
    items.sort((a, b) => a.dist - b.dist);
    const top = items.slice(0, 18);
    if (!top.length) toast('250 公尺內查無適合消費的 OpenStreetMap 店家');
    else {
      showNearChips(top);
      if (fromFallback) toast(`已改用 OpenStreetMap，找到 ${top.length} 個地點`);
    }
  } catch (e) {
    console.warn('OSM nearby failed', e);
    toast('附近地點服務暫時無法連線');
  } finally {
    btn.textContent = '📍 找附近店家';
    btn.disabled = false;
  }
}
function showNearChips(items) {
  items = (items || []).map((x) =>
    typeof x === 'string' ? { name: shortPlaceName(x) } : { ...x, name: shortPlaceName(x.name) },
  );
  $('#nearChips').innerHTML = items
    .map((x, i) => `<button data-i="${i}">${esc(x.name)}</button>`)
    .join('');
  $('#nearChips')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          applyPlaceNameToStore(items[+b.dataset.i]?.name || '', items[+b.dataset.i]?.type || '');
        }),
    );
}
