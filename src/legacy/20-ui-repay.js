/* ===== 還款 / 結算紀錄 ===== */
let repayEditingId = null,
  repayDir = 'received';
function openRepaySheet(id, partner = '', dir = 'received') {
  repayEditingId = id || null;
  const r = id ? records.find((x) => x.id === id) : null,
    q = r?.settlement || {};
  repayDir = q.direction || dir || 'received';
  $('#repayTitle').textContent = id ? '編輯還款' : '記錄還款';
  $('#repayDelete').style.display = id ? 'block' : 'none';
  buildDatalists();
  $('#rp-partner').value = q.partner || partner || '';
  $('#rp-date').value = r?.date || todayISO();
  $('#rp-amount').value = r?.total || '';
  $('#rp-note').value = r?.note || '';
  $('#repayDirSeg')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.d === repayDir));
  $('#repayBackdrop').classList.add('show');
  $('#repaySheet').classList.add('show');
}
function closeRepaySheet() {
  $('#repayBackdrop').classList.remove('show');
  $('#repaySheet').classList.remove('show');
  repayEditingId = null;
}
$('#repayDirSeg')
  .querySelectorAll('button')
  .forEach(
    (b) =>
      (b.onclick = () => {
        repayDir = b.dataset.d;
        $('#repayDirSeg')
          .querySelectorAll('button')
          .forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
$('#repayCancel').onclick = closeRepaySheet;
$('#repayBackdrop').onclick = closeRepaySheet;
function saveRepayment() {
  const partner = $('#rp-partner').value.trim(),
    amount = +$('#rp-amount').value;
  if (!partner) {
    toast('請輸入還款對象');
    return;
  }
  if (!(amount > 0)) {
    toast('請輸入還款金額');
    return;
  }
  const old = repayEditingId ? records.find((x) => x.id === repayEditingId) : null,
    rec = {
      id: repayEditingId || uid(),
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
      date: $('#rp-date').value || todayISO(),
      kind: 'settlement',
      scope: { type: 'daily', trip: null },
      store: '',
      payment: null,
      hashtags: old?.hashtags || [],
      note: $('#rp-note').value.trim(),
      items: null,
      catMode: null,
      category: null,
      sub: null,
      total: amount,
      split: null,
      inv: null,
      settlement: { partner, direction: repayDir },
    };
  if (repayEditingId) records = records.map((x) => (x.id === repayEditingId ? rec : x));
  else records = [...records, rec];
  save(K.rec, records);
  closeRepaySheet();
  renderAll();
  if ($('#view-chart').classList.contains('active')) renderCharts();
  toast(repayEditingId ? '已更新還款' : '已記錄還款');
}
$('#repaySave').onclick = saveRepayment;
$('#repaySaveBottom').onclick = saveRepayment;
$('#repayDelete').onclick = () => {
  if (!repayEditingId || !confirm('刪除這筆還款紀錄？')) return;
  records = records.filter((x) => x.id !== repayEditingId);
  save(K.rec, records);
  closeRepaySheet();
  renderAll();
  if ($('#view-chart').classList.contains('active')) renderCharts();
  toast('已刪除還款');
};
