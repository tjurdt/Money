/* ===== 設定頁：版本與更新紀錄 ===== */
// 資料來自 src/domain/changelog.js；這裡只負責畫。內容是固定的，載入時畫一次即可。

function changelogEntryHtml(e, current) {
  return (
    `<div class="ver-entry${current ? ' current' : ''}"><div class="ver-head"><b>v${esc(e.version)}</b>` +
    `<span>${esc(e.date)}${current ? ' · 目前版本' : ''}</span></div><ul>` +
    e.items.map((x) => `<li>${esc(x)}</li>`).join('') +
    '</ul></div>'
  );
}

function renderVersionInfo() {
  const sum = $('#versionSummary'),
    body = $('#versionBody');
  if (!sum || !body) return;
  sum.textContent = `版本與更新 · v${APP_VERSION}`;
  body.innerHTML = CHANGELOG.map((e, i) => changelogEntryHtml(e, i === 0)).join('');
}

renderVersionInfo();
