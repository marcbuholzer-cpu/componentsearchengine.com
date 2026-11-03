// ==UserScript==
// @name         CSE Export
// @namespace    https://github.com/marcbuholzer-cpu/componentsearchengine.com
// @version      1.2.0
// @description  Exportiert Suchergebnisse von componentsearchengine.com zeilenweise oder über mehrere Seiten (CSV/JSON).
// @match        https://componentsearchengine.com/*
// @match        https://www.componentsearchengine.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  if (window.__cseExport) return;
  window.__cseExport = true;

  var DEFAULT_SELECTOR = 'table tbody tr, table tr';
  var DEFAULT_MAX_PAGES = 20;
  var MARK = 'data-cse-export';
  var FRAME_TIMEOUT_MS = 20000;
  var FRAME_SETTLE_MS = 800;
  var PAGINATION_WAIT_MS = 3000;

  function load(key, def) {
    try { return localStorage.getItem(key) || def; } catch (e) { return def; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, v); } catch (e) { /* ignore */ }
  }
  function getSelector() { return load('cseExportSelector', DEFAULT_SELECTOR); }
  function getPageParam() { return load('cseExportPageParam', 'page'); }
  function getMaxPages() {
    var n = parseInt(load('cseExportMaxPages', ''), 10);
    return n > 0 ? n : DEFAULT_MAX_PAGES;
  }

  function absUrl(href, base) {
    try { return new URL(href, base || location.href).href; } catch (e) { return href; }
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
      if (seen.has(r) || r.closest('#cse-panel')) return;
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
      var u = absUrl(h, base);
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

  function pageUrl(n) {
    var u = new URL(location.href);
    u.searchParams.set(getPageParam(), String(n));
    return u.href;
  }

  function currentPageNo() {
    var n = parseInt(new URL(location.href).searchParams.get(getPageParam()), 10);
    return n > 0 ? n : 1;
  }

  // Highest page number linked from the document's pagination (0 if none).
  function maxPageIn(doc) {
    var param = getPageParam();
    var max = 0;
    Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      if (a.closest('#cse-panel')) return;
      try {
        var u = new URL(a.getAttribute('href'), doc.baseURI);
        if (u.origin !== location.origin || u.pathname !== location.pathname) return;
        var n = parseInt(u.searchParams.get(param), 10);
        if (n > max) max = n;
      } catch (e) { /* ignore */ }
    });
    return max;
  }

  function rowSignature(rows) {
    return rows.length + '|' + rows.map(function (r) { return clean(r.textContent); }).join('|');
  }

  // Loads a page in a hidden iframe so JS-rendered results are included.
  // Falls back to fetch + DOMParser when the site forbids framing or the frame shows no rows.
  // Returns { promise, cancel }; cancel() aborts the load and rejects the promise.
  var frameBlocked = false;

  function loadPage(url) {
    var cancelled = false;
    var current = null;

    var promise = (frameBlocked ? Promise.resolve(null) : loadInFrame(url, function (c) { current = c; }))
      .catch(function (e) {
        if (cancelled) throw e;
        frameBlocked = true;
        return null;
      })
      .then(function (res) {
        if (cancelled) { if (res) res.dispose(); throw new Error('abgebrochen'); }
        if (res && findRows(res.doc).length) return res;
        if (res) res.dispose();
        return loadViaFetch(url, function (c) { current = c; });
      });

    return {
      promise: promise,
      cancel: function () { cancelled = true; if (current) current(); },
    };
  }

  function loadInFrame(url, onCancel) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      var timer = null;
      var started = Date.now();
      var lastCount = -1;
      var stableSince = 0;
      var done = false;

      function settle(err) {
        if (done) return;
        done = true;
        clearInterval(timer);
        if (err) { frame.remove(); reject(err); return; }
        resolve({ doc: frame.contentDocument, dispose: function () { frame.remove(); } });
      }
      onCancel(function () { settle(new Error('abgebrochen')); });

      frame.setAttribute(MARK, '');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;visibility:hidden';
      frame.addEventListener('load', function () {
        clearInterval(timer);
        timer = setInterval(function () {
          var doc;
          try { doc = frame.contentDocument; } catch (e) { doc = null; }
          // Blocked frames (X-Frame-Options/CSP) end up cross-origin or on about:blank.
          if (!doc || doc.URL === 'about:blank') { settle(new Error('iframe blockiert')); return; }
          if (doc.readyState === 'loading') return;
          var count = findRows(doc).length;
          if (count !== lastCount) { lastCount = count; stableSince = Date.now(); return; }
          var stableFor = Date.now() - stableSince;
          var settled = count > 0 && stableFor >= FRAME_SETTLE_MS &&
            (maxPageIn(doc) > 0 || stableFor >= PAGINATION_WAIT_MS);
          if (settled || Date.now() - started > FRAME_TIMEOUT_MS) settle();
        }, 200);
      });
      frame.src = url;
      document.body.appendChild(frame);
    });
  }

  function loadViaFetch(url, onCancel) {
    var ctrl = new AbortController();
    onCancel(function () { ctrl.abort(); });
    return fetch(url, { credentials: 'include', signal: ctrl.signal })
      .catch(function (e) { throw new Error(e.name === 'AbortError' ? 'abgebrochen' : 'Netzwerkfehler'); })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // Relative links must resolve against the fetched page, not the current one.
        var base = doc.createElement('base');
        base.href = url;
        doc.head.insertBefore(base, doc.head.firstChild);
        return { doc: doc, dispose: function () {} };
      });
  }

  // job.state: 'running' | 'paused' | 'done'
  var job = null;

  function startJob() {
    if (job && job.state === 'running') return;
    var first = currentPageNo();
    var rowEls = findRows();
    job = {
      state: 'paused',
      rows: rowEls.map(function (r) { var o = extract(r); o.Seite = first; return o; }),
      firstPage: first,
      page: first,
      lastKnown: maxPageIn(document),
      prevSig: rowSignature(rowEls),
      current: null,
      loader: null,
      stop: false,
      note: '',
      log: [{ page: first, count: rowEls.length, url: location.href }],
    };
    runJob();
  }

  async function runJob() {
    if (!job || job.state === 'running' || job.state === 'done') return;
    job.state = 'running';
    job.stop = false;
    job.note = '';
    renderJob();
    var max = getMaxPages();
    var pagesThisRun = 0;
    var finished = false;
    try {
      while (!job.stop) {
        var n = job.page + 1;
        if (job.lastKnown && n > job.lastKnown) { finished = true; break; }
        if (pagesThisRun >= max) { job.note = 'Limit von ' + max + ' Seiten pro Lauf erreicht.'; break; }
        var url = pageUrl(n);
        job.current = url;
        renderJob();
        job.loader = loadPage(url);
        var loaded;
        try {
          loaded = await job.loader.promise;
        } catch (e) {
          if (job.stop) break;
          throw e;
        } finally {
          job.loader = null;
        }
        try {
          if (job.stop) break;
          var rowEls = findRows(loaded.doc);
          if (!rowEls.length) {
            // End of results or a security check: pause so Weiter can retry.
            job.note = 'Seite ' + n + ' ohne Zeilen. Falls das nicht das Ende ist (z. B. Sicherheitsprüfung): ' +
              'Seite im Tab öffnen, Prüfung bestehen, dann Weiter.';
            break;
          }
          var sig = rowSignature(rowEls);
          if (sig === job.prevSig) {
            job.note = 'Seite ' + n + ' wiederholt die vorherige Seite, Ende erreicht.';
            finished = true;
            break;
          }
          rowEls.forEach(function (r) { var o = extract(r); o.Seite = n; job.rows.push(o); });
          job.page = n;
          job.prevSig = sig;
          job.lastKnown = Math.max(job.lastKnown, maxPageIn(loaded.doc));
          job.log.push({ page: n, count: rowEls.length, url: url });
        } finally {
          loaded.dispose();
        }
        pagesThisRun++;
        renderJob();
      }
      job.state = finished && !job.stop ? 'done' : 'paused';
      if (job.stop) job.note = 'Gestoppt. Weiter setzt ab Seite ' + (job.page + 1) + ' fort.';
      downloadJob();
    } catch (e) {
      job.state = 'paused';
      job.note = 'Fehler: ' + e.message + '. Weiter versucht es erneut.';
    } finally {
      job.current = null;
      renderJob();
    }
  }

  function stopJob() {
    if (!job || job.state !== 'running') return;
    job.stop = true;
    if (job.loader) job.loader.cancel();
  }

  function downloadJob() {
    if (!job || !job.rows.length) return;
    writeFile(job.rows, getFormat(), '_seiten_' + job.firstPage + '-' + job.page);
  }

  function resetJob() {
    if (job && job.state === 'running') return;
    job = null;
    renderJob();
  }

  // ---- UI ----

  var STATE_LABEL = { running: 'läuft', paused: 'pausiert', done: 'fertig' };

  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = $(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function getFormat() {
    var f = $('cse-format');
    return f ? f.value : 'csv';
  }

  // Collects what is needed to tune the selectors for the real site.
  function diagnostics() {
    var out = ['URL: ' + location.href, 'Zeilen-Selektor: ' + getSelector(),
      'Seiten-Parameter: ' + getPageParam(), 'Aktuelle Seite: ' + currentPageNo(),
      'Höchste verlinkte Seite: ' + (maxPageIn(document) || 'keine gefunden'),
      'Zeilen gefunden: ' + findRows().length];
    if (job) {
      out.push('Job: ' + job.state + ', ' + job.note);
      job.log.forEach(function (it) { out.push('  Seite ' + it.page + ': ' + it.count + ' Zeilen, ' + it.url); });
    }
    out.push('', 'Links, die nach Seitennavigation aussehen:');
    var containers = new Set();
    Array.prototype.forEach.call(document.querySelectorAll('a, button'), function (a) {
      if (a.closest('#cse-panel')) return;
      var t = clean(a.textContent);
      var h = a.getAttribute('href') || '';
      if (/^\d{1,4}$|^[‹›«»<>→←]+$|next|weiter|prev|zurück|nächste/i.test(t) || /page|offset|start=|skip/i.test(h)) {
        out.push('  <' + a.tagName.toLowerCase() + '> "' + t + '" href=' + h + ' class=' + (a.className || '') +
          ' rel=' + (a.getAttribute('rel') || '') + ' aria-label=' + (a.getAttribute('aria-label') || ''));
        var c = a.closest('nav, ul, ol, .pagination, [class*=pag]');
        if (c) containers.add(c);
      }
    });
    containers.forEach(function (c) { out.push('', 'HTML der Navigation:', c.outerHTML.slice(0, 3000)); });
    return out.join('\n');
  }

  function copyDiagnostics() {
    var text = diagnostics();
    var done = function () { setText('cse-job-note', 'Diagnose in die Zwischenablage kopiert.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { download('cse_diagnose.txt', text, 'text/plain'); });
    } else {
      download('cse_diagnose.txt', text, 'text/plain');
    }
  }

  function renderJob() {
    var s = job ? job.state : 'idle';
    setText('cse-job-state', job ? STATE_LABEL[s] : 'kein Job');
    $('cse-job-state').setAttribute('data-state', s);
    setText('cse-job-pages', job ? job.firstPage + ' bis ' + job.page : '0');
    setText('cse-job-last', job && job.lastKnown ? String(job.lastKnown) : 'unbekannt');
    setText('cse-job-rows', job ? String(job.rows.length) : '0');
    setText('cse-job-current', job && job.current ? 'Lade Seite ' + (job.page + 1) + ' …' : '');
    setText('cse-job-note', job ? job.note : '');

    $('cse-start').disabled = !!job;
    $('cse-stop').disabled = s !== 'running';
    $('cse-resume').disabled = s !== 'paused';
    $('cse-download').disabled = !job || s === 'running' || !job.rows.length;
    $('cse-reset').disabled = !job || s === 'running';

    var log = $('cse-job-log');
    var items = job ? job.log : [];
    if (log.children.length !== items.length) {
      log.textContent = '';
      items.forEach(function (it) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = it.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Seite ' + it.page;
        li.appendChild(a);
        li.appendChild(document.createTextNode(': ' + it.count + ' Zeilen'));
        log.appendChild(li);
      });
      log.scrollTop = log.scrollHeight;
    }
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
    setText('cse-page-count', rows.length + ' Zeilen');
  }

  var PANEL_WIDTH = 300;

  function setCollapsed(on) {
    document.documentElement.classList.toggle('cse-panel-open', !on);
    $('cse-panel').classList.toggle('cse-collapsed', on);
    save('cseExportCollapsed', on ? '1' : '');
  }

  function buildPanel() {
    var style = document.createElement('style');
    style.textContent =
      'html.cse-panel-open{margin-right:' + PANEL_WIDTH + 'px!important}' +
      '#cse-panel{position:fixed;top:0;right:0;bottom:0;width:' + PANEL_WIDTH + 'px;z-index:2147483647;box-sizing:border-box;' +
      'background:#111827;color:#e5e7eb;font:13px/1.4 system-ui,sans-serif;border-left:1px solid #374151;' +
      'display:flex;flex-direction:column;box-shadow:-4px 0 16px rgba(0,0,0,.25)}' +
      '#cse-panel *{box-sizing:border-box}' +
      '#cse-panel.cse-collapsed{width:auto;bottom:auto;top:50%;transform:translateY(-50%);border-radius:6px 0 0 6px}' +
      '#cse-panel.cse-collapsed .cse-body,#cse-panel.cse-collapsed .cse-title{display:none}' +
      '#cse-panel .cse-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #374151}' +
      '#cse-panel.cse-collapsed .cse-head{border:0;padding:6px}' +
      '#cse-panel .cse-title{font-weight:600;font-size:14px}' +
      '#cse-panel .cse-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:14px}' +
      '#cse-panel section{display:flex;flex-direction:column;gap:8px}' +
      '#cse-panel h3{margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:600}' +
      '#cse-panel .cse-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
      '#cse-panel button{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:6px 10px;cursor:pointer;font:inherit}' +
      '#cse-panel button:disabled{opacity:.4;cursor:default}' +
      '#cse-panel button.cse-stop{background:#dc2626}' +
      '#cse-panel button.cse-resume{background:#16a34a}' +
      '#cse-panel button.cse-ghost{background:#374151}' +
      '#cse-panel input,#cse-panel select{font:inherit;padding:4px 6px;border-radius:4px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;width:100%}' +
      '#cse-panel label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#9ca3af}' +
      '#cse-panel dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0}' +
      '#cse-panel dt{color:#9ca3af}#cse-panel dd{margin:0;font-variant-numeric:tabular-nums}' +
      '#cse-job-state[data-state=running]{color:#60a5fa}#cse-job-state[data-state=paused]{color:#fbbf24}#cse-job-state[data-state=done]{color:#4ade80}' +
      '#cse-job-current:empty,#cse-job-note:empty{display:none}' +
      '#cse-job-note{color:#fbbf24;font-size:12px}' +
      '#cse-job-log{list-style:none;margin:0;padding:6px 8px;max-height:220px;overflow:auto;background:#1f2937;border-radius:4px;font-size:12px}' +
      '#cse-job-log:empty{display:none}#cse-job-log a{color:#93c5fd}' +
      'button.cse-export-row{background:#2563eb;color:#fff;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;font:12px system-ui,sans-serif}';
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'cse-panel';
    panel.innerHTML =
      '<div class="cse-head"><span class="cse-title">Export</span>' +
      '<button type="button" id="cse-toggle" class="cse-ghost" title="Ein-/Ausklappen">⇔</button></div>' +
      '<div class="cse-body">' +
      '<section><h3>Aktuelle Seite</h3>' +
      '<div id="cse-page-count">0 Zeilen</div>' +
      '<div class="cse-row"><button type="button" id="cse-page-csv">CSV</button><button type="button" id="cse-page-json">JSON</button></div></section>' +
      '<section><h3>Export-Job (alle Seiten)</h3>' +
      '<label>Format <select id="cse-format"><option value="csv">CSV</option><option value="json">JSON</option></select></label>' +
      '<div class="cse-row">' +
      '<button type="button" id="cse-start">Start</button>' +
      '<button type="button" id="cse-stop" class="cse-stop" title="Anhalten und aktuellen Stand herunterladen">Stop</button>' +
      '<button type="button" id="cse-resume" class="cse-resume">Weiter</button></div>' +
      '<div class="cse-row"><button type="button" id="cse-download" class="cse-ghost">Download</button>' +
      '<button type="button" id="cse-reset" class="cse-ghost">Neu</button>' +
      '<button type="button" id="cse-diag" class="cse-ghost" title="Infos zur Seitennavigation kopieren">Diagnose kopieren</button></div>' +
      '<dl><dt>Status</dt><dd id="cse-job-state">kein Job</dd>' +
      '<dt>Seiten</dt><dd id="cse-job-pages">0</dd>' +
      '<dt>Letzte Seite</dt><dd id="cse-job-last">unbekannt</dd>' +
      '<dt>Zeilen</dt><dd id="cse-job-rows">0</dd></dl>' +
      '<div id="cse-job-current"></div>' +
      '<div id="cse-job-note"></div>' +
      '<ol id="cse-job-log"></ol></section>' +
      '<section><h3>Einstellungen</h3>' +
      '<label>Max. Seiten pro Lauf <input id="cse-max" type="number" min="1"></label>' +
      '<label>Zeilen-Selektor <input id="cse-sel"></label>' +
      '<label>Seiten-Parameter in der URL <input id="cse-param"></label></section>' +
      '</div>';
    document.body.appendChild(panel);

    $('cse-format').value = load('cseExportFormat', 'csv');
    $('cse-format').addEventListener('change', function () { save('cseExportFormat', getFormat()); });

    var sel = $('cse-sel');
    sel.value = getSelector();
    sel.addEventListener('change', function () {
      save('cseExportSelector', sel.value.trim() || DEFAULT_SELECTOR);
      document.querySelectorAll('[' + MARK + ']:not(iframe)').forEach(function (n) { n.remove(); });
      decorate();
    });
    var param = $('cse-param');
    param.value = getPageParam();
    param.addEventListener('change', function () { save('cseExportPageParam', param.value.trim() || 'page'); });
    var max = $('cse-max');
    max.value = getMaxPages();
    max.addEventListener('change', function () { save('cseExportMaxPages', String(parseInt(max.value, 10) || DEFAULT_MAX_PAGES)); });

    $('cse-toggle').addEventListener('click', function () { setCollapsed(!panel.classList.contains('cse-collapsed')); });
    $('cse-page-csv').addEventListener('click', function () { exportAll('csv'); });
    $('cse-page-json').addEventListener('click', function () { exportAll('json'); });
    $('cse-start').addEventListener('click', startJob);
    $('cse-stop').addEventListener('click', stopJob);
    $('cse-resume').addEventListener('click', runJob);
    $('cse-download').addEventListener('click', downloadJob);
    $('cse-reset').addEventListener('click', resetJob);
    $('cse-diag').addEventListener('click', copyDiagnostics);

    window.addEventListener('beforeunload', function (e) {
      if (job && job.state === 'running') { e.preventDefault(); e.returnValue = ''; }
    });

    setCollapsed(load('cseExportCollapsed', '') === '1');
    renderJob();
  }

  function init() {
    buildPanel();
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
