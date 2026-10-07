/* ===== 行程的外幣與匯率設定（編輯行程時） ===== */
// 編輯中的草稿。輸入時只改草稿、不重繪（否則輸入框會失去焦點），
// 按儲存才寫回 trip.currencies。
let tripFxDraft = [];

const newRateId = () => 'r' + uid();
const blankRate = (type) => ({ id: newRateId(), type, label: '', rate: '', twd: '', foreign: '' });

function loadTripCurrencyDraft(t) {
  tripFxDraft = JSON.parse(JSON.stringify(Array.isArray(t?.currencies) ? t.currencies : []));
  tripFxDraft.forEach((c) => (c.rates = Array.isArray(c.rates) ? c.rates : []));
  renderTripCurrencyEditor();
}

/** 草稿 → 可存檔的資料。算不出匯率的項目會被略過並提示。 */
function readTripCurrencyDraft() {
  let skipped = 0;
  const out = tripCurrencies({ currencies: tripFxDraft }).map((c) => ({
    code: c.code,
    rates: c.rates,
  }));
  const total = tripFxDraft.reduce((n, c) => n + c.rates.length, 0);
  skipped = total - out.reduce((n, c) => n + c.rates.length, 0);
  // 草稿裡完全沒有任何有效匯率的貨幣仍保留：使用者可能打算之後再補。
  tripFxDraft.forEach((c) => {
    if (!out.some((o) => o.code === c.code)) out.push({ code: c.code, rates: [] });
  });
  if (skipped) toast(`有 ${skipped} 筆匯率未填完整，已略過`);
  return out;
}

function renderTripCurrencyEditor() {
  const box = $('#tripFxBox');
  if (!box) return;
  box.style.display = tKind === 'overseas' ? 'block' : 'none';
  const used = new Set(tripFxDraft.map((c) => c.code));
  $('#tripFxAddSel').innerHTML =
    '<option value="">選擇幣別…</option>' +
    CURRENCY_LIST.filter((c) => !used.has(c.code))
      .map(
        (c) =>
          `<option value="${c.code}">${c.flag} ${c.name} ${c.code}（${esc(c.symbol)}）</option>`,
      )
      .join('');
  const trip = tripEditingId ? tripById(tripEditingId) : null;
  const bal = trip ? exchangeBalances(records, trip) : [];
  $('#tripFxList').innerHTML = tripFxDraft.map((c, ci) => currencyCardHtml(c, ci, bal)).join('');
  bindTripCurrencyEditor();
}

function rateRowHtml(code, r, ci, ri, bal) {
  const m = currencyMeta(code),
    type = (t, l) => `<option value="${t}"${r.type === t ? ' selected' : ''}>${l}</option>`;
  const body =
    r.type === 'exchange'
      ? `<div class="fx-eq">NT$ <input type="number" inputmode="decimal" data-f="twd" value="${esc(r.twd)}" placeholder="花的台幣"> 換 ${esc(m.symbol)} <input type="number" inputmode="decimal" data-f="foreign" value="${esc(r.foreign)}" placeholder="換到的外幣"></div>`
      : `<div class="fx-eq">1 ${esc(code)} = NT$ <input type="number" inputmode="decimal" step="any" data-f="rate" value="${esc(r.rate)}" placeholder="匯率">${r.type === 'float' ? `<button type="button" class="tiny-btn" data-live>即時</button>` : ''}</div>`;
  const b = bal.find((x) => x.rateId === r.id);
  const note = b
    ? `<div class="fx-sub">已花 ${formatMoney(code, b.used)} · 剩 ${formatMoney(code, b.remaining)}</div>`
    : '';
  return `<div class="fx-rate" data-ci="${ci}" data-ri="${ri}"><div class="fx-rate-top"><select data-f="type">${type('fixed', '固定匯率')}${type('float', '浮動匯率')}${type('exchange', '換匯（金額）')}</select><input type="text" data-f="label" value="${esc(r.label)}" placeholder="名稱（選填，例如：機場換匯）"><button type="button" class="fx-x" data-del-rate aria-label="刪除匯率">×</button></div>${body}<div class="fx-sub" data-calc>${calcText(r)}</div>${note}</div>`;
}

function calcText(r) {
  const v = rateValue(r);
  return v ? `＝ 1 單位外幣 ≈ NT$ ${formatRate(v)}` : '尚未填完整';
}

