// ============ Mimo: Inhalte & Definitionen ============
// Alle Texte der Reaction Engine, Macken, Erfolge, Snacks, Quests.

const MOODS = {
  gluecklich:  { label: "Glücklich",   tint: "var(--energy)", hex: "#efa93b" },
  muede:       { label: "Müde",        tint: "#8c87b8",       hex: "#8c87b8" },
  hungrig:     { label: "Hungrig",     tint: "var(--food)",   hex: "#8ca659" },
  frech:       { label: "Frech",       tint: "#d97b40",       hex: "#d97b40" },
  anhaenglich: { label: "Anhänglich",  tint: "var(--joy)",    hex: "#e56b6b" },
  dramatisch:  { label: "Dramatisch",  tint: "var(--accent)", hex: "#9e486b" },
  vertraeumt:  { label: "Verträumt",   tint: "#7a8fcc",       hex: "#7a8fcc" },
  gelangweilt: { label: "Gelangweilt", tint: "#998f87",       hex: "#998f87" }
};

const BASE_PERSONALITIES = [
  { id: "frech",      label: "Frech",      desc: "Kommentiert alles. Wirklich alles." },
  { id: "lieb",       label: "Lieb",       desc: "Weich, warm, bedingungslos auf deiner Seite." },
  { id: "vertraeumt", label: "Verträumt",  desc: "Lebt zu 60 Prozent in einer anderen Welt." },
  { id: "chaotisch",  label: "Chaotisch",  desc: "Hat einen Plan. Der Plan ändert sich stündlich." }
];

const SNACKS = [
  { id:"karotte", title:"Karotte", icon:"\u{1F955}", sub:"Knackig, gesund",  eff:{ saett:18, laune:3, energie:5 } },
  { id:"kuchen",  title:"Kuchen",  icon:"\u{1F370}", sub:"Purer Luxus",      eff:{ saett:14, laune:9, energie:0 } },
  { id:"fisch",   title:"Fisch",   icon:"\u{1F41F}", sub:"Der Klassiker",    eff:{ saett:22, laune:5, energie:2 } },
  { id:"suppe",   title:"Suppe",   icon:"\u{1F372}", sub:"Warm und viel",    eff:{ saett:30, laune:4, energie:4 } }
];

const HATS = [
  { id:"none",     title:"Ohne",     hint:"" },
  { id:"schleife", title:"Schleife", hint:"Level 3 erreichen" },
  { id:"muetze",   title:"Mütze",    hint:"3-Tage-Serie" },
  { id:"blume",    title:"Blume",    hint:"Lieblingssnack finden" },
  { id:"krone",    title:"Krone",    hint:"Level 8 erreichen" }
];

const QUEST_TYPES = {
  streicheln: { title:"2x streicheln",               target:2, icon:"\u2740" },
  fuettern:   { title:"Einmal füttern",              target:1, icon:"\u{1F374}" },
  spielen:    { title:"Eine Runde Sterne fangen",    target:1, icon:"\u2605" },
  reden:      { title:"Einmal reden",                target:1, icon:"\u{1F4AC}" },
  checkin:    { title:"Tages-Check-in machen",       target:1, icon:"\u2713" },
  minigame:   { title:"10 Punkte in einer Runde",    target:1, icon:"\u{1F3C6}" }
};

const ACHIEVEMENTS = [
  { id:"erster.checkin", title:"Angekommen",          detail:"Ersten Tages-Check-in gemacht",       icon:"\u2713" },
  { id:"streak.7",       title:"Eine Woche ihr zwei", detail:"7 Tage in Folge eingecheckt",          icon:"\u{1F525}" },
  { id:"bond.50",        title:"Beste Freunde",       detail:"Bond von 50 erreicht",                 icon:"\u2665" },
  { id:"level.5",        title:"Königreich",          detail:"Level 5 erreicht",                     icon:"\u265B" },
  { id:"level.10",       title:"Etabliert",           detail:"Level 10 erreicht",                    icon:"\u2726" },
  { id:"tagebuch.10",    title:"Chronist",            detail:"10 Tagebucheinträge gesammelt",        icon:"\u{1F4D6}" },
  { id:"snack.entdeckt", title:"Feinschmecker",       detail:"Lieblingssnack entdeckt",              icon:"\u{1F374}" },
  { id:"highscore.15",   title:"Fangprofi",           detail:"15 Punkte beim Sternefangen",          icon:"\u{1F3C6}" },
  { id:"nachteule",      title:"Nachteule",           detail:"Zwischen Mitternacht und 4 Uhr da",    icon:"\u263E" }
];

