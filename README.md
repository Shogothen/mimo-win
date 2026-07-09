# Mimo (Web)

Virtuelles Haustier als Web-App. Vanilla JS/HTML/CSS, keine Dependencies, Speicherung in localStorage.
Portiert vom nativen SwiftUI-Projekt (Repo "mimo") mit allen Systemen: Stimmung, Persönlichkeit,
Erinnerungen, Macken, Quests, Erfolge, Garderobe, zwei Mini-Games, Tagesphasen-Himmel.
v21 Room & Spiele: Kamin/Aquarium-SVG nachgerüstet (gekaufte Deko war unsichtbar), alle 14 Deko-Objekte interaktiv (Sounds, Animationen, Mimo-Reaktionen, Zimmer-Kenner-Erfolg), drittes Minispiel 'Brösels Hütchen' (Runden-Mischspiel mit steigendem Tempo, eigene Belohnungsskala und Erfolgen).
v20 Klang: generative Ambient-Musik (folgt Tageszeit und Wetter, nie loopend), Wetter-Ambiente (Regen-Rauschen, Vögel am Morgen, Grillen nachts), vereinheitlichte Effekte inkl. Nachrichten-Ton, Klang-Einstellungen im Profil (Musik/Ambiente/Effekte getrennt), iOS-konformer Audio-Unlock und Hintergrund-Pause.
v19 Tiefe: Lauf-Bug behoben (Mimo lief wegen zerstörter Zentrierung aus dem Bild), Live-Story 2 'Brösels Bitte' (Inventur im Archiv, Schachtel für schlechte Tage, Stellvertretender-Verwalter-Finale) mit generischen Story-Gates, Chronik im Profil: automatische Zeitleiste aller Meilensteine.
v18 Geräte-Fixes: Stat-Icons standen 90° gedreht (Ring-Rotation vererbte sich auf die Glyphen), Regen auf die Szene begrenzt, Pings-Ungelesen-Zähler auf Lese-Flags umgestellt (falsche Benachrichtigung behoben, inkl. Migration), Sprachpolitur.
v17 Momente-Fixes: Drei-Dinge-Overlay als echtes Fullscreen (war im Seitenfluss versteckt), Atemreise voll geführt (Intro mit Muster-Wahl und Beginnen-Button, Sekunden-Countdown, Anleitung pro Phase, Runden-Punkte, Mimo atmet im Ring mit), Dankbarkeits-Glas mit sichtbaren Einträgen.
v16 Lebendige Szene: Mimo läuft frei herum (Hüpf-Schritte, Füttern am Ort), tägliches Wetter (Sonne/Wolken/Regen/Nebel mit Visuals und Kommentaren), anstupsbare Wolken, nachts Sterne pflücken (+Staub, 3/Nacht).
v15 Achtsamkeit: Momente-Hub mit 5 Übungen (Atemreise mit 3 Mustern, Drei Dinge, Gedanken-Wolke, Dankbarkeit, Tagesabschluss), Geerdet-Buff (+10% XP, -25% Laune-Verfall), Ruhe-Stufen mit Freischaltungen (Stille-Muster, Zen-Stein, Stille-Gespräch + Ruhestein); Stat-Icons neu gezeichnet.
v14 Live: Echtzeit-Story 'Das Geräusch hinter der Wand' (Lifeline-Prinzip: Nachrichten treffen über 1,5 Tage real ein, Nacht-Cliffhanger, Entscheidungen, Herr Brösel), Mimo schreibt selbstständig Pings mit Quick-Replies, Home-Live-Ticker mit Ungelesen-Status.
v13 Story: 6-Kapitel-Arc 'Der Brief unterm Fenster' mit Tages-/Level-/Bond-Gates, gespeicherten Entscheidungen und legendärem Finale; Körperzonen-Haptik (Ohren, Kopf, Nase, Bauch).
v12 Lebendigkeit: Drag-Füttern (Snack zum Mund ziehen, Augen und Körper folgen), Augenverfolgung, Idle-Leben (Umsehen, Hopser, Schmetterling zum Fangen), Schnurr-Sound unter der Hand, Mampf-Geräusche.
v11 Körpersprache: Animations-Clip-System (Sprung, Wackeln, Mampf-Bob, Zungen-Schlecker), Anlehnen an die Hand beim Streicheln mit Schnurr-Puls, 5-Phasen-Fütter-Choreografie mit Backen-Beulen und Feier.
v10 Pflege & Langzeit: Hygiene-System mit Dreck und Bade-Rubbel-Modus, Streichel-Geste statt Tippen, Futter-Hüpfer, XP-Kurve bis Level 30, gestreckte Bond-Stufen/Preise/Drops, 10 Langzeit-Erfolge, 30 Fundstücke.
v9 Politur: konsolidiertes Home (Heute-Karte, kombinierte Ziele), konsistentes SVG-Icon-System, Stat-Ring- und Dock-Fixes, Text-Qualitätspass, +5 Gespräche.
v8 Seele: sichtbares Wachstum (Wirbel, Schweif, Ohren), Bond wird sichtbar (Augenglanz, Herz-Wangen, Schimmer), Emotions-Bursts, Traurig-Stimmung, Momente-System mit Erinnerungs-Gesprächen, Kosename, Tagesgruß.
v7 Balancing: Anti-Spam-Budgets, Hunger mit Konsequenz, Premium-Snacks mit XP/Bond-Boni, Belohnungen sichtbar in der Szene, fliegende Snacks mit Kau-Animation.
v6 Tiefe: steigende XP-Kurve bis Level 20+, Beziehungsstufen, Ziel-Meisterschaft mit Reise-Log, Wochenziele, Combo-System.
v5 Welt: Expeditionen mit echter Abwesenheit, Sammelalbum (20 Fundstücke), Atemübung, Dankbarkeits-Glas, Streak-Schutz.
v4 Gespräche: echtes Chat-System, Mimo lernt dich kennen und erinnert sich, Kontext- und Bond-Gespräche.
v3 Gameplay: Sternenstaub-Ökonomie, Shop, tägliches Geschenk, Tageswunsch, Wachstumsstufen, Willkommen-zurück.

## Deployment (GitHub Pages)
1. Alle Dateien in ein Repo hochladen
2. Settings -> Pages -> Branch "main", Ordner "/ (root)" -> Save
3. URL öffnen; auf dem iPhone: Teilen -> "Zum Home-Bildschirm" für Vollbild-App-Feeling

## Design
Display-Font ist Fraunces (Google Fonts, Fallback Georgia). Vier Tagesphasen mit eigenen
Paletten und Szenen: Morgen, Tag (Wolken, Sonne), Abend, Nacht (Indigo, Mond, Sterne, Glühwürmchen).

## Testen ohne Warten
- Level: in app.js in addXP() den Divisor 100 senken (z. B. 20)
- Tagesphasen: dayPhase() temporär eine Phase hart zurückgeben ("night")
- Reset: Profil -> App zurücksetzen