function currencyCardHtml(c, ci, bal) {
  const rates = c.rates.map((r, ri) => rateRowHtml(c.code, r, ci, ri, bal)).join('');
  return `<div class="fx-cur" data-ci="${ci}"><div class="fx-cur-head"><b>${currencyTitle(c.code)} <small>${esc(currencyMeta(c.code).symbol)}</small></b><button type="button" class="fx-x" data-del-cur aria-label="移除幣別">移除</button></div>${rates || '<div class="fx-sub">還沒有匯率，請在下方新增一種。</div>'}<div class="fx-add-rate"><button type="button" class="tiny-btn" data-add-rate="fixed">＋ 固定匯率</button><button type="button" class="tiny-btn" data-add-rate="float">＋ 浮動匯率</button><button type="button" class="tiny-btn" data-add-rate="exchange">＋ 換匯</button></div></div>`;
}

/** 重繪後在輸入欄位上掛事件。 */
function bindTripCurrencyEditor() {
  const list = $('#tripFxList');
  list.querySelectorAll('.fx-cur').forEach((card) => {
    const c = tripFxDraft[+card.dataset.ci];
    card.querySelector('[data-del-cur]').onclick = () => removeDraftCurrency(c);
    card.querySelectorAll('[data-add-rate]').forEach((b) => {
      b.onclick = () => {
        c.rates.push(blankRate(b.dataset.addRate));
        renderTripCurrencyEditor();
      };
    });
  });
  list.querySelectorAll('.fx-rate').forEach(bindRateRow);
}

function bindRateRow(row) {
  const c = tripFxDraft[+row.dataset.ci],
    r = c.rates[+row.dataset.ri];
  row.querySelectorAll('input[data-f]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const f = inp.dataset.f;
      r[f] = f === 'label' ? inp.value : inp.value === '' ? '' : +inp.value;
      row.querySelector('[data-calc]').textContent = calcText(r);
    });
  });
  row.querySelector('select[data-f=type]').onchange = (e) => {
    r.type = e.target.value;
    renderTripCurrencyEditor();
  };
  row.querySelector('[data-del-rate]').onclick = () => removeDraftRate(c, r);
  const live = row.querySelector('[data-live]');
  if (live) live.onclick = () => fillLiveRate(c.code, r, row);
}

function removeDraftRate(c, r) {
  const trip = tripEditingId ? tripById(tripEditingId) : null;
  const n = trip ? rateUsageCount(records, trip.id, c.code, r.id) : 0;
  if (
    n &&
    !confirm(
      `已有 ${n} 筆帳目用了這個匯率。刪除後那些帳目的金額不會變，只是不再歸在這個匯率底下。\n確定刪除？`,
    )
  )
    return;
  c.rates = c.rates.filter((x) => x !== r);
  renderTripCurrencyEditor();
}

function removeDraftCurrency(c) {
  const trip = tripEditingId ? tripById(tripEditingId) : null;
  const n = trip ? currencyUsageCount(records, trip.id, c.code) : 0;
  if (n && !confirm(`已有 ${n} 筆帳目用 ${c.code} 記帳。移除後那些帳目的金額不會變。\n確定移除？`))
    return;
  tripFxDraft = tripFxDraft.filter((x) => x !== c);
  renderTripCurrencyEditor();
}

$('#tripFxAddBtn').onclick = () => {
  const code = $('#tripFxAddSel').value;
  if (!code) return toast('請先選擇幣別');
  tripFxDraft.push({ code, rates: [blankRate('fixed')] });
  renderTripCurrencyEditor();
};

/** 向公開匯率服務取 1 單位外幣兌台幣的即時匯率。 */
async function fetchLiveRate(code) {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/' + encodeURIComponent(code), {
      cache: 'no-store',
      signal: ctl.signal,
    });
    const v = (await res.json())?.rates?.TWD;
    if (!(v > 0)) throw new Error('沒有取得台幣匯率');
    return +v;
  } finally {
    clearTimeout(timer);
  }
}

async function fillLiveRate(code, r, row) {
  try {
    r.rate = +(await fetchLiveRate(code)).toFixed(4);
    row.querySelector('input[data-f=rate]').value = r.rate;
    row.querySelector('[data-calc]').textContent = calcText(r);
    toast('已帶入即時匯率（僅供參考，請依實際為準）');
  } catch (e) {
    toast('無法取得即時匯率，請手動輸入');
  }
}
