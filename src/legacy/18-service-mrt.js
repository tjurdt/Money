/* ===== 臺北捷運票價快捷：只在交通情境出現 ===== */
const MRT_FARE_URL =
  'https://data.taipei/api/dataset/4acb4911-0360-4063-808d-fcee629508b3/resource/893c2f2a-dcfd-407b-b871-394a14105532/download';
const MRT_FARE_URL_LEGACY =
  'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=893c2f2a-dcfd-407b-b871-394a14105532';
const MRT_CACHE_KEY = 'ledger.mrt.fares.v2';
const MRT_COMMON_STATIONS = [
  '動物園',
  '木柵',
  '萬芳社區',
  '萬芳醫院',
  '辛亥',
  '麟光',
  '六張犁',
  '科技大樓',
  '大安',
  '忠孝復興',
  '南京復興',
  '中山國中',
  '松山機場',
  '大直',
  '劍南路',
  '西湖',
  '港墘',
  '文德',
  '內湖',
  '大湖公園',
  '葫洲',
  '東湖',
  '南港軟體園區',
  '南港展覽館',
  '象山',
  '台北101/世貿',
  '信義安和',
  '大安森林公園',
  '東門',
  '中正紀念堂',
  '台大醫院',
  '台北車站',
  '中山',
  '雙連',
  '民權西路',
  '圓山',
  '劍潭',
  '士林',
  '芝山',
  '明德',
  '石牌',
  '唭哩岸',
  '奇岩',
  '北投',
  '新北投',
  '復興崗',
  '忠義',
  '關渡',
  '竹圍',
  '紅樹林',
  '淡水',
  '新店',
  '新店區公所',
  '七張',
  '小碧潭',
  '大坪林',
  '景美',
  '萬隆',
  '公館',
  '台電大樓',
  '古亭',
  '小南門',
  '西門',
  '北門',
  '松江南京',
  '台北小巨蛋',
  '南京三民',
  '松山',
  '南勢角',
  '景安',
  '永安市場',
  '頂溪',
  '忠孝新生',
  '行天宮',
  '中山國小',
  '大橋頭',
  '台北橋',
  '菜寮',
  '三重',
  '先嗇宮',
  '頭前庄',
  '新莊',
  '輔大',
  '丹鳳',
  '迴龍',
  '三重國小',
  '三和國中',
  '徐匯中學',
  '三民高中',
  '蘆洲',
  '頂埔',
  '永寧',
  '土城',
  '海山',
  '亞東醫院',
  '府中',
  '板橋',
  '新埔',
  '江子翠',
  '龍山寺',
  '善導寺',
  '忠孝敦化',
  '國父紀念館',
  '市政府',
  '永春',
  '後山埤',
  '昆陽',
  '南港',
  '十四張',
  '秀朗橋',
  '景平',
  '中和',
  '橋和',
  '中原',
  '板新',
  '新埔民生',
  '幸福',
  '新北產業園區',
];
let mrtFareType = 'full',
  mrtFareData = load(MRT_CACHE_KEY, null),
  mrtCurrentFare = null,
  mrtLoading = false,
  mrtLoadError = '',
  mrtFareSource = '';