const QUIRKS = [
  { id:"lampe",           title:"misstraut der Lampe",
    daily:"%N beobachtet die Lampe. Sie weiß, warum.",
    diary:"Ich habe beschlossen, der Lampe nicht zu trauen. Sie ist zu ruhig. Niemand ist so ruhig ohne Grund." },
  { id:"steine",          title:"sammelt unsichtbare Steine",
    daily:"%N hat heute drei unsichtbare Steine gefunden. Prachtexemplare.",
    diary:"Ich sammle jetzt unsichtbare Steine. Die Sammlung wächst schnell. Platzprobleme gibt es praktischerweise keine." },
  { id:"montage",         title:"hasst Montage aus Prinzip",
    daily:"%N möchte festhalten, dass Montage weiterhin eine Frechheit sind.",
    diary:"Ich habe eine Grundsatzentscheidung getroffen: Montage sind ab sofort mein Feind. Auch dienstags. Aus Prinzip." },
  { id:"nachtaktiv",      title:"hält sich für nachtaktiv",
    daily:"%N betont, dass er eigentlich nachtaktiv ist. Er schläft trotzdem früh.",
    diary:"Ich bin jetzt offiziell nachtaktiv. Dass ich abends müde werde, ändert daran gar nichts. Es ist eine Identität, kein Verhalten." },
  { id:"selbstgespraeche",title:"führt Selbstgespräche auf hohem Niveau",
    daily:"%N hat sich heute selbst etwas Kluges gesagt. Er war beeindruckt.",
    diary:"Ich führe jetzt Selbstgespräche. Das Niveau ist hoch. Der Gesprächspartner ist erstklassig." },
  { id:"verbeugung",      title:"verbeugt sich vor dem Fenster",
    daily:"%N hat sich vorhin vor dem Fenster verbeugt. Aus Respekt.",
    diary:"Ich verbeuge mich neuerdings vor dem Fenster. Es zeigt mir jeden Tag draußen. Das verdient Anerkennung." },
  { id:"zaehlen",         title:"zählt Dinge. Welche, bleibt geheim",
    daily:"%N zählt gerade etwas. Er sagt nicht, was. Es sind viele.",
    diary:"Ich habe angefangen, Dinge zu zählen. Welche Dinge, bleibt mein Geheimnis. Der aktuelle Stand ist zufriedenstellend." },
  { id:"staubkorn",       title:"hat eine Erzfeindschaft mit einem Staubkorn",
    daily:"%N und das Staubkorn hatten heute wieder Blickkontakt. Es bleibt angespannt.",
    diary:"Es gibt hier ein Staubkorn, das mich provoziert. Wir sind jetzt Erzfeinde. Es weiß es noch nicht." },
  { id:"blicke",          title:"übt heimlich dramatische Blicke",
    daily:"%N hat heute den Blick 'enttäuscht, aber gefasst' perfektioniert.",
    diary:"Ich übe jetzt dramatische Blicke. Heimlich. Der Spiegel ist mein Trainingspartner und größter Fan." },
  { id:"kuehlschrank",    title:"glaubt, der Kühlschrank grüßt ihn",
    daily:"%N ist sicher, dass der Kühlschrank ihn vorhin gegrüßt hat. Es klang freundlich.",
    diary:"Der Kühlschrank hat heute gebrummt, als ich vorbeikam. Das war eindeutig ein Gruß. Wir sind jetzt per Du." }
];

