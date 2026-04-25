/**
 * EWD CMS — Inline Editor for GitHub Pages
 * Usage: <script src="https://ewd-cms.vercel.app/cms.js"
 *           data-repo="owner/repo"
 *           data-file="index.html"
 *           data-pw-hash="SHA256_HASH"
 *           data-api="https://ewd-cms.vercel.app">
 *        </script>
 */
(function () {
  'use strict';

  // ── Config from script tag ──────────────────────────────────────────
  const scriptEl = document.currentScript ||
    document.querySelector('script[data-repo]');
  const CFG = {
    repo:   scriptEl.dataset.repo,
    file:   scriptEl.dataset.file,
    pwHash: scriptEl.dataset.pwHash,
    api:    (scriptEl.dataset.api || 'https://ewd-cms.vercel.app').replace(/\/$/, ''),
  };

  // Only activate on ?edit param
  if (!location.search.includes('edit')) return;

  // ── Utilities ───────────────────────────────────────────────────────
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function injectStyle(css) {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Styles ──────────────────────────────────────────────────────────
  injectStyle(`
    #ewd-overlay {
      position:fixed;inset:0;background:rgba(0,0,0,.55);
      display:flex;align-items:center;justify-content:center;z-index:99999;
      font-family:system-ui,sans-serif;
    }
    #ewd-login {
      background:#fff;border-radius:14px;padding:36px 32px;
      width:340px;box-shadow:0 8px 40px rgba(0,0,0,.25);text-align:center;
    }
    #ewd-login h2 {margin:0 0 6px;font-size:1.2rem;color:#0d1117;}
    #ewd-login p  {margin:0 0 20px;font-size:.85rem;color:#64748b;}
    #ewd-login input {
      width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;
      border-radius:8px;font-size:1rem;outline:none;box-sizing:border-box;margin-bottom:10px;
    }
    #ewd-login input:focus {border-color:#0066ff;}
    #ewd-login button {
      width:100%;padding:12px;background:#0066ff;color:#fff;
      border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;
    }
    #ewd-login button:hover {background:#0050cc;}
    #ewd-login .err {color:#e63946;font-size:.82rem;margin-top:8px;display:none;}

    #ewd-bar {
      position:fixed;bottom:0;left:0;right:0;
      background:#0d1117;color:#fff;
      display:flex;align-items:center;gap:12px;padding:10px 20px;
      z-index:99998;font-family:system-ui,sans-serif;font-size:.85rem;
      box-shadow:0 -2px 16px rgba(0,0,0,.3);
    }
    #ewd-bar .ewd-status {flex:1;color:#a8b4c0;}
    #ewd-bar button {
      padding:8px 18px;border:none;border-radius:7px;
      font-size:.85rem;font-weight:700;cursor:pointer;
    }
    #ewd-save   {background:#0066ff;color:#fff;}
    #ewd-save:hover {background:#0050cc;}
    #ewd-cancel {background:#1c2128;color:#a8b4c0;}
    #ewd-cancel:hover {background:#2d3748;color:#fff;}

    [data-ewd-editable]:hover  {outline:2px dashed rgba(0,102,255,.4);outline-offset:2px;}
    [data-ewd-editable]:focus  {outline:2px solid #0066ff;outline-offset:2px;border-radius:2px;}
    [data-ewd-drag]            {cursor:grab;position:relative;}
    [data-ewd-drag].ewd-dragging {opacity:.4;}
    [data-ewd-drag]::before    {
      content:'⠿';position:absolute;left:-22px;top:50%;transform:translateY(-50%);
      font-size:1.1rem;color:#0066ff;opacity:0;transition:opacity .15s;pointer-events:none;
    }
    [data-ewd-drag]:hover::before {opacity:1;}
    .ewd-drop-hint {
      border-top:3px solid #0066ff !important;margin-top:0 !important;
    }
    [data-ewd-img]:hover {
      outline:3px dashed rgba(0,102,255,.5);outline-offset:3px;cursor:pointer;
    }
  `);

  // ── Login Overlay ───────────────────────────────────────────────────
  function showLogin() {
    const overlay = document.createElement('div');
    overlay.id = 'ewd-overlay';
    overlay.innerHTML = `
      <div id="ewd-login">
        <h2>EWD Editor</h2>
        <p>Passwort eingeben um Seite zu bearbeiten</p>
        <input type="password" id="ewd-pw" placeholder="Passwort" autocomplete="current-password">
        <button id="ewd-login-btn">Einloggen</button>
        <div class="err" id="ewd-err">Falsches Passwort</div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#ewd-pw');
    const btn   = overlay.querySelector('#ewd-login-btn');
    const err   = overlay.querySelector('#ewd-err');

    input.focus();

    async function tryLogin() {
      const hash = await sha256(input.value.trim());
      if (hash === CFG.pwHash) {
        overlay.remove();
        activateEditor();
      } else {
        err.style.display = 'block';
        input.value = '';
        input.focus();
      }
    }

    btn.addEventListener('click', tryLogin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  }

  // ── Editor ──────────────────────────────────────────────────────────
  function activateEditor() {
    loadSortable(() => {
      makeTextEditable();
      makeSectionsDraggable();
      makeImagesReplaceable();
      showToolbar();
    });
  }

  // Load Sortable.js dynamically
  function loadSortable(cb) {
    if (window.Sortable) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  // Make all visible text elements editable
  function makeTextEditable() {
    const SELECTORS = 'h1,h2,h3,h4,p,li,td,th,blockquote,figcaption,span,a,button,label';
    document.querySelectorAll(SELECTORS).forEach(el => {
      // Skip elements inside scripts/styles/hidden/editor UI
      if (el.closest('#ewd-bar,#ewd-overlay,script,style,noscript')) return;
      if (el.children.length > 0 && !['A','BUTTON','SPAN'].includes(el.tagName)) return;
      el.contentEditable = 'true';
      el.dataset.ewdEditable = '1';
      el.dataset.ewdOriginal = el.innerHTML;
    });
    setStatus('✏️ Texte anklicken und bearbeiten');
  }

  // Mark top-level sections as draggable
  function makeSectionsDraggable() {
    const main = document.querySelector('main, #main, .main, body');
    if (!main) return;

    const sections = Array.from(main.children).filter(el =>
      ['SECTION','DIV','ARTICLE','HEADER','FOOTER'].includes(el.tagName) &&
      !el.closest('#ewd-bar')
    );

    sections.forEach(s => {
      s.dataset.ewdDrag = '1';
    });

    window._ewdSortable = Sortable.create(main, {
      handle: '[data-ewd-drag]',
      animation: 150,
      ghostClass: 'ewd-dragging',
      chosenClass: 'ewd-dragging',
      dragClass: 'ewd-dragging',
      onEnd: () => setStatus('💾 Ungespeicherte Änderungen'),
    });
  }

  // Click on images to replace them — compress + embed as data URL (no server needed)
  function makeImagesReplaceable() {
    document.querySelectorAll('img').forEach(img => {
      if (img.closest('#ewd-bar,#ewd-overlay')) return;
      img.dataset.ewdImg = '1';

      // Show hover badge
      img.title = '📷 Klicken um Bild zu ändern';

      img.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          setStatus('⏳ Bild wird verarbeitet...');
          try {
            const dataUrl = await compressImage(file);
            img.src = dataUrl;
            setStatus('✅ Bild ersetzt — klick Speichern wenn fertig');
          } catch (e) {
            setStatus('❌ Fehler: ' + e.message);
          }
        };
        input.click();
      });
    });
  }

  // Compress image to JPEG via canvas (max 1200px wide, quality 0.82)
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const MAX = 1200;
        const ratio = Math.min(MAX / image.width, 1);
        const w = Math.round(image.width * ratio);
        const h = Math.round(image.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(image, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  // ── Toolbar ─────────────────────────────────────────────────────────
  function showToolbar() {
    const bar = document.createElement('div');
    bar.id = 'ewd-bar';
    bar.innerHTML = `
      <span class="ewd-status" id="ewd-status-text">✏️ Bearbeitungsmodus aktiv</span>
      <button id="ewd-cancel">Abbrechen</button>
      <button id="ewd-save">💾 Speichern</button>`;
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '60px';

    bar.querySelector('#ewd-save').addEventListener('click', saveChanges);
    bar.querySelector('#ewd-cancel').addEventListener('click', () => {
      if (confirm('Änderungen verwerfen?')) location.href = location.pathname;
    });
  }

  function setStatus(msg) {
    const el = document.getElementById('ewd-status-text');
    if (el) el.textContent = msg;
  }

  // ── Save ─────────────────────────────────────────────────────────────
  async function saveChanges() {
    setStatus('⏳ Wird gespeichert...');
    document.getElementById('ewd-save').disabled = true;

    // Remove editor attributes before serializing
    document.querySelectorAll('[data-ewd-editable]').forEach(el => {
      el.removeAttribute('contenteditable');
      delete el.dataset.ewdEditable;
      delete el.dataset.ewdOriginal;
    });
    document.querySelectorAll('[data-ewd-drag]').forEach(el => {
      delete el.dataset.ewdDrag;
    });
    document.querySelectorAll('[data-ewd-img]').forEach(el => {
      delete el.dataset.ewdImg;
    });
    document.getElementById('ewd-bar').remove();
    document.body.style.paddingBottom = '';

    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    try {
      const resp = await fetch(CFG.api + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: CFG.repo, file: CFG.file, content: html })
      });
      const data = await resp.json();
      if (data.ok) {
        alert('✅ Gespeichert! Seite ist in ~60 Sekunden live.');
        location.href = location.pathname;
      } else {
        alert('❌ Fehler: ' + (data.error || 'Unbekannt'));
        location.reload();
      }
    } catch (e) {
      alert('❌ Netzwerkfehler: ' + e.message);
      location.reload();
    }
  }

  // ── Start ────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showLogin);
  } else {
    showLogin();
  }

})();
