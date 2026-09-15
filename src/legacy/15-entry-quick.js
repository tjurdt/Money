/* ===== 快速記帳：漸進式明細與智慧預設 ===== */
function setItemDetailOpen(on, addBlank = true) {
  itemDetailOpen = !!on;
  $('#detailToggle').classList.toggle('open', itemDetailOpen);
  $('#detailToggle').querySelector('.chev').textContent = itemDetailOpen ? '⌃' : '⌄';
  if (getKind() === 'expense') {
    $('#fld-items').classList.toggle('hidden', !itemDetailOpen);
    $('#fld-catmode').classList.toggle('hidden', !itemDetailOpen);
    if (itemDetailOpen && addBlank && !$('#itemRows').children.length) addItemRow();
  } else {
    $('#fld-items').classList.add('hidden');
    $('#fld-catmode').classList.add('hidden');
  }
}
$('#detailToggle').onclick = () => setItemDetailOpen(!itemDetailOpen);
function activeTripToday() {
  const d = todayISO();
  return sortedTrips().find((t) => t.start && t.start <= d && (t.end || t.start) >= d) || null;
}
function defaultFormScope() {
  if (currentScope.type !== 'all') return { ...currentScope };
  const t = activeTripToday();
  return t ? { type: t.kind, trip: t.id } : { type: 'daily', trip: null };
}
function lastExpense() {
  return (
    records
      .filter((r) => r.kind === 'expense')
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0] || null
  );
}
function updateRepeatButton() {
  const show = !editingId && getKind() === 'expense' && !!lastExpense();
  $('#repeatLastBtn').classList.toggle('show', show);
}
function applyRecordTemplate(r) {
  if (!r) return;
  storeMode = r.storeChain ? 'chain' : 'single';
  $('#f-store').value = r.store || '';
  refreshChainSelect(r.storeChain || '');
  $('#f-chain').value = r.storeChain || '';
  $('#f-branch').value = r.storeBranch || '';
  setStoreMode(storeMode, false);
  $('#f-total').value = r.total || '';
  discountDraft = cloneDiscounts(r.discounts || []);
  discountOverrideTotal = r.discountOverrideTotal != null ? +r.discountOverrideTotal : null;
  discountBaseAmount = r.grossTotal != null ? r.grossTotal : r.total || 0;
  selCat = r.category || null;
  selSub = r.sub || null;
  selPay = r.payment || null;
  catMode = r.catMode || 'whole';
  const hasDetails = !!(r.items || []).some((i) => i.name) || catMode === 'perItem';
  $('#itemRows').innerHTML = '';
  if (hasDetails)
    (r.items || []).forEach((i) =>
      addItemRow(
        i.name || '',
        i.grossPrice != null ? i.grossPrice : (i.price ?? ''),
        i.category || '',
        i.sub || '',
        i.qty || 1,
        i.unitPrice,
        i.lineId || '',
      ),
    );
  setItemDetailOpen(hasDetails);
  renderChipSelectors();
  renderSubChips();
  refreshStoreItems();
  recomputeTotal();
  renderDiscountSummary();
  updateSplitPreview();
  toast('已套用上一筆；日期與情境維持本次設定');
}
$('#repeatLastBtn').onclick = () => applyRecordTemplate(lastExpense());
function smartFillFromStore() {
  if (getKind() !== 'expense') return;
  const store = composedStore();
  if (!store) return;
  const hist = records.filter((r) => r.kind === 'expense' && r.store === store);
  if (!hist.length) return;
  const count = (arr) =>
    Object.entries(arr.reduce((m, x) => (x && (m[x] = (m[x] || 0) + 1), m), {})).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
  if (!selCat) {
    const c = count(hist.flatMap((r) => recordCategories(r)));
    if (c) {
      selCat = c;
      selSub = null;
    }
  }
  if (!selPay) {
    const p = count(hist.map((r) => r.payment));
    if (p) selPay = p;
  }
  renderChipSelectors();
  renderSubChips();
}
$('#f-store').addEventListener('blur', smartFillFromStore);
$('#f-chain').addEventListener('blur', smartFillFromStore);
$('#f-branch').addEventListener('blur', smartFillFromStore);
$('#openRepayFromEntry').onclick = () => {
  closeSheet();
  openRepaySheet(null, '');
};
