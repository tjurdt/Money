/* ===== 行程結算卡：以台幣為主，點開可看各幣別與各匯率 ===== */
// 資料全由 summarizeTripFx() 算出（src/domain/fx.js），這裡只負責畫。
// 展開狀態放在 fxCardOpen（03-core-state.js），重繪後才不會自己收起來。

function fxCardTrip() {
  if (!currentScope || !currentScope.trip) return null;
  const t = tripById(currentScope.trip);
  if (!t) return null;
  const hasFxRecords = records.some((r) => r.scope && r.scope.trip === t.id && hasFx(r));
  return tripCurrencies(t).length || hasFxRecords ? t : null;
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function fxRowHtml(key, name, main, sub, share) {
  const open = fxCardOpen.has(key);
  return (
    `<div class="fx-row" data-fxkey="${esc(key)}"><div class="nm">${name}</div><div class="nt">${main}</div>` +
    `<div class="sb">${sub}</div><div class="fx-bar"><i style="width:${share}%"></i></div></div>` +
    `<div class="fx-detail ${open ? 'show' : ''}" data-fxdetail="${esc(key)}">`
  );
}

function fxBatchLines(c, balances) {
  const lines = c.batches.map(
    (b) =>
      `<div><span>${esc(b.label)}（${b.count} 筆）</span><span>${formatMoney(c.code, b.foreign)} ≈ ${nf(b.twd)}</span></div>`,
  );
  balances
    .filter((b) => b.code === c.code)
    .forEach((b) => {
      const note = b.remaining < 0 ? '不足' : '剩';
      lines.push(
        `<div class="bal"><span>└ ${esc(b.label)}：換 ${formatMoney(c.code, b.foreign)} 花 ${nf(b.twdCost)}</span><span>${note} ${formatMoney(c.code, Math.abs(b.remaining))}</span></div>`,
      );
    });
  return lines.join('');
}

function fxCurrencyBlock(c, s) {
  const sub = `${c.count} 筆 · 平均匯率 ${formatRate(c.avgRate)} · 佔 ${pct(c.twd, s.totalTwd)}%`;
  return (
    fxRowHtml(
      c.code,
      currencyTitle(c.code),
      formatMoney(c.code, c.foreign),
      `≈ ${nf(c.twd)}　${sub}`,
      pct(c.twd, s.totalTwd),
    ) +
    fxBatchLines(c, s.balances) +
    '</div>'
  );
}

/** 還沒花完的外幣現金，依各批換匯的匯率估算成台幣。 */
function leftoverCashTwd(balances) {
  return balances.filter((b) => b.remaining > 0).reduce((n, b) => n + b.remaining * b.rate, 0);
}

function fxSummaryHtml(t, s) {
  const exchanged = s.balances.reduce((n, b) => n + b.twdCost, 0);
  const left = leftoverCashTwd(s.balances);
  let h = `<h3>💱 ${esc(t.name)} 結算</h3><div class="fx-hero">${nf(s.totalTwd)}<small>${s.count} 筆 · 台幣總計</small></div>`;
  if (s.twdOnly.count)
    h +=
      fxRowHtml(
        'TWD',
        '🇹🇼 台幣直接付款',
        nf(s.twdOnly.total),
        `${s.twdOnly.count} 筆 · 佔 ${pct(s.twdOnly.total, s.totalTwd)}%（信用卡、現金）`,
        pct(s.twdOnly.total, s.totalTwd),
      ) + '</div>';
  h += s.currencies.map((c) => fxCurrencyBlock(c, s)).join('');
  if (s.balances.length)
    h += `<div class="fx-sub" style="margin-top:8px">換匯成本共 ${nf(exchanged)}；尚未花完的外幣現金約 ${nf(left)}（依各批匯率估算）。</div>`;
  return h;
}

function renderTripFxCard() {
  const box = $('#tripFxCard');
  if (!box) return;
  const t = fxCardTrip();
  if (!t) {
    box.innerHTML = '';
    return;
  }
  const s = summarizeTripFx(records, t);
  box.innerHTML = `<div class="fx-card">${fxSummaryHtml(t, s)}</div>`;
  box.querySelectorAll('.fx-row').forEach((row) => {
    row.onclick = () => {
      const key = row.dataset.fxkey;
      fxCardOpen.has(key) ? fxCardOpen.delete(key) : fxCardOpen.add(key);
      box.querySelector(`[data-fxdetail="${CSS.escape(key)}"]`)?.classList.toggle('show');
    };
  });
}
