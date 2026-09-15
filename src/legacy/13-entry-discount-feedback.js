/* ===== v23c：折扣輸入即時回饋（僅輔助輸入，不更動計算引擎與資料格式） ===== */
function updateDiscountRateEcho() {
  const el = $('#discountRateEcho');
  if (!el) return;
  const needsRate = !['fixed', 'bundle_price'].includes(discountEditorType);
  if (!needsRate || $('#discountRateField').style.display === 'none') {
    el.textContent = '';
    el.classList.remove('bad');
    return;
  }
  const raw = ($('#discountRate').value || '').trim();
  if (raw === '') {
    el.textContent = '';
    el.classList.remove('bad');
    return;
  }
  const rate = normalizeDiscountRate(raw);
  if (rate == null) {
    el.classList.add('bad');
    el.textContent = '格式無法辨識，可輸入 6、7.9、79 或 0.79';
    return;
  }
  el.classList.remove('bad');
  el.innerHTML = `→ ${discountRateLabel(rate)}，實付 <strong>${Math.round(rate * 100)}%</strong>（省 ${Math.round((1 - rate) * 100)}%）`;
}
function updateDiscountEditorLive() {
  const el = $('#discountEditorLive');
  if (!el) return;
  const type = discountEditorType,
    items = draftItemsForDiscount(),
    gross = currentDiscountPlan().grossTotal,
    needsRate = !['fixed', 'bundle_price'].includes(type),
    rate = needsRate ? normalizeDiscountRate($('#discountRate').value) : null,
    isItem = ['item_percent', 'nth_percent', 'bundle_price'].includes(type);
  const rule = {
    type,
    targetLineId: isItem ? $('#discountTarget').value || null : null,
    rate,
    amount: type === 'fixed' ? Math.max(0, +$('#discountFixed').value || 0) : 0,
    nth: type === 'nth_percent' ? Math.max(2, Math.floor(+$('#discountNth').value || 2)) : null,
    bundleQty:
      type === 'bundle_price' ? Math.max(2, Math.floor(+$('#discountBundleQty').value || 2)) : null,
    bundlePrice:
      type === 'bundle_price' ? Math.max(0, +$('#discountBundlePrice').value || 0) : null,
    repeat:
      type === 'nth_percent'
        ? $('#discountRepeat').checked
        : type === 'bundle_price'
          ? $('#discountBundleRepeat').checked
          : null,
    minSpend: Math.max(0, +$('#discountMinSpend').value || 0),
    maxSaving: Math.max(0, +$('#discountMaxSaving').value || 0),
  };
  let msg = '';
  if (isItem && !rule.targetLineId) msg = '選擇品項後，這裡會即時預估省多少';
  else if (needsRate && rate == null) msg = '輸入折數後，這裡會即時預估省多少';
  else if (type === 'fixed' && !(rule.amount > 0)) msg = '輸入折抵金額後，這裡會即時預估省多少';
  else if (type === 'bundle_price' && !(rule.bundlePrice >= 0 && rule.bundleQty >= 2))
    msg = '填好件數與特價後，這裡會即時預估省多少';
  else if (rule.minSpend > 0 && gross + 1e-9 < rule.minSpend)
    msg = `未達滿額門檻，還差 ${nf(rule.minSpend - gross)} 才折抵`;
  else {
    const save = rulePotential(rule, items, gross);
    msg =
      save > 0
        ? `這條規則預估省 <strong>${nf(save)}</strong>　原價 ${nf(gross)} → 約 ${nf(Math.max(0, gross - save))}`
        : '目前條件下，這條規則不會產生折抵';
  }
  el.innerHTML = msg;
}
function refreshDiscountEditorFeedback() {
  updateDiscountRateEcho();
  updateDiscountEditorLive();
}
[
  '#discountRate',
  '#discountFixed',
  '#discountNth',
  '#discountBundleQty',
  '#discountBundlePrice',
  '#discountMinSpend',
  '#discountMaxSaving',
].forEach((sel) => $(sel)?.addEventListener('input', refreshDiscountEditorFeedback));
$('#discountTarget')?.addEventListener('change', refreshDiscountEditorFeedback);
['#discountRepeat', '#discountBundleRepeat'].forEach((sel) =>
  $(sel)?.addEventListener('change', refreshDiscountEditorFeedback),
);
$('#discountBaseAmount').addEventListener('input', () => {
  discountBaseAmount = Math.max(0, +$('#discountBaseAmount').value || 0);
  updateDiscountPreview();
});
$('#discountOverrideTotal').addEventListener('input', () => {
  const raw = $('#discountOverrideTotal').value.trim();
  if (raw === '') discountOverrideTotal = null;
  else {
    const v = Math.max(0, +raw || 0),
      gross = currentDiscountPlan().grossTotal;
    if (gross > 0 && v > gross) {
      toast('實際結帳金額不可高於折扣前原價');
      return;
    }
    discountOverrideTotal = v;
  }
  recomputeTotal();
  renderDiscountList();
});
$('#discountOverrideClear').onclick = () => {
  discountOverrideTotal = null;
  $('#discountOverrideTotal').value = '';
  recomputeTotal();
  renderDiscountList();
};
$('#discountRuleSave').onclick = () => {
  const type = discountEditorType,
    needsRate = !['fixed', 'bundle_price'].includes(type),
    rate = needsRate ? normalizeDiscountRate($('#discountRate').value) : null,
    target = ['item_percent', 'nth_percent', 'bundle_price'].includes(type)
      ? $('#discountTarget').value
      : '',
    amount = type === 'fixed' ? Math.max(0, +$('#discountFixed').value || 0) : 0,
    nth = type === 'nth_percent' ? Math.max(2, Math.floor(+$('#discountNth').value || 2)) : null,
    bundleQty =
      type === 'bundle_price' ? Math.max(2, Math.floor(+$('#discountBundleQty').value || 2)) : null,
    bundlePrice =
      type === 'bundle_price' ? Math.max(0, +$('#discountBundlePrice').value || 0) : null,
    minSpend = Math.max(0, +$('#discountMinSpend').value || 0),
    maxSaving = Math.max(0, +$('#discountMaxSaving').value || 0);
  if (['item_percent', 'nth_percent', 'bundle_price'].includes(type) && !target) {
    toast('請選擇要套用的品項');
    return;
  }
  if (needsRate && rate == null) {
    toast('折數格式無法辨識');
    return;
  }
  if (type === 'fixed' && !(amount > 0)) {
    toast('請輸入折抵金額');
    return;
  }
  if (type === 'bundle_price' && !(bundlePrice >= 0)) {
    toast('請輸入組合特價');
    return;
  }
  const old = discountEditingRuleId
      ? discountDraft.find((x) => x.id === discountEditingRuleId)
      : null,
    rule = {
      id: discountEditingRuleId || uid(),
      createdAt: old?.createdAt || Date.now(),
      type,
      targetLineId: target || null,
      rate,
      amount: type === 'fixed' ? amount : 0,
      nth,
      bundleQty,
      bundlePrice,
      repeat:
        type === 'nth_percent'
          ? $('#discountRepeat').checked
          : type === 'bundle_price'
            ? $('#discountBundleRepeat').checked
            : null,
      label: $('#discountLabel').value.trim(),
      mode: discountEditorMode,
      bestGroup: discountEditorMode === 'best' ? $('#discountBestGroup').value || 'A' : null,
      minSpend,
      maxSaving,
    };
  if (discountEditingRuleId)
    discountDraft = discountDraft.map((x) => (x.id === discountEditingRuleId ? rule : x));
  else discountDraft.push(rule);
  closeDiscountEditor();
  renderDiscountList();
  recomputeTotal();
};
function applyDiscountsToItems(items, baseAmount) {
  const plan = calculateDiscountPlan(items, baseAmount, discountDraft, discountOverrideTotal);
  return {
    plan,
    items: (items || []).map((it) => ({
      ...it,
      grossPrice: money2(it.grossPrice != null ? it.grossPrice : it.price),
      price: plan.netByLine[it.lineId] != null ? plan.netByLine[it.lineId] : money2(it.price),
    })),
  };
}

