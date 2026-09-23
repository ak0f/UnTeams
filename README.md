<div align="center">

# UnTeams

**Eigene Microsoft-Teams-Nachrichten automatisch löschen.**

Für die Teams-Desktop-App.

[![Download](https://img.shields.io/github/v/release/ak0f/UnTeams?label=Download\&style=for-the-badge\&color=c4314b)](https://github.com/ak0f/UnTeams/releases/latest/download/UnTeams.zip)
 
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=for-the-badge\&logo=windows)
 
![Lizenz](https://img.shields.io/github/license/ak0f/UnTeams?style=for-the-badge)

<img src="docs/screenshot.png" alt="UnTeams in Microsoft Teams" width="420">

</div>

---

## Funktionen

* Läuft direkt in der Teams-Desktop-App
* Löscht nur eigene Nachrichten
* Ein Chat oder mehrere ausgewählte Chats
* Vorschau vor dem Löschen
* Text- und Regex-Filter
* Filter nach Zeitraum
* Filter für Links und Anhänge
* Einstellbare Geschwindigkeit
* Automatische Pause bei langsamen Antworten von Teams
* Fortschritt und Log
* Jederzeit abbrechbar
* Helles und dunkles Teams-Design

## Download

**Voraussetzungen:** Windows 10/11, neues Microsoft Teams und Node.js 22 LTS oder neuer.

1. [UnTeams.zip herunterladen](https://github.com/ak0f/UnTeams/releases/latest/download/UnTeams.zip)
2. ZIP-Datei entpacken
3. [Node.js LTS](https://nodejs.org) installieren, falls noch nicht vorhanden
4. `UnTeams.bat` starten

Teams wird dabei neu gestartet. Nach dem Laden erscheint unten rechts der UnTeams-Button.

Das schwarze Terminal-Fenster muss geöffnet bleiben. Es kann minimiert werden.

> Windows SmartScreen kann beim Start der `.bat`-Datei eine Warnung anzeigen. Der Quellcode ist öffentlich einsehbar.

## Verwendung

1. Teams öffnen und einen Chat auswählen.
2. Auf den UnTeams-Button klicken.
3. Einen Chat auswählen oder mehrere Chats laden.
4. Filter setzen, falls benötigt.
5. `Vorschau` starten.
6. Prüfen, welche Nachrichten gefunden wurden.
7. `Löschen starten` auswählen und bestätigen.

Mit `Stopp` kann der Vorgang beendet werden.

### Filter

| Filter             | Beschreibung                         |
| ------------------ | ------------------------------------ |
| Text enthält       | Sucht nach einem bestimmten Text     |
| Regex              | Verwendet einen regulären Ausdruck   |
| Von / Bis          | Begrenzt den Zeitraum                |
| Nur mit Link       | Nur Nachrichten mit einem Link       |
| Nur mit Datei/Bild | Nur Nachrichten mit Anhang oder Bild |

Beispiel:

```regex
^(ok|jo|ja)$
```

### Geschwindigkeit

Standardmässig wartet UnTeams 1200 ms zwischen zwei Löschvorgängen.

Wenn Teams nicht mehr reagiert, wird die Pause automatisch erhöht. Fehlgeschlagene Aktionen werden bis zu drei Mal wiederholt.

## Funktionsweise

Das neue Teams verwendet Microsoft Edge WebView2.

`UnTeams.bat` startet Teams mit einem lokalen Debug-Port (`127.0.0.1:9222`) und fügt anschliessend das UnTeams-Script in die Teams-Oberfläche ein.

Der Ablauf entspricht dem manuellen Löschen:

```text
Chat öffnen
    ↓
Eigene Nachrichten finden
    ↓
Nachricht prüfen
    ↓
Löschen
    ↓
Nächste Nachricht
```

UnTeams verwendet keinen kopierten Token und keine eigene API. Die Aktionen werden über die Teams-Oberfläche ausgeführt.

## Probleme

<details>
<summary><b>Der UnTeams-Button erscheint nicht</b></summary>

* Warten, bis Teams vollständig geladen ist.
* Prüfen, ob das Terminal noch geöffnet ist.
* Teams vollständig beenden und `UnTeams.bat` erneut starten.

</details>

<details>
<summary><b>„Teams hat keinen Debug-Port geöffnet“</b></summary>

Teams lief wahrscheinlich noch im Hintergrund.

Im Task-Manager alle `ms-teams.exe` Prozesse beenden und `UnTeams.bat` erneut starten.

</details>

<details>
<summary><b>„Node.js fehlt“</b></summary>

[Node.js LTS](https://nodejs.org) installieren und `UnTeams.bat` erneut starten.

</details>

<details>
<summary><b>Einige Nachrichten wurden übersprungen</b></summary>

Nicht jede Nachricht kann über die Teams-Oberfläche gelöscht werden. Dazu gehören unter anderem bestimmte System- und Besprechungsnachrichten.

Bei vielen Fehlern die Geschwindigkeit reduzieren und den Vorgang erneut starten.

</details>

<details>
<summary><b>Funktioniert UnTeams im Browser?</b></summary>

Nein. UnTeams ist für das neue Microsoft Teams als Desktop-App entwickelt.

Teams Classic wird ebenfalls nicht unterstützt.

</details>

<details>
<summary><b>Wird das Löschen für andere Personen angezeigt?</b></summary>

Ja. Teams zeigt bei einer gelöschten Nachricht den entsprechenden Hinweis an.

</details>

## Sicherheit

* Der Debug-Port ist nur über `127.0.0.1` erreichbar.
* UnTeams verwendet keinen eigenen Server.
* Es werden keine Daten übertragen oder gespeichert.
* Der Debug-Port wird mit dem Beenden von Teams geschlossen.
* Gelöschte Nachrichten können nicht über UnTeams wiederhergestellt werden.
* Bei Schul- und Firmenkonten können Aufbewahrungsrichtlinien gelten.

Wenn Teams geändert wird, können Funktionen von UnTeams ausfallen. Fehler können über die [Issues](https://github.com/ak0f/UnTeams/issues) gemeldet werden.

## Entwicklung

```text
UnTeams/
├── UnTeams.bat
├── launcher/
│   └── launch.mjs
├── src/
│   ├── teams.js
│   ├── deleter.js
│   ├── ui.js
│   ├── ui.css
│   ├── utils.js
│   └── main.js
├── build.js
└── dist/
    └── unteams.js
```

Build:

```bash
node build.js
```

Start:

```bash
node launcher/launch.mjs
```

Die Teams-spezifischen Selektoren befinden sich in [`src/teams.js`](src/teams.js).

## Credits

Inspiriert von [Undiscord](https://github.com/victornpb/undiscord) von victornpb.

## Lizenz

[MIT](LICENSE)

UnTeams ist kein offizielles Microsoft-Produkt und nicht mit Microsoft verbunden.
