/* ===== 行程編輯 ===== */
let tripEditingId = null,
  tKind = 'domestic';
$('#tkindSeg')
  .querySelectorAll('.tk')
  .forEach(
    (b) =>
      (b.onclick = () => {
        tKind = b.dataset.k;
        $('#tkindSeg')
          .querySelectorAll('.tk')
          .forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
function openTripSheet(id, kind) {
  tripEditingId = id;
  const t = id ? tripById(id) : null;
  $('#tripSheetTitle').textContent = id ? '編輯行程' : '新增行程';
  $('#tripDelete').style.display = id ? 'block' : 'none';
  $('#t-name').value = t ? t.name : '';
  tKind = t ? t.kind : kind || 'domestic';
  $('#tkindSeg')
    .querySelectorAll('.tk')
    .forEach((x) => x.classList.toggle('on', x.dataset.k === tKind));
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