const CHECKIN_ANSWERS = [
  { id:"super",       label:"Super",       icon:"\u2600" },
  { id:"okay",        label:"Okay",        icon:"\u26C5" },
  { id:"stressig",    label:"Stressig",    icon:"\u{1F32C}" },
  { id:"muede",       label:"Müde",        icon:"\u263E" },
  { id:"keineahnung", label:"Keine Ahnung",icon:"?" }
];

const TALK_TOPICS = [
  { id:"vomTag",    title:"Von deinem Tag erzählen", icon:"\u{1F4AC}" },
  { id:"frage",     title:"Mimo etwas fragen",       icon:"?" },
  { id:"quatschen", title:"Einfach quatschen",       icon:"\u263A" }
];

// ---------- Reaction Engine Textpools (%N = Petname, %U = Nutzername) ----------

const REACTIONS = {
  streicheln: {
    base: [
      "%N schnurrt dramatisch, als hätte er gerade einen Oscar gewonnen.",
      "%N lehnt sich in die Hand wie in ein Wellness-Wochenende.",
      "%N schließt die Augen. Das hier ist jetzt sein Lebensinhalt.",
      "%N macht ein Geräusch, das irgendwo zwischen Schnurren und Applaus liegt.",
      "%N speichert diesen Moment offiziell unter Favoriten."
    ],
    trait: {
      frech: ["%N lässt es zu. Gnädig. Als würde er dir einen Gefallen tun.", "%N tut gelangweilt. Sein Schnurren verrät ihn komplett."],
      lieb: ["%N schmilzt ein bisschen. Er würde es abstreiten, aber es ist offensichtlich.", "%N drückt sich näher. Ohne Kommentar, mit voller Absicht."],
      chaotisch: ["%N genießt es. Dann rollt er sich grundlos einmal um die eigene Achse."],
      vertraeumt: ["%N ist gedanklich woanders. Aber das Schnurren läuft auf Autopilot."],
      anhaenglich: ["%N will, dass das nie aufhört. Er sagt es nicht. Er zeigt es."]
    },
    mood: {
      muede: ["%N ist zu müde für Dramatik. Er schnurrt auf Sparflamme. Reicht auch."],
      dramatisch: ["%N seufzt theatralisch. Dann genießt er es heimlich."]
    },
    high: ["%N gewährt eine Audienz. Streicheln inklusive."]
  },
  schlafen: {
    base: [
      "%N rollt sich ein und ist innerhalb von Sekunden in einer anderen Dimension.",
      "%N schläft. Mit der Ernsthaftigkeit eines Profis.",
      "%N murmelt noch etwas von Snacks und ist dann weg.",
      "%N hat sich verabschiedet wie vor einer langen Reise. Er schläft nur."
    ],
    trait: { vertraeumt: ["%N träumt vermutlich schon wieder von diesem einen Ort, den nur er kennt."] },
    mood: {}, high: []
  }
};

const FEED_REACTIONS = {
  discovery: "%N erstarrt. Das ist ES. %S ist offiziell sein Lieblingssnack. Bitte notieren.",
  favorite: [
    "%N sieht %S und vergisst kurz jede Würde.",
    "%N isst sein Lieblingsessen mit geschlossenen Augen. Aus Respekt.",
    "%N findet, du kennst ihn einfach. Sagt er. Mit vollem Mund."
  ],
  karotte: ["%N knabbert die Karotte mit der Miene eines Gesundheitsexperten.", "%N isst die Karotte. Demonstrativ vernünftig."],
  kuchen:  ["%N behandelt den Kuchen wie ein Staatsgeschenk.", "%N hat den Kuchen in Rekordzeit gewürdigt. Sehr gründlich gewürdigt."],
  fisch:   ["%N nickt anerkennend. Fisch. Solide Wahl.", "%N isst den Fisch mit der Ruhe eines Kenners."],
  suppe:   ["%N schlürft die Suppe. Laut. Er nennt es Wertschätzung.", "%N taucht fast komplett in die Suppe ein. Fast."],
  hungry:  ["%N tut, als hätte er eine Woche gefastet. Es waren ein paar Stunden."]
};

