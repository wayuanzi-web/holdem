/* ===== 90-web：只有公開網頁 App 版才有的東西：分享、安裝到主畫面、離線快取 ===== */
(function webExtras() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const shareUrl = location.origin + location.pathname + '?openExternalBrowser=1';   // LINE 看到這個參數會改用手機瀏覽器開
  let deferred = null;
  const bar = $('webbar');
  bar.innerHTML = '<button type="button" class="chip" id="btnShare">分享</button><button type="button" class="chip" id="btnInstall">安裝</button>';
  if (standalone) $('btnInstall').hidden = true;
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#0b1714;border:1px solid #2c5547;border-radius:10px;padding:10px 16px;max-width:min(92vw,520px);font-size:14px;z-index:50;display:none';
  document.body.appendChild(toast);
  let tt = 0;
  const say = (msg, ms) => { toast.textContent = msg; toast.style.display = 'block'; clearTimeout(tt); tt = setTimeout(() => { toast.style.display = 'none'; }, ms || 4000); };

  $('btnShare').addEventListener('click', async () => {
    const data = { title: '德州軍師', text: '跟電腦打德州撲克，教練一步一步教你怎麼打，手機點開就能用：', url: shareUrl };
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(shareUrl); say('連結已複製，貼給朋友就能用。'); }
    catch (e) { say('把這個網址傳給朋友：' + shareUrl, 9000); }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { $('btnInstall').hidden = true; });
  $('btnInstall').addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { /* 使用者關掉了 */ } deferred = null; return; }
    say(inApp ? '這個 App 內建的瀏覽器不能安裝。請點右上角選單，選「用預設瀏覽器開啟」，再按安裝。'
      : isIOS ? '在 Safari 點「分享」按鈕，往下找「加入主畫面」，就會多一個像 App 的圖示。'
        : '請打開瀏覽器的選單，選「安裝應用程式」或「加到主畫面」。', 9000);
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* 沒有離線快取也能用 */ }); });
  }
})();
