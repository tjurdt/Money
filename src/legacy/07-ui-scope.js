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
    st = sortedTrips();
  const item = (sc, name, dts) => {
    const on = cur.type === sc.type && (!sc.trip || cur.trip === sc.trip);
    return `<div class="scopeitem ${on ? 'on' : ''}" data-type="${sc.type}" data-trip="${sc.trip || ''}"><div><div class="nm">${esc(name)}</div>${dts ? `<div class="dts">${dts}</div>` : ''}</div><span class="tot">${nf(scopeTotal(sc))}</span></div>`;
  };
  let h =
    (scopePickerTarget === 'current'
      ? item({ type: 'all', trip: null }, '🌐 全部', '所有日常與情境')
      : '') + item({ type: 'daily', trip: null }, '🏠 日常', '');

  // 每種情境類型各自成為一個分區。新增類型只需改 src/domain/scope.js，
  // 不必回頭改這裡 —— 這是原本 domestic/overseas 硬編碼在 7 個檔案的痛點。
  for (const kind of SCOPE_KIND_LIST) {
    const entries = st.filter((t) => (t.kind || 'domestic') === kind.key);
    h +=
      `<div class="sec">${kind.emoji} ${kind.label}</div>` +
      (entries.length
        ? entries
            .map((t) =>
              item({ type: kind.key, trip: t.id }, `${kind.emoji} ${t.name}`, tripDates(t)),
            )
            .join('')
        : '<div class="empty" style="padding:8px;font-size:13px">尚無</div>') +
      `<button class="addtrip" data-add="${kind.key}">＋ 新增${kind.label}</button>`;
  }
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
