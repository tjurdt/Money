/* ===== 品項批次輸入：一行一項、逗點分欄 ===== */
function parseBulkItemLine(line, index) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const parts = raw.split(/[,，]/).map((x) => x.trim());
  if (parts.length < 2) return { error: `第 ${index + 1} 行缺少價格`, raw };
  const name = parts[0],
    amountSpec = (parts[1] || '').replace(/\s+/g, '');
  if (!name) return { error: `第 ${index + 1} 行缺少品項名稱`, raw };
  let qty = 1,
    unitPrice = null,
    total = 0,
    m = amountSpec.match(/^(\d+(?:\.\d+)?)[xX×*](\d+(?:\.\d+)?)$/);
  if (m) {
    unitPrice = +m[1];
    qty = +m[2];
    total = unitPrice * qty;
  } else if (/^\d+(?:\.\d+)?$/.test(amountSpec)) {
    total = +amountSpec;
  } else return { error: `第 ${index + 1} 行價格格式無法辨識`, raw };
  if (!(total > 0) || !(qty > 0)) return { error: `第 ${index + 1} 行價格或數量需大於 0`, raw };
  return {
    name,
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    qty,
    unitPrice,
    category: parts[2] || '',
    sub: parts[3] || '',
  };
}
function parseBulkItems(text) {
  const rows = String(text || '').split(/\r?\n/),
    items = [],
    errors = [];
  rows.forEach((line, i) => {
    const x = parseBulkItemLine(line, i);
    if (!x) return;
    if (x.error) errors.push(x.error);
    else items.push(x);
  });
  return { items, errors };
}
function updateBulkItemPreview() {
  const p = parseBulkItems($('#bulkItemText').value),
    sum = p.items.reduce((s, x) => s + x.total, 0),
    el = $('#bulkItemPreview');
  if (!p.items.length && !p.errors.length) {
    el.className = 'bulk-preview';
    el.textContent = '尚未輸入品項。';
    return;
  }
  el.className = 'bulk-preview ' + (p.errors.length ? 'warn' : 'ok');
  el.textContent =
    `可加入 ${p.items.length} 項，共 ${nf(sum)}` +
    (p.errors.length ? ` · ${p.errors.slice(0, 2).join('；')}` : ' · 格式正常');
}
function openBulkItemSheet() {
  $('#bulkItemText').value = '';
  updateBulkItemPreview();
  $('#bulkItemBackdrop').classList.add('show');
  $('#bulkItemSheet').classList.add('show');
}
function closeBulkItemSheet() {
  $('#bulkItemBackdrop').classList.remove('show');
  $('#bulkItemSheet').classList.remove('show');
}
$('#bulkItemBtn').onclick = openBulkItemSheet;
$('#bulkItemCancel').onclick = closeBulkItemSheet;
$('#bulkItemBackdrop').onclick = closeBulkItemSheet;
$('#bulkItemText').addEventListener('input', updateBulkItemPreview);
$('#bulkItemApply').onclick = () => {
  const p = parseBulkItems($('#bulkItemText').value);
  if (!p.items.length) {
    toast(p.errors[0] || '請先輸入品項');
    return;
  }
  const hasCat = p.items.some((x) => x.category);
  if (hasCat) {
    p.items.forEach((x) => {
      if (x.category && !catsExpense.includes(x.category)) {
        catsExpense = [...catsExpense, x.category];
        if (!catColors[x.category])
          catColors[x.category] = CAT_COLORS[Object.keys(catColors).length % CAT_COLORS.length];
      }
      if (x.category && x.sub) {
        subcats[x.category] = unionUnique(subcats[x.category], [x.sub]);
      }
    });
    save(K.ce, catsExpense);
    save(K.sub, subcats);
    save(K.cc, catColors);
    catMode = 'perItem';
    setCatMode('perItem');
  }
  p.items.forEach((x) => addItemRow(x.name, x.total, x.category, x.sub, x.qty, x.unitPrice));
  setItemDetailOpen(true);
  recomputeTotal();
  closeBulkItemSheet();
  toast(
    `已加入 ${p.items.length} 個品項${p.errors.length ? '；另有 ' + p.errors.length + ' 行未匯入' : ''}`,
  );
};
