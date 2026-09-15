/* ===== 優惠／折扣引擎：原價與實付分離，統計仍以實付為準 ===== */
const money2 = (n) => Math.round((Math.max(0, +n || 0) + Number.EPSILON) * 100) / 100;
function normalizeDiscountRate(v) {
  let n = parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 10 && n <= 100) n /= 100;
  else if (n > 1 && n <= 10) n /= 10;
  if (n < 0 || n > 1) return null;
  return n;
}
function discountRateLabel(rate) {
  const p = Math.round((+rate || 0) * 1000) / 10;
  if (Math.abs(p % 10) < 0.001) return `${p / 10}折`;
  return `${p}折`;
}
function cloneDiscounts(x) {
  return Array.isArray(x) ? x.map((d) => ({ ...d })) : [];
}
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
function ruleEligible(rule, gross) {
  const min = Math.max(0, +rule?.minSpend || 0);
  return !min || gross + 1e-9 >= min;
}
function cappedSaving(d, rule) {
  const cap = Math.max(0, +rule?.maxSaving || 0);
  return money2(cap > 0 ? Math.min(d, cap) : d);
}
function rulePotential(rule, items, gross) {
  if (!rule || !ruleEligible(rule, gross)) return 0;
  const rate = normalizeDiscountRate(rule.rate);
  if (rule.type === 'fixed') return Math.min(gross, Math.max(0, +rule.amount || 0));
  if (rule.type === 'order_percent')
    return rate == null ? 0 : cappedSaving(gross * (1 - rate), rule);
  const it = items.find((x) => x.lineId === rule.targetLineId);
  if (!it) return 0;
  if (rule.type === 'bundle_price') {
    const n = Math.max(2, Math.floor(+rule.bundleQty || 2)),
      q = Math.max(0, +it.qty || 1),
      groups = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
      u = +it.unitPrice || 0 || (q ? it.grossPrice / q : it.grossPrice),
      d = Math.max(0, groups * (n * u - Math.max(0, +rule.bundlePrice || 0)));
    return Math.min(it.grossPrice, cappedSaving(d, rule));
  }
  if (rate == null) return 0;
  if (rule.type === 'item_percent') return cappedSaving(it.grossPrice * (1 - rate), rule);
  if (rule.type === 'nth_percent') {
    const n = Math.max(2, Math.floor(+rule.nth || 2)),
      q = Math.max(0, +it.qty || 1),
      count = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
      u = +it.unitPrice || 0 || (q ? it.grossPrice / q : it.grossPrice);
    return Math.min(it.grossPrice, cappedSaving(count * u * (1 - rate), rule));
  }
  return 0;
}
function allocateDiscount(lines, amount) {
  let left = Math.min(
    lines.reduce((s, x) => s + x.net, 0),
    Math.max(0, amount || 0),
  );
  const total = lines.reduce((s, x) => s + x.net, 0);
  if (!(left > 0) || !(total > 0)) return 0;
  let applied = 0;
  const positive = lines.filter((x) => x.net > 0);
  positive.forEach((x, i) => {
    const d =
      i === positive.length - 1
        ? Math.min(x.net, left)
        : Math.min(x.net, money2(amount * (x.net / total)));
    x.net = money2(x.net - d);
    left = money2(left - d);
    applied = money2(applied + d);
  });
  return applied;
}
function proportionalNetByLine(baseItems, gross, target) {
  const out = {};
  if (!baseItems.length) {
    out.__order__ = money2(target);
    return out;
  }
  const ratio = gross > 0 ? Math.max(0, target) / gross : 0;
  let left = money2(target);
  baseItems.forEach((x, i) => {
    const v = i === baseItems.length - 1 ? left : money2((+x.grossPrice || 0) * ratio);
    out[x.lineId] = Math.max(0, v);
    left = money2(left - v);
  });
  return out;
}
function runDiscountRules(baseItems, gross, activeRules) {
  const lines = baseItems.length
      ? baseItems.map((x) => ({ ...x, net: money2(x.grossPrice) }))
      : [
          {
            lineId: '__order__',
            name: '整單',
            grossPrice: gross,
            net: gross,
            qty: 1,
            unitPrice: gross,
          },
        ],
    priority = { bundle_price: 1, item_percent: 2, nth_percent: 3, order_percent: 4, fixed: 5 },
    savings = {};
  [...(activeRules || [])]
    .filter((r) => ruleEligible(r, gross))
    .sort(
      (a, b) =>
        (priority[a.type] || 99) - (priority[b.type] || 99) ||
        (a.createdAt || 0) - (b.createdAt || 0),
    )
    .forEach((rule) => {
      let d = 0,
        rate = normalizeDiscountRate(rule.rate);
      if (rule.type === 'bundle_price') {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          const n = Math.max(2, Math.floor(+rule.bundleQty || 2)),
            q = Math.max(0, +x.qty || 1),
            groups = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
            effUnit = q ? x.net / q : x.net,
            target = Math.max(0, +rule.bundlePrice || 0),
            raw = Math.max(0, groups * (n * effUnit - target));
          d = Math.min(x.net, cappedSaving(raw, rule));
          x.net = money2(x.net - d);
        }
      } else if (rule.type === 'item_percent' && rate != null) {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          d = cappedSaving(x.net * (1 - rate), rule);
          x.net = money2(x.net - Math.min(x.net, d));
          d = Math.min(d, x.net + d);
        }
      } else if (rule.type === 'nth_percent' && rate != null) {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          const n = Math.max(2, Math.floor(+rule.nth || 2)),
            q = Math.max(0, +x.qty || 1),
            count = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
            effUnit = q ? x.net / q : x.net;
          d = cappedSaving(Math.min(x.net, count * effUnit * (1 - rate)), rule);
          x.net = money2(x.net - d);
        }
      } else if (rule.type === 'order_percent' && rate != null) {
        const total = lines.reduce((s, x) => s + x.net, 0);
        d = allocateDiscount(lines, cappedSaving(total * (1 - rate), rule));
      } else if (rule.type === 'fixed') {
        d = allocateDiscount(lines, Math.max(0, +rule.amount || 0));
      }
      savings[rule.id] = money2(d);
    });
  const finalTotal = money2(lines.reduce((s, x) => s + x.net, 0)),
    netByLine = {};
  lines.forEach((x) => (netByLine[x.lineId] = money2(x.net)));
  return { finalTotal, netByLine, savings };
}
function bestRuleCombinations(groups) {
  const arr = [...groups.values()];
  let combos = [[]];
  for (const g of arr) {
    const opts = [null, ...g];
    const next = [];
    for (const c of combos) {
      for (const o of opts) {
        next.push(o ? [...c, o] : c.slice());
        if (next.length > 512) return null;
      }
    }
    combos = next;
  }
  return combos;
}
function calculateDiscountPlan(baseItems, baseAmount, rules, overrideTotal = null) {
  const items = (baseItems || []).map((x) => ({
      ...x,
      grossPrice: money2(x.grossPrice != null ? x.grossPrice : x.price),
    })),
    gross = items.length
      ? money2(items.reduce((s, x) => s + x.grossPrice, 0))
      : money2(baseAmount || 0),
    valid = (rules || []).filter(
      (r) =>
        r &&
        ['item_percent', 'nth_percent', 'order_percent', 'fixed', 'bundle_price'].includes(r.type),
    ),
    exclusive = valid.filter((r) => r.mode === 'best'),
    stack = valid.filter((r) => r.mode !== 'best'),
    baseline = runDiscountRules(items, gross, stack),
    groups = new Map();
  exclusive.forEach((r) => {
    const g = String(r.bestGroup || 'A').trim() || 'A';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });
  let activeBest = [],
    bestRun = baseline,
    bestFinal = baseline.finalTotal;
  const combos = bestRuleCombinations(groups);
  if (combos) {
    for (const combo of combos) {
      const q = runDiscountRules(items, gross, stack.concat(combo));
      if (q.finalTotal < bestFinal - 0.001) {
        bestFinal = q.finalTotal;
        bestRun = q;
        activeBest = combo;
      }
    }
  } else {
    for (const rs of groups.values()) {
      let chosen = null,
        chosenRun = bestRun;
      for (const r of rs) {
        const q = runDiscountRules(items, gross, stack.concat(activeBest, [r]));
        if (q.finalTotal < chosenRun.finalTotal - 0.001) {
          chosen = r;
          chosenRun = q;
        }
      }
      if (chosen) {
        activeBest.push(chosen);
        bestRun = chosenRun;
      }
    }
  }
  const active = stack.concat(activeBest),
    run = runDiscountRules(items, gross, active),
    chosenIds = activeBest.map((r) => r.id),
    candidateExtraSavings = {};
  exclusive.forEach((r) => {
    const q = runDiscountRules(items, gross, stack.concat([r]));
    candidateExtraSavings[r.id] = money2(baseline.finalTotal - q.finalTotal);
  });
  let finalTotal = run.finalTotal,
    netByLine = run.netByLine,
    overrideApplied = false,
    overrideAdjustment = 0;
  if (overrideTotal !== null && overrideTotal !== '' && Number.isFinite(+overrideTotal)) {
    const ov = Math.max(0, money2(+overrideTotal));
    if (gross <= 0 || ov <= gross + 0.001) {
      overrideApplied = true;
      overrideAdjustment = Math.round((run.finalTotal - ov) * 100) / 100;
      finalTotal = ov;
      netByLine = proportionalNetByLine(items, gross, ov);
    }
  }
  const discountTotal = money2(gross - finalTotal);
  return {
    grossTotal: gross,
    discountTotal,
    finalTotal,
    netByLine,
    savings: run.savings,
    chosenId: chosenIds[0] || null,
    chosenIds,
    candidateExtraSavings,
    overrideApplied,
    overrideAdjustment,
  };
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
function discountRuleTitle(r) {
  const items = draftItemsForDiscount(),
    it = items.find((x) => x.lineId === r.targetLineId),
    nm = it?.name || '品項';
  if (r.label) return r.label;
  if (r.type === 'item_percent') return `${nm} ${discountRateLabel(r.rate)}`;
  if (r.type === 'nth_percent') return `${nm} · 第 ${r.nth || 2} 件 ${discountRateLabel(r.rate)}`;
  if (r.type === 'bundle_price') return `${nm} · ${r.bundleQty || 2} 件 ${nf(r.bundlePrice || 0)}`;
  if (r.type === 'order_percent') return `整單 ${discountRateLabel(r.rate)}`;
  return `現折 ${nf(r.amount || 0)}`;
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
