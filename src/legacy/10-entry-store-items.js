/* ===== 店家與品項明細（漸進式 UX） ===== */
function catSelOptions(sel) {
  return (
    `<option value="">分類</option>` +
    catOrder(catsExpense)
      .map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`)
      .join('') +
    `<option value="__add__">＋新增…</option>`
  );
}
function subSelOptions(cat, sel) {
  const subs = subcats[cat] || [];
  return (
    `<option value="">子分類</option>` +
    subs.map((s) => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('') +
    (cat ? `<option value="__add__">＋新增…</option>` : '')
  );
}
function composedStore() {
  if (storeMode === 'chain') {
    const c = $('#f-chain').value.trim(),
      b = $('#f-branch').value.trim();
    return c ? (b ? `${c}・${b}` : c) : b;
  }
  return $('#f-store').value.trim();
}
const BUILTIN_CHAINS = [
  '7-ELEVEN',
  '全家',
  '全聯',
  '萊爾富',
  'OKmart',
  '家樂福',
  '星巴克',
  '路易莎',
  '麥當勞',
  '摩斯漢堡',
  '康是美',
  '屈臣氏',
];
function chainCatalog() {
  const score = new Map(),
    pin = new Set(settings.storeChains || []);
  records.forEach((r) => {
    if (r.storeChain) score.set(r.storeChain, (score.get(r.storeChain) || 0) + 1);
  });
  pin.forEach((x) => score.set(x, (score.get(x) || 0) + 1000));
  const used = [...score.keys()]
      .filter(Boolean)
      .sort((a, b) => score.get(b) - score.get(a) || a.localeCompare(b, 'zh-Hant')),
    rest = BUILTIN_CHAINS.filter((x) => !score.has(x));
  return [...used, ...rest];
}
function branchCatalog(chain) {
  const x = new Set();
  records.forEach((r) => {
    if (r.storeChain === chain && r.storeBranch) x.add(r.storeBranch);
  });
  return [...x].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}
function refreshChainSelect(keep) {
  const el = $('#f-chain');
  if (!el) return;
  const cur = (keep ?? el.value ?? '').trim(),
    all = chainCatalog(),
    fav = new Set(settings.storeChains || []),
    used = new Set(records.map((r) => r.storeChain).filter(Boolean)),
    mine = all.filter((x) => fav.has(x) || used.has(x)),
    common = all.filter((x) => !mine.includes(x));
  if (cur && !mine.includes(cur) && !common.includes(cur)) mine.unshift(cur);
  el.innerHTML =
    '<option value="">選擇連鎖店</option>' +
    (mine.length
      ? `<optgroup label="常用／曾使用">${mine.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</optgroup>`
      : '') +
    (common.length
      ? `<optgroup label="常見連鎖店">${common.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</optgroup>`
      : '');
  el.value = cur;
}
function setChainValue(v) {
  v = String(v || '').trim();
  if (v) {
    settings.storeChains = unionUnique(settings.storeChains, [v]);
    save(K.set, settings);
  }
  refreshChainSelect(v);
  refreshBranchList();
}
function refreshBranchList() {
  const c = $('#f-chain')?.value.trim() || '';
  $('#chainList').innerHTML = chainCatalog()
    .map((x) => `<option value="${esc(x)}">`)
    .join('');
  $('#branchList').innerHTML = branchCatalog(c)
    .map((x) => `<option value="${esc(x)}">`)
    .join('');
}
function setStoreMode(mode, prefill = true) {
  const target = mode === 'chain' ? 'chain' : 'single',
    singleBefore = $('#f-store').value.trim(),
    chainBefore = $('#f-chain').value.trim(),
    branchBefore = $('#f-branch').value.trim(),
    composedBefore = chainBefore
      ? branchBefore
        ? `${chainBefore}・${branchBefore}`
        : chainBefore
      : branchBefore;
  if (prefill && target === 'chain' && singleBefore) {
    const x = inferChainBranch(singleBefore);
    if (x.recognized) {
      setChainValue(x.chain);
      $('#f-chain').value = x.chain;
      $('#f-branch').value = x.branch;
    } else if (!branchBefore) {
      $('#f-branch').value = shortPlaceName(singleBefore);
    }
  }
  if (prefill && target === 'single' && composedBefore) $('#f-store').value = composedBefore;
  storeMode = target;
  $('#storeSingleWrap').classList.toggle('hide', storeMode === 'chain');
  $('#storeChainWrap').classList.toggle('show', storeMode === 'chain');
  $('#storeModeBtn').textContent = storeMode === 'chain' ? '一般店名' : '連鎖店';
  refreshChainSelect($('#f-chain')?.value || '');
  refreshBranchList();
  refreshStoreItems();
}
$('#storeModeBtn').onclick = () => setStoreMode(storeMode === 'single' ? 'chain' : 'single');
$('#f-chain').addEventListener('change', () => {
  refreshBranchList();
  refreshStoreItems();
});
$('#f-store').addEventListener('change', () => {
  const n = shortPlaceName($('#f-store').value);
  if (n && n !== $('#f-store').value) $('#f-store').value = n;
  refreshStoreItems();
});
$('#addChainQuick').onclick = () => {
  const n = (prompt('新增常用連鎖店名稱') || '').trim();
  if (!n) return;
  setChainValue(n);
  $('#f-chain').value = n;
  refreshBranchList();
  toast(`已加入「${n}」`);
};

function addItemRow(
  name = '',
  price = '',
  cat = '',
  sub = '',
  qty = 1,
  unitPrice = null,
  lineId = '',
) {
  qty = Number(qty) || 1;
  price = price === '' ? '' : +price || 0;
  const useQty = qty !== 1 || unitPrice != null,
    calcUnit = unitPrice == null ? (price !== '' ? (+price || 0) / qty : '') : +unitPrice || 0;
  const row = document.createElement('div');
  row.className = 'itemrow' + (catMode === 'perItem' ? ' per' : '') + (useQty ? ' qty' : '');
  row.dataset.lineId = lineId || uid();
  row.innerHTML = `<div class="line1"><input class="i-name" list="itemList" placeholder="品項" value="${esc(name)}"><input class="i-price" inputmode="decimal" placeholder="${useQty ? '小計' : '價格'}" value="${price !== '' ? price : ''}" ${useQty ? 'readonly' : ''}><button type="button" class="i-qty-toggle" title="只為這個品項設定數量">×數量</button><button class="i-del">✕</button></div><div class="qtyline"><input class="i-qty" type="number" inputmode="decimal" min="0" step="1" value="${qty}"><span>×</span><input class="i-unit" type="number" inputmode="decimal" min="0" step="any" placeholder="單價" value="${calcUnit !== '' ? calcUnit : ''}"><span>=</span><span class="eq i-subtotal">${price !== '' ? nf(price) : '—'}</span></div><div class="line2"><select class="i-cat">${catSelOptions(cat)}</select><select class="i-sub">${subSelOptions(cat, sub)}</select></div>`;
  const nameI = row.querySelector('.i-name'),
    priceI = row.querySelector('.i-price'),
    qtyI = row.querySelector('.i-qty'),
    unitI = row.querySelector('.i-unit'),
    catS = row.querySelector('.i-cat'),
    subS = row.querySelector('.i-sub'),
    del = row.querySelector('.i-del'),
    qtyBtn = row.querySelector('.i-qty-toggle');
  const rowUsesQty = () => row.classList.contains('qty');
  nameI.addEventListener('change', () => {
    const catalog = storeItemCatalog(composedStore()),
      hit = catalog.find((x) => x.name === nameI.value.trim());
    if (hit) {
      if (rowUsesQty() && unitI.value === '') {
        unitI.value = hit.unitPrice || hit.price || '';
        syncItemRowTotal(row);
      } else if (!rowUsesQty() && priceI.value === '') {
        priceI.value = hit.price;
        recomputeTotal();
      }
    }
  });
  priceI.addEventListener('input', recomputeTotal);
  qtyI.addEventListener('input', () => {
    syncItemRowTotal(row);
    recomputeTotal();
  });
  unitI.addEventListener('input', () => {
    syncItemRowTotal(row);
    recomputeTotal();
  });
  qtyBtn.onclick = () => {
    const on = !rowUsesQty();
    row.classList.toggle('qty', on);
    priceI.readOnly = on;
    priceI.placeholder = on ? '小計' : '價格';
    if (on) {
      if (!qtyI.value) qtyI.value = '1';
      if (!unitI.value && priceI.value)
        unitI.value = String((+priceI.value || 0) / (+qtyI.value || 1));
      syncItemRowTotal(row);
    } else {
      const subtotal = +priceI.value || 0;
      qtyI.value = '1';
      unitI.value = '';
      priceI.value = subtotal || '';
    }
    recomputeTotal();
  };
  catS.addEventListener('change', () => {
    if (catS.value === '__add__') {
      const v = (prompt('新增分類名稱') || '').trim();
      if (v && !catsExpense.includes(v)) {
        catsExpense = [...catsExpense, v];
        save(K.ce, catsExpense);
      }
      refreshItemCatSelects();
      catS.value = v || '';
    }
    subS.innerHTML = subSelOptions(catS.value, '');
  });
  subS.addEventListener('change', () => {
    if (subS.value === '__add__') {
      const c = catS.value;
      if (!c) {
        toast('請先選分類');
        subS.value = '';
        return;
      }
      const v = (prompt('新增子分類到「' + c + '」') || '').trim();
      if (v) {
        (subcats[c] = subcats[c] || []).push(v);
        save(K.sub, subcats);
      }
      subS.innerHTML = subSelOptions(c, v || '');
    }
  });
  del.onclick = () => {
    const lid = row.dataset.lineId;
    row.remove();
    discountDraft = discountDraft.filter((d) => d.targetLineId !== lid);
    recomputeTotal();
    renderDiscountList();
  };
  $('#itemRows').appendChild(row);
  if (useQty) syncItemRowTotal(row);
}
function syncItemRowTotal(row) {
  if (!row || !row.classList.contains('qty')) return;
  const q = Math.max(0, +row.querySelector('.i-qty').value || 0),
    u = Math.max(0, +row.querySelector('.i-unit').value || 0),
    t = q * u;
  row.querySelector('.i-price').value =
    q && u ? String(Math.round((t + Number.EPSILON) * 100) / 100) : '';
  row.querySelector('.i-subtotal').textContent = q && u ? nf(t) : '—';
}
function recomputeTotal() {
  let t = 0;
  $('#itemRows')
    .querySelectorAll('.itemrow')
    .forEach((row) => {
      if (row.classList.contains('qty')) syncItemRowTotal(row);
      t += parseFloat(row.querySelector('.i-price').value) || 0;
    });
  $('#itemTotal').textContent = nf(t);
  if (itemDetailOpen && getKind() === 'expense' && t > 0) {
    discountBaseAmount = t;
    const plan = currentDiscountPlan(t);
    $('#f-total').value = plan.finalTotal;
  } else if (getKind() === 'expense' && (discountDraft.length || discountOverrideTotal !== null)) {
    const plan = currentDiscountPlan(discountBaseAmount || +$('#f-total').value || 0);
    $('#f-total').value = plan.finalTotal;
  } else if (getKind() === 'expense' && $('#f-total').readOnly && discountBaseAmount > 0) {
    $('#f-total').value = money2(discountBaseAmount);
  }
  if (typeof updateEntryTotalMirror === 'function') updateEntryTotalMirror();
  renderDiscountSummary();
  updateSplitPreview();
  return t;
}
function collectItems() {
  const arr = [];
  $('#itemRows')
    .querySelectorAll('.itemrow')
    .forEach((r) => {
      const name = r.querySelector('.i-name').value.trim(),
        price = parseFloat(r.querySelector('.i-price').value) || 0,
        cat = r.querySelector('.i-cat').value,
        sub = r.querySelector('.i-sub').value,
        isQty = r.classList.contains('qty'),
        qty = isQty ? Math.max(0, +r.querySelector('.i-qty').value || 1) : 1,
        unitPrice = isQty ? Math.max(0, +r.querySelector('.i-unit').value || 0) : 0;
      if ((name || price) && cat !== '__add__')
        arr.push({
          lineId: r.dataset.lineId || uid(),
          name,
          price,
          grossPrice: price,
          qty: qty || 1,
          unitPrice: isQty ? unitPrice || price / (qty || 1) : null,
          category: cat || null,
          sub: sub && sub !== '__add__' ? sub : null,
        });
    });
  return arr;
}
$('#addItemBtn').onclick = () => addItemRow();
