/* ===== 加入主畫面（PWA 安裝引導） ===== */

/**
 * 為什麼需要這張卡
 *
 * 從瀏覽器開啟時一定會有網址列，點連結也可能跳出去 —— 這是瀏覽器分頁的行為，
 * 不是 app 設定能改的。要真正「像 app」（沒有網址列、獨立視窗、獨立切換），
 * 使用者必須把它加到主畫面。
 *
 * 但多數人不知道這個動作存在，也不知道在哪。這張卡就是負責講清楚：
 * 已經安裝好就低調收起來，還沒安裝就給出這台裝置對應的步驟。
 */

/** Chrome 系瀏覽器提供的安裝提示事件，攔下來改由我們自己的按鈕觸發。 */
let deferredInstallPrompt = null;

/** 目前是不是以獨立視窗執行（已加入主畫面）。 */
function isStandaloneApp() {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: minimal-ui)')?.matches ||
      // iOS Safari 用的是非標準屬性。
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

/** 粗略判斷 iOS —— iPadOS 會偽裝成 Mac，因此一併看觸控點數。 */
function isIosDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;
}

window.addEventListener('beforeinstallprompt', (e) => {
  // 擋掉瀏覽器自己的橫幅，改在設定頁用我們的按鈕，時機比較合理。
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallCard();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  toast('已加入主畫面');
  renderInstallCard();
});

/** 繪製設定頁最上方的安裝引導卡。 */
function renderInstallCard() {
  const box = $('#installCard');
  if (!box) return;

  if (isStandaloneApp()) {
    box.hidden = false;
    box.className = 'install-card ok';
    box.innerHTML =
      '<h3>✅ 已以應用程式模式執行</h3>' +
      '<p>目前沒有網址列，資料存在這台裝置上。登入 Google 帳號後會另外同步到你的雲端硬碟。</p>';
    return;
  }

  box.hidden = false;
  box.className = 'install-card';

  if (deferredInstallPrompt) {
    box.innerHTML =
      '<h3>📲 加入主畫面</h3>' +
      '<p>安裝後會像一般 App 一樣獨立開啟，沒有網址列，切換也更快。</p>' +
      '<button type="button" class="install-btn" id="installBtn">立即安裝</button>';
    $('#installBtn').onclick = async () => {
      const prompt = deferredInstallPrompt;
      if (!prompt) return;
      deferredInstallPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (e) {
        console.warn('install prompt failed', e);
      }
      renderInstallCard();
    };
    return;
  }

  // 沒有 beforeinstallprompt 的環境（iOS Safari、部分瀏覽器）只能給步驟說明。
  box.innerHTML = isIosDevice()
    ? '<h3>📲 加入主畫面</h3>' +
      '<p>加入後會像一般 App 一樣獨立開啟，沒有網址列。</p>' +
      '<ol><li>點下方工具列的「分享」<span aria-hidden="true">􀈂</span></li>' +
      '<li>往下找到「加入主畫面」</li>' +
      '<li>按右上角「新增」</li></ol>'
    : '<h3>📲 加入主畫面</h3>' +
      '<p>加入後會像一般 App 一樣獨立開啟，沒有網址列。</p>' +
      '<ol><li>打開瀏覽器右上角的選單</li>' +
      '<li>選擇「安裝應用程式」或「加到主畫面」</li></ol>';
}

registerView({
  id: 'install',
  // 這張卡在設定頁內，跟著設定頁一起重繪即可。
  isActive: () => $('#view-settings')?.classList.contains('active') ?? false,
  deps: [],
  render: renderInstallCard,
});

renderInstallCard();
