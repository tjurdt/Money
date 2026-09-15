/* ===== 通用 CSV 匯入 ===== */
let csvRows = [],
  csvHeaders = [];
const CSV_FIELDS = [
  ['date', '日期'],
  ['kind', '類型'],
  ['amount', '單一金額'],
  ['expenseAmount', '支出金額'],
  ['incomeAmount', '收入金額'],
  ['store', '店家／來源'],
  ['category', '分類'],
  ['sub', '子分類'],
  ['payment', '付款方式'],
  ['note', '備註'],
  ['scope', '情境'],
];
const CSV_HINTS = {
  date: ['date', '日期', '交易日期', '消費日期', '時間'],
  kind: ['type', '類型', '收支', '交易類型'],
  amount: ['amount', '金額', '總額', '費用', 'price'],
  expenseAmount: [
    'expense_amount',
    'expenseamount',
    '支出金額',
    '支出',
    'expense',
    'debit',
    '提款',
  ],
  incomeAmount: ['income_amount', 'incomeamount', '收入金額', '收入', 'income', 'credit', '存入'],
  store: ['merchant', 'store', '店家', '商家', '商店', '項目', '名稱', '說明', 'description'],
  category: ['category', '分類', '大分類'],
  sub: ['subcategory', 'sub_category', '子分類', '小分類'],
  payment: ['payment', '付款', '付款方式', 'account', '帳戶'],
  note: ['note', 'memo', '備註', '說明'],
  scope: ['context', 'scope', '情境', '旅行', '專案', 'project', 'trip'],
};
function autoCsvHeader(field) {
  const hints = CSV_HINTS[field] || [];
  return (
    csvHeaders.find((h) =>
      hints.some((x) => String(h).trim().toLowerCase().includes(x.toLowerCase())),
    ) || ''
  );
}
function renderCsvMapper() {
  const box = $('#csvMap');
  box.innerHTML = CSV_FIELDS.map(
    ([k, l]) =>
      `<div class="field"><label>${l}${k === 'amount' || k === 'expenseAmount' || k === 'incomeAmount' ? '' : ''}</label><select data-csvmap="${k}"><option value="">${k === 'date' ? '未指定＝今天' : '不匯入'}</option>${csvHeaders.map((h) => `<option value="${esc(h)}" ${autoCsvHeader(k) === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`,
  ).join('');
  const pv = $('#csvPreview'),
    sample = csvRows.slice(0, 5);
  pv.innerHTML = sample.length
    ? `<table><thead><tr>${csvHeaders.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sample.map((r) => `<tr>${csvHeaders.map((h) => `<td>${esc(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<div class="empty" style="padding:20px">沒有可匯入資料</div>';
}
function openCsvSheet() {
  $('#csvBackdrop').classList.add('show');
  $('#csvSheet').classList.add('show');
}
function closeCsvSheet() {
  $('#csvBackdrop').classList.remove('show');
  $('#csvSheet').classList.remove('show');
  csvRows = [];
  csvHeaders = [];
}
function normCsvDate(v) {
  v = String(v || '').trim();
  if (!v) return todayISO();
  let m = v.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${new Date().getFullYear()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? todayISO()
    : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function normCsvAmount(v) {
  const n = parseFloat(String(v ?? '').replace(/[,$NT$\s]/gi, ''));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}
function csvKind(v, amountRaw) {
  const t = String(v || '').toLowerCase();
  if (/投資|investment|股票|證券/.test(t)) return null;
  if (/還款|settlement|transfer/.test(t)) return null;
  if (/收入|income|credit|入帳|存入/.test(t)) return 'income';
  if (/支出|expense|debit|消費|付款/.test(t)) return 'expense';
  return 'expense';
}
function scopeFromCsv(v) {
  const x = String(v || '').trim();
  if (!x || /日常|daily/i.test(x)) return { type: 'daily', trip: null };
  const t = trips.find((t) => t.name === x || x.includes(t.name) || t.name.includes(x));
  return t ? { type: t.kind, trip: t.id } : { type: 'daily', trip: null };
}
function csvSignature(r) {
  return [r.date, r.kind, Math.round(+r.total || 0), r.store || '', r.category || '', r.note || '']
    .join('|')
    .toLowerCase();
}
function downloadCsvTemplate(lang) {
  let head, row, name;
  if (lang === 'zh') {
    head = '日期,類型,金額,店家,分類,子分類,付款方式,備註,情境';
    row = '2026-08-12,支出,120,全家,餐食,午餐,信用卡,範例,日常';
    name = '記帳匯入範本_中文.csv';
  } else {
    head = 'date,type,amount,merchant,category,subcategory,payment,note,context';
    row = '2026-08-12,expense,120,Example Store,Food,Lunch,Credit Card,example,daily';
    name = 'ledger_import_template_en.csv';
  }
  dl(new Blob(['\uFEFF' + head + '\n' + row + '\n'], { type: 'text/csv;charset=utf-8' }), name);
}
$('#dlTemplateZh')?.addEventListener('click', () => downloadCsvTemplate('zh'));
$('#dlTemplateEn')?.addEventListener('click', () => downloadCsvTemplate('en'));
$('#importCsvBtn').onclick = () => $('#csvFile').click();
$('#csvFile').onchange = (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (!window.Papa) {
    toast('CSV 解析元件尚未載入');
    return;
  }
  Papa.parse(f, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) =>
      String(h || '')
        .replace(/^\ufeff/, '')
        .trim(),
    complete: (r) => {
      if (r.errors?.length && !(r.data || []).length) {
        toast('CSV 解析失敗');
        return;
      }
      csvRows = r.data || [];
      csvHeaders = r.meta?.fields || Object.keys(csvRows[0] || {});
      renderCsvMapper();
      openCsvSheet();
    },
    error: () => toast('CSV 讀取失敗'),
  });
  e.target.value = '';
};
$('#csvCancel').onclick = closeCsvSheet;
$('#csvBackdrop').onclick = closeCsvSheet;
$('#csvImportDo').onclick = () => {
  const mp = {};
  $$('[data-csvmap]').forEach((s) => (mp[s.dataset.csvmap] = s.value));
  if (!mp.amount && !mp.expenseAmount && !mp.incomeAmount) {
    toast('請指定「單一金額」，或至少一個「支出金額／收入金額」欄位');
    return;
  }
  const existing = new Set(records.map(csvSignature));
  let added = 0,
    skipped = 0;
  csvRows.forEach((row) => {
    let amount = 0,
      kind = 'expense',
      raw = '';
    if (mp.amount) {
      raw = row[mp.amount];
      amount = normCsvAmount(raw);
      kind = csvKind(mp.kind ? row[mp.kind] : '', raw);
    } else {
      const inc = mp.incomeAmount ? normCsvAmount(row[mp.incomeAmount]) : 0,
        exp = mp.expenseAmount ? normCsvAmount(row[mp.expenseAmount]) : 0;
      if (inc > 0) {
        amount = inc;
        kind = 'income';
        raw = row[mp.incomeAmount];
      } else {
        amount = exp;
        kind = 'expense';
        raw = mp.expenseAmount ? row[mp.expenseAmount] : '';
      }
    }
    if (!(amount > 0) || kind === null) {
      skipped++;
      return;
    }
    const cat = mp.category ? String(row[mp.category] || '').trim() : '',
      sub = mp.sub ? String(row[mp.sub] || '').trim() : '',
      pay = mp.payment ? String(row[mp.payment] || '').trim() : '',
      rec = {
        id: uid(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        date: normCsvDate(mp.date ? row[mp.date] : ''),
        kind,
        scope: scopeFromCsv(mp.scope ? row[mp.scope] : ''),
        store: mp.store ? String(row[mp.store] || '').trim() : '',
        payment: pay || null,
        hashtags: [],
        note: mp.note ? String(row[mp.note] || '').trim() : '',
        items: null,
        catMode: 'whole',
        category: cat || null,
        sub: sub || null,
        total: amount,
        split: null,
        inv: null,
        settlement: null,
      };
    const sig = csvSignature(rec);
    if (existing.has(sig)) {
      skipped++;
      return;
    }
    existing.add(sig);
    records.push(rec);
    added++;
    if (cat) {
      const list = kind === 'income' ? catsIncome : catsExpense;
      if (!list.includes(cat)) list.push(cat);
      if (!catColors[cat])
        catColors[cat] = CAT_COLORS[Object.keys(catColors).length % CAT_COLORS.length];
      if (kind === 'expense' && sub) {
        subcats[cat] = unionUnique(subcats[cat], [sub]);
      }
    }
    if (pay && !payments.includes(pay)) payments.push(pay);
  });
  save(K.rec, records);
  save(K.ce, catsExpense);
  save(K.ci, catsIncome);
  save(K.pay, payments);
  save(K.sub, subcats);
  save(K.cc, catColors);
  closeCsvSheet();
  renderAll();
  renderSettings();
  toast(`CSV 匯入 ${added} 筆${skipped ? `，略過 ${skipped} 筆` : ''}`);
};
