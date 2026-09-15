/* ===== 表單顯示切換 ===== */
function setCatMode(m) {
  catMode = m;
  $('#catModeSeg')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#fld-cat').classList.toggle(
    'hidden',
    m === 'perItem' || (getKind() !== 'expense' && getKind() !== 'income'),
  );
  if (getKind() === 'income') $('#fld-cat').classList.remove('hidden');
  $('#itemRows')
    .querySelectorAll('.itemrow')
    .forEach((r) => r.classList.toggle('per', m === 'perItem'));
  renderSubChips();
}
$('#catModeSeg')
  .querySelectorAll('button')
  .forEach((b) => (b.onclick = () => setCatMode(b.dataset.m)));
function updateKindUI() {
  const k = getKind();
  $('#fld-store').classList.toggle('hidden', k === 'investment');
  $('#fld-amount').classList.toggle('hidden', k === 'investment');
  $('#amountLabel').textContent = k === 'income' ? '收入金額 (NT$)' : '支出金額 (NT$)';
  $('#fld-cat').classList.toggle(
    'hidden',
    k === 'investment' || (k === 'expense' && catMode === 'perItem'),
  );
  $('#fld-pay').classList.toggle('hidden', k === 'investment');
  $('#fld-split').classList.toggle('hidden', k !== 'expense');
  $('#fld-split').parentElement?.classList.toggle('split-hidden', k !== 'expense');
  $('#fld-invest').classList.toggle('hidden', k !== 'investment');
  $('#detailToggle').style.display = k === 'expense' ? 'flex' : 'none';
  if (k === 'expense') setItemDetailOpen(itemDetailOpen);
  else {
    $('#fld-items').classList.add('hidden');
    $('#fld-catmode').classList.add('hidden');
  }
  $('#scopeRow').style.display = k === 'investment' ? 'none' : 'flex';
  $('#storeLabel').innerHTML =
    k === 'income' ? '來源 / 摘要 <small>選填</small>' : '店家名稱 <small>選填</small>';
  $('#storeModeBtn').style.display = k === 'expense' ? 'inline-block' : 'none';
  if (k !== 'expense' && storeMode === 'chain') setStoreMode('single', true);
  $('#catLabel').textContent = k === 'income' ? '收入分類' : '分類';
  $('#payLabel').textContent = k === 'income' ? '收款方式' : '付款方式';
  $('#nearBtn').style.display = k !== 'investment' ? 'inline-flex' : 'none';
  const catList = k === 'income' ? catsIncome : catsExpense;
  if (!catList.includes(selCat)) selCat = null;
  renderChipSelectors();
  renderSubChips();
  updateMrtQuick();
  if (k === 'investment') updateInvUI();
  updateRepeatButton();
  updateSplitPreview();

  syncEntryBlocks();
}
$('#sheet')
  .querySelectorAll('.ia')
  .forEach(
    (b) =>
      (b.onclick = () => {
        invAct = b.dataset.a;
        $('#sheet')
          .querySelectorAll('.ia')
          .forEach((x) => x.classList.toggle('on', x === b));
        updateInvUI();
      }),
  );
const CATHAY_STOCK_FEE_RATE = 0.000399,
  TW_STOCK_TAX_RATE = 0.003,
  TW_DAYTRADE_TAX_RATE = 0.0015;
