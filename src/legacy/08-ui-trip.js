/* ===== 行程編輯 ===== */
let tripEditingId = null,
  tKind = DEFAULT_SCOPE_KIND;

/** 依選定的類型調整標題、欄位提示與說明文字。 */
function syncTripKindUI() {
  const meta = scopeKindMeta(tKind);
  $('#tkindSeg')
    .querySelectorAll('.tk')
    .forEach((x) => x.classList.toggle('on', x.dataset.k === tKind));
  $('#tripNameLabel').textContent = meta.isTrip ? '行程名稱' : '情境名稱';
  $('#t-name').placeholder = meta.namePlaceholder;
  $('#tripSheetTitle').textContent =
    (tripEditingId ? '編輯' : '新增') + (meta.isTrip ? '行程' : meta.label);
  $('#tripKindNote').textContent = meta.isTrip
    ? '旅程有明確起訖，會出現在「各趟旅遊花費」的比較圖中。'
    : '常設情境是長期持續的支出（孝親費、房貸、寵物…），不會跟日常消費混在一起，也不會進入旅遊比較圖。日期區間可留空。';
}

$('#tkindSeg')
  .querySelectorAll('.tk')
  .forEach(
    (b) =>
      (b.onclick = () => {
        tKind = b.dataset.k;
        syncTripKindUI();
      }),
  );
function openTripSheet(id, kind) {
  tripEditingId = id;
  const t = id ? tripById(id) : null;
  $('#tripDelete').style.display = id ? 'block' : 'none';
  $('#t-name').value = t ? t.name : '';
  tKind = isScopeKind(t ? t.kind : kind) ? t?.kind || kind : DEFAULT_SCOPE_KIND;
  syncTripKindUI();
  $('#t-start').value = t ? t.start || '' : '';
  $('#t-end').value = t ? t.end || '' : '';
  $('#tripBackdrop').classList.add('show');
  $('#tripSheet').classList.add('show');
}
function closeTripSheet() {
  $('#tripBackdrop').classList.remove('show');
  $('#tripSheet').classList.remove('show');
  tripEditingId = null;
}
$('#tripCancel').onclick = closeTripSheet;
$('#tripBackdrop').onclick = closeTripSheet;
function saveTrip() {
  const wasNew = !tripEditingId;
  const name = $('#t-name').value.trim();
  if (!name) {
    toast('請輸入行程名稱');
    return;
  }
  const start = $('#t-start').value,
    end = $('#t-end').value;
  if (start && end && end < start) {
    toast('結束不能早於開始');
    return;
  }
  let t;
  if (tripEditingId) {
    t = tripById(tripEditingId);
    Object.assign(t, { name, kind: tKind, start, end });
  } else {
    t = { id: uid(), name, kind: tKind, start, end };
    trips = [...trips, t];
  }
  save(K.trips, trips);
  closeTripSheet();
  renderScopePill();
  renderMonthBar();
  renderAll();
  if ($('#view-settings').classList.contains('active')) renderSettings();
  if (wasNew) selectScope({ type: tKind, trip: t.id });
}
$('#tripSave').onclick = saveTrip;
$('#tripSaveBottom').onclick = saveTrip;
$('#tripDelete').onclick = () => {
  if (!tripEditingId) return;
  if (confirm('刪除此行程？帳目會保留但顯示為已刪除。')) {
    const id = tripEditingId;
    trips = trips.filter((x) => x.id !== id);
    save(K.trips, trips);
    if (currentScope.trip === id) {
      currentScope = { type: 'daily', trip: null };
      save(K.scope, currentScope);
    }
    closeTripSheet();
    renderScopePill();
    renderMonthBar();
    renderAll();
    renderSettings();
  }
};
$('#addTripSettings').onclick = () => openTripSheet(null, 'domestic');
