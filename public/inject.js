(function () {
  'use strict';
  if (window.__cseExport) return;
  window.__cseExport = true;

  var script = document.currentScript || document.querySelector('script[data-upstream]');
  var UPSTREAM = (script && script.getAttribute('data-upstream')) || location.origin;
  var STORE_KEY = 'cseExportSelector';
  var DEFAULT_SELECTOR = 'table tbody tr, table tr';
  var MARK = 'data-cse-export';

  function getSelector() {
    try { return localStorage.getItem(STORE_KEY) || DEFAULT_SELECTOR; } catch (e) { return DEFAULT_SELECTOR; }
  }
  function setSelector(v) {
    try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* ignore */ }
  }

  // Proxied links point at the proxy; exported links should point at the real site.
  function toUpstream(href) {
    try {
      var u = new URL(href, location.href);
      if (u.origin === location.origin) return UPSTREAM + u.pathname + u.search + u.hash;
      return u.href;
    } catch (e) { return href; }
  }

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function dataCells(row) {
    var cells = row.cells ? Array.prototype.slice.call(row.cells) : Array.prototype.slice.call(row.children);
    return cells.filter(function (c) { return !c.hasAttribute(MARK); });
  }

  function findRows() {
    var seen = new Set();
    var rows = [];
    var nodes;
    try { nodes = document.querySelectorAll(getSelector()); } catch (e) { nodes = []; }
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
    var cells = dataCells(row);
    var values = cells.map(function (c) { return clean(c.innerText || c.textContent); });
    var links = [];
    Array.prototype.forEach.call(row.querySelectorAll('a[href]'), function (a) {
      if (a.closest('[' + MARK + ']')) return;
      var h = a.getAttribute('href');
      if (!h || /^(javascript:|#)/i.test(h)) return;
      var u = toUpstream(h);
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
    if (format === 'json') download(baseName() + '.json', JSON.stringify(objs, null, 2), 'application/json');
    else download(baseName() + '.csv', toCsv(objs), 'text/csv;charset=utf-8');
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
      'display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 32px)}' +
      '#cse-export-bar button{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:5px 10px;cursor:pointer;font:inherit}' +
      '#cse-export-bar input{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #4b5563;width:170px}' +
      'button.cse-export-row{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;font:12px system-ui,sans-serif}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'cse-export-bar';
    bar.innerHTML =
      '<span id="cse-export-count">0 Zeilen</span>' +
      '<button type="button" data-f="csv">Alle als CSV</button>' +
      '<button type="button" data-f="json">Alle als JSON</button>' +
      '<input id="cse-export-sel" title="CSS-Selektor für Zeilen">';
    document.body.appendChild(bar);
    var input = bar.querySelector('#cse-export-sel');
    input.value = getSelector();
    input.addEventListener('change', function () {
      setSelector(input.value.trim() || DEFAULT_SELECTOR);
      document.querySelectorAll('[' + MARK + ']').forEach(function (n) { n.remove(); });
      decorate();
    });
    bar.addEventListener('click', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f');
      if (f) exportAll(f);
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
