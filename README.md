# CSE Export (Userscript)

Userscript für componentsearchengine.com. Es läuft direkt im eigenen Browser auf
der echten Seite, die Cloudflare-Sicherheitsprüfung bestehst du also ganz normal.

* Jede Ergebniszeile bekommt einen "Export"-Button (CSV).
* Panel am rechten Rand (einklappbar mit ⇔): Export der aktuellen Seite und ein
  Export-Job über alle Ergebnisseiten (CSV oder JSON).

## Installation

1. Browser-Erweiterung [Tampermonkey](https://www.tampermonkey.net/) installieren.
2. Chrome/Edge: in den Details der Erweiterung "Nutzerskripts zulassen" aktivieren
   (bei älteren Versionen stattdessen den Entwicklermodus unter `chrome://extensions`).
3. Tampermonkey Dashboard öffnen, "+" (neues Skript), den gesamten Inhalt von
   [`cse-export.user.js`](cse-export.user.js) einfügen und speichern.
4. https://componentsearchengine.com/search?term=schurter öffnen.

## Export-Job (mehrere Seiten)

| Button     | Wirkung |
|------------|---------|
| Start      | Startet auf der aktuellen Seite und lädt danach `page=2`, `page=3` usw. |
| Stop       | Hält sofort an und lädt den bisherigen Stand herunter. |
| Weiter     | Setzt ab der nächsten noch nicht exportierten Seite fort. |
| Download   | Lädt den aktuellen Stand erneut herunter (Format umschaltbar). |
| Neu        | Verwirft den Job. |
| Diagnose kopieren | Kopiert Seitenzahlen, Job-Log und das HTML der Seitennavigation in die Zwischenablage (zur Fehlersuche). |

* Angezeigt werden Status (läuft, pausiert, fertig), exportierte Seiten, letzte
  bekannte Seite, Anzahl Zeilen sowie ein Log pro Seite.
* Das Ende wird über die höchste Seitenzahl in den Links der Seitennavigation
  erkannt. Ohne solche Links endet der Job, sobald eine Seite die vorherige
  wiederholt, oder er pausiert bei einer leeren Seite.
* Start auf einer beliebigen Seite möglich (z. B. `page=3`), die Spalte `Seite`
  enthält die echte Seitennummer.
* "Max. Seiten pro Lauf" (Default 20): danach pausiert der Job, lädt den Stand
  herunter, und "Weiter" setzt fort. Gleiches bei Ladefehlern.
* Liefert eine Seite keine Zeilen (Ende der Ergebnisse oder erneute
  Sicherheitsprüfung), pausiert der Job und lädt den Stand herunter. Falls es
  nicht das Ende ist: Seite einmal im Tab öffnen, Prüfung bestehen, "Weiter" klicken.
* Am Ende wird die Datei automatisch heruntergeladen. Sie enthält die Spalte `Seite`.
* Der Job lebt im geöffneten Tab. Neu laden oder wegnavigieren verwirft ihn
  (während er läuft, fragt der Browser nach).
* Weitere Seiten werden in einem unsichtbaren iframe geladen (erfasst auch per
  JavaScript gerenderte Ergebnisse). Verbietet die Seite das, wird automatisch
  per `fetch` geladen.

## Export-Format

* CSV mit `;` als Trenner und UTF-8 BOM (öffnet direkt korrekt in Excel DE/CH).
* Spaltennamen aus dem Tabellenkopf, zusätzlich Spalte `Links` mit allen Links der Zeile.

## Einstellungen im Panel

* **Zeilen-Selektor** (Default `table tbody tr, table tr`): anpassen, falls die
  Ergebnisse keine Tabelle sind.
* **Seiten-Parameter in der URL** (Default `page`): Name des Parameters für die Seitennummer.
