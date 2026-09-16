/* ===== v23 UX / data glue ===== */
function storeStatKey(r) {
  if (settings.chartMergeChains) {
    const c = chainNameOfRecord(r);
    if (c) return c;
  }
  return shortPlaceName(r?.store || '') || '未填店家';
}
function updateChartMergeToggle() {
  const isStore = pieMode === 'store';
  const wrap = $('#chartChainMergeWrap');
  if (wrap) {
    wrap.classList.toggle('show', isStore);
    $('#chartMergeChains').checked = !!settings.chartMergeChains;
  }
  const t10 = $('#chartStoreTop10Wrap');
  if (t10) {
    t10.classList.toggle('show', isStore);
    $('#chartStoreTop10').checked = !!settings.chartStoreTop10;
  }
}
$('#chartMergeChains')?.addEventListener('change', (e) => {
  settings.chartMergeChains = !!e.target.checked;
  save(K.set, settings);
  renderPie();
  renderBar();
});
$('#chartStoreTop10')?.addEventListener('change', (e) => {
  settings.chartStoreTop10 = !!e.target.checked;
  save(K.set, settings);
  renderPie();
});
$('#pieModeSelect')?.addEventListener('change', updateChartMergeToggle);
$('#barDimSelect')?.addEventListener('change', updateChartMergeToggle);

// 類別選擇完成後，以該分類顏色輕染選擇框；逐項分類比照處理。
function tintItemCategoryRow(row) {
  if (!row) return;
  const cat = row.querySelector('.i-cat')?.value || '',
    c = cat ? catColor(cat) : '';
  for (const el of [row.querySelector('.i-cat'), row.querySelector('.i-sub')]) {
    if (!el) continue;
    if (c) {
      el.style.backgroundColor = colorBg(c, 0.11);
      el.style.borderColor = colorBg(c, 0.38);
    } else {
      el.style.backgroundColor = '';
      el.style.borderColor = '';
    }
  }
}
$('#itemRows')?.addEventListener('change', (e) => {
  if (e.target.matches('.i-cat,.i-sub')) tintItemCategoryRow(e.target.closest('.itemrow'));
});
const itemTintObserver = new MutationObserver((ms) => {
  ms.forEach((m) =>
    m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList?.contains('itemrow')) tintItemCategoryRow(n);
      n.querySelectorAll?.('.itemrow').forEach(tintItemCategoryRow);
    }),
  );
});
if ($('#itemRows')) itemTintObserver.observe($('#itemRows'), { childList: true });

// 情境欄與分類一致：整列可點，無額外「切換」文字。
$('#formScopeChange').textContent = '';
$('#formScopeChange').innerHTML =
  '<span class="choice-label">情境</span><span class="choice-value"><strong id="formScopeText">' +
  esc(scopeLabel(formScope || currentScope)) +
  '</strong></span><span class="choice-chevron">›</span>';
$('#formScopeChange').onclick = () => {
  formScope = formScope || { ...currentScope };
  openScopePicker('form');
};

