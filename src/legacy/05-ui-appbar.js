/* ===== App bar ===== */
function renderScopePill() {
  $('#scopePillText').textContent = scopeLabel(currentScope);
}
function periodMonthBounds() {
  const y = viewMonth.getFullYear(),
    m = viewMonth.getMonth() + 1,
    from = `${y}-${String(m).padStart(2, '0')}-01`,
    last = new Date(y, m, 0).getDate(),
    to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}
function saveListPeriod() {
  save('ledger.list.period.v1', listPeriod);
}
function setListPeriod(mode, from = '', to = '') {
  listPeriod = { mode, from, to };
  if (mode === 'month') {
    const ym = (from || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      const [y, m] = ym.split('-').map(Number);
      viewMonth = new Date(y, m - 1, 1);
    }
    const b = periodMonthBounds();
    listPeriod.from = b.from;
    listPeriod.to = b.to;
  }
  if (mode === 'day') listPeriod.to = from;
  if (mode === 'custom' && from && to && to < from) {
    const x = from;
    from = to;
    to = x;
    listPeriod = { mode, from, to };
  }
  saveListPeriod();
  renderMonthBar();
  renderAll();
}
function renderMonthBar() {
  const lbl = $('#monthLabel');
  if (isTripScope()) {
    const t = tripById(currentScope.trip),
      dt = tripDates(t);
    lbl.innerHTML = (t ? esc(t.name) : '行程') + (dt ? `<span class="sub">${dt}</span>` : '');
    lbl.classList.add('trip');
    $('#prevMonth').classList.add('hide');
    $('#nextMonth').classList.add('hide');
    lbl.disabled = true;
    return;
  }
  lbl.disabled = false;
  lbl.classList.remove('trip');
  if (listPeriod.mode === 'all') lbl.innerHTML = '全部時間<span class="sub">點此選擇日期</span>';
  else if (listPeriod.mode === 'day') {
    const d = new Date((listPeriod.from || todayISO()) + 'T00:00:00');
    lbl.innerHTML = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}<span class="sub">單日</span>`;
  } else if (listPeriod.mode === 'custom') {
    lbl.innerHTML = `${esc(listPeriod.from || '開始')}–${esc(listPeriod.to || '今天')}<span class="sub">自訂範圍</span>`;
  } else {
    const b = periodMonthBounds();
    listPeriod = { mode: 'month', from: b.from, to: b.to };
    lbl.innerHTML = `${viewMonth.getFullYear()} / ${String(viewMonth.getMonth() + 1).padStart(2, '0')}<span class="sub">點此選擇時間</span>`;
  }
  const arrows = listPeriod.mode === 'month';
  $('#prevMonth').classList.toggle('hide', !arrows);
  $('#nextMonth').classList.toggle('hide', !arrows);
}
$('#prevMonth').onclick = () => {
  if (listPeriod.mode !== 'month') return;
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  const b = periodMonthBounds();
  listPeriod = { mode: 'month', ...b };
  saveListPeriod();
  renderMonthBar();
  renderAll();
};
$('#nextMonth').onclick = () => {
  if (listPeriod.mode !== 'month') return;
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  const b = periodMonthBounds();
  listPeriod = { mode: 'month', ...b };
  saveListPeriod();
  renderMonthBar();
  renderAll();
};
function openPeriodSheet() {
  if (isTripScope()) return;
  $('#periodMonth').value =
    `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
  $('#periodFrom').value =
    listPeriod.mode === 'custom'
      ? listPeriod.from
      : listPeriod.mode === 'day'
        ? listPeriod.from
        : '';
  $('#periodTo').value =
    listPeriod.mode === 'custom' ? listPeriod.to : listPeriod.mode === 'day' ? listPeriod.from : '';
  $('#periodPresets')
    .querySelectorAll('button')
    .forEach((b) =>
      b.classList.toggle(
        'on',
        (b.dataset.period === 'month' && listPeriod.mode === 'month') ||
          (b.dataset.period === 'today' &&
            listPeriod.mode === 'day' &&
            listPeriod.from === todayISO()) ||
          (b.dataset.period === 'all' && listPeriod.mode === 'all'),
      ),
    );
  $('#periodBackdrop').classList.add('show');
  $('#periodSheet').classList.add('show');
}
function closePeriodSheet() {
  $('#periodBackdrop').classList.remove('show');
  $('#periodSheet').classList.remove('show');
}
$('#monthLabel').onclick = openPeriodSheet;
$('#periodCancel').onclick = closePeriodSheet;
$('#periodBackdrop').onclick = closePeriodSheet;
$('#periodPresets')
  .querySelectorAll('button')
  .forEach(
    (b) =>
      (b.onclick = () => {
        const p = b.dataset.period;
        if (p === 'today') setListPeriod('day', todayISO(), todayISO());
        else if (p === 'all') setListPeriod('all', '', '');
        else
          setListPeriod(
            'month',
            `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
          );
        closePeriodSheet();
      }),
  );
$('#periodMonthApply').onclick = () => {
  const ym = $('#periodMonth').value;
  if (!ym) return toast('請選擇月份');
  setListPeriod('month', ym + '-01');
  closePeriodSheet();
};
$('#periodRangeApply').onclick = () => {
  const f = $('#periodFrom').value,
    t = $('#periodTo').value;
  if (!f && !t) return toast('請至少選擇一個日期');
  if (f && t && f === t) setListPeriod('day', f, f);
  else setListPeriod('custom', f, t);
  closePeriodSheet();
};
$('#scopePill').onclick = () => openScopePicker('current');
$$('.nav button').forEach(
  (b) =>
    (b.onclick = () => {
      $$('.nav button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      $$('.view').forEach((v) => v.classList.remove('active'));
      $('#view-' + b.dataset.view).classList.add('active');
      $('#fab').classList.toggle('settings-hidden', b.dataset.view === 'settings');
      if (b.dataset.view === 'chart') renderCharts();
      if (b.dataset.view === 'invest') {
        renderInvest();
        maybeRefreshPrices();
      }
      if (b.dataset.view === 'settings') renderSettings();
      window.scrollTo(0, 0);
    }),
);
