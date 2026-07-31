# Voidrix Launcher

Ein Game- und App-Launcher im Stil des Epic Games Launchers — nur eben für **Voidrix**.
Gebaut mit Electron, komplett offline, alle Daten bleiben auf dem eigenen PC.

* **Konten**: Registrieren mit Benutzername, Profilname, Passwort + Wiederholung. Wer sich einmal
  angemeldet hat, bleibt auch nach einem Neustart des Launchers angemeldet.
* **Store & Bibliothek**: Hero-Karussell, Karten mit Cover, Detailseiten mit Banner, Screenshots und Infos.
* **Starten**: In `Games-Apps.json` steht bei jedem Titel der Pfad zur `.exe`. Existiert die Datei,
  gilt der Titel als installiert und lässt sich mit einem Klick starten.
* **Admin**: Games und Apps direkt im Launcher hochladen — mit Banner, Cover, Profilbild,
  Beschreibung, Tags, Version, Größe und allem Drum und Dran.
* **.exe**: Über `electron-builder` entsteht ein Windows-Installer und eine portable `.exe`.

---

## Schnellstart

```bash
npm install     # Abhängigkeiten laden (erzeugt auch build/icon.png)
npm start       # Launcher starten
```

Beim ersten Start wird automatisch der Administrator-Zugang angelegt:

| Feld         | Wert            |
| ------------ | --------------- |
| Benutzername | `adminpass`     |
| Passwort     | `PaulPass21.21` |

> Das Passwort lässt sich im Launcher unter **Einstellungen → Passwort ändern** jederzeit ändern —
> empfohlen, sobald mehrere Leute den Launcher benutzen.

## Windows-.exe bauen

```bash
npm run dist        # Installer (NSIS) + portable .exe -> Ordner dist/
npm run dist:win    # dasselbe, explizit für Windows
npm run pack        # nur entpacktes Verzeichnis, ohne Installer
```

Ergebnis in `dist/`:

* `Voidrix-Launcher-Setup-1.0.0.exe` – Installer mit Desktop- und Startmenü-Verknüpfung
* `Voidrix-Launcher-1.0.0-portable.exe` – läuft ohne Installation

Der Windows-Build muss auf Windows laufen (oder in einer Windows-VM/CI); Linux und macOS gehen über
`npm run dist:linux` bzw. `npm run dist:mac`.

---

## Games-Apps.json

Das Herzstück: hier stehen alle Titel und vor allem der Pfad zur Programmdatei.

**Wo liegt die Datei?**

| Situation                 | Ort                                                  |
| ------------------------- | ---------------------------------------------------- |
| Entwicklung (`npm start`) | `Games-Apps.json` im Projektordner                    |
| Portable `.exe`           | `Games-Apps.json` neben der `.exe` (falls vorhanden)  |
| Installierte Version      | `%APPDATA%\Voidrix Launcher\Games-Apps.json`          |

Der genaue Pfad steht immer unter **Einstellungen → Games-Apps.json**; von dort lässt sich die Datei
auch direkt öffnen. Wer möchte, setzt die Umgebungsvariable `VOIDRIX_CATALOG` auf einen eigenen Pfad.

**Aufbau**

```json
{
  "version": 1,
  "apps": [
    {
      "id": "voidrix-arena",
      "title": "Voidrix Arena",
      "type": "game",
      "developer": "Voidrix Studios",
      "publisher": "Voidrix",
      "shortDescription": "Schneller Arena-Shooter.",
      "description": "Längerer Text.\nZeilenumbrüche bleiben erhalten.",
      "banner": "media/arena-banner.png",
      "cover": "media/arena-cover.png",
      "icon": "media/arena-icon.png",
      "screenshots": ["media/shot1.png", "media/shot2.png"],
      "tags": ["Action", "Multiplayer"],
      "version": "1.4.2",
      "size": "24 GB",
      "releaseDate": "2026-03-18",
      "price": "Kostenlos",
      "exePath": "C:\\Games\\VoidrixArena\\Arena.exe",
      "args": ["-fullscreen"],
      "workingDir": "",
      "website": "https://voidrix.gg",
      "featured": true,
      "accentColor": "#8b5cf6"
    }
  ]
}
```

**Felder**

