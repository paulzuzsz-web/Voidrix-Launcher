# Voidrix Launcher

Ein Game- und App-Launcher im Stil des Epic Games Launchers — nur eben für **Voidrix**.
Gebaut mit Electron, komplett offline, alle Daten bleiben auf dem eigenen PC.

* **Eigener Datenordner**: Beim ersten Start wählt man einen Ordner — dort legt der Launcher seine
  komplette Struktur an (Katalog, Konten, Bilder, Sicherungen).
* **Konten**: Registrieren mit Benutzername, Profilname, Passwort + Wiederholung. Wer sich einmal
  angemeldet hat, bleibt auch nach einem Neustart des Launchers angemeldet.
* **Store & Bibliothek**: Hero-Karussell, Karten mit Cover, Detailseiten mit Banner, Screenshots und Infos.
* **Gemeinsamer Store**: Was ein Admin veröffentlicht, erscheint bei allen anderen automatisch —
  alle Launcher lesen dieselbe `Games-Apps.json` aus dem Netz.
* **Veröffentlichen per Link**: Beim Anlegen eines Titels einfach die Adresse der Datei eintragen
  (z. B. ein GitHub-Release). Jeder Nutzer sieht dann **Installieren**, die Datei wird mit
  Fortschrittsanzeige heruntergeladen, ZIPs werden automatisch entpackt — danach startbereit.
* **Oder hochladen**: Die `.exe` bzw. den ganzen Spiel-Ordner direkt hochladen — die Dateien werden
  nach `spiele/` kopiert. Wer will, verknüpft stattdessen nur den Pfad, wo das Spiel schon liegt.
* **Starten**: In `Games-Apps.json` steht bei jedem Titel der Pfad zur `.exe`. Existiert die Datei,
  gilt der Titel als installiert und lässt sich mit einem Klick starten.
* **Admin**: Games und Apps direkt im Launcher hochladen — mit Banner, Cover, Profilbild,
  Beschreibung, Tags, Version, Größe und allem Drum und Dran.
* **Selbst-Update**: Beim Start vergleicht der Launcher seine Version mit der `package.json` im Netz.
  Gibt es eine neuere, lädt er den Installer herunter und startet ihn.
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
├── updates/             heruntergeladene Launcher-Updates
├── einstellungen.json   Launcher-Einstellungen (Store-Quelle, Update-Quelle, Token)
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
      "downloadUrl": "https://github.com/USER/REPO/releases/download/v1.4.2/VoidrixArena.zip",
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
| `downloadUrl`               | **Link zur Datei** (`.exe`, `.msi`, `.zip` …), z. B. ein GitHub-Release. Der Launcher lädt sie herunter und trägt `exePath` selbst ein. |
| `exePath`                   | **Der Pfad zur `.exe`.** Hochgeladene Titel stehen relativ zum Datenordner (`spiele/arena/Arena.exe`), verknüpfte absolut — Backslashes in JSON doppelt: `C:\\Spiele\\x.exe` |
| `args`                      | Startparameter als Liste, z. B. `["-fullscreen", "-novid"]`.                          |
| `workingDir`                | Arbeitsverzeichnis; leer = Ordner der `.exe`.                                         |
| `banner` / `cover` / `icon` | Bilder: `media/banner/datei.png`, absoluter Pfad oder `https://…`                     |
| `screenshots`               | Liste weiterer Bilder für die Detailseite.                                            |
| `featured`                  | `true` = erscheint im Hero-Karussell des Stores.                                      |
| `accentColor`               | Akzentfarbe für Karten und Hintergründe, z. B. `#22d3ee`.                              |
| `source`                    | `remote` = kommt aus dem gemeinsamen Store, `local` = nur auf diesem PC (setzt der Launcher selbst). |
| `tags`, `version`, `size`, `price`, `releaseDate`, `developer`, `publisher`, `website` | reine Anzeigedaten |

