# Mimo (Web)

Virtuelles Haustier als Web-App. Vanilla JS/HTML/CSS, keine Dependencies, Speicherung in localStorage.
Portiert vom nativen SwiftUI-Projekt (Repo "mimo") mit allen Systemen: Stimmung, Persönlichkeit,
Erinnerungen, Macken, Quests, Erfolge, Garderobe, Mini-Game, Tagesphasen-Himmel.

## Deployment (GitHub Pages)
1. Alle Dateien in ein Repo hochladen
2. Settings -> Pages -> Branch "main", Ordner "/ (root)" -> Save
3. URL öffnen; auf dem iPhone: Teilen -> "Zum Home-Bildschirm" für Vollbild-App-Feeling

## Testen ohne Warten
- Level: in app.js in addXP() den Divisor 100 senken (z. B. 20)
- Tagesphasen: dayPhase() temporär eine Phase hart zurückgeben ("night")
- Reset: Profil -> App zurücksetzen