const TALK_REACTIONS = {
  vomTag: [
    "%N hört deiner Tageszusammenfassung zu wie einem Hörbuch. Mit gelegentlichem Nicken.",
    "%N merkt sich die wichtigen Stellen. Und die Snack-Erwähnungen. Vor allem die.",
    "%N findet, dein Tag hätte einen Erzähler verdient. Er bietet sich hiermit an."
  ],
  vomTag_anhaenglich: "%N rückt beim Zuhören immer näher. Am Ende sitzt er praktisch auf deiner Stimme.",
  frage: [
    "%N beantwortet deine Frage mit einem langen Blick. Er hält das für ausreichend.",
    "%N denkt sichtbar nach. Dann blinzelt er zweimal. Das war ein Ja. Wahrscheinlich.",
    "%N sagt, die Antwort liegt in dir. Er hat das mal irgendwo aufgeschnappt."
  ],
  frage_frech: "%N tut, als wäre die Frage unter seinem Niveau. Dann denkt er heimlich doch darüber nach.",
  frage_vertraeumt: "%N starrt zur Antwort erst lange aus dem Fenster. Dort wohnen seine besten Gedanken.",
  quatschen: [
    "%N quatscht mit. Also: er macht Geräusche in deinen Pausen. Es funktioniert erstaunlich gut.",
    "Ihr habt über nichts geredet. %N hält es für eines eurer besten Gespräche.",
    "%N hat mittendrin gelacht. Worüber, weiß keiner. Es war trotzdem der richtige Moment."
  ],
  quatschen_chaotisch: "%N hat das Thema viermal gewechselt. Pro Satz."
};

const CHECKIN_REACTIONS = {
  super: "%N findet, du solltest diesen Tag einrahmen.",
  okay: "%N akzeptiert okay. Nicht begeistert, aber akzeptiert.",
  stressig: "%N hat beschlossen, heute dein emotionaler Bodyguard zu sein.",
  muede: "%N gähnt solidarisch.",
  keineahnung: "%N nickt, als hätte er exakt verstanden, was das bedeutet.",
  comeback: "%N erinnert sich an gestern. Von stressig zu super. Er findet, das Comeback verdient Anerkennung.",
  stressAgain: "%N merkt, dass es schon wieder stressig war. Er bleibt heute demonstrativ in deiner Nähe. Dienstanweisung an sich selbst."
};