**Installiert oder nicht?** Der Launcher prüft schlicht, ob die Datei unter `exePath` existiert.
Ist das Feld leer und ein `downloadUrl` gesetzt, zeigt die Karte **Verfügbar** und den Knopf
**Installieren**. Ohne beides steht dort „Kein Pfad“ mit dem Knopf **Pfad festlegen** — der gewählte
Pfad wird sofort in `Games-Apps.json` gespeichert.

Statt eines Dateipfads sind auch Protokoll-Links erlaubt, etwa `steam://rungameid/440` oder
`com.epicgames.launcher://apps/...`.

---

## Der Launcher aktualisiert sich selbst

Beim Start (und über **Einstellungen → Launcher-Updates → Jetzt suchen**) holt der Launcher eine
`package.json` aus dem Netz und vergleicht deren `version` mit der laufenden. Ist die entfernte
neuer, erscheint ein Fenster mit den Änderungen und dem Knopf **Jetzt aktualisieren**: die passende
Datei wird heruntergeladen (mit Fortschritt und Abbrechen), gestartet — und der Launcher beendet
sich, damit der Installer die alte Version ersetzen kann.

Konfiguriert wird das im Block `voidrix.update` der eigenen `package.json`:

```json
"voidrix": {
  "update": {
    "manifest": "https://raw.githubusercontent.com/USER/REPO/main/package.json",
    "downloads": {
      "win": "https://github.com/USER/REPO/releases/latest/download/Voidrix-Launcher-Setup.exe",
      "linux": "https://github.com/USER/REPO/releases/latest/download/Voidrix-Launcher.AppImage",
      "mac": "https://github.com/USER/REPO/releases/latest/download/Voidrix-Launcher.dmg"
    },
    "notes": "Was ist neu?",
    "autoCheck": true
  }
}
```

* `manifest` — die Datei, die verglichen wird. Am einfachsten die eigene `package.json` im Repo
  (`raw.githubusercontent.com`). Nur **https** (zum Testen auch `localhost`).
* `downloads` — die fertigen Dateien je System. Der Launcher nimmt automatisch die passende.
  Diese Angaben dürfen auch in der *entfernten* `package.json` stehen — dann muss man beim
  Ausliefern nur dort etwas ändern.
* `notes` — Text, der im Update-Fenster steht.
* `autoCheck` — Suche beim Start (höchstens alle 12 Stunden). Lässt sich im Launcher abschalten.

Admins können Quelle, Download-Adresse und Auto-Suche zur Laufzeit ändern:
**Einstellungen → Launcher-Updates → Quelle**. Diese Werte landen in `einstellungen.json` im
Datenordner und haben Vorrang vor der `package.json`.

**Neue Version veröffentlichen**

1. `version` in der `package.json` erhöhen (z. B. `1.0.0` → `1.1.0`) und pushen.
2. `npm run dist` bauen.
3. Die erzeugte `Voidrix-Launcher-Setup-<version>.exe` als Release hochladen — unter dem Namen, der
   in `downloads.win` steht (mit `releases/latest/download/…` bleibt die Adresse immer gleich).

Fertig: Alle laufenden Launcher sehen die neue Version beim nächsten Start. Vorabversionen wie
`1.1.0-beta.1` gelten dabei als älter als `1.1.0`. Wer ein Update nicht will, klickt
**Diese Version überspringen** — dann kommt das Fenster erst bei der nächsten Version wieder.

---

## Gemeinsamer Store — einmal veröffentlichen, alle sehen es

Standardmäßig kennt jeder Launcher nur seine eigene `Games-Apps.json`. Damit ein Titel bei **allen**
auftaucht, gibt es den gemeinsamen Store: eine einzige `Games-Apps.json` im Netz, die jeder Launcher
beim Start liest.

```
   Admin: „Veröffentlichen"                       alle anderen: beim Start
            │                                              ▲
            ▼                                              │
   Games-Apps.json im GitHub-Repo  ────────────────────────┘
   (raw.githubusercontent.com/…)
```

**Einrichten** (Einstellungen → *Gemeinsamer Store* → **Quelle**, nur Admin):

