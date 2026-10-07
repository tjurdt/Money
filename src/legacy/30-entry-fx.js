/* ===== 記帳表單：支付幣別與匯率 ===== */
// 帳目的 total 永遠是台幣；外幣金額與匯率另存在 record.fx（見 src/domain/fx.js）。
// 選了外幣之後，金額欄、品項、優惠、分帳全部以外幣計算；
// 台幣金額是另一欄（依匯率自動換算，或刷卡時照帳單輸入），儲存時才把整筆換成台幣。
// 狀態（fxCur、fxRateKey、fxExtraRate、fxTotalManual）宣告在 03-core-state.js，
// 因為更早載入的檔案（優惠、表單切換）也要讀它，放這裡會踩到暫時性死區。

/** 表單目前情境的行程（只有支出、且行程有設定外幣時才有）。 */
function fxTrip() {
  if (getKind() !== 'expense' || !formScope || !formScope.trip) return null;
  const t = tripById(formScope.trip);
  return t && tripCurrencies(t).length ? t : null;
}

const fxMemory = (t) => (settings.lastFx && settings.lastFx[t.id]) || {};

/** 某幣別可選的匯率（含編輯舊帳目時被刪掉的那一筆）。 */
function fxRatesFor(t, code) {
  const rates = [...(tripCurrencies(t).find((c) => c.code === code)?.rates || [])];
  if (fxExtraRate && fxExtraRate.cur === code && !rates.some((r) => r.id === fxExtraRate.id))
    rates.push(fxExtraRate.rate);
  return rates;
}

/** 開表單時決定初始的幣別與匯率：編輯舊帳目依帳目，新增依這趟旅行上次的選擇。 */
function initFxState(r) {
  fxCur = null;
  fxRateKey = null;
  fxExtraRate = null;
  fxTotalManual = false;
  $('#f-fxtwd').value = '';
  $('#f-fxfloat').value = '';
  const t = fxTrip();
  if (!t) return;
  const fx = r && r.fx;
  if (fx && fx.cur) {
    fxCur = fx.cur;
    fxRateKey = fx.rateType === 'card' ? 'card' : fx.rateId;
    if (fx.rateType !== 'card' && !findRate(t, fx.cur, fx.rateId))
      fxExtraRate = {
        cur: fx.cur,
        rate: { id: fx.rateId, type: fx.rateType, rate: fx.rate, label: fx.rateLabel },
      };
    $('#f-fxtwd').value = fx.twd ?? '';
    if (fx.rateType === 'float') $('#f-fxfloat').value = fx.rate;
    fxTotalManual = true;
  } else if (!r) {
    const m = fxMemory(t);
    if (m.cur && tripCurrencies(t).some((c) => c.code === m.cur)) {
      fxCur = m.cur;
      fxRateKey = m.rateKey || null;
    }
  }
  normalizeFxRateKey(t);
}

/** 目前選的匯率若不存在就退回該幣別的第一筆，沒有匯率可選就是刷卡。 */
function normalizeFxRateKey(t) {
  if (!fxCur) return;
  const rates = fxRatesFor(t, fxCur);
  if (fxRateKey === 'card' || rates.some((r) => r.id === fxRateKey)) return;
  fxRateKey = rates.length ? rates[0].id : 'card';
}

/** 目前選定的匯率物件；刷卡回傳 null。浮動匯率會套用使用者輸入的值。 */
function currentFxRate(t) {
  if (!fxCur || fxRateKey === 'card') return null;
  const r = fxRatesFor(t, fxCur).find((x) => x.id === fxRateKey);
  if (!r) return null;
  return r.type === 'float' ? { ...r, rate: +$('#f-fxfloat').value || 0 } : r;
}

function rateOptionText(r, code) {
  const v = formatRate(rateValue(r));
  return r.label || r.type === 'exchange' ? `${rateLabel(r, code)} · ${v}` : rateLabel(r, code);
}