const MRT_VERIFIED_FALLBACK = {
  '明德|石牌': { full: 20, discount: 8 },
  '明德|芝山': { full: 20, discount: 8 },
  '明德|士林': { full: 20, discount: 8 },
  '明德|劍潭': { full: 20, discount: 8 },
  '明德|北投': { full: 20, discount: 8 },
  '明德|台北車站': { full: 25, discount: 10 },
  '明德|中山': { full: 25, discount: 10 },
  '明德|西門': { full: 30, discount: 12 },
  '明德|忠孝復興': { full: 30, discount: 12 },
  '明德|市政府': { full: 35, discount: 14 },
  '明德|台北101/世貿': { full: 35, discount: 14 },
};
function updateMrtQuick() {
  const on =
    getKind() === 'expense' &&
    (String(selCat || '').includes('交通') || String(selSub || '').includes('大眾運輸'));
  $('#mrtQuickWrap')?.classList.toggle('hidden', !on);
}
function pickCsvKey(row, re) {
  return Object.keys(row || {}).find((k) => re.test(String(k).replace(/\s/g, ''))) || '';
}
function normalizeStationName(x) {
  return String(x || '')
    .replace(/^[A-Z]{1,3}\d{1,3}[A-Z]?\s*/i, '')
    .replace(/臺北101[／/]世貿/g, '台北101/世貿')
    .replace(/臺北車站/g, '台北車站')
    .replace(/臺大醫院/g, '台大醫院')
    .replace(/\s+/g, '')
    .trim();
}
function buildMrtData(rows) {
  if (!rows?.length) return null;
  const sample = rows.find((r) => r && Object.keys(r).length) || {},
    ks = pickCsvKey(sample, /起站|起點|起站名稱/),
    ke = pickCsvKey(sample, /訖站|終點|迄站|訖站名稱/),
    kf = pickCsvKey(sample, /全票.*票價|全票票價|全票/),
    kd = pickCsvKey(sample, /敬老.*愛心|兒童.*優惠|優惠票價|敬老卡愛心卡/);
  if (!ks || !ke || !kf) return null;
  const fares = {},
    stations = new Set();
  rows.forEach((r) => {
    const a = normalizeStationName(r[ks]),
      b = normalizeStationName(r[ke]),
      full = +String(r[kf] ?? '').replace(/[^0-9.]/g, ''),
      discount = kd ? +String(r[kd] ?? '').replace(/[^0-9.]/g, '') : 0;
    if (!a || !b || !(full > 0)) return;
    stations.add(a);
    stations.add(b);
    fares[a + '|' + b] = { full, discount: discount > 0 ? discount : null };
  });
  if (Object.keys(fares).length < 100) return null;
  return {
    updatedAt: Date.now(),
    stations: [...stations].sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    fares,
  };
}
function parseMrtBytes(buf) {
  if (!window.Papa) throw new Error('CSV 元件尚未載入');
  const encs = ['utf-8', 'big5'];
  let last = null;
  for (const enc of encs) {
    try {
      const text = new TextDecoder(enc).decode(buf),
        parsed = Papa.parse(text.replace(/^\ufeff/, ''), {
          header: true,
          skipEmptyLines: 'greedy',
        }),
        data = buildMrtData(parsed.data || []);
      if (data) return data;
      last = new Error(enc + ' 格式無法辨識');
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('官方票價資料格式無法辨識');
}
async function fetchMrtBytes(url, ms = 9000) {
  const ctl = new AbortController(),
    to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.arrayBuffer();
  } finally {
    clearTimeout(to);
  }
}
function mrtFetchCandidates() {
  const u = encodeURIComponent(MRT_FARE_URL),
    ul = encodeURIComponent(MRT_FARE_URL_LEGACY);
  return [
    { name: '臺北市資料大平臺', url: MRT_FARE_URL },
    { name: '臺北市資料大平臺（舊介面）', url: MRT_FARE_URL_LEGACY },
    { name: '臺北市資料大平臺（跨網域轉接）', url: 'https://api.allorigins.win/raw?url=' + u },
    { name: '臺北市資料大平臺（跨網域備援）', url: 'https://corsproxy.io/?url=' + u },
    { name: '臺北市資料大平臺（舊介面轉接）', url: 'https://api.allorigins.win/raw?url=' + ul },
  ];
}
async function ensureMrtFareData(force = false) {
  if (!force && mrtFareData?.fares && mrtFareData?.stations?.length) return mrtFareData;
  mrtLoading = true;
  mrtLoadError = '';
  $('#mrtRetry').style.display = 'none';
  updateMrtFareResult();
  let last = null;
  try {
    for (const src of mrtFetchCandidates()) {
      try {
        const buf = await fetchMrtBytes(src.url),
          data = parseMrtBytes(buf);
        mrtFareData = data;
        mrtFareSource = src.name;
        try {
          localStorage.setItem(MRT_CACHE_KEY, JSON.stringify(data));
        } catch (e) {}
        return data;
      } catch (e) {
        last = e;
        console.warn('MRT source failed', src.name, e);
      }
    }
    throw last || new Error('無法取得官方票價資料');
  } finally {
    mrtLoading = false;
    if (!mrtFareData) {
      mrtLoadError = String(last?.message || '無法取得官方票價資料');
      $('#mrtRetry').style.display = 'inline-block';
    }
  }
}
function renderMrtStations() {
  const arr = mrtFareData?.stations?.length ? mrtFareData.stations : MRT_COMMON_STATIONS;
  const uniq = [...new Set(arr.map(normalizeStationName).filter(Boolean))];
  $('#mrtStationList').innerHTML = uniq.map((x) => `<option value="${esc(x)}">`).join('');
}
function renderMrtRecent() {
  const box = $('#mrtRecent');
  if (!box) return;
  const pairs = (settings.mrtRecentPairs || []).slice(0, 4);
  box.innerHTML = pairs.length
    ? pairs
        .map(
          (x, i) => `<button type="button" data-mr="${i}">${esc(x.from)} → ${esc(x.to)}</button>`,
        )
        .join('')
    : '';
  box.querySelectorAll('[data-mr]').forEach(
    (b) =>
      (b.onclick = () => {
        const x = pairs[+b.dataset.mr];
        if (!x) return;
        $('#mrtFrom').value = x.from;
        $('#mrtTo').value = x.to;
        updateMrtFareResult();
      }),
  );
}
function findMrtFare(a, b) {
  a = normalizeStationName(a);
  b = normalizeStationName(b);
  if (!a || !b || a === b) return null;
  const live = mrtFareData?.fares?.[a + '|' + b] || mrtFareData?.fares?.[b + '|' + a];
  if (live) return { ...live, _source: mrtFareSource || '官方票價快取' };
  const fb = MRT_VERIFIED_FALLBACK[a + '|' + b] || MRT_VERIFIED_FALLBACK[b + '|' + a];
  return fb ? { ...fb, _source: '內建官方驗證票價' } : null;
}
function updateMrtFareResult() {
  const a = $('#mrtFrom').value,
    b = $('#mrtTo').value,
    box = $('#mrtResult');
  mrtCurrentFare = null;
  if (!a || !b) {
    box.textContent = mrtLoading
      ? '正在載入官方票價；也可以先選擇起訖站。'
      : '選擇起訖站後會自動查票價。';
    $('#mrtApply').disabled = true;
    return;
  }
  if (normalizeStationName(a) === normalizeStationName(b)) {
    box.textContent = '起站與訖站不能相同。';
    $('#mrtApply').disabled = true;
    return;
  }
  const f = findMrtFare(a, b);
  if (!f) {
    if (mrtLoading) box.textContent = '正在載入這組站點的官方票價…';
    else if (!mrtFareData)
      box.textContent = '官方票價暫時載入失敗；可按「重新載入票價」再試，或這次手動輸入金額。';
    else box.textContent = '找不到這組站點，請從建議站名中選擇或確認名稱。';
    $('#mrtApply').disabled = true;
    return;
  }
  const value = mrtFareType === 'discount' ? f.discount || 0 : f.full;
  if (!(value > 0)) {
    box.textContent = '這個票種沒有可用票價。';
    $('#mrtApply').disabled = true;
    return;
  }
  mrtCurrentFare = {
    from: normalizeStationName(a),
    to: normalizeStationName(b),
    price: value,
    type: mrtFareType,
  };
  box.innerHTML = `${esc(mrtCurrentFare.from)} → ${esc(mrtCurrentFare.to)}<br><b>${nf(value)}</b> <span style="font-size:12px">${mrtFareType === 'full' ? '一般／儲值卡全票' : '優惠票'}</span><div style="font-size:11px;margin-top:5px;opacity:.72">來源：${esc(f._source || mrtFareSource || '官方資料')}</div>`;
  $('#mrtApply').disabled = false;
}
async function openMrtFare() {
  mrtCurrentFare = null;
  // 每次開啟都重新計次：這份清單只反映「這次開著面板期間加了幾段」。
  mrtAddedRoutes = [];
  renderMrtAdded();
  renderMrtRecent();
  renderMrtStations();
  $('#mrtBackdrop').classList.add('show');
  $('#mrtSheet').classList.add('show');
  if (mrtFareData) {
    updateMrtFareResult();
    return;
  }
  try {
    await ensureMrtFareData();
    renderMrtStations();
    mrtLoadError = '';
    $('#mrtRetry').style.display = 'none';
  } catch (e) {
    console.warn('mrt fare load failed', e);
    mrtLoadError = String(e?.message || e);
  }
  updateMrtFareResult();
}
async function retryMrtFare() {
  const b = $('#mrtRetry');
  b.disabled = true;
  b.textContent = '載入中…';
  mrtFareData = null;
  try {
    await ensureMrtFareData(true);
    renderMrtStations();
    mrtLoadError = '';
    $('#mrtRetry').style.display = 'none';
  } catch (e) {
    mrtLoadError = String(e?.message || e);
  } finally {
    b.disabled = false;
    b.textContent = '重新載入票價';
    updateMrtFareResult();
  }
}
function closeMrtFare() {
  $('#mrtBackdrop').classList.remove('show');
  $('#mrtSheet').classList.remove('show');
}
$('#mrtFareBtn').onclick = openMrtFare;
$('#mrtCancel').onclick = closeMrtFare;
$('#mrtBackdrop').onclick = closeMrtFare;
$('#mrtRetry').onclick = retryMrtFare;
$('#mrtFrom').addEventListener('input', updateMrtFareResult);
$('#mrtTo').addEventListener('input', updateMrtFareResult);
$('#mrtFareType')
  .querySelectorAll('button')
  .forEach(
    (b) =>
      (b.onclick = () => {
        mrtFareType = b.dataset.t;
        $('#mrtFareType')
          .querySelectorAll('button')
          .forEach((x) => x.classList.toggle('on', x === b));
        updateMrtFareResult();
      }),
  );
/**
 * 本次開啟票價面板後已加入的路程。用於顯示小計，關閉面板時清空。
 * @type {Array<{from: string, to: string, price: number}>}
 */
let mrtAddedRoutes = [];

/** 一段路程在品項中的名稱。 */
const mrtRouteName = (r) => `捷運 ${r.from} → ${r.to}`;

/** 重繪「本次已加入」清單。 */
function renderMrtAdded() {
  const box = $('#mrtAdded');
  if (!box) return;
  if (!mrtAddedRoutes.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const total = mrtAddedRoutes.reduce((s, r) => s + r.price, 0);
  box.hidden = false;
  box.innerHTML =
    `<div class="hd"><span>本次已加入 ${mrtAddedRoutes.length} 段</span><b>${nf(total)}</b></div>` +
    '<ul>' +
    mrtAddedRoutes
      .map(
        (r) =>
          `<li><span class="rt">${esc(r.from)} → ${esc(r.to)}</span><span class="pr">${nf(r.price)}</span></li>`,
      )
      .join('') +
    '</ul>';
}

/**
 * 把目前查到的票價加成一條品項。
 *
 * 刻意不關閉面板，也不覆寫總金額 —— 一趟出門常常包含好幾段捷運，
 * 逐段加入品項後由 recomputeTotal() 自動加總，就能在同一筆帳裡記錄完整路線。
 */
$('#mrtApply').onclick = () => {
  if (!mrtCurrentFare) return;

  // 票價是支出；若使用者正停在收入／投資，先切回支出再加品項。
  if (getKind() !== 'expense') {
    $('#k-expense').checked = true;
    updateKindUI();
  }

  // 第一段路程時才設定店家與分類，避免覆蓋使用者後來的手動調整。
  if (!mrtAddedRoutes.length) {
    storeMode = 'single';
    setStoreMode('single', false);
    if (!$('#f-store').value.trim()) $('#f-store').value = '臺北捷運';
    selCat = catsExpense.find((c) => c.includes('交通')) || selCat;
    if (selCat && subcats[selCat]?.some((x) => x.includes('大眾運輸')))
      selSub = subcats[selCat].find((x) => x.includes('大眾運輸'));
    renderChipSelectors();
    renderSubChips();
    refreshStoreItems();
  }

  // 展開品項區（不自動補空白列，以免多出一條空品項）。
  setItemDetailOpen(true, false);
  addItemRow(mrtRouteName(mrtCurrentFare), mrtCurrentFare.price, selCat || '', selSub || '');
  recomputeTotal();

  mrtAddedRoutes = [...mrtAddedRoutes, { ...mrtCurrentFare }];
  renderMrtAdded();

  settings = {
    ...settings,
    mrtRecentPairs: [
      { from: mrtCurrentFare.from, to: mrtCurrentFare.to },
      ...(settings.mrtRecentPairs || []).filter(
        (x) => !(x.from === mrtCurrentFare.from && x.to === mrtCurrentFare.to),
      ),
    ].slice(0, 6),
  };
  save(K.set, settings);
  renderMrtRecent();

  // 多段路程通常是接續的（A→B、B→C），所以把訖站帶成下一段的起站。
  const lastTo = mrtCurrentFare.to;
  $('#mrtFrom').value = lastTo;
  $('#mrtTo').value = '';
  $('#mrtTo').focus();
  updateMrtFareResult();

  toast(
    `已加入 ${mrtRouteName(mrtAddedRoutes[mrtAddedRoutes.length - 1])} ${nf(mrtAddedRoutes[mrtAddedRoutes.length - 1].price)}`,
  );
};