| Feld | Beispiel |
| --- | --- |
| Adresse | `https://raw.githubusercontent.com/USER/REPO/main/Games-Apps.json` |
| Repository | `USER/REPO` |
| Branch / Datei | `main` / `Games-Apps.json` |
| GitHub-Token | Feingranularer Token mit Schreibrecht auf *Contents* |

Voreingestellt ist das in `voidrix.catalog` der `package.json` — wer das dort einträgt, muss im
Launcher nichts mehr einstellen. **Zum Lesen braucht niemand ein Konto oder einen Token** — nur zum
Veröffentlichen.

**Veröffentlichen**: Im Admin-Bereich oder auf der Detailseite auf das Weltkugel-Symbol
(**Veröffentlichen**) klicken. Der Launcher schreibt den Titel in die Datei im Repo; beim nächsten
Start (oder mit **Jetzt abgleichen**) hat ihn jeder. **Zurückziehen** entfernt ihn wieder.

Ein Titel muss dafür einen **Download-Link** haben — sonst könnten die anderen ihn ja nicht
installieren. Bilder sollten `https://`-Adressen sein; liegen sie nur lokal in `media/`, warnt der
Launcher beim Veröffentlichen.

**Was beim Abgleich passiert**

* Neue Titel kommen dazu, geänderte werden aktualisiert.
* **Lokales bleibt lokal**: Pfad zur `.exe`, Installationsdatum, Spielzeit und Startzähler überschreibt
  der Abgleich nie.
* Verschwindet ein Titel oben, verschwindet er auch lokal — es sei denn, er ist installiert. Dann
  bleibt er erhalten und gilt nur nicht mehr als Store-Titel.
* Ohne Netz passiert nichts, der Launcher startet normal weiter.

**Kein Token?** Der Knopf **Exportieren** legt eine fertige `Games-Apps.veroeffentlichen.json` im
Datenordner ab — die lädt man von Hand ins Repo.

---

## Titel per Download-Link veröffentlichen

Der bequemste Weg: die Datei irgendwo ablegen (GitHub-Release, eigener Webspace …) und im Launcher
nur den Link eintragen.

1. **Hochladen** → Feld **Download-Link**, z. B.
   `https://github.com/Voidrix-Launcher/Apps-Spiele/releases/download/Voidrix-Client-Editon/VoidrixClient.exe`
2. **Link prüfen** zeigt Dateiname und Größe an, bevor du speicherst.
3. Speichern — fertig. Im Store steht der Titel jetzt als **Verfügbar**.

Was beim Klick auf **Installieren** passiert:

* Die Datei wird nach `spiele/<titel>/` geladen — mit Fortschritt, Tempo und **Abbrechen**-Knopf.
  Ein Abbruch räumt die halbe Datei restlos weg.
* Ist es ein **`.zip`**, wird es automatisch entpackt und die passende `.exe` gesucht
  (Installer- und Uninstaller-Dateien werden dabei übersprungen). Das Archiv selbst wird gelöscht.
* `exePath`, Größe und Installationsdatum trägt der Launcher selbst in `Games-Apps.json` ein.
* Danach heißt der Knopf **Starten**. Über das Papierkorb-Symbol auf der Detailseite lässt sich der
  Titel wieder **deinstallieren** — die Dateien verschwinden, der Eintrag bleibt.

Vor dem Download wird der freie Speicherplatz geprüft; ist die Datei größer, bricht der Launcher mit
einer klaren Meldung ab, statt die Platte vollzuschreiben.

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
3. Programmdatei festlegen — vier Wege:
   * **Download-Link** (empfohlen) — nur die Adresse eintragen, den Rest macht der Launcher beim
     Installieren. Siehe Abschnitt oben.
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
        └── js/              # app.js, setup.js, update.js, state.js, auth.js, views/*
```

**Sicherheit**: Das UI läuft mit `contextIsolation`, ohne Node-Zugriff und mit strenger CSP.
Sämtliche Dateizugriffe und Programmstarts passieren im Hauptprozess; Admin-Aktionen werden dort
anhand der angemeldeten Rolle geprüft, nicht im UI.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
