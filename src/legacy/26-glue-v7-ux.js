/* ===== v7.0 UX glue：只改呈現，不改資料模型 ===== */
let choiceMode = '';
function syncCompactChoiceLabels() {
  const cv = $('#catSelectValue'),
    sv = $('#subSelectValue'),
    pv = $('#paySelectValue'),
    dot = $('#catChoiceDot');
  if (cv) cv.textContent = selCat || '未選擇';
  if (sv) sv.textContent = selSub || '未選擇';
  if (pv) pv.textContent = selPay || '未選擇';
  if (dot) {
    if (selCat) {
      dot.style.background = catColor(selCat);
      dot.classList.add('show');
    } else dot.classList.remove('show');
  }

  const b = $('#catSelectBtn'),
    sb = $('#subSelectBtn');
  if (b) {
    if (selCat) {
      const c = catColor(selCat);
      b.style.background = colorBg(c, 0.12);
      b.style.borderColor = colorBg(c, 0.42);
      b.classList.add('cat-tinted');
    } else {
      b.style.background = '';
      b.style.borderColor = '';
      b.classList.remove('cat-tinted');
    }
  }
  if (sb) {
    if (selCat && selSub) {
      const c = catColor(selCat);
      sb.style.background = colorBg(c, 0.08);
      sb.style.borderColor = colorBg(c, 0.32);
    } else {
      sb.style.background = '';
      sb.style.borderColor = '';
    }
  }
}
function closeChoiceSheet() {
  $('#choiceBackdrop').classList.remove('show');
  const sh = $('#choiceSheet');
  sh.classList.remove('show', 'choice-mode-cat', 'choice-mode-sub', 'choice-mode-pay');
  choiceMode = '';
}
function chooseAndClose(mode, value) {
  if (mode === 'cat') {
    selCat = value || null;
    selSub = null;
    renderChipSelectors();
    renderSubChips();
  } else if (mode === 'sub') {
    selSub = value || null;
    renderSubChips();
  } else if (mode === 'pay') {
    selPay = value || null;
    renderChipSelectors();
  }
  syncCompactChoiceLabels();
  closeChoiceSheet();
}
function openChoiceSheet(mode) {
  choiceMode = mode;
  const body = $('#choiceSheetBody'),
    title = $('#choiceTitle'),
    sheet = $('#choiceSheet');
  let list = [],
    current = '',
    allowAdd = true;
  sheet.classList.remove('choice-mode-cat', 'choice-mode-sub', 'choice-mode-pay');
  sheet.classList.add('choice-mode-' + mode);
  if (mode === 'cat') {
    title.textContent = getKind() === 'income' ? '選擇收入分類' : '選擇分類';
    list = catOrder(getKind() === 'income' ? catsIncome : catsExpense);
    current = selCat || '';
  } else if (mode === 'sub') {
    title.textContent = '選擇子分類';
    list = selCat ? subcats[selCat] || [] : [];
    current = selSub || '';
  } else {
    title.textContent = getKind() === 'income' ? '選擇收款方式' : '選擇付款方式';
    list = payments;
    current = selPay || '';
  }
  const dot = (v) =>
    mode === 'cat' ? `<span class="dot" style="background:${catColor(v)}"></span>` : '';
  body.innerHTML =
    `<button type="button" class="choice-option full ${!current ? 'on' : ''}" data-choice="">未指定</button>` +
    list
      .map(
        (v) =>
          `<button type="button" class="choice-option ${current === v ? 'on' : ''}" data-choice="${esc(v)}">${dot(v)}<span>${esc(v)}</span></button>`,
      )
      .join('') +
    (allowAdd
      ? `<button type="button" class="choice-option add full" data-choice-add="1">＋ 新增${mode === 'pay' ? '付款方式' : mode === 'sub' ? '子分類' : '分類'}</button>`
      : '');
  body
    .querySelectorAll('[data-choice]')
    .forEach((b) => (b.onclick = () => chooseAndClose(mode, b.dataset.choice)));
  body.querySelector('[data-choice-add]')?.addEventListener('click', () => {
    if (mode === 'cat') {
      addOption('cat');
      syncCompactChoiceLabels();
      closeChoiceSheet();
    } else if (mode === 'pay') {
      addOption('pay');
      syncCompactChoiceLabels();
      closeChoiceSheet();
    } else if (selCat) {
      const v = (prompt('新增子分類到「' + selCat + '」') || '').trim();
      if (v) {
        subcats[selCat] = unionUnique(subcats[selCat], [v]);
        save(K.sub, subcats);
        selSub = v;
        renderSubChips();
        syncCompactChoiceLabels();
        closeChoiceSheet();
      }
    }
  });
  $('#choiceBackdrop').classList.add('show');
  $('#choiceSheet').classList.add('show');
}
$('#catSelectBtn')?.addEventListener('click', () => openChoiceSheet('cat'));
$('#subSelectBtn')?.addEventListener('click', () => openChoiceSheet('sub'));
$('#paySelectBtn')?.addEventListener('click', () => openChoiceSheet('pay'));
$('#choiceCancel')?.addEventListener('click', closeChoiceSheet);
$('#choiceBackdrop')?.addEventListener('click', closeChoiceSheet);

function updateEntryTotalMirror() {
  const el = $('#entryTotalMirror');
  if (el) el.textContent = nf(parseFloat($('#f-total')?.value) || 0);
}
$('#f-total')?.addEventListener('input', () => {
  updateEntryTotalMirror();
  if (
    getKind() === 'expense' &&
    !discountDraft.length &&
    discountOverrideTotal === null &&
    !draftItemsForDiscount().some((x) => x.grossPrice > 0)
  )
    discountBaseAmount = +$('#f-total').value || 0;
});

function syncEntryBlocks() {
  const k = getKind();
  $('#entryBlockClassify')?.classList.toggle('hidden', k === 'investment');
  $('#entryBlockItems')?.classList.toggle('hidden', k !== 'expense');
  $('#entryBlockInvest')?.classList.toggle('hidden', k !== 'investment');
  $('#entryTotalRow')?.classList.toggle('hidden', k === 'investment');
  const t1 = $('#entryBlock1Title'),
    t4 = $('#entryBlock4Title');
  if (t1) t1.textContent = k === 'income' ? '收入' : k === 'investment' ? '交易日期' : '消費';
  if (t4) t4.textContent = k === 'investment' ? '備註' : k === 'income' ? '收款' : '付款';
  updateEntryTotalMirror();
  syncCompactChoiceLabels();
  renderDiscountSummary();
}
// 既有 onchange 綁的是舊函式參照，因此在這裡重新綁一次，功能內容仍沿用原 updateKindUI。
$$('input[name=kind]').forEach((r) => (r.onchange = updateKindUI));
// 清單：類型改成與搜尋同列的單一選單；舊 chips 保留在 DOM 供原邏輯相容。
$('#listTypeSelect')?.addEventListener('change', (e) => {
  activeFilter = e.target.value;
  renderFilterChips();
  renderList();
});
// 初始同步一次。
syncCompactChoiceLabels();
syncEntryBlocks();
renderFilterChips();
