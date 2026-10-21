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
  // 同一趟旅行的外幣帳目：品項與金額用外幣原貌帶入，否則維持台幣內容。
  if (r.fx && formScope && r.scope && r.scope.trip === formScope.trip) r = fxSourceRecord(r);
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
  userPicked = { cat: true, pay: true };
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
  fxAfterTemplate(r);
  toast('已套用上一筆；日期與情境維持本次設定');
}
$('#repeatLastBtn').onclick = () => applyRecordTemplate(lastExpense());
/** 目前表單上的連鎖店名稱：連鎖店模式取所選連鎖，一般店名則看能否辨識成連鎖。 */
function currentStoreChain() {
  if (storeMode === 'chain') return $('#f-chain').value.trim();
  const x = inferChainBranch($('#f-store').value.trim());
  return x.recognized ? x.chain : '';
}
/** 這家店（或同一連鎖的任一分店）上一次消費的分類與付款方式；沒有歷史回傳 null。 */
function storeHistoryDefaults() {
  return lastStoreDefaults(records, composedStore(), {
    excludeId: editingId || undefined,
    chain: currentStoreChain(),
    chainOf: chainNameOfRecord,
  });
}
/**
 * 輸入店名後，帶入該店「上一筆」消費的分類與付款方式。
 * 使用者在這張表單裡親自選過的欄位不會被覆蓋；編輯舊帳目時完全不介入。
 */
function smartFillFromStore() {
  if (getKind() !== 'expense' || editingId) return;
  const store = composedStore(),
    d = storeHistoryDefaults();
  if (!d) return;
  let changed = false;
  if (!userPicked.cat && catMode === 'whole' && d.category && catsExpense.includes(d.category)) {
    if (d.category !== selCat) {
      selCat = d.category;
      selSub = d.sub && (subcats[d.category] || []).includes(d.sub) ? d.sub : null;
      changed = true;
    }
  }
  if (!userPicked.pay && d.payment && payments.includes(d.payment) && d.payment !== selPay) {
    selPay = d.payment;
    changed = true;
  }
  if (!changed) return;
  renderChipSelectors();
  renderSubChips();
  toast(`已帶入「${store}」上次的分類與付款方式`);
}
['#f-store', '#f-chain', '#f-branch'].forEach((id) => {
  $(id).addEventListener('blur', smartFillFromStore);
  $(id).addEventListener('change', smartFillFromStore);
});
// 從下拉建議清單挑選時只會觸發 input（沒有 blur），inputType 為空或 insertReplacementText。
$('#f-store').addEventListener('input', (e) => {
  if (!e.inputType || e.inputType === 'insertReplacementText') smartFillFromStore();
});
// 邊打邊帶入：名稱一旦完整對上歷史店家（或辨識為已用過的連鎖）就帶入，不必等離開欄位。
// 沒對上時 smartFillFromStore 什麼都不做，所以每個字都跑也不會誤改。
$('#f-store').addEventListener('input', smartFillFromStore);
$('#f-branch').addEventListener('input', smartFillFromStore);
$('#openRepayFromEntry').onclick = () => {
  closeSheet();
  openRepaySheet(null, '');
};
