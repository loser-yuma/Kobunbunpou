// テンシ ポータルの Supabase（publishable キーのみ。service_role は絶対に入れない）
// ※ supabase-config.js は古文文法サイト自身のプロジェクト用。こちらはポータル用で、別物。
window.PORTAL_SUPABASE_URL = 'https://ljowllihyetgvuugafam.supabase.co';
window.PORTAL_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lfvqV1MdT5eioPyLOnM36Q_a1EZGSV0';

// しりとりサイトと共通のヘッダー、およびトップ画面の簡潔な表示。
(function setupKobunbunpouPage() {
  function mount() {
    if (!document.querySelector('.app-nav')) {
      var style = document.createElement('style');
      style.textContent = [
        ':root{--nav-bg:rgba(250,250,252,.86);--nav-border:rgba(0,0,0,.12);--nav-text:#1d1d1f;--nav-muted:#424245}',
        '@media(prefers-color-scheme:dark){:root{--nav-bg:rgba(22,22,23,.86);--nav-border:rgba(255,255,255,.16);--nav-text:#f5f5f7;--nav-muted:#d2d2d7}}',
        '.app-nav{position:sticky;top:0;z-index:20;min-height:48px;background:var(--nav-bg);border-bottom:1px solid var(--nav-border);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px)}',
        '.app-nav-inner{width:min(100% - 40px,1024px);min-height:48px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:28px}',
        '.app-nav-title{flex:0 0 auto;color:var(--nav-text);font-size:.95rem;font-weight:650;letter-spacing:-.02em;white-space:nowrap}',
        '.app-nav-links{display:flex;align-items:center;justify-content:flex-end;gap:clamp(18px,3vw,36px)}',
        '.app-nav a{display:inline-flex;align-items:center;min-height:44px;color:var(--nav-muted);text-decoration:none;font-size:.75rem;font-weight:400;white-space:nowrap;transition:color 160ms ease}',
        '.app-nav a:hover,.app-nav a[aria-current=page]{color:var(--nav-text)}',
        '.app-nav a:focus-visible{outline:2px solid #007aff;outline-offset:3px}',
        '@media(max-width:520px){.app-nav-inner{width:calc(100% - 28px);min-height:48px;gap:14px}.app-nav-title{font-size:.85rem}.app-nav-links{gap:14px}.app-nav a{font-size:.7rem}}',
        '@media(max-width:360px){.app-nav-inner{width:calc(100% - 20px);gap:8px}.app-nav-links{gap:9px}.app-nav-title{font-size:.78rem}.app-nav a{font-size:.66rem}}'
      ].join('');
      document.head.appendChild(style);

      var nav = document.createElement('nav');
      nav.className = 'app-nav';
      nav.setAttribute('aria-label', 'アプリの切り替え');
      nav.innerHTML = '<div class="app-nav-inner">'
        + '<span class="app-nav-title">Dr.Yの研究室</span>'
        + '<div class="app-nav-links"><a href="https://loser-yuma.github.io/DeleteTailtoNose/">消去しりとり</a>'
        + '<a href="https://loser-yuma.github.io/Kobunbunpou/" aria-current="page">古典文法</a></div>'
        + '</div>';
      document.body.insertBefore(nav, document.body.firstChild);
    }

    var pageHeader = document.querySelector('body > header');
    if (pageHeader) {
      var title = pageHeader.querySelector('h1');
      if (title) title.textContent = '古典文法';
      pageHeader.querySelector('p')?.remove();
    }

    var eyebrow = document.querySelector('.welcome .eyebrow');
    if (eyebrow) eyebrow.textContent = '助詞・助動詞';
    var welcomeTitle = document.querySelector('.welcome h2');
    if (welcomeTitle) welcomeTitle.textContent = '古典文法を学ぶ';
    var welcomeCopy = document.querySelector('.welcome-copy');
    if (welcomeCopy) welcomeCopy.textContent = '助詞と助動詞の問題を解いて、文法を確認します。';

    document.querySelectorAll('.course-icon').forEach(function (icon) { icon.remove(); });
    var particleDescription = document.querySelector('[data-start-kind="particles"] .course-description');
    if (particleDescription) particleDescription.textContent = '係り結びなどの助詞';
    var auxiliaryDescription = document.querySelector('[data-start-kind="auxiliaries"] .course-description');
    if (auxiliaryDescription) auxiliaryDescription.textContent = '意味と用法から助動詞';

    document.querySelectorAll('.home-note').forEach(function (note) {
      if (note.textContent.includes('最高記録はこのブラウザー')) {
        note.textContent = '最高記録は端末に保存されます。';
      } else if (note.textContent.includes('メールアドレスは公開されません')) {
        note.textContent = 'メールアドレスは公開されません。';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