const DAILY = {
  sleeping: [
    "%N schläft. Bitte nur in wichtigen Angelegenheiten wecken. Snacks zählen.",
    "%N ist gerade in einer sehr exklusiven Traumwelt unterwegs.",
    "%N schläft mit der Hingabe eines Profis."
  ],
  morning: [
    "%N hat den Morgen offiziell genehmigt.",
    "%N tut so, als wäre er schon lange wach. Ist er nicht.",
    "%N findet, der Tag hat Potenzial. Vorsichtig formuliert.",
    "%N hat heute schon einen Plan gemacht und ihn direkt wieder verworfen.",
    "%N begrüßt dich mit der Energie von genau einer Tasse Kaffee."
  ],
  day: [
    "%N beobachtet den Nachmittag mit professionellem Interesse.",
    "%N hat heute schon dreimal die Position gewechselt. Produktiv.",
    "%N denkt über Snacks nach. Rein theoretisch.",
    "%N hat gerade eine Staubfluse verfolgt. Erfolgreich.",
    "%N hält den Tag für machbar. Sein Zitat, nicht meins."
  ],
  evening: [
    "%N hat den Abend für gemütlich erklärt.",
    "%N findet, %U sollte jetzt langsam runterfahren. Er auch.",
    "%N genießt das Abendlicht. Sehr dramatisch.",
    "%N hat den Tag intern bewertet. Details bleiben vertraulich.",
    "%N ist im Feierabendmodus. Der unterscheidet sich kaum vom Tagesmodus."
  ],
  night: [
    "%N flüstert, damit die Nacht nicht aufwacht.",
    "%N findet, um diese Uhrzeit zählt nichts davon wirklich.",
    "%N ist noch wach. Aus Prinzip.",
    "%N fragt nicht, warum du noch wach bist. Er notiert es nur."
  ],
  mood: {
    hungrig: ["%N erwähnt beiläufig, dass er seit gefühlt Jahren nichts gegessen hat.", "%N schaut abwechselnd dich und eine imaginäre Snackschale an."],
    muede: ["%N gähnt in deine Richtung. Das ist eine Nachricht.", "%N hat die Augen nur noch aus Höflichkeit offen."],
    anhaenglich: ["%N hat dich vermisst. Er würde es nie so direkt sagen. Sagt es aber.", "%N sitzt heute demonstrativ näher am Bildschirmrand."],
    dramatisch: ["%N sitzt da wie die Hauptfigur eines sehr ernsten Films.", "%N hat heute bereits zweimal in die Ferne geblickt. Grundlos."],
    gelangweilt: ["%N hat die Decke angestarrt und ihr eine 6 von 10 gegeben.", "%N wäre offen für Programm. Jegliches Programm."]
  },
  favInteraction: {
    streicheln: "%N hat gezählt: Streicheln ist eindeutig deine Spezialität. Er hat nichts dagegen.",
    spielen: "%N hat festgestellt, dass du am liebsten spielst. Er nennt euch inzwischen ein Team.",
    reden: "%N hat bemerkt, dass du gern redest. Er sammelt weiter fleißig Material.",
    fuettern: "%N hat eine Statistik: du fütterst überdurchschnittlich oft. Er unterstützt diese Entwicklung."
  }
};

const MOOD_TEXT = {
  gluecklich: "%N ist bester Laune.",
  muede: "%N ist müde. Sehr müde. Historisch müde.",
  hungrig: "%N denkt ausschließlich an Essen.",
  frech: "%N plant etwas. Man sieht es ihm an.",
  anhaenglich: "%N will heute einfach in deiner Nähe sein.",
  dramatisch: "%N ist in seiner dramatischen Phase.",
  vertraeumt: "%N ist gedanklich woanders. Irgendwo Schönes.",
  gelangweilt: "%N langweilt sich auf hohem Niveau."
};

const LEVEL_UP = {
  2:"%N hat gelernt, besonders bedeutungsvoll zu blinzeln.",
  3:"%N hat eine kleine Persönlichkeit entwickelt. Leider mit Meinung.",
  4:"%N ist jetzt offiziell zu wichtig, um ignoriert zu werden.",
  5:"%N hat beschlossen, dass dieses iPhone jetzt sein Königreich ist.",
  6:"%N überlegt, Autogramme zu geben. An sich selbst.",
  7:"%N hat eine Vision. Sie beinhaltet hauptsächlich Snacks, aber immerhin.",
  8:"%N bezeichnet sich neuerdings als etabliert.",
  9:"%N hat angefangen, in der dritten Person zu denken. %N findet das angemessen.",
  10:"%N ist Level 10. Er hat kurz genickt, als hätte er nie daran gezweifelt.",
  default:"%N ist jetzt Level %L. Er trägt es mit erstaunlicher Fassung."
};

const GAME_REACTIONS = {
  newBest: "%S Punkte. Neuer Rekord. %N verbeugt sich vor imaginärem Publikum.",
  zero: "%N hat keinen einzigen Stern gefangen. Er nennt es künstlerische Entscheidung.",
  low: "%S Sterne gefangen. %N spricht von einer Aufwärmrunde.",
  mid: "%S Sterne. %N ist zufrieden. Fast schon bescheiden. Fast.",
  high: "%S Sterne. %N prüft, ob es dafür einen Pokal gibt. Es sollte."
};