// 每月日曆：以目前圖表情境篩選，月份獨立切換。
let chartCalendarMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
function compactMoney(n) {
  n = Math.round(+n || 0);
  const a = Math.abs(n);
  if (a >= 1000000) return (n / 1000000).toFixed(a >= 10000000 ? 0 : 1) + 'm';
  if (a >= 10000) return (n / 1000).toFixed(a >= 100000 ? 0 : 1) + 'k';
  return String(n);
}
function renderChartCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  const y = chartCalendarMonth.getFullYear(),
    m = chartCalendarMonth.getMonth(),
    days = new Date(y, m + 1, 0).getDate(),
    first = (new Date(y, m, 1).getDay() + 6) % 7,
    prefix = `${y}-${String(m + 1).padStart(2, '0')}-`,
    today = todayISO();
  $('#calendarMonthLabel').textContent = `${y} / ${String(m + 1).padStart(2, '0')}`;
  const map = {};
  records.forEach((r) => {
    if (!r.date?.startsWith(prefix) || !scopeMatch(r)) return;
    if (r.kind !== 'expense' && r.kind !== 'income') return;
    const d = +r.date.slice(8, 10),
      x = (map[d] = map[d] || { e: 0, i: 0 });
    if (r.kind === 'expense') x.e += myShareOf(r);
    else x.i += +r.total || 0;
  });
  let h = '';
  for (let i = 0; i < first; i++) h += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const date = prefix + String(d).padStart(2, '0'),
      x = map[d] || { e: 0, i: 0 },
      n = x.i - x.e,
      has = x.e || x.i;
    h += `<button type="button" class="cal-day ${has ? 'has' : ''} ${date === today ? 'today' : ''}" data-cal-date="${date}"><div class="dn">${d}</div>${has ? `<div class="cv ce">支 ${compactMoney(x.e)}</div><div class="cv ci">收 ${compactMoney(x.i)}</div><div class="cv cn">餘 ${n >= 0 ? '+' : ''}${compactMoney(n)}</div>` : ''}</button>`;
  }
  grid.innerHTML = h;
  grid.querySelectorAll('[data-cal-date]').forEach(
    (b) =>
      (b.onclick = () => {
        listQuery = '';
        if ($('#listSearch')) $('#listSearch').value = '';
        if ($('#clearSearch')) $('#clearSearch').style.display = 'none';
        if ($('#searchScopeNote')) $('#searchScopeNote').classList.remove('show');
        setListPeriod('day', b.dataset.calDate, b.dataset.calDate);
        document.querySelector('.nav button[data-view="list"]')?.click();
      }),
  );
}
$('#calendarPrev')?.addEventListener('click', () => {
  chartCalendarMonth = new Date(
    chartCalendarMonth.getFullYear(),
    chartCalendarMonth.getMonth() - 1,
    1,
  );
  renderChartCalendar();
});
$('#calendarNext')?.addEventListener('click', () => {
  chartCalendarMonth = new Date(
    chartCalendarMonth.getFullYear(),
    chartCalendarMonth.getMonth() + 1,
    1,
  );
  renderChartCalendar();
});

