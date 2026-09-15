/* ===== 清單 ===== */
function renderFilterChips() {
  const base = [
    ['all', '全部'],
    ['expense', '支出'],
    ['income', '收入'],
    ['split', '分帳'],
    ['settlement', '還款'],
  ];
  const h = base
    .map(
      ([v, l]) =>
        `<button class="chip ${activeFilter === v ? 'on' : ''}" data-f="${v}">${l}</button>`,
    )
    .join('');
  const c = $('#filterChips');
  c.innerHTML = h;
  c.querySelectorAll('.chip').forEach(
    (ch) =>
      (ch.onclick = () => {
        activeFilter = ch.dataset.f;
        renderFilterChips();
        renderList();
      }),
  );
  const cats = [...new Set([...catsExpense, ...catsIncome])];
  $('#listCatFilter').innerHTML =
    '<option value="">所有分類</option>' +
    cats
      .map(
        (x) =>
          `<option value="${esc(x)}" ${listCatFilter === x ? 'selected' : ''}>${esc(x)}</option>`,
      )
      .join('');
  $('#listPayFilter').innerHTML =
    '<option value="">所有付款方式</option>' +
    payments
      .map(
        (x) =>
          `<option value="${esc(x)}" ${listPayFilter === x ? 'selected' : ''}>${esc(x)}</option>`,
      )
      .join('');
}
function passFilter(r) {
  const f = activeFilter;
  if (f === 'expense' && r.kind !== 'expense') return false;
  if (f === 'income' && r.kind !== 'income') return false;
  if (f === 'investpnl' && !r.investmentDerived) return false;
  if (f === 'split' && !r.split) return false;
  if (f === 'settlement' && r.kind !== 'settlement') return false;
  if (listCatFilter && !recordCategories(r).includes(listCatFilter)) return false;
  if (listPayFilter && r.payment !== listPayFilter) return false;
  if (listQuery) {
    const q = listQuery.toLowerCase(),
      hay = [r.store, r.storeChain, r.storeBranch, ...(r.items || []).map((i) => i.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
$('#listSearch').addEventListener('input', (e) => {
  listQuery = e.target.value.trim();
  $('#clearSearch').style.display = listQuery ? 'block' : 'none';
  $('#searchScopeNote').classList.toggle('show', !!listQuery);
  renderList();
});
$('#clearSearch').onclick = () => {
  $('#listSearch').value = '';
  listQuery = '';
  $('#clearSearch').style.display = 'none';
  $('#searchScopeNote').classList.remove('show');
  renderList();
};
$('#listFilterBtn').onclick = () => {
  const p = $('#listFilterPanel'),
    on = !p.classList.contains('show');
  p.classList.toggle('show', on);
  $('#listFilterBtn').classList.toggle('on', on || !!listCatFilter || !!listPayFilter);
};
$('#listCatFilter').onchange = (e) => {
  listCatFilter = e.target.value;
  $('#listFilterBtn').classList.toggle(
    'on',
    !!listCatFilter || !!listPayFilter || $('#listFilterPanel').classList.contains('show'),
  );
  renderList();
};
$('#listPayFilter').onchange = (e) => {
  listPayFilter = e.target.value;
  $('#listFilterBtn').classList.toggle(
    'on',
    !!listCatFilter || !!listPayFilter || $('#listFilterPanel').classList.contains('show'),
  );
  renderList();
};
function derivedInvestmentEvents() {
  const h = {},
    out = [];
  records
    .filter((r) => r.kind === 'investment')
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .forEach((t) => {
      const q = t.inv || {},
        key = q.ticker || q.symbol || '—',
        x = (h[key] = h[key] || { shares: 0, cost: 0 }),
        sh = +q.shares || 0,
        pr = +q.unitPrice || 0,
        fee = +q.fee || 0,
        sym = q.symbol || q.ticker || '投資';
      if (q.action === 'buy') {
        x.shares += sh;
        x.cost += sh * pr + fee;
      } else if (q.action === 'sell') {
        const avg = x.shares > 0 ? x.cost / x.shares : 0,
          gain = money2(sh * pr - fee - avg * sh),
          kind = gain >= 0 ? 'income' : 'expense';
        if (Math.abs(gain) >= 0.01)
          out.push({
            id: t.id,
            sourceInvestmentId: t.id,
            investmentDerived: true,
            date: t.date,
            createdAt: t.createdAt + 0.1,
            kind,
            scope: { type: 'daily', trip: null },
            store: `${sym} · 已實現${gain >= 0 ? '獲利' : '虧損'}`,
            category: '投資損益',
            sub: gain >= 0 ? '已實現獲利' : '已實現虧損',
            payment: null,
            note: `賣出 ${sh.toLocaleString()} 股 · 成交 ${pr} · 費稅 ${fee}`,
            items: null,
            catMode: 'whole',
            total: Math.abs(gain),
            split: null,
            invEvent: { type: 'realized', gain },
          });
        x.cost -= avg * sh;
        x.shares -= sh;
        if (x.shares < 1e-6) {
          x.shares = 0;
          x.cost = 0;
        }
      } else if (q.action === 'dividend') {
        const amt = +t.total || 0;
        if (amt > 0)
          out.push({
            id: t.id,
            sourceInvestmentId: t.id,
            investmentDerived: true,
            date: t.date,
            createdAt: t.createdAt + 0.1,
            kind: 'income',
            scope: { type: 'daily', trip: null },
            store: `${sym} · 股利收入`,
            category: '投資損益',
            sub: '股利',
            payment: null,
            note: '股票股利／現金股利紀錄',
            items: null,
            catMode: 'whole',
            total: amt,
            split: null,
            invEvent: { type: 'dividend', gain: amt },
          });
      }
    });
  return out;
}
const daySignedNet = (r) =>
  r.investmentDerived
    ? 0
    : r.kind === 'income'
      ? r.total
      : r.kind === 'expense'
        ? -myShareOf(r)
        : 0;
function itemsPreview(r) {
  if (!r.items || !r.items.length) return '';
  const n = r.items
    .filter((i) => i.name)
    .map((i) => i.name + ((+i.qty || 1) > 1 ? ` ×${i.qty}` : ''));
  return n.length ? n.slice(0, 3).join('、') + (n.length > 3 ? ` +${n.length - 3}` : '') : '';
}
function splitBalance(r) {
  if (!r.split) return 0;
  return r.split.payer === 'me' ? r.total - myShareOf(r) : -myShareOf(r);
}
function renderList() {
  const invEvents = derivedInvestmentEvents().filter((r) =>
      listQuery ? true : inCurrentScope(r) && inListPeriod(r.date),
    ),
    baseList = listQuery ? globalSearchRecords() : viewRecords(),
    list = baseList
      .concat(invEvents)
      .filter(passFilter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const box = $('#recordList');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big">🧾</div>這裡還沒有帳目<br>點右下角 ＋ 開始記帳</div>`;
    return;
  }
  const g = {};
  list.forEach((r) => (g[r.date] = g[r.date] || []).push(r));
  let html = '';
  Object.keys(g)
    .sort((a, b) => b.localeCompare(a))
    .forEach((date) => {
      const recs = g[date],
        daySum = recs.reduce((s, r) => s + daySignedNet(r), 0),
        d = new Date(date),
        wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      const dlabel =
        listQuery || listPeriod.mode !== 'month'
          ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
          : `${d.getMonth() + 1}/${d.getDate()}`;
      html += `<div class="daygroup"><div class="dayhdr"><span>${dlabel}（${wd}）</span><span class="dsum">${daySum >= 0 ? '+' : ''}${nf(daySum)}</span></div>`;
      recs.forEach((r) => {
        if (r.kind === 'settlement') {
          const q = r.settlement || {},
            recv = q.direction === 'received',
            who = q.partner || '（未填對象）';
          html += `<div class="rec settlement" data-repay-id="${r.id}"><div class="body"><div class="top"><span class="store">${recv ? '收到還款' : '已還款'} · ${esc(who)}</span><span class="amt">${nf(r.total || 0)}</span></div>${r.note ? `<div class="item">${esc(r.note)}</div>` : ''}<div class="meta"><span class="tag ${recv ? 'recv' : 'pay'}">${recv ? '對方還我' : '我還對方'}</span></div></div></div>`;
          return;
        }
        const bal = splitBalance(r);
        const cls = r.investmentDerived
          ? 'inv-derived ' + (r.kind === 'income' ? 'income' : '')
          : r.kind === 'income'
            ? 'income'
            : '';
        const pos = r.kind === 'income';
        const shownAmt = r.kind === 'expense' ? myShareOf(r) : r.total;
        const normalCat = r.kind === 'expense' && r.catMode !== 'perItem' ? r.category : null;
        const recStyle = normalCat ? ` style="border-left-color:${catColor(normalCat)}"` : '';
        let splitTags = '';
        if (r.split) {
          splitTags += `<span class="tag">我的負擔 ${nf(myShareOf(r))}</span>`;
          if (!r.split.settled && Math.round(bal) !== 0)
            splitTags +=
              bal > 0
                ? `<span class="tag recv">${esc(r.split.partner || '對方')}此筆應補 ${nf(bal)}</span>`
                : `<span class="tag pay">此筆應補${esc(r.split.partner || '對方')} ${nf(-bal)}</span>`;
          if (r.split.settled) splitTags += `<span class="tag">已結清</span>`;
        }
        const scopeTag =
          listQuery ||
          currentScope.type === 'all' ||
          (currentScope.type === 'daily' && r.scope && r.scope.type !== 'daily')
            ? `<span class="tag scope">${esc(scopeLabel(r.scope))}</span>`
            : '';
        const catTag =
          r.kind === 'income'
            ? r.category
              ? `<span class="tag cat" style="color:${catColor(r.category)};background:${colorBg(catColor(r.category))}">${esc(r.category)}</span>`
              : ''
            : r.catMode === 'perItem'
              ? `<span class="tag cat">逐項</span>`
              : r.category
                ? `<span class="tag cat" style="color:${catColor(r.category)};background:${colorBg(catColor(r.category))}">${esc(r.category)}${r.sub ? '·' + esc(r.sub) : ''}</span>`
                : '';
        const sub = r.kind === 'expense' ? itemsPreview(r) : '';
        html += `<div class="rec ${cls}"${recStyle} data-id="${r.id}"><div class="body">
        <div class="top"><span class="store">${esc(r.store || (r.kind === 'income' ? '（收入）' : '（未填店家）'))}</span><span class="amt ${pos ? 'pos' : ''}">${pos ? '+' : ''}${nf(shownAmt)}</span></div>
        ${r.kind === 'expense' && r.split && Math.abs(r.total - shownAmt) > 0.5 ? `<div class="secondary">本筆總額 ${nf(r.total)} · ${r.split.payer === 'me' ? '我先付款' : '對方先付款'}</div>` : ''}
        ${sub ? `<div class="item">${esc(sub)}</div>` : ''}
        <div class="meta">${r.investmentDerived ? `<span class="tag invtag">${r.invEvent?.type === 'dividend' ? '投資股利' : '投資損益'} · 不列生活收支</span>` : ''}${r.recurring ? `<span class="tag scope">↻ 每月固定</span>` : ''}${catTag}${r.payment ? `<span class="tag">${esc(r.payment)}</span>` : ''}${r.kind === 'expense' && (+r.discountTotal || 0) > 0 ? `<span class="tag">優惠 −${nf(r.discountTotal)}</span>` : ''}${splitTags}${scopeTag}</div>
      </div></div>`;
      });
      html += '</div>';
    });
  box.innerHTML = html;
  box
    .querySelectorAll('.rec[data-id]')
    .forEach((el) => (el.onclick = () => openSheet(el.dataset.id)));
  box
    .querySelectorAll('[data-repay-id]')
    .forEach((el) => (el.onclick = () => openRepaySheet(el.dataset.repayId)));
}
function renderSummary() {
  const rs = viewRecords();
  const income = rs.filter((r) => r.kind === 'income').reduce((s, r) => s + r.total, 0);
  const expense = rs.filter((r) => r.kind === 'expense').reduce((s, r) => s + myShareOf(r), 0);
  $('#sumIncome').textContent = nf(income);
  $('#sumExpense').textContent = nf(expense);
  $('#sumNet').textContent = (income - expense >= 0 ? '+' : '−') + nf(Math.abs(income - expense));
}