| Feld                        | Bedeutung                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `id`                        | Eindeutige Kennung. Fehlt sie, wird sie automatisch erzeugt.                         |
| `title`                     | Angezeigter Name (Pflicht).                                                          |
| `type`                      | `game` oder `app`.                                                                   |
| `exePath`                   | **Der Pfad zur `.exe`.** Backslashes in JSON doppelt schreiben: `C:\\Spiele\\x.exe`   |
| `args`                      | Startparameter als Liste, z. B. `["-fullscreen", "-novid"]`.                          |
| `workingDir`                | Arbeitsverzeichnis; leer = Ordner der `.exe`.                                         |
| `banner` / `cover` / `icon` | Bilder: `media/datei.png`, absoluter Pfad oder `https://…`                            |
| `screenshots`               | Liste weiterer Bilder für die Detailseite.                                            |
| `featured`                  | `true` = erscheint im Hero-Karussell des Stores.                                      |
| `accentColor`               | Akzentfarbe für Karten und Hintergründe, z. B. `#22d3ee`.                              |
| `tags`, `version`, `size`, `price`, `releaseDate`, `developer`, `publisher`, `website` | reine Anzeigedaten |

**Installiert oder nicht?** Der Launcher prüft schlicht, ob die Datei unter `exePath` existiert.
Ist das Feld leer, zeigt die Karte „Kein Pfad“ und bietet den Knopf **Pfad festlegen** an — der
gewählte Pfad wird sofort in `Games-Apps.json` gespeichert.

Statt eines Dateipfads sind auch Protokoll-Links erlaubt, etwa `steam://rungameid/440` oder
`com.epicgames.launcher://apps/...`.

---

## Konten

* **Registrieren**: Benutzername (3–20 Zeichen), Profilname, Passwort (min. 6 Zeichen) + Wiederholung.
* **Gespeichert** werden alle Konten in `accounts.json` im Benutzerdaten-Ordner
  (`%APPDATA%\Voidrix Launcher\`). Passwörter liegen dort ausschließlich als **scrypt-Hash** mit
  zufälligem Salt — niemals im Klartext.
* **Angemeldet bleiben**: Beim Login wird ein Sitzungs-Token erzeugt und in `session.json` abgelegt.
  Beim nächsten Start meldet der Launcher automatisch wieder an. Über **Abmelden** wird das Token
  verworfen.
* Das allererste selbst angelegte Konto wird automatisch Administrator (zusätzlich zu `adminpass`).

## Als Administrator hochladen

Im Bereich **Hochladen**:

1. Grunddaten ausfüllen (Titel, Typ, Entwickler, Beschreibung, Version, Größe, Tags …).
2. Bilder wählen — Banner (16:9), Cover (3:4), Profilbild und beliebig viele Screenshots.
   Gewählte Dateien werden in den Ordner `media/` kopiert, alternativ funktioniert eine `https://`-URL.
3. Pfad zur `.exe` setzen (Dateidialog oder von Hand eintippen), optional Startparameter.
4. Akzentfarbe wählen und bei Bedarf „Im Hero-Karussell zeigen“ ankreuzen.
5. **Jetzt hochladen** — der Eintrag landet direkt in `Games-Apps.json`.

Rechts läuft eine Live-Vorschau der Store-Karte mit. Bestehende Einträge lassen sich unten in der
Liste bearbeiten oder löschen; unter **Benutzer** verwaltet man Konten und Rollen.

## Tastenkürzel

| Taste             | Funktion                       |
| ----------------- | ------------------------------ |
| `Strg` + `F`      | Suchfeld fokussieren           |
| `Esc`             | Detailseite / Dialog schließen |
| `F5` / `Strg`+`R` | Oberfläche neu laden           |
| `F12`             | Entwicklerwerkzeuge            |

---

## Projektstruktur

```
Voidrix-Launcher/
├── Games-Apps.json          # Katalog: Titel + Pfade zu den .exe-Dateien
├── package.json             # Skripte und electron-builder-Konfiguration
├── scripts/make-icon.js     # erzeugt build/icon.png ohne externe Pakete
└── src/
    ├── main/                # Electron-Hauptprozess
    │   ├── main.js          # Fenster, Protokolle (app://, vximg://), IPC
    │   ├── preload.js       # sichere Brücke zum UI (contextBridge)
    │   ├── store.js         # Pfade + atomares Lesen/Schreiben der JSON-Dateien
    │   ├── auth.js          # Konten, scrypt-Hashes, Sitzungen
    │   └── library.js       # Katalog, Medien-Import, Programmstart
    └── renderer/            # Oberfläche
        ├── index.html
        ├── styles/          # theme.css, components.css, views.css
        └── js/              # app.js, state.js, auth.js, views/*
```

**Sicherheit**: Das UI läuft mit `contextIsolation`, ohne Node-Zugriff und mit strenger CSP.
Sämtliche Dateizugriffe und Programmstarts passieren im Hauptprozess; Admin-Aktionen werden dort
anhand der angemeldeten Rolle geprüft, nicht im UI.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