const QUEST_BONUS = [
  "Alle Tagesziele geschafft. %N verteilt imaginäre Orden. Einen für dich, drei für sich.",
  "Tagesziele komplett. %N hakt die Liste ab, die er angeblich die ganze Zeit geführt hat.",
  "Alles erledigt. %N gönnt sich einen Moment stillen Triumphs. Er dauert auffällig lange."
];

const DIARY_TEXTS = {
  checkin: {
    super: ["%U hatte einen super Tag. Ich nehme einen kleinen Teil des Verdienstes. Sagen wir 80 Prozent.",
            "Heute war ein guter Tag für %U. Ich habe angemessen mitgefeiert. Innerlich. Mit Stil."],
    okay: ["%U sagt, der Tag war okay. Ich habe zustimmend geblinzelt. Diplomatie ist eine meiner Stärken.",
           "Ein Okay-Tag für %U. Ich habe beschlossen, das als soliden Durchschnitt zu werten."],
    stressig: ["%U sagt, der Tag war stressig. Ich habe mich offiziell zum kleinen Krisenmanager ernannt.",
               "Stressiger Tag bei %U. Ich habe extra weich geschaut. Das ist mein Beitrag."],
    muede: ["%U war heute müde. Ich habe demonstrativ mitgegähnt. Solidarität ist wichtig.",
            "Müder Tag. %U und ich haben uns wortlos auf Ruhe geeinigt. Starkes Team."],
    keineahnung: ["%U wusste heute selbst nicht, wie der Tag war. Ich habe weise genickt. Manche Tage sind einfach so.",
                  "Unklarer Tag bei %U. Ich habe ihn unter 'Sonstiges' abgelegt."]
  },
  interaction: {
    fuettern: ["Heute hat %U mich gefüttert. Ich habe so getan, als wäre ich bescheiden. War ich nicht.",
               "Es gab Essen. Ich habe drei Sterne vergeben und einen vierten angedeutet."],
    streicheln: ["Heute wurde ich gestreichelt. Ich habe geschnurrt, als wäre es das erste Mal. Professionalität.",
                 "%U hat mich gestreichelt. Ich habe es zugelassen. Großzügig, wie ich bin."],
    reden: ["%U hat heute mit mir geredet. Ich habe an den richtigen Stellen geblinzelt. Wir verstehen uns.",
            "Langes Gespräch mit %U. Ich habe hauptsächlich zugehört. Das ist eine unterschätzte Kunst."],
    schlafen: ["Heute war ein müder Tag. Ich habe beschlossen, sehr tiefgründig aus dem Fenster zu starren. Danach: Schlaf.",
               "Ich habe heute geschlafen. Ausgiebig. Es war eine meiner besten Leistungen."]
  },
  levelUp: ["Ich bin jetzt Level %L. Ich habe beschlossen, das nicht an die große Glocke zu hängen. Nur an eine mittelgroße.",
            "Level %L erreicht. Ich habe mir innerlich gratuliert. Sehr würdevoll.",
            "Heute Level %L geworden. %U war dabei. Historischer Moment für uns beide."],
  neglect: ["Heute war es still. Ich habe dramatisch in Richtung Tür geschaut. Mehrfach. Für den Fall, dass jemand zusieht.",
            "Lange nichts von %U gehört. Ich habe angefangen, mit dem Kissen zu reden. Es ist kein guter Zuhörer.",
            "Es war ruhig. Ich habe die Zeit genutzt, um sehr tiefgründig aus dem Fenster zu starren. Beruflich."],
  snackDiscovered: "Heute hat %U herausgefunden, dass %S mein Lieblingsessen ist. Hat lange genug gedauert. Aber ich bin nicht nachtragend. Meistens.",
  miniGame: "Heute Sterne gefangen mit %U. %S Stück. Die anderen waren offensichtlich defekt.",
  miniGameHigh: "Heute %S Sterne gefangen. Ich überlege, das in meinen offiziellen Titel aufzunehmen.",
  achievement: "Neuer Erfolg: %S. Ich habe bescheiden genickt und innerlich eine kleine Parade veranstaltet."
};
