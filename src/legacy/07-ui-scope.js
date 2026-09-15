/* ===== 情境選擇 ===== */
const scopeTotal = (sc) =>
  records
    .filter(
      (r) =>
        r.kind === 'expense' &&
        (sc.type === 'all' ||
          (r.scope && (sc.type === 'daily' ? r.scope.type === 'daily' : r.scope.trip === sc.trip))),
    )
    .reduce((s, r) => s + myShareOf(r), 0);
let scopePickerTarget = 'current';
function openScopePicker(t) {
  scopePickerTarget = t;
  renderScopeList();
  $('#scopeBackdrop').classList.add('show');
  $('#scopeSheet').classList.add('show');
}
function closeScopePicker() {
  $('#scopeBackdrop').classList.remove('show');
  $('#scopeSheet').classList.remove('show');
}
$('#scopeCancel').onclick = closeScopePicker;
$('#scopeBackdrop').onclick = closeScopePicker;
const activeScope = () => (scopePickerTarget === 'current' ? currentScope : formScope);
function renderScopeList() {
  const cur = activeScope(),
    st = sortedTrips(),
    dom = st.filter((t) => t.kind === 'domestic'),
    ovs = st.filter((t) => t.kind === 'overseas');
  const item = (sc, name, dts) => {
    const on = cur.type === sc.type && (!sc.trip || cur.trip === sc.trip);
    return `<div class="scopeitem ${on ? 'on' : ''}" data-type="${sc.type}" data-trip="${sc.trip || ''}"><div><div class="nm">${esc(name)}</div>${dts ? `<div class="dts">${dts}</div>` : ''}</div><span class="tot">${nf(scopeTotal(sc))}</span></div>`;
  };
  let h =
    (scopePickerTarget === 'current'
      ? item({ type: 'all', trip: null }, '🌐 全部', '所有日常與旅行')
      : '') + item({ type: 'daily', trip: null }, '🏠 日常', '');
  h +=
    `<div class="sec">🚆 國內旅遊</div>` +
    (dom.length
      ? dom
          .map((t) => item({ type: 'domestic', trip: t.id }, '🚆 ' + t.name, tripDates(t)))
          .join('')
      : '<div class="empty" style="padding:8px;font-size:13px">尚無</div>') +
    `<button class="addtrip" data-add="domestic">＋ 新增國內旅遊</button>`;
  h +=
    `<div class="sec">✈️ 出國旅遊</div>` +
    (ovs.length
      ? ovs
          .map((t) => item({ type: 'overseas', trip: t.id }, '✈️ ' + t.name, tripDates(t)))
          .join('')
      : '<div class="empty" style="padding:8px;font-size:13px">尚無</div>') +
    `<button class="addtrip" data-add="overseas">＋ 新增出國旅遊</button>`;
  const box = $('#scopeListBody');
  box.innerHTML = h;
  box
    .querySelectorAll('.scopeitem')
    .forEach(
      (el) =>
        (el.onclick = () => selectScope({ type: el.dataset.type, trip: el.dataset.trip || null })),
    );
  box.querySelectorAll('[data-add]').forEach(
    (b) =>
      (b.onclick = () => {
        closeScopePicker();
        openTripSheet(null, b.dataset.add);
      }),
  );
}
function selectScope(sc) {
  if (scopePickerTarget === 'current') {
    currentScope = sc;
    save(K.scope, currentScope);
    renderScopePill();
    renderMonthBar();
    renderAll();
  } else {
    formScope = sc;
    $('#formScopeText').textContent = scopeLabel(sc);
  }
  closeScopePicker();
}
