/* ===== 優惠／折扣引擎：原價與實付分離，統計仍以實付為準 ===== */
function draftItemsForDiscount() {
  const a = [];
  $('#itemRows')
    .querySelectorAll('.itemrow')
    .forEach((r) => {
      if (r.classList.contains('qty')) syncItemRowTotal(r);
      const gross = +r.querySelector('.i-price').value || 0,
        qty = r.classList.contains('qty') ? Math.max(1, +r.querySelector('.i-qty').value || 1) : 1,
        unit = r.classList.contains('qty')
          ? Math.max(0, +r.querySelector('.i-unit').value || 0)
          : qty
            ? gross / qty
            : gross;
      if (gross > 0 || r.querySelector('.i-name').value.trim())
        a.push({
          lineId: r.dataset.lineId || '',
          name: r.querySelector('.i-name').value.trim() || '未命名品項',
          grossPrice: money2(gross),
          qty,
          unitPrice: unit || gross / qty,
        });
    });
  return a;
}
function currentDiscountPlan(baseOverride = null) {
  const items = draftItemsForDiscount(),
    sum = money2(items.reduce((s, x) => s + x.grossPrice, 0)),
    base =
      sum > 0
        ? sum
        : money2(
            baseOverride != null ? baseOverride : discountBaseAmount || +$('#f-total').value || 0,
          );
  return calculateDiscountPlan(items, base, discountDraft, discountOverrideTotal);
}
function renderDiscountSummary() {
  const box = $('#discountSummary'),
    txt = $('#discountSummaryText'),
    itl = $('#itemTotalLabel');
  if (itl)
    itl.textContent =
      discountDraft.length || discountOverrideTotal !== null ? '品項原價' : '品項加總';
  if (!box || !txt) return;
  if (getKind() !== 'expense' || (!discountDraft.length && discountOverrideTotal === null)) {
    box.classList.remove('show');
    syncDiscountAmountLock();
    return;
  }
  const p = currentDiscountPlan();
  txt.innerHTML = `<b>${discountDraft.length ? `優惠 ${discountDraft.length} 項` : '實付校正'}</b>${p.overrideApplied && discountDraft.length ? ' · <span class="dr-badge override">實付校正</span>' : ''} · 原價 ${nf(p.grossTotal)} · <span>省 ${nf(Math.max(0, p.discountTotal))}</span> · 實付 <b>${nf(p.finalTotal)}</b>`;
  box.classList.add('show');
  syncDiscountAmountLock();
}
function syncDiscountAmountLock() {
  const lock = $('#discountAmountLock'),
    inp = $('#f-total'),
    hasItems = draftItemsForDiscount().some((x) => x.grossPrice > 0),
    locked =
      getKind() === 'expense' &&
      (discountDraft.length > 0 || discountOverrideTotal !== null) &&
      !hasItems;
  if (lock) lock.classList.toggle('show', locked);
  if (inp) inp.readOnly = locked;
  const lbl = $('#amountLabel');
  if (lbl && getKind() === 'expense')
    lbl.textContent = locked ? '優惠後金額 (NT$)' : '支出金額 (NT$)';
}
function discountItemOptions(selected = '') {
  const items = draftItemsForDiscount();
  return (
    '<option value="">選擇品項</option>' +
    items
      .map(
        (x, i) =>
          `<option value="${esc(x.lineId)}" ${x.lineId === selected ? 'selected' : ''}>${i + 1}. ${esc(x.name)} · ${nf(x.grossPrice)}${x.qty > 1 ? ` · ${x.qty}件` : ''}</option>`,
      )
      .join('')
  );
}
function renderDiscountList() {
  const list = $('#discountList');
  if (!list) return;
  const p = currentDiscountPlan();
  if (!discountDraft.length)
    list.innerHTML =
      '<div class="discount-empty">尚未設定優惠規則。常見促銷可用規則描述；太複雜時直接填下方「實際結帳金額」即可。</div>';
  else
    list.innerHTML = discountDraft
      .map((r) => {
        const save = p.savings[r.id] || 0,
          isBest = r.mode === 'best',
          chosen = (p.chosenIds || []).includes(r.id),
          potential = isBest && !chosen ? p.candidateExtraSavings?.[r.id] || 0 : save,
          badge = isBest
            ? chosen
              ? `<span class="dr-badge best">${esc(r.bestGroup || 'A')}組最優惠</span>`
              : `<span class="dr-badge off">${esc(r.bestGroup || 'A')}組未套用</span>`
            : '<span class="dr-badge">可疊加</span>',
          conds = [
            r.minSpend > 0 ? `滿 ${nf(r.minSpend)}` : '',
            r.maxSaving > 0 ? `最多折 ${nf(r.maxSaving)}` : '',
          ]
            .filter(Boolean)
            .join(' · ');
        return `<div class="discount-rule"><div><div class="dr-title">${esc(discountRuleTitle(r))}${badge}</div><div class="dr-sub">${potential > 0 ? (isBest && !chosen ? `若套用可省 ${nf(potential)}` : `本次省 ${nf(potential)}`) : '目前條件尚未產生折扣'}${conds ? ' · ' + esc(conds) : ''}</div></div><div class="dr-actions"><button type="button" data-dedit="${esc(r.id)}">編輯</button><button type="button" class="danger" data-ddel="${esc(r.id)}">刪除</button></div></div>`;
      })
      .join('');
  list
    .querySelectorAll('[data-dedit]')
    .forEach((b) => (b.onclick = () => openDiscountEditor(b.dataset.dedit)));
  list.querySelectorAll('[data-ddel]').forEach(
    (b) =>
      (b.onclick = () => {
        discountDraft = discountDraft.filter((r) => r.id !== b.dataset.ddel);
        renderDiscountList();
        recomputeTotal();
        updateDiscountPreview();
      }),
  );
  updateDiscountPreview();
}
function updateDiscountPreview() {
  const el = $('#discountPreview');
  if (!el) return;
  const p = currentDiscountPlan(),
    groups = new Set(discountDraft.filter((r) => r.mode === 'best').map((r) => r.bestGroup || 'A'))
      .size;
  let extra = '';
  if (p.overrideApplied)
    extra = `<br><span class="saving">已以實際結帳金額校正${p.overrideAdjustment ? `（與規則計算差 ${p.overrideAdjustment > 0 ? '−' : '+'}${nf(Math.abs(p.overrideAdjustment))}）` : ''}</span>`;
  else if (groups) extra = ` · ${groups} 個擇優群組各自取最省方案`;
  el.innerHTML = `原價 <strong>${nf(p.grossTotal)}</strong>　<span class="saving">優惠 −${nf(Math.max(0, p.discountTotal))}</span><br>預估實付 <strong>${nf(p.finalTotal)}</strong>${extra}`;
}
function syncDiscountEditorFields() {
  const t = discountEditorType,
    itemType = ['item_percent', 'nth_percent', 'bundle_price'].includes(t),
    needsRate = !['fixed', 'bundle_price'].includes(t);
  $('#discountTargetField').style.display = itemType ? 'block' : 'none';
  $('#discountRateField').style.display = needsRate ? 'block' : 'none';
  $('#discountNthField').style.display = t === 'nth_percent' ? 'block' : 'none';
  $('#discountBundleField').style.display = t === 'bundle_price' ? 'block' : 'none';
  $('#discountFixedField').style.display = t === 'fixed' ? 'block' : 'none';
  $('#discountBestGroupField').style.display = discountEditorMode === 'best' ? 'block' : 'none';
  $('#discountTypeGrid')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.dtype === t));
  $('#discountModeSeg')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.mode === discountEditorMode));

  refreshDiscountEditorFeedback();
}
function openDiscountEditor(id = null) {
  discountEditingRuleId = id;
  const r = id ? discountDraft.find((x) => x.id === id) : null;
  discountEditorType = r?.type || 'order_percent';
  discountEditorMode = r?.mode || 'stack';
  $('#discountTarget').innerHTML = discountItemOptions(r?.targetLineId || '');
  $('#discountRate').value = r?.rate != null ? Math.round(r.rate * 1000) / 10 : '8';
  $('#discountNth').value = r?.nth || 2;
  $('#discountRepeat').checked = r?.repeat !== false;
  $('#discountBundleQty').value = r?.bundleQty || 2;
  $('#discountBundlePrice').value = r?.bundlePrice || '';
  $('#discountBundleRepeat').checked = r?.repeat !== false;
  $('#discountFixed').value = r?.amount || '';
  $('#discountLabel').value = r?.label || '';
  $('#discountMinSpend').value = r?.minSpend || '';
  $('#discountMaxSaving').value = r?.maxSaving || '';
  $('#discountBestGroup').value = r?.bestGroup || 'A';
  $('#discountRuleSave').textContent = id ? '更新規則' : '加入規則';
  $('#discountEditor').classList.add('show');
  syncDiscountEditorFields();
  setTimeout(() => {
    if (discountEditorType === 'fixed') $('#discountFixed').focus();
    else if (discountEditorType === 'bundle_price') $('#discountBundlePrice').focus();
    else $('#discountRate').focus();
  }, 80);
}
function closeDiscountEditor() {
  discountEditingRuleId = null;
  $('#discountEditor').classList.remove('show');
}
function openDiscountSheet() {
  if (getKind() !== 'expense') return;
  const items = draftItemsForDiscount(),
    hasItems = items.some((x) => x.grossPrice > 0);
  if (!hasItems && !(discountBaseAmount > 0)) discountBaseAmount = +$('#f-total').value || 0;
  $('#discountBaseWrap').classList.toggle('show', !hasItems);
  $('#discountBaseAmount').value = !hasItems ? discountBaseAmount || '' : '';
  $('#discountOverrideTotal').value = discountOverrideTotal === null ? '' : discountOverrideTotal;
  $('#discountOverrideDetails').open = discountOverrideTotal !== null || discountDraft.length === 0;
  closeDiscountEditor();
  renderDiscountList();
  $('#discountBackdrop').classList.add('show');
  $('#discountSheet').classList.add('show');
}
function closeDiscountSheet() {
  $('#discountBackdrop').classList.remove('show');
  $('#discountSheet').classList.remove('show');
  closeDiscountEditor();
  recomputeTotal();
}
$('#discountBtn').onclick = openDiscountSheet;
$('#discountSummaryEdit').onclick = openDiscountSheet;
$('#discountCancel').onclick = closeDiscountSheet;
$('#discountDone').onclick = closeDiscountSheet;
$('#discountBackdrop').onclick = closeDiscountSheet;
$('#discountAddBtn').onclick = () => openDiscountEditor();
$('#discountEditorCancel').onclick = closeDiscountEditor;
$('#discountTypeGrid')
  .querySelectorAll('button')
  .forEach(
    (b) =>
      (b.onclick = () => {
        discountEditorType = b.dataset.dtype;
        if (
          ['item_percent', 'nth_percent', 'bundle_price'].includes(discountEditorType) &&
          !draftItemsForDiscount().length
        ) {
          toast('這種優惠需要先新增品項明細');
          discountEditorType = 'order_percent';
        }
        syncDiscountEditorFields();
      }),
  );
$('#discountModeSeg')
  .querySelectorAll('button')
  .forEach(
    (b) =>
      (b.onclick = () => {
        discountEditorMode = b.dataset.mode;
        syncDiscountEditorFields();
      }),
  );