function renderFxCurSeg(t) {
  const btn = (code, on, text) =>
    `<button type="button" data-cur="${code}" class="${on ? 'on' : ''}">${text}</button>`;
  $('#fxCurSeg').innerHTML =
    btn('', !fxCur, '🇹🇼 台幣') +
    tripCurrencies(t)
      .map((c) => btn(c.code, fxCur === c.code, `${currencyMeta(c.code).flag} ${c.code}`))
      .join('');
  $('#fxCurSeg')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          fxCur = b.dataset.cur || null;
          fxRateKey = fxCur ? (fxMemory(t).cur === fxCur ? fxMemory(t).rateKey : null) : null;
          fxTotalManual = false;
          $('#f-fxtwd').value = '';
          normalizeFxRateKey(t);
          updateFxUI();
          recalcFxTwd();
          refreshStoreItems();
        }),
    );
}

function renderFxRateSelect(t) {
  const rates = fxRatesFor(t, fxCur);
  $('#f-fxrate').innerHTML =
    rates
      .map((r) => `<option value="${esc(r.id)}">${esc(rateOptionText(r, fxCur))}</option>`)
      .join('') + `<option value="card">💳 信用卡刷卡（輸入帳單台幣）</option>`;
  $('#f-fxrate').value = fxRateKey;
}

/** 金額欄的標籤：選了外幣就明確標示幣別，避免把外幣金額當成台幣。 */
function applyFxAmountLabel() {
  if (!fxCur) return;
  $('#amountLabel').textContent = `外幣金額 (${currencyMeta(fxCur).symbol} ${fxCur})`;
}

/** 依目前狀態顯示／隱藏、重繪外幣區塊。 */
function updateFxUI() {
  const t = fxTrip(),
    box = $('#fxEntry');
  box.style.display = t ? 'block' : 'none';
  if (!t) {
    fxCur = null;
    return;
  }
  if (fxCur && !tripCurrencies(t).some((c) => c.code === fxCur)) fxCur = null;
  normalizeFxRateKey(t);
  renderFxCurSeg(t);
  $('#fxFields').style.display = fxCur ? 'block' : 'none';
  if (fxCur) {
    renderFxRateSelect(t);
    const float = currentFxRateType(t) === 'float';
    $('#fxFloatRow').style.display = float ? 'block' : 'none';
    if (float && !$('#f-fxfloat').value) $('#f-fxfloat').value = defaultFloatRate(t);
    $('#f-fxtwd').placeholder = fxRateKey === 'card' ? '帳單上的台幣' : '自動換算';
    applyFxAmountLabel();
  } else $('#amountLabel').textContent = '支出金額 (NT$)';
  updateFxPreview(t);
}

function currentFxRateType(t) {
  const r = fxRatesFor(t, fxCur).find((x) => x.id === fxRateKey);
  return r ? r.type : 'card';
}

function defaultFloatRate(t) {
  const m = fxMemory(t);
  if (m.cur === fxCur && +m.float > 0) return m.float;
  const r = fxRatesFor(t, fxCur).find((x) => x.id === fxRateKey);
  return r && rateValue(r) ? +rateValue(r).toFixed(4) : '';
}

/** 外幣總額或匯率改變時重算台幣金額；刷卡或使用者手動改過台幣就不覆蓋。 */
function recalcFxTwd() {
  const t = fxTrip();
  if (!t || !fxCur) return;
  const rate = currentFxRate(t),
    amt = +$('#f-total').value;
  if (rate && amt > 0 && !fxTotalManual) $('#f-fxtwd').value = toTwd(amt, rateValue(rate));
  else if (!(amt > 0) && !fxTotalManual) $('#f-fxtwd').value = '';
  updateFxPreview(t);
}