// 每月固定支出：只在 App 開啟時補入已到期月份；以 deterministic id 避免多裝置重複。
function recurringRules() {
  return Array.isArray(settings.recurringRules) ? settings.recurringRules : [];
}
function ensureRecurringTransactions() {
  const rules = recurringRules(),
    today = todayISO(),
    now = new Date(today + 'T00:00:00'),
    nowYM = today.slice(0, 7),
    existing = new Set(records.map((r) => r.id)),
    skipped = new Set(settings.recurringSkipped || []);
  let added = 0;
  for (const rule of rules) {
    if (!rule?.active) continue;
    const start = /^\d{4}-\d{2}$/.test(rule.startMonth || '') ? rule.startMonth : nowYM,
      end = /^\d{4}-\d{2}$/.test(rule.endMonth || '') ? rule.endMonth : '';
    let [y, m] = start.split('-').map(Number);
    m -= 1;
    let guard = 0;
    while (guard++ < 240) {
      const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (ym > nowYM || (end && ym > end)) break;
      const date = recurringOccurrenceDate(y, m, rule.day),
        id = `recurring:${rule.id}:${date}`;
      if (date <= today && !existing.has(id) && !skipped.has(rule.id + '|' + date)) {
        records = [
          ...records,
          {
            id,
            createdAt: new Date(date + 'T08:00:00').getTime(),
            updatedAt: Date.now(),
            date,
            kind: 'expense',
            scope: { type: 'daily', trip: null },
            store: rule.store || '',
            storeChain: null,
            storeBranch: null,
            payment: rule.payment || null,
            hashtags: [],
            note: rule.note || '',
            items: null,
            catMode: 'whole',
            category: rule.category || null,
            sub: rule.sub || null,
            total: +rule.amount || 0,
            split: null,
            inv: null,
            settlement: null,
            recurring: { ruleId: rule.id, occurrenceDate: date },
          },
        ];
        existing.add(id);
        added++;
      }
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  if (added) {
    save(K.rec, records);
  }
  return added;
}
let recurringEditingId = null;
function recurringSelectOptions() {
  const cat = $('#rc-category'),
    pay = $('#rc-payment');
  if (!cat || !pay) return;
  cat.innerHTML =
    '<option value="">未指定</option>' +
    catsExpense.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  pay.innerHTML =
    '<option value="">未指定</option>' +
    payments.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
}
function updateRecurringSub() {
  const c = $('#rc-category').value,
    l = c ? subcats[c] || [] : [],
    cur = $('#rc-sub').value;
  $('#rc-sub').innerHTML =
    '<option value="">未指定</option>' +
    l.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if (l.includes(cur)) $('#rc-sub').value = cur;
}
function openRecurringSheet(id = null) {
  recurringEditingId = id;
  const r = id ? recurringRules().find((x) => x.id === id) : null,
    ym = todayISO().slice(0, 7);
  recurringSelectOptions();
  $('#recurringTitle').textContent = r ? '編輯每月固定支出' : '新增每月固定支出';
  $('#rc-store').value = r?.store || '';
  $('#rc-amount').value = r?.amount || '';
  $('#rc-day').value = r?.day || 1;
  $('#rc-category').value = r?.category || '';
  updateRecurringSub();
  $('#rc-sub').value = r?.sub || '';
  $('#rc-payment').value = r?.payment || '';
  $('#rc-start').value = r?.startMonth || ym;
  $('#rc-end').value = r?.endMonth || '';
  $('#rc-note').value = r?.note || '';
  $('#rc-active').checked = r ? r.active !== false : true;
  $('#recurringDelete').style.display = r ? 'block' : 'none';
  $('#recurringBackdrop').classList.add('show');
  $('#recurringSheet').classList.add('show');
}
function closeRecurringSheet() {
  $('#recurringBackdrop').classList.remove('show');
  $('#recurringSheet').classList.remove('show');
  recurringEditingId = null;
}
function saveRecurringRule() {
  const store = $('#rc-store').value.trim(),
    amount = +$('#rc-amount').value,
    day = Math.max(1, Math.min(31, Math.floor(+$('#rc-day').value || 1))),
    start = $('#rc-start').value || todayISO().slice(0, 7),
    end = $('#rc-end').value;
  if (!store) {
    toast('請輸入店家或項目名稱');
    return;
  }
  if (!(amount > 0)) {
    toast('請輸入每月金額');
    return;
  }
  if (end && end < start) {
    toast('結束月份不能早於開始月份');
    return;
  }
  const rules = recurringRules().slice(),
    old = rules.find((x) => x.id === recurringEditingId),
    r = {
      id: recurringEditingId || uid(),
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
      store,
      amount: money2(amount),
      day,
      category: $('#rc-category').value || null,
      sub: $('#rc-sub').value || null,
      payment: $('#rc-payment').value || null,
      startMonth: start,
      endMonth: end || '',
      note: $('#rc-note').value.trim(),
      active: $('#rc-active').checked,
    };
  if (recurringEditingId) {
    const i = rules.findIndex((x) => x.id === recurringEditingId);
    rules[i] = r;
  } else rules.push(r);
  settings.recurringRules = rules;
  save(K.set, settings);
  const added = ensureRecurringTransactions();
  closeRecurringSheet();
  renderSettings();
  renderAll();
  toast(added ? `已儲存，並補入 ${added} 筆到期支出` : '已儲存固定支出');
}
function renderRecurringRules() {
  const box = $('#recurringManage');
  if (!box) return;
  const rules = recurringRules();
  box.innerHTML = rules.length
    ? rules
        .map(
          (r) =>
            `<div class="recurring-rule"><div><div class="rr-name">${esc(r.store)}</div><div class="rr-sub">每月 ${r.day} 日 · ${nf(r.amount)}${r.category ? ' · ' + esc(r.category) : ''}${r.payment ? ' · ' + esc(r.payment) : ''}</div></div><span class="rr-state ${r.active === false ? 'off' : ''}">${r.active === false ? '已停用' : '啟用中'}</span><button type="button" data-recurring-edit="${r.id}">編輯規則</button></div>`,
        )
        .join('')
    : '<div class="empty" style="padding:10px;font-size:13px">尚未設定固定支出</div>';
  box
    .querySelectorAll('[data-recurring-edit]')
    .forEach((b) => (b.onclick = () => openRecurringSheet(b.dataset.recurringEdit)));
}
$('#addRecurringRule')?.addEventListener('click', () => openRecurringSheet());
$('#recurringCancel')?.addEventListener('click', closeRecurringSheet);
$('#recurringBackdrop')?.addEventListener('click', closeRecurringSheet);
$('#recurringSave')?.addEventListener('click', saveRecurringRule);
$('#rc-category')?.addEventListener('change', updateRecurringSub);
$('#recurringDelete')?.addEventListener('click', () => {
  if (!recurringEditingId || !confirm('刪除這個固定支出規則？已經產生的舊帳會保留。')) return;
  settings.recurringRules = recurringRules().filter((x) => x.id !== recurringEditingId);
  save(K.set, settings);
  closeRecurringSheet();
  renderSettings();
  toast('已刪除固定支出規則');
});
// 初始補入到期固定支出，並同步目前顯示。
const recurringAddedOnInit = ensureRecurringTransactions();
if (recurringAddedOnInit) renderAll();
syncCompactChoiceLabels();
updateChartMergeToggle();