function estimateCathayStockCosts(sh, pr, action, dayTrade = false) {
  const value = Math.max(0, Math.floor((+sh || 0) * (+pr || 0))),
    commission = value ? Math.round(value * CATHAY_STOCK_FEE_RATE) : 0,
    tax =
      action === 'sell' && value
        ? Math.round(value * (dayTrade ? TW_DAYTRADE_TAX_RATE : TW_STOCK_TAX_RATE))
        : 0;
  return {
    value,
    commission,
    tax,
    total: commission + tax,
    taxRate: action === 'sell' ? (dayTrade ? TW_DAYTRADE_TAX_RATE : TW_STOCK_TAX_RATE) : 0,
  };
}
function syncInvestmentFee() {
  const auto = $('#f-auto-fee')?.checked !== false,
    sh = +$('#f-shares').value || 0,
    pr = +$('#f-uprice').value || 0,
    day = !!$('#f-daytrade')?.checked,
    box = $('#invAutoFeeBox'),
    inp = $('#f-fee');
  box?.classList.toggle('sell', invAct === 'sell');
  if (inp) inp.readOnly = auto;
  if (auto && invAct !== 'dividend' && sh > 0 && pr > 0) {
    const q = estimateCathayStockCosts(sh, pr, invAct, day);
    inp.value = q.total;
    $('#invFeeNote').textContent =
      `國泰網路下單手續費約 ${nf(q.commission)}${invAct === 'sell' ? ` ＋ 證交稅 ${nf(q.tax)}${day ? '（當沖 0.15%）' : '（0.3%）'}` : ''}；實際仍以券商對帳單為準。`;
  } else if ($('#invFeeNote'))
    $('#invFeeNote').textContent = auto
      ? '依國泰證券目前網路下單 0.399‰ 估算；賣出股票另計證交稅。'
      : '自動估算已關閉，可直接輸入券商實際費用。';
}
function updateInvUI() {
  const div = invAct === 'dividend';
  $('#invTradeFields').classList.toggle('hidden', div);
  $('#invDivField').classList.toggle('hidden', !div);
  syncInvestmentFee();
  updateInvPreview();
}
function updateInvPreview() {
  if (invAct === 'dividend') {
    $('#invPreview').textContent = '';
    return;
  }
  syncInvestmentFee();
  const sh = +$('#f-shares').value || 0,
    pr = +$('#f-uprice').value || 0,
    fee = +$('#f-fee').value || 0,
    net = invAct === 'buy' ? sh * pr + fee : sh * pr - fee;
  $('#invPreview').textContent =
    sh && pr
      ? `${invAct === 'buy' ? '投入' : '實收'}約 ${nf(net)}${$('#f-auto-fee')?.checked ? ' · 已含國泰估算費稅' : ''}`
      : '';
}
$$('input[name=kind]').forEach((r) => (r.onchange = updateKindUI));
['f-shares', 'f-uprice'].forEach((id) => $('#' + id).addEventListener('input', updateInvPreview));
$('#f-fee').addEventListener('input', updateInvPreview);
$('#f-auto-fee')?.addEventListener('change', updateInvPreview);
$('#f-daytrade')?.addEventListener('change', updateInvPreview);
$('#f-total').addEventListener('input', updateSplitPreview);
$('#f-partner').addEventListener('input', updateSplitPreview);
$('#formScopeChange').onclick = () => {
  formScope = formScope || { ...currentScope };
  openScopePicker('form');
};

