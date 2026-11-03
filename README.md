# CSE Export Proxy

Reverse Proxy für componentsearchengine.com. Jede Ergebniszeile bekommt einen
"Export"-Button (CSV), unten rechts gibt es "Alle als CSV" und "Alle als JSON".

## Start

Node 18 oder neuer, keine Abhängigkeiten.

```bash
npm start
```

Dann öffnen: http://localhost:3000/search?term=schurter (oder http://localhost:3000/__start)

## Konfiguration (Umgebungsvariablen)

| Variable     | Default                             |
|--------------|-------------------------------------|
| `PORT`       | `3000`                              |
| `UPSTREAM`   | `https://componentsearchengine.com` |
| `START_PATH` | `/search?term=schurter`             |

## Export

* CSV mit `;` als Trenner und UTF-8 BOM (öffnet direkt korrekt in Excel DE/CH).
* Spaltennamen kommen aus dem Tabellenkopf, zusätzlich Spalte `Links` mit allen
  Links der Zeile (auf die Original-Domain zurückgeschrieben).
* Zeilen werden per CSS-Selektor gefunden (Default `table tbody tr, table tr`).
  Falls die Seite keine Tabelle nutzt, Selektor im Eingabefeld der Toolbar
  anpassen (wird im Browser gespeichert).
* Per JavaScript nachgeladene Zeilen werden automatisch erkannt.
* Exportiert wird, was auf der aktuellen Seite angezeigt ist (bei Pagination pro Seite).

## Funktionsweise

`server.js` leitet alle Requests an den Upstream weiter, entpackt gzip/br/deflate,
schreibt absolute Upstream-URLs, Redirects und Cookies auf den Proxy um, entfernt
CSP/X-Frame-Options/HSTS und injiziert `public/inject.js` in HTML-Seiten.
