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
  renderTripCurrencyEditor();
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
  loadTripCurrencyDraft(t);
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
/**
 * 新增（或調整日期後）詢問：這段期間已有的日常消費要不要一併納入這個行程。
 * 只動「日常」帳目，不會把別的行程的帳目搶過來。回傳實際移入的筆數。
 */
function offerClaimExistingRecords(t) {
  if (!isTripKind(t.kind)) return 0;
  const hits = dailyRecordsInTripRange(records, t);
  if (!hits.length) return 0;
  const sum = hits.reduce((s, r) => s + myShareOf(r), 0);
  const ok = confirm(
    `${t.start} ～ ${t.end} 這段期間，日常裡已有 ${hits.length} 筆帳目（支出約 ${nf(sum)}）。

` +
      `要把它們納入「${t.name}」嗎？
按「取消」則維持在日常。`,
  );
  if (!ok) return 0;
  records = moveRecordsToTrip(
    records,
    hits.map((r) => r.id),
    t,
  );
  save(K.rec, records);
  return hits.length;
}
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
  const prev = tripEditingId ? tripById(tripEditingId) : null;
  const rangeChanged = !prev || prev.start !== start || prev.end !== end;
  // 幣別設定只在出國行程編輯；其他類型保留原值，不因為切換類型而默默丟失。
  const currencies = tKind === 'overseas' ? readTripCurrencyDraft() : prev?.currencies;
  const fx = currencies ? { currencies } : {};
  let t;
  if (prev) {
    t = prev;
    Object.assign(t, { name, kind: tKind, start, end, ...fx });
    trips = [...trips];
  } else {
    t = { id: uid(), name, kind: tKind, start, end, ...fx };
    trips = [...trips, t];
  }
  save(K.trips, trips);
  const claimed = rangeChanged ? offerClaimExistingRecords(t) : 0;
  closeTripSheet();
  renderScopePill();
  renderMonthBar();
  renderAll();
  if ($('#view-settings').classList.contains('active')) renderSettings();
  if (wasNew) selectScope({ type: tKind, trip: t.id });
  if (claimed) toast(`已將 ${claimed} 筆日常帳目納入「${t.name}」`);
}
$('#tripSave').onclick = saveTrip;
$('#tripSaveBottom').onclick = saveTrip;

/**
 * 刪除行程：帳目改回日常，並留下墓碑讓雲端同步也認得「這個行程已被刪除」。
 * 沒有墓碑的話，同步合併行程時取聯集，會把刪掉的行程從雲端補回來。
 */
function deleteTrip(id) {
  const next = applyTripTombstones({ trips, records }, [id]);
  settings = { ...settings, deletedTripIds: unionUnique(settings.deletedTripIds, [id]) };
  records = next.records;
  trips = next.trips;
  save(K.set, settings);
  save(K.rec, records);
  save(K.trips, trips);
  if (currentScope.trip === id) {
    currentScope = { type: 'daily', trip: null };
    save(K.scope, currentScope);
  }
}
$('#tripDelete').onclick = () => {
  if (!tripEditingId) return;
  const id = tripEditingId,
    n = records.filter((r) => r.scope && r.scope.trip === id).length;
  const msg = n ? `刪除此行程？裡面的 ${n} 筆帳目會移回「日常」。` : '刪除此行程？';
  if (!confirm(msg)) return;
  deleteTrip(id);
  closeTripSheet();
  renderScopePill();
  renderMonthBar();
  renderAll();
  renderSettings();
  toast(n ? `已刪除，${n} 筆帳目已移回日常` : '已刪除');
};
$('#addTripSettings').onclick = () => openTripSheet(null, 'domestic');
