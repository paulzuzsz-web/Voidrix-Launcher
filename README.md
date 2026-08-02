# Voidrix Launcher

Ein Game- und App-Launcher im Stil des Epic Games Launchers — nur eben für **Voidrix**.
Gebaut mit Electron, komplett offline, alle Daten bleiben auf dem eigenen PC.

* **Eigener Datenordner**: Beim ersten Start wählt man einen Ordner — dort legt der Launcher seine
  komplette Struktur an (Katalog, Konten, Bilder, Sicherungen).
* **Konten**: Registrieren mit Benutzername, Profilname, Passwort + Wiederholung. Wer sich einmal
  angemeldet hat, bleibt auch nach einem Neustart des Launchers angemeldet.
* **Store & Bibliothek**: Hero-Karussell, Karten mit Cover, Detailseiten mit Banner, Screenshots und Infos.
* **Hochladen statt verlinken**: Die `.exe` oder gleich den ganzen Spiel-Ordner hochladen — die
  Dateien werden nach `spiele/` kopiert und von dort gestartet. Wer will, verknüpft stattdessen
  einfach den Pfad, wo das Spiel schon liegt.
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

Beim allerersten Start kommt zuerst die **Ersteinrichtung**: Datenordner auswählen (siehe unten),
danach der Login. Der Administrator-Zugang wird dabei automatisch angelegt:

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

Der Installer fragt wie gewohnt nach dem **Programmordner**. Wohin die *Daten* kommen, entscheidest
du beim ersten Start im Launcher selbst.

---

## Datenordner

Beim ersten Start fragt der Launcher, wo seine Daten liegen sollen (Vorschlag:
`Dokumente\Voidrix Launcher`). Der Ordner wird angelegt, falls es ihn noch nicht gibt, und bekommt
diese Struktur:

```
<dein Ordner>/
├── Games-Apps.json      Katalog: alle Titel + Pfade zu den .exe-Dateien
├── konten/              accounts.json (Konten) und session.json (Anmeldung)
├── media/               hochgeladene Bilder, nach Art sortiert
│   ├── banner/          Banner 16:9 für Hero und Detailseite
│   ├── cover/           Cover 3:4 für die Store-Karten
│   ├── icons/           Logos / Profilbilder der Titel
│   ├── screenshots/     Screenshots der Detailseite
│   └── profilbilder/    Profilbilder der Benutzer
├── spiele/              hochgeladene Spiele und Apps (ein Ordner je Titel)
├── sicherungen/         automatische Kopien der Games-Apps.json
└── LIESMICH.txt         kurze Erklärung im Ordner selbst
```

Alle Pfade stehen im Launcher unter **Einstellungen** und lassen sich dort einzeln öffnen.

**Ordner wechseln**: Einstellungen → *Datenordner* → **Ändern** (nur als Admin). Katalog, Konten und
Bilder werden in den neuen Ordner kopiert, danach startet der Launcher neu. Die Dateien im alten
Ordner bleiben als Kopie liegen.

Gemerkt wird der Ort in `location.json` unter `%APPDATA%\Voidrix Launcher\`. Wer schon eine ältere
Version benutzt hat oder die portable `.exe` mit einer `Games-Apps.json` daneben startet, wird nicht
gefragt — der vorhandene Ordner wird einfach übernommen.

---

## Games-Apps.json

Das Herzstück: hier stehen alle Titel und vor allem der Pfad zur Programmdatei. Die Datei liegt im
Datenordner und lässt sich unter **Einstellungen → Games-Apps.json** direkt öffnen. Wer möchte, setzt
die Umgebungsvariable `VOIDRIX_CATALOG` auf einen eigenen Pfad.

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
      "banner": "media/banner/arena.png",
      "cover": "media/cover/arena.png",
      "icon": "media/icons/arena.png",
      "screenshots": ["media/screenshots/shot1.png", "media/screenshots/shot2.png"],
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
| `exePath`                   | **Der Pfad zur `.exe`.** Hochgeladene Titel stehen relativ zum Datenordner (`spiele/arena/Arena.exe`), verknüpfte absolut — Backslashes in JSON doppelt: `C:\\Spiele\\x.exe` |
| `args`                      | Startparameter als Liste, z. B. `["-fullscreen", "-novid"]`.                          |
| `workingDir`                | Arbeitsverzeichnis; leer = Ordner der `.exe`.                                         |
| `banner` / `cover` / `icon` | Bilder: `media/banner/datei.png`, absoluter Pfad oder `https://…`                     |
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
* **Gespeichert** werden alle Konten in `konten/accounts.json` im gewählten Datenordner.
  Passwörter liegen dort ausschließlich als **scrypt-Hash** mit zufälligem Salt — niemals im Klartext.
* **Angemeldet bleiben**: Beim Login wird ein Sitzungs-Token erzeugt und in `konten/session.json` abgelegt.
  Beim nächsten Start meldet der Launcher automatisch wieder an. Über **Abmelden** wird das Token
  verworfen.
* Das allererste selbst angelegte Konto wird automatisch Administrator (zusätzlich zu `adminpass`).

## Als Administrator hochladen

Im Bereich **Hochladen**:

1. Grunddaten ausfüllen (Titel, Typ, Entwickler, Beschreibung, Version, Größe, Tags …).
2. Bilder wählen — Banner (16:9), Cover (3:4), Profilbild und beliebig viele Screenshots.
   Gewählte Dateien landen im passenden Unterordner von `media/`, alternativ funktioniert eine
   `https://`-URL.
3. Programmdatei festlegen — drei Wege:
   * **`.exe` hochladen** — kopiert die Datei nach `spiele/<titel>/`.
   * **Ordner hochladen** — kopiert einen kompletten Spiel-Ordner (mit DLLs, Assets …) dorthin.
     Liegen mehrere `.exe` darin, fragt der Launcher, welche startet. Während des Kopierens läuft
     eine Fortschrittsanzeige; bei zu wenig Speicherplatz bricht er vorher ab.
   * **Nur verknüpfen** — merkt sich bloß den Pfad, wo das Spiel schon liegt.

   Dazu optional Startparameter und Arbeitsverzeichnis.
4. Akzentfarbe wählen und bei Bedarf „Im Hero-Karussell zeigen“ ankreuzen.
5. **Jetzt hochladen** — der Eintrag landet direkt in `Games-Apps.json`.

Rechts läuft eine Live-Vorschau der Store-Karte mit. Bestehende Einträge lassen sich unten in der
Liste bearbeiten oder löschen; beim Löschen eines hochgeladenen Titels fragt der Launcher, ob die
Dateien in `spiele/` mitgelöscht werden sollen. Unter **Benutzer** verwaltet man Konten und Rollen.

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
    │   ├── store.js         # Datenordner, Struktur, Umzug, atomares JSON-Schreiben
    │   ├── auth.js          # Konten, scrypt-Hashes, Sitzungen
    │   └── library.js       # Katalog, Medien-Import, Programmstart
    └── renderer/            # Oberfläche
        ├── index.html
        ├── styles/          # theme.css, components.css, views.css
        └── js/              # app.js, setup.js, state.js, auth.js, views/*
```

**Sicherheit**: Das UI läuft mit `contextIsolation`, ohne Node-Zugriff und mit strenger CSP.
Sämtliche Dateizugriffe und Programmstarts passieren im Hauptprozess; Admin-Aktionen werden dort
anhand der angemeldeten Rolle geprüft, nicht im UI.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