function storeItemCatalog(store, chain) {
  const freq = {},
    price = {},
    unit = {};
  const useChain = !!chain;
  records.forEach((r) => {
    if (!r.items) return;
    const match = useChain ? chainNameOfRecord(r) === chain : r.store === store;
    if (!match) return;
    r.items.forEach((it) => {
      if (it.name) {
        freq[it.name] = (freq[it.name] || 0) + 1;
        const gp = it.grossPrice != null ? it.grossPrice : it.price;
        price[it.name] = gp;
        unit[it.name] = it.unitPrice || ((+it.qty || 1) > 0 ? (+gp || 0) / (+it.qty || 1) : gp);
      }
    });
  });
  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .map((n) => ({ name: n, price: price[n], unitPrice: unit[n] }));
}
function refreshStoreItems() {
  if (getKind() !== 'expense') {
    const ft = $('#favTitle');
    if (ft) ft.style.display = 'none';
    const sb = $('#storeFav');
    if (sb) sb.innerHTML = '';
    return;
  }
  const store = composedStore();
  let chain = '';
  if (storeMode === 'chain') {
    chain = $('#f-chain').value.trim();
  } else {
    const x = inferChainBranch(store);
    if (x.recognized) chain = x.chain;
  }
  const cat = storeItemCatalog(store, chain);
  $('#itemList').innerHTML = cat.map((x) => `<option value="${esc(x.name)}">`).join('');
  const fav = cat.slice(0, 10);
  $('#favTitle').style.display = fav.length ? 'block' : 'none';
  if (fav.length)
    $('#favTitle').textContent = chain
      ? `${chain}常買（含各分店，點選帶入）`
      : '此店常買（點選帶入）';
  const box = $('#storeFav');
  box.innerHTML = fav
    .map(
      (x) =>
        `<button data-n="${esc(x.name)}" data-p="${x.price}" data-u="${x.unitPrice || x.price}">${esc(x.name)} <small style="opacity:.6">${nf(x.unitPrice || x.price)}</small></button>`,
    )
    .join('');
  box
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => pickStoreFavItem(b.dataset.n, b.dataset.p, b.dataset.u)));
}
function pickStoreFavItem(name, price, unit) {
  if (getKind() !== 'expense') return;
  if (!itemDetailOpen) setItemDetailOpen(true, false);
  const rows = [...$('#itemRows').querySelectorAll('.itemrow')];
  const empty = rows.find(
    (r) => !r.querySelector('.i-name').value.trim() && !r.querySelector('.i-price').value.trim(),
  );
  if (empty) {
    empty.querySelector('.i-name').value = name;
    empty.querySelector('.i-price').value = price;
    if (empty.classList.contains('qty')) {
      const u = empty.querySelector('.i-unit');
      if (u) {
        u.value = unit;
        syncItemRowTotal(empty);
      }
    }
  } else addItemRow(name, price, '', '', 1, unit);
  recomputeTotal();
}
function buildDatalists() {
  const f = {};
  records.forEach((r) => {
    if (r.store) f[r.store] = (f[r.store] || 0) + 1;
  });
  $('#storeList').innerHTML = Object.keys(f)
    .sort((a, b) => f[b] - f[a])
    .slice(0, 60)
    .map((x) => `<option value="${esc(x)}">`)
    .join('');
  refreshChainSelect($('#f-chain')?.value || '');
  refreshBranchList();
  const partners = new Set();
  records.forEach((r) => {
    if (r.split && r.split.partner) partners.add(r.split.partner);
    if (r.kind === 'settlement' && r.settlement?.partner) partners.add(r.settlement.partner);
  });
  $('#partnerList').innerHTML = [...partners].map((x) => `<option value="${esc(x)}">`).join('');
}
$('#f-store').addEventListener('change', refreshStoreItems);
$('#f-chain').addEventListener('change', refreshStoreItems);
$('#f-branch').addEventListener('change', refreshStoreItems);