function defaultDateFor(scope) {
  const today = new Date(),
    iso = new Date(today.getTime() - today.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (scope && scope.trip) {
    const t = tripById(scope.trip);
    if (t && t.start && t.end && (iso < t.start || iso > t.end)) return t.start;
  }
  return iso;
}
function openSheet(id) {
  editingId = id || null;
  const r = id ? records.find((x) => x.id === id) : null;
  if (r && r.kind === 'settlement') {
    editingId = null;
    openRepaySheet(id);
    return;
  }
  $('#sheetTitle').textContent = r ? '編輯帳目' : '新增一筆';
  $('#deleteBtn').style.display = r ? 'block' : 'none';
  buildDatalists();
  $('#nearChips').innerHTML = '';
  $('#itemRows').innerHTML = '';
  const k = r ? r.kind : $('#view-invest').classList.contains('active') ? 'investment' : 'expense';
  document.querySelector('input[name=kind][value="' + k + '"]').checked = true;
  formScope = r ? r.scope || { type: 'daily', trip: null } : defaultFormScope();
  $('#formScopeText').textContent = scopeLabel(formScope);
  $('#f-date').value = r ? r.date : defaultDateFor(formScope);
  storeMode = r && r.storeChain ? 'chain' : 'single';
  $('#f-store').value = r ? r.store || '' : '';
  refreshChainSelect(r ? r.storeChain || '' : '');
  $('#f-chain').value = r ? r.storeChain || '' : '';
  $('#f-branch').value = r ? r.storeBranch || '' : '';
  setStoreMode(storeMode, false);
  $('#f-total').value = r && (r.kind === 'income' || r.kind === 'expense') ? r.total : '';
  discountDraft = r && r.kind === 'expense' ? cloneDiscounts(r.discounts || []) : [];
  discountOverrideTotal =
    r && r.kind === 'expense' && r.discountOverrideTotal != null ? +r.discountOverrideTotal : null;
  discountBaseAmount =
    r && r.kind === 'expense'
      ? r.grossTotal != null
        ? r.grossTotal
        : r.total || 0
      : +$('#f-total').value || 0;
  $('#f-note').value = r ? r.note || '' : '';
  catMode = r && r.catMode ? r.catMode : 'whole';
  const existingItems = r && r.items && r.items.length ? r.items : [];
  itemDetailOpen =
    k === 'expense' && !!(existingItems.some((it) => it.name) || catMode === 'perItem');
  if (k === 'expense' && itemDetailOpen)
    existingItems.forEach((it) =>
      addItemRow(
        it.name || '',
        it.grossPrice != null ? it.grossPrice : it.price != null ? it.price : '',
        it.category || '',
        it.sub || '',
        it.qty || 1,
        it.unitPrice,
        it.lineId || '',
      ),
    );
  // split
  const sp = r && r.split ? r.split : null;
  $('#splitToggle').checked = !!sp;
  $('#splitBody').classList.toggle('show', !!sp);
  splitPayer = sp ? sp.payer : 'me';
  splitPreset = sp ? normalizedSplitPreset(sp.preset) : 'even';
  $('#payerSeg')
    .querySelectorAll('button')
    .forEach((x) => x.classList.toggle('on', x.dataset.p === splitPayer));
  $('#shareSeg')
    .querySelectorAll('button')
    .forEach((x) => x.classList.toggle('on', x.dataset.s === splitPreset));
  splitCustomMode = 'amount';
  $('#splitCustomModeSeg')
    .querySelectorAll('button')
    .forEach((x) => x.classList.toggle('on', x.dataset.cm === 'amount'));
  $('#f-myshare').placeholder = '我應負擔的金額';
  $('#splitCustomModeSeg').style.display = splitPreset === 'own' ? 'flex' : 'none';
  $('#f-myshare').style.display = splitPreset === 'own' ? 'block' : 'none';
  $('#f-myshare').value = sp && normalizedSplitPreset(sp.preset) === 'own' ? sp.myShare : '';
  $('#f-partner').value = sp ? sp.partner : '';
  // invest
  const inv = r && r.inv ? r.inv : {};
  invAct = inv.action || 'buy';
  $('#sheet')
    .querySelectorAll('.ia')
    .forEach((x) => x.classList.toggle('on', x.dataset.a === invAct));
  $('#f-symbol').value = inv.symbol || '';
  $('#f-ticker').value = inv.ticker || '';
  $('#f-shares').value = inv.shares || '';
  $('#f-uprice').value = inv.unitPrice || '';
  $('#f-fee').value = inv.fee || '';
  $('#f-auto-fee').checked = r && r.kind === 'investment' ? inv.autoFee === true : true;
  $('#f-daytrade').checked = !!inv.dayTrade;
  $('#f-divamt').value = r && r.kind === 'investment' && inv.action === 'dividend' ? r.total : '';
  selCat = r ? r.category : null;
  selSub = r ? r.sub : null;
  selPay = r
    ? r.payment
    : settings.lastPayment && payments.includes(settings.lastPayment)
      ? settings.lastPayment
      : null;
  setCatMode(catMode);
  setItemDetailOpen(itemDetailOpen);
  updateKindUI();
  refreshStoreItems();
  if (itemDetailOpen || discountDraft.length || discountOverrideTotal !== null) recomputeTotal();
  renderDiscountSummary();
  updateRepeatButton();
  if (effectiveMapsKey()) ensureGoogle();
  $('#backdrop').classList.add('show');
  $('#sheet').classList.add('show');
  $('#sheet').scrollTop = 0;
  const _cont = $('#saveContinueBtn');
  if (_cont) _cont.style.display = editingId ? 'none' : 'block';

  syncEntryBlocks();
  const nd = $('#noteDetails');
  if (nd) nd.open = !!$('#f-note')?.value.trim();
}
function closeSheet() {
  $('#backdrop').classList.remove('show');
  $('#sheet').classList.remove('show');
  editingId = null;
}
function saveRecord(cont) {
  const k = getKind();
  let total,
    inv = null,
    items = null,
    split = null;
  const old = editingId ? records.find((x) => x.id === editingId) : null;
  if (k === 'investment') {
    if (invAct === 'dividend') {
      total = +$('#f-divamt').value;
      if (!(total > 0)) {
        toast('請輸入股利金額');
        return;
      }
      inv = {
        action: 'dividend',
        symbol: $('#f-symbol').value.trim(),
        ticker: $('#f-ticker').value.trim(),
        shares: 0,
        unitPrice: 0,
        fee: 0,
        autoFee: false,
        commission: 0,
        tax: 0,
        dayTrade: false,
      };
    } else {
      const sh = +$('#f-shares').value,
        pr = +$('#f-uprice').value,
        autoFee = $('#f-auto-fee')?.checked !== false,
        dayTrade = invAct === 'sell' && !!$('#f-daytrade')?.checked,
        est = estimateCathayStockCosts(sh, pr, invAct, dayTrade),
        fee = autoFee ? est.total : +$('#f-fee').value || 0;
      if (!(sh > 0) || !(pr > 0)) {
        toast('請輸入股數與成交價');
        return;
      }
      total = invAct === 'buy' ? sh * pr + fee : sh * pr - fee;
      inv = {
        action: invAct,
        symbol: $('#f-symbol').value.trim(),
        ticker: $('#f-ticker').value.trim(),
        shares: sh,
        unitPrice: pr,
        fee,
        autoFee,
        commission: autoFee ? est.commission : null,
        tax: autoFee ? est.tax : null,
        dayTrade,
        taxRate: autoFee ? est.taxRate : null,
        feeRate: autoFee ? CATHAY_STOCK_FEE_RATE : null,
      };
    }
    if (!inv.symbol) {
      toast('請輸入標的名稱');
      return;
    }
  } else if (k === 'income') {
    total = parseFloat($('#f-total').value);
    if (!(total > 0)) {
      toast('請輸入金額');
      return;
    }
  } else {
    total = parseFloat($('#f-total').value);
    items = itemDetailOpen ? collectItems() : null;
    const itemGross = (items || []).reduce((s, i) => s + (+i.grossPrice || +i.price || 0), 0),
      base = itemGross > 0 ? itemGross : discountBaseAmount || total || 0,
      applied = applyDiscountsToItems(items || [], base);
    if (items) items = applied.items;
    if (discountDraft.length || discountOverrideTotal !== null) total = applied.plan.finalTotal;
    else if (itemDetailOpen && itemGross > 0) total = itemGross;
    if (!(total > 0)) {
      toast('請輸入支出金額');
      return;
    }
    if ($('#splitToggle').checked) {
      const ms = Math.max(0, Math.min(currentMyShare(total), total));
      split = {
        partner: $('#f-partner').value.trim(),
        payer: splitPayer,
        myShare: ms,
        preset: splitPreset,
        settled: false,
      };
    }
  }
  const rec = {
    id: editingId || uid(),
    createdAt: editingId
      ? records.find((x) => x.id === editingId)?.createdAt || Date.now()
      : Date.now(),
    date: $('#f-date').value || new Date().toISOString().slice(0, 10),
    kind: k,
    scope:
      k === 'investment'
        ? { type: 'daily', trip: null }
        : formScope || { type: 'daily', trip: null },
    store: composedStore(),
    storeChain: k === 'expense' && storeMode === 'chain' ? $('#f-chain').value.trim() : null,
    storeBranch: k === 'expense' && storeMode === 'chain' ? $('#f-branch').value.trim() : null,
    payment: k === 'investment' ? null : selPay,
    hashtags: old?.hashtags || [],
    note: $('#f-note').value.trim(),
    items,
    catMode: k === 'expense' ? catMode : null,
    category: k === 'investment' ? null : k === 'expense' && catMode === 'perItem' ? null : selCat,
    sub: k === 'expense' && catMode === 'whole' ? selSub : null,
    grossTotal:
      k === 'expense'
        ? discountDraft.length || discountOverrideTotal !== null
          ? money2(
              (items || []).reduce((s, i) => s + (+i.grossPrice || 0), 0) ||
                discountBaseAmount ||
                total,
            )
          : null
        : null,
    discountTotal:
      k === 'expense' && (discountDraft.length || discountOverrideTotal !== null)
        ? money2(
            ((items || []).reduce((s, i) => s + (+i.grossPrice || 0), 0) ||
              discountBaseAmount ||
              total) - total,
          )
        : 0,
    discounts: k === 'expense' && discountDraft.length ? cloneDiscounts(discountDraft) : null,
    discountOverrideTotal:
      k === 'expense' && discountOverrideTotal !== null ? money2(discountOverrideTotal) : null,
    total,
    split,
    inv,
  };
  if (editingId) records = records.map((x) => (x.id === editingId ? rec : x));
  else records.push(rec);
  const wasEditing = !!editingId;
  save(K.rec, records);
  if (k === 'expense' && storeMode === 'chain' && $('#f-chain').value.trim()) {
    settings.storeChains = unionUnique(settings.storeChains, [$('#f-chain').value.trim()]);
  }
  if (k !== 'investment' && selPay) settings.lastPayment = selPay;
  save(K.set, settings);
  if (cont && !wasEditing) {
    renderAll();
    if (k === 'investment') renderInvest();
    toast('已儲存，繼續下一筆');
    openSheet(null);
  } else {
    closeSheet();
    renderAll();
    if (k === 'investment') renderInvest();
    toast(wasEditing ? '已更新' : '已儲存');
  }
}
function deleteRecord() {
  if (!editingId) return;
  if (!confirm('確定刪除這筆？')) return;
  const old = records.find((x) => x.id === editingId);
  if (old?.recurring?.ruleId) {
    settings.recurringSkipped = unionUnique(settings.recurringSkipped, [
      old.recurring.ruleId + '|' + (old.recurring.occurrenceDate || old.date),
    ]);
    save(K.set, settings);
  }
  records = records.filter((x) => x.id !== editingId);
  save(K.rec, records);
  closeSheet();
  renderAll();
  renderInvest();
  toast('已刪除');
}
$('#fab').onclick = () => openSheet(null);
$('#cancelBtn').onclick = closeSheet;
$('#backdrop').onclick = closeSheet;
$('#saveBtn').onclick = () => saveRecord(false);
$('#saveBtnBottom').onclick = () => saveRecord(false);
$('#saveContinueBtn').onclick = () => saveRecord(true);
$('#deleteBtn').onclick = deleteRecord;
