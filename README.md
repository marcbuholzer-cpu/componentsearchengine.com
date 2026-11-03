# CSE Export Proxy

Reverse Proxy für componentsearchengine.com. Jede Ergebniszeile bekommt einen
"Export"-Button (CSV). Das Panel am rechten Rand (einklappbar) exportiert die
aktuelle Seite oder steuert einen Export-Job über alle Ergebnisseiten (CSV oder JSON).

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

## Export-Job (mehrere Seiten)

Im Panel rechts unter "Export-Job":

| Button     | Wirkung |
|------------|---------|
| Start      | Startet auf der aktuellen Seite und folgt dem Link zur nächsten Seite. |
| Stop       | Hält sofort an und lädt den bisherigen Stand herunter. |
| Weiter     | Setzt ab der nächsten noch nicht exportierten Seite fort. |
| Download   | Lädt den aktuellen Stand erneut herunter (Format umschaltbar). |
| Neu        | Verwirft den Job. |

* Angezeigt werden Status (läuft, pausiert, fertig), Anzahl Seiten und Zeilen
  sowie ein Log pro Seite.
* "Max. Seiten pro Lauf" (Default 20): danach pausiert der Job, lädt den Stand
  herunter, und "Weiter" setzt fort. Gleiches bei Ladefehlern.
* Am Ende wird die Datei automatisch heruntergeladen. Sie enthält die Spalte `Seite`.
* Der Job lebt im geöffneten Tab. Neu laden oder wegnavigieren verwirft ihn
  (während er läuft, fragt der Browser nach).
* Der Weiter-Link wird automatisch erkannt (`rel="next"` oder Linktext wie
  "Next", "Weiter", "Nächste Seite", "›", "»"). Falls das nicht greift, im Feld
  "Weiter-Link-Selektor" einen CSS-Selektor eintragen, z. B. `.pagination a.next`.
* Jede Seite wird über den Proxy in einem unsichtbaren iframe geladen, damit auch
  per JavaScript gerenderte Ergebnisse erfasst werden.
* Seiten, die nur per JavaScript-Button ohne echten Link blättern, werden nicht unterstützt.

## Funktionsweise

`server.js` leitet alle Requests an den Upstream weiter, entpackt gzip/br/deflate,
schreibt absolute Upstream-URLs, Redirects und Cookies auf den Proxy um, entfernt
CSP/X-Frame-Options/HSTS und injiziert `public/inject.js` in HTML-Seiten.