function updateFxPreview(t) {
  const el = $('#fxPreview');
  if (!fxCur) {
    el.innerHTML = '';
    return;
  }
  const amt = +$('#f-total').value,
    twd = +$('#f-fxtwd').value,
    rate = currentFxRate(t),
    parts = [];
  if (amt > 0 && twd > 0) {
    parts.push(
      `${formatMoney(fxCur, amt)} ≈ <b>NT$ ${Math.round(twd).toLocaleString('en-US')}</b>` +
        `（1 ${fxCur} = NT$ ${formatRate(impliedRate(twd, amt))}）`,
    );
  } else if (!rate) parts.push('品項與優惠都以外幣計算；請在右邊填入帳單上的台幣總額。');
  const warn = exchangeShortfall(t, rate, amt);
  if (warn) parts.push(warn);
  el.innerHTML = parts.join('<br>');
}

/** 這筆花費扣掉所選換匯批次的餘額；不夠時回傳提醒文字。 */
function exchangeShortfall(t, rate, amt) {
  if (!rate || rate.type !== 'exchange') return '';
  const b = exchangeBalances(records, t).find((x) => x.rateId === rate.id);
  if (!b) return '';
  const old = editingId ? records.find((x) => x.id === editingId)?.fx : null;
  const back = old && old.rateId === rate.id ? +old.amount : 0;
  const left = b.remaining + back - (amt > 0 ? amt : 0);
  return left < 0
    ? `<span class="fx-warn">這批換匯的外幣不夠，差 ${formatMoney(fxCur, -left)}（其餘可能是別批現金或刷卡）</span>`
    : `這批換匯記完這筆後剩 ${formatMoney(fxCur, left)}`;
}

/**
 * 儲存時取出 fx。台幣付款回傳 null；資料不完整回傳 false（已提示使用者）。
 * @param {number} total 外幣總額（此時表單上的 total 是外幣）
 */
function readFxForSave(total) {
  const t = fxTrip();
  if (!t || !fxCur) return null;
  const rate = currentFxRate(t),
    twd = +$('#f-fxtwd').value;
  if (rate && !rateValue(rate)) {
    toast('請輸入匯率');
    return false;
  }
  if (!rate && !(twd > 0)) {
    toast('請輸入帳單上的台幣總額');
    return false;
  }
  const fx = buildFx({
    code: fxCur,
    amount: total,
    rate,
    twdTotal: twd > 0 ? twd : toTwd(total, rateValue(rate)),
  });
  if (!fx) toast('無法算出匯率，請確認金額');
  return fx || false;
}

/** 記下這趟旅行最後使用的幣別與匯率，下次開表單直接帶入。 */
function rememberFx(fx) {
  const t = fxTrip();
  if (!t) return;
  const mem = {
    cur: fx ? fx.cur : null,
    rateKey: fx ? (fx.rateType === 'card' ? 'card' : fx.rateId) : null,
  };
  if (fx && fx.rateType === 'float') mem.float = fx.rate;
  settings.lastFx = { ...(settings.lastFx || {}), [t.id]: mem };
}

/** 套用「上一筆」時：同一趟旅行的外幣帳目連幣別一起帶入，否則回到台幣。 */
function fxAfterTemplate(r) {
  const same = r && r.fx && formScope && r.scope && r.scope.trip === formScope.trip;
  initFxState(same ? r : null);
  if (!same) fxCur = null;
  updateFxUI();
}

$('#f-total').addEventListener('input', () => {
  fxTotalManual = false;
  recalcFxTwd();
});
$('#f-fxtwd').addEventListener('input', () => {
  fxTotalManual = true;
  const t = fxTrip();
  if (t && fxCur) updateFxPreview(t);
});
$('#f-fxfloat').addEventListener('input', () => {
  fxTotalManual = false;
  recalcFxTwd();
});
$('#f-fxrate').addEventListener('change', (e) => {
  fxRateKey = e.target.value;
  fxTotalManual = false;
  $('#f-fxfloat').value = '';
  updateFxUI();
  recalcFxTwd();
});
$('#fxLiveBtn').onclick = async () => {
  try {
    $('#f-fxfloat').value = +(await fetchLiveRate(fxCur)).toFixed(4);
    fxTotalManual = false;
    recalcFxTwd();
  } catch (e) {
    toast('無法取得即時匯率，請手動輸入');
  }
};
