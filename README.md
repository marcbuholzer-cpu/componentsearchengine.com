# CSE Export Proxy

Reverse Proxy für componentsearchengine.com. Jede Ergebniszeile bekommt einen
"Export"-Button (CSV). Die Leiste unten rechts exportiert die aktuelle Seite
oder alle Ergebnisseiten auf einmal (CSV oder JSON).

## Start

Node 18 oder neuer, keine Abhängigkeiten.

```bash
npm start
```

Dann öffnen: http://localhost:3030/search?term=schurter (oder http://localhost:3030/__start)

## Konfiguration (Umgebungsvariablen)

| Variable     | Default                             |
|--------------|-------------------------------------|
| `PORT`       | `3030`                              |
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

## Mehrere Seiten

"Alle Seiten CSV/JSON" startet auf der aktuellen Seite und folgt dem Link zur
nächsten Seite, bis keiner mehr da ist oder "Max. Seiten" (Default 20) erreicht ist.
Das Ergebnis ist eine Datei mit zusätzlicher Spalte `Seite`.

* Der Weiter-Link wird automatisch erkannt (`rel="next"` oder Linktext wie
  "Next", "Weiter", "Nächste Seite", "›", "»"). Falls das nicht greift, im Feld
  "Weiter-Link" einen CSS-Selektor eintragen, z. B. `.pagination a.next`.
* Jede Seite wird über den Proxy in einem unsichtbaren iframe geladen, damit auch
  per JavaScript gerenderte Ergebnisse erfasst werden.
* Seiten, die nur per JavaScript-Button ohne echten Link blättern, werden nicht unterstützt.

## Funktionsweise

`server.js` leitet alle Requests an den Upstream weiter, entpackt gzip/br/deflate,
schreibt absolute Upstream-URLs, Redirects und Cookies auf den Proxy um, entfernt
CSP/X-Frame-Options/HSTS und injiziert `public/inject.js` in HTML-Seiten.
