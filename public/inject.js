(function () {
  'use strict';
  if (window.__cseExport) return;
  window.__cseExport = true;

  var FRAME_NAME = 'cse-export-frame';
  // Pages loaded for multi-page export only need to render, not get their own UI.
  if (window.name === FRAME_NAME) return;

  var script = document.currentScript || document.querySelector('script[data-upstream]');
  var UPSTREAM = (script && script.getAttribute('data-upstream')) || location.origin;
  var DEFAULT_SELECTOR = 'table tbody tr, table tr';
  var DEFAULT_MAX_PAGES = 20;
  var MARK = 'data-cse-export';
  var NEXT_RE = /^(?:(?:next|weiter|nächste)(?: page| seite)?\s*[›»>→]{0,2}|[›»>→]{1,2})$/i;
  var FRAME_TIMEOUT_MS = 20000;
  var FRAME_SETTLE_MS = 800;

  function load(key, def) {
    try { return localStorage.getItem(key) || def; } catch (e) { return def; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, v); } catch (e) { /* ignore */ }
  }
  function getSelector() { return load('cseExportSelector', DEFAULT_SELECTOR); }
  function getNextSelector() { return load('cseExportNext', ''); }
  function getMaxPages() {
    var n = parseInt(load('cseExportMaxPages', ''), 10);
    return n > 0 ? n : DEFAULT_MAX_PAGES;
  }

  // Proxied links point at the proxy; exported links should point at the real site.
  function toUpstream(href, base) {
    try {
      var u = new URL(href, base || location.href);
      if (u.origin === location.origin) return UPSTREAM + u.pathname + u.search + u.hash;
      return u.href;
    } catch (e) { return href; }
  }

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function dataCells(row) {
    var cells = row.cells ? Array.prototype.slice.call(row.cells) : Array.prototype.slice.call(row.children);
    return cells.filter(function (c) { return !c.hasAttribute(MARK); });
  }

  function findRows(doc) {
    doc = doc || document;
    var seen = new Set();
    var rows = [];
    var nodes;
    try { nodes = doc.querySelectorAll(getSelector()); } catch (e) { nodes = []; }
    Array.prototype.forEach.call(nodes, function (r) {
      if (seen.has(r) || r.closest('#cse-export-bar')) return;
      seen.add(r);
      // Skip pure header rows.
      if (r.tagName === 'TR' && !r.querySelector('td')) return;
      if (r.closest('thead')) return;
      rows.push(r);
    });
    return rows;
  }

  function headersFor(row, width) {
    var table = row.closest('table');
    var names = [];
    if (table) {
      var headRow = table.querySelector('thead tr') ||
        Array.prototype.find.call(table.rows, function (r) { return !r.querySelector('td') && r.querySelector('th'); });
      if (headRow) names = dataCells(headRow).map(function (c) { return clean(c.innerText || c.textContent); });
    }
    for (var i = 0; i < width; i++) if (!names[i]) names[i] = 'Spalte ' + (i + 1);
    return names.slice(0, width);
  }

  function extract(row) {
    var base = row.ownerDocument.baseURI;
    var cells = dataCells(row);
    var values = cells.map(function (c) { return clean(c.innerText || c.textContent); });
    var links = [];
    Array.prototype.forEach.call(row.querySelectorAll('a[href]'), function (a) {
      if (a.closest('[' + MARK + ']')) return;
      var h = a.getAttribute('href');
      if (!h || /^(javascript:|#)/i.test(h)) return;
      var u = toUpstream(h, base);
      if (links.indexOf(u) === -1) links.push(u);
    });
    var headers = headersFor(row, values.length);
    var obj = {};
    headers.forEach(function (h, i) {
      var key = h, n = 2;
      while (Object.prototype.hasOwnProperty.call(obj, key)) key = h + ' (' + n++ + ')';
      obj[key] = values[i];
    });
    obj.Links = links.join(' ');
    return obj;
  }

  function csvEscape(v) {
    v = v == null ? '' : String(v);
    return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toCsv(objs) {
    var cols = [];
    objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (cols.indexOf(k) === -1) cols.push(k); }); });
    var lines = [cols.map(csvEscape).join(';')];
    objs.forEach(function (o) { lines.push(cols.map(function (k) { return csvEscape(o[k]); }).join(';')); });
    return '﻿' + lines.join('\r\n');
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function writeFile(objs, format, suffix) {
    var name = baseName() + (suffix || '');
    if (format === 'json') download(name + '.json', JSON.stringify(objs, null, 2), 'application/json');
    else download(name + '.csv', toCsv(objs), 'text/csv;charset=utf-8');
  }

  function baseName() {
    var term = new URLSearchParams(location.search).get('term') || 'export';
    return 'cse_' + term.replace(/[^\w.-]+/g, '_');
  }

  function fileSafe(s) { return (s || 'zeile').replace(/[^\w.-]+/g, '_').slice(0, 60); }

  function exportRow(row, index) {
    var obj = extract(row);
    var first = obj[Object.keys(obj)[0]];
    download(baseName() + '_' + (index + 1) + '_' + fileSafe(first) + '.csv', toCsv([obj]), 'text/csv;charset=utf-8');
  }

  function exportAll(format) {
    var objs = findRows().map(extract);
    if (!objs.length) { alert('Keine Zeilen gefunden. Selektor prüfen.'); return; }
    writeFile(objs, format);
  }

  // ---- Multi-page export ----

  function findNextUrl(doc) {
    var el = null;
    var sel = getNextSelector();
    if (sel) { try { el = doc.querySelector(sel); } catch (e) { el = null; } }
    if (!el) el = doc.querySelector('a[rel~="next"][href], link[rel~="next"][href]');
    if (!el) {
      el = Array.prototype.find.call(doc.querySelectorAll('a[href]'), function (a) {
        return NEXT_RE.test(clean(a.textContent)) ||
          NEXT_RE.test(clean(a.getAttribute('aria-label'))) ||
          NEXT_RE.test(clean(a.getAttribute('title')));
      });
    }
    if (!el) return null;
    var h = el.getAttribute('href');
    if (!h || /^(#|javascript:)/i.test(h)) return null;
    if (el.closest && el.closest('.disabled, [aria-disabled="true"]')) return null;
    var u = new URL(h, doc.baseURI);
    return u.origin === location.origin ? u.href : null;
  }

  // Loads a page in a hidden same-origin iframe so JS-rendered results are included.
  function loadPage(url) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      frame.name = FRAME_NAME;
      frame.setAttribute(MARK, '');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;visibility:hidden';
      var started = Date.now();
      var lastCount = -1;
      var stableSince = 0;
      var timer = null;

      function finish(err) {
        clearInterval(timer);
        if (err) { frame.remove(); reject(err); return; }
        resolve({ doc: frame.contentDocument, dispose: function () { frame.remove(); } });
      }

      frame.addEventListener('load', function () {
        clearInterval(timer);
        timer = setInterval(function () {
          var doc;
          try { doc = frame.contentDocument; } catch (e) { finish(new Error('Kein Zugriff auf ' + url)); return; }
          if (!doc || doc.readyState === 'loading') return;
          var count = findRows(doc).length;
          if (count !== lastCount) { lastCount = count; stableSince = Date.now(); return; }
          var settled = count > 0 && Date.now() - stableSince >= FRAME_SETTLE_MS;
          if (settled || Date.now() - started > FRAME_TIMEOUT_MS) finish();
        }, 200);
      });
      frame.src = url;
      document.body.appendChild(frame);
    });
  }

  var busy = false;

  async function exportPages(format) {
    if (busy) return;
    busy = true;
    setBusy(true);
    var maxPages = getMaxPages();
    var visited = new Set([location.href]);
    var all = [];
    var page = 1;
    var info = '';
    try {
      findRows().forEach(function (r) { var o = extract(r); o.Seite = page; all.push(o); });
      var next = findNextUrl(document);
      while (next && !visited.has(next) && page < maxPages) {
        visited.add(next);
        page++;
        status('Lade Seite ' + page + ' …');
        var loaded = await loadPage(next);
        try {
          var rows = findRows(loaded.doc);
          if (!rows.length) { info = 'Seite ' + page + ' ohne Zeilen, Abbruch.'; page--; break; }
          rows.forEach(function (r) { var o = extract(r); o.Seite = page; all.push(o); });
          next = findNextUrl(loaded.doc);
        } finally {
          loaded.dispose();
        }
      }
      if (next && page >= maxPages && !visited.has(next)) info = 'Limit von ' + maxPages + ' Seiten erreicht.';
      if (!all.length) { alert('Keine Zeilen gefunden. Selektor prüfen.'); return; }
      writeFile(all, format, '_seiten_1-' + page);
      status(all.length + ' Zeilen aus ' + page + ' Seite(n) exportiert.' + (info ? ' ' + info : ''));
    } catch (e) {
      status('Fehler: ' + e.message);
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  // ---- UI ----

  function status(text) {
    var el = document.getElementById('cse-export-status');
    if (el && el.textContent !== text) el.textContent = text;
  }

  function setBusy(on) {
    document.querySelectorAll('#cse-export-bar button').forEach(function (b) { b.disabled = on; });
  }

  function decorate() {
    var rows = findRows();
    rows.forEach(function (row) {
      if (row.querySelector(':scope > [' + MARK + ']')) return;
      var cell = document.createElement(row.tagName === 'TR' ? 'td' : 'div');
      cell.setAttribute(MARK, '');
      cell.style.cssText = 'white-space:nowrap;width:1%';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cse-export-row';
      btn.textContent = 'Export';
      btn.title = 'Diese Zeile als CSV exportieren';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        exportRow(row, findRows().indexOf(row));
      });
      cell.appendChild(btn);
      row.appendChild(cell);
    });
    // Keep header width consistent with the added column.
    document.querySelectorAll('table').forEach(function (t) {
      if (!t.querySelector('[' + MARK + ']')) return;
      var head = t.querySelector('thead tr');
      if (head && !head.querySelector('[' + MARK + ']')) {
        var th = document.createElement('th');
        th.setAttribute(MARK, '');
        head.appendChild(th);
      }
    });
    var count = document.getElementById('cse-export-count');
    var label = rows.length + ' Zeilen';
    if (count && count.textContent !== label) count.textContent = label;
  }

  function buildBar() {
    var style = document.createElement('style');
    style.textContent =
      '#cse-export-bar{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1f2937;color:#fff;' +
      'font:13px/1.3 system-ui,sans-serif;padding:10px 12px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3);' +
      'display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(560px,calc(100vw - 32px))}' +
      '#cse-export-bar button{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit}' +
      '#cse-export-bar button:disabled{opacity:.5;cursor:default}' +
      '#cse-export-bar input{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #4b5563}' +
      '#cse-export-bar label{display:flex;gap:4px;align-items:center}' +
      '#cse-export-status{flex-basis:100%;font-size:12px;opacity:.85}' +
      '#cse-export-status:empty{display:none}' +
      'button.cse-export-row{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;font:12px system-ui,sans-serif}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'cse-export-bar';
    bar.innerHTML =
      '<span id="cse-export-count">0 Zeilen</span>' +
      '<button type="button" data-f="csv">Seite CSV</button>' +
      '<button type="button" data-f="json">Seite JSON</button>' +
      '<button type="button" data-f="csv" data-pages="1">Alle Seiten CSV</button>' +
      '<button type="button" data-f="json" data-pages="1">Alle Seiten JSON</button>' +
      '<label>Max. Seiten <input id="cse-export-max" type="number" min="1" style="width:60px"></label>' +
      '<label>Zeilen <input id="cse-export-sel" style="width:140px" title="CSS-Selektor für Zeilen"></label>' +
      '<label>Weiter-Link <input id="cse-export-next" style="width:110px" placeholder="automatisch" title="CSS-Selektor für den Link zur nächsten Seite"></label>' +
      '<span id="cse-export-status"></span>';
    document.body.appendChild(bar);

    var sel = bar.querySelector('#cse-export-sel');
    sel.value = getSelector();
    sel.addEventListener('change', function () {
      save('cseExportSelector', sel.value.trim() || DEFAULT_SELECTOR);
      document.querySelectorAll('[' + MARK + ']').forEach(function (n) { n.remove(); });
      decorate();
    });
    var next = bar.querySelector('#cse-export-next');
    next.value = getNextSelector();
    next.addEventListener('change', function () { save('cseExportNext', next.value.trim()); });
    var max = bar.querySelector('#cse-export-max');
    max.value = getMaxPages();
    max.addEventListener('change', function () { save('cseExportMaxPages', String(parseInt(max.value, 10) || DEFAULT_MAX_PAGES)); });

    bar.addEventListener('click', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f');
      if (!f) return;
      if (e.target.hasAttribute('data-pages')) exportPages(f);
      else exportAll(f);
    });
  }

  function init() {
    buildBar();
    decorate();
    // Results may be loaded or re-rendered by JavaScript.
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () { pending = false; decorate(); }, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
