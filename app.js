// ============ Mimo Web ============
// State + Engine + Pet-Rendering + UI + Mini-Game. Keine Dependencies.

"use strict";

// roundRect-Polyfill (aeltere Safari-Versionen)
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.moveTo(x + r, y); this.lineTo(x + w - r, y); this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r); this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h); this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r); this.quadraticCurveTo(x, y, x + r, y);
    return this;
  };
}

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const yesterdayKey = () => todayKey(new Date(Date.now() - 864e5));
const twoDaysAgoKey = () => todayKey(new Date(Date.now() - 2 * 864e5));
const fmt = (tpl, ctx) => tpl
  .replaceAll("%N", ctx.N ?? "").replaceAll("%U", ctx.U ?? "")
  .replaceAll("%S", ctx.S ?? "").replaceAll("%L", ctx.L ?? "")
  .replaceAll("%V", ctx.V ?? "")
  .replaceAll("%K", ctx.K ?? "");

function dayPhase(d = new Date()) {
  const h = d.getHours();
  if (h >= 6 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

// ---------- State ----------
const STORAGE_KEY = "mimo_state_v1";

function defaultState() {
  return {
    onboarded: false,
    userName: "",
    createdAt: Date.now(),
    pet: {
      name: "Mimo", base: "frech",
      stats: { energie: 80, laune: 70, saettigung: 70, bond: 10, hygiene: 85, xp: 0, level: 1 },
      pers: { frech: 20, lieb: 20, chaotisch: 20, vertraeumt: 20, anhaenglich: 20 },
      lastInteraction: Date.now(), lastUpdate: Date.now(),
      lastCheckInDay: null, streak: 0, sleeping: false,
      favSnack: pick(SNACKS).id, favDiscovered: false,
      bestScore: 0, hat: "none",
      dust: 40, dustEarned: 40,
      memory: { checkinCounts: {}, interCounts: {}, recent: [], quirks: [] }
    },
    diary: [],
    quests: null,           // { dayKey, list:[{type,progress}], bonus }
    achievements: [],
    hats: ["none"],
    best: { sterne: 0, blasen: 0 },
    ownedSnacks: [], ownedDeco: [], purchases: 0,
    lastGiftDay: null, giftsOpened: 0,
    wish: null, wishesDone: 0,
    lastSeen: 0, evoSeen: 1,
    talkFacts: {}, convoSeen: {}, lastFactDay: null, convosDone: 0,
    expedition: null, expeditionsDone: 0, souvenirs: [],
    gratitude: [], lastGratitudeDay: null, lastBreathDay: null, breathsDone: 0,
    streakFreezes: 0,
    bondTierSeen: 0, destVisits: {}, weekly: null, weeklyDone: 0,
    care: { streichel: [], quatschDay: null, quatschCount: 0, gamesDay: null, gamesCount: 0, bathDay: null },
    moments: [], lastGreetDay: null,
    bathsDone: 0,
    calm: { points: 0, tierSeen: 0, lastDay: null, streak: 0, wolken: 0, erden: 0, abende: 0, lastGroundDay: null, lastCloudDay: null, lastEveningDay: null }
  };
}

function deepMerge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])
        && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
      deepMerge(base[k], extra[k]);
    } else {
      base[k] = extra[k];
    }
  }
  return base;
}

let state = defaultState();
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) state = deepMerge(defaultState(), JSON.parse(raw));
} catch (e) { /* korrupter Spielstand -> frisch starten */ }

// Migration aelterer Spielstaende
if (state.best.sterne === 0 && state.pet.bestScore > 0) state.best.sterne = state.pet.bestScore;
if (state.pet.stats.hygiene === undefined) state.pet.stats.hygiene = 75;
if (state.care.bathDay === undefined) state.care.bathDay = null;
if (state.bathsDone === undefined) state.bathsDone = 0;
if (state.pings) {
  (state.pings.items || []).forEach(i => { if (i.read === undefined) i.read = true; });
  delete state.pings.unread;
}
if (!state.sound) state.sound = { music: true, ambience: true, sfx: true };
if (!state.calm) state.calm = { points: 0, tierSeen: 0, lastDay: null, streak: 0, wolken: 0, erden: 0, abende: 0, lastGroundDay: null, lastCloudDay: null, lastEveningDay: null };
// Neue XP-Kurve: bestehendes Level bleibt mindestens erhalten
state.pet.stats.level = Math.max(state.pet.stats.level, (function () {
  let lvl = 1, sum = 0;
  while (state.pet.stats.xp >= sum + 120 + (lvl - 1) * 45) { sum += 120 + (lvl - 1) * 45; lvl++; }
  return lvl;
})());

function save() {
  state.lastSeen = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Engine: Sternenstaub ----------
let _dustHookBusy = false;
function earnDust(n) {
  if (n <= 0) return;
  state.pet.dust += n;
  state.pet.dustEarned += n;
  if (!_dustHookBusy && state.onboarded) {
    _dustHookBusy = true;
    try { weeklyProgress("staub", n); } catch (e) {}
    _dustHookBusy = false;
  }
  const chips = [$("#dustAmount"), $("#dustAmountShop")];
  for (const el of chips) if (el) {
    el.textContent = state.pet.dust;
    const chip = el.closest(".chip");
    if (chip) { chip.classList.remove("dust-pop"); void chip.offsetWidth; chip.classList.add("dust-pop"); }
  }
}
function spendDust(n) {
  if (state.pet.dust < n) return false;
  state.pet.dust -= n;
  return true;
}

// ---------- Engine: Wachstumsstufen ----------
function bondTier() {
  const b = state.pet.stats.bond;
  let t = 0;
  for (let i = 0; i < BOND_TIERS.length; i++) if (b >= BOND_TIERS[i].min) t = i;
  return t;
}

let pendingBondTier = null;
function checkBondTier() {
  const t = bondTier();
  if (t > (state.bondTierSeen || 0)) {
    state.bondTierSeen = t;
    addChronicle("\u2661", "Bond-Stufe \u201E" + BOND_TIERS[t].name + "\u201C erreicht");
    pendingBondTier = t;
    if (t === 4) captureMoment("seelen");
    state.diary.unshift({ date: Date.now(), mood: "anhaenglich", text: fmt(BOND_TIER_DIARY, ctx({ S: BOND_TIERS[t].name })) });
  }
}

function maybeShowBondTier() {
  if (pendingBondTier === null) return;
  if (!$("#levelupOverlay").classList.contains("hidden")) return; // wartet bis Level-Up zu ist
  const t = pendingBondTier; pendingBondTier = null;
  showCelebration(BOND_TIERS[t].name, fmt(BOND_TIERS[t].text, ctx()));
  playSound("level");
}

function petStage() {
  const l = state.pet.stats.level;
  return l >= 8 ? 3 : l >= 4 ? 2 : 1;
}
const STAGE_NAMES = { 1: "Knirps", 2: "Halbstark", 3: "Ausgewachsen" };

// ---------- Engine: Mood, Decay, XP ----------
function dominantTrait() {
  const p = state.pet.pers;
  return Object.keys(p).reduce((a, b) => (p[a] >= p[b] ? a : b));
}

function computeMood() {
  const p = state.pet, s = p.stats;
  const h = new Date().getHours();
  const hrs = (Date.now() - p.lastInteraction) / 36e5;
  if (p.sleeping) return "vertraeumt";
  if (s.energie < 25) return "muede";
  if (s.saettigung < 30) return "hungrig";
  if (hrs > 12) return p.pers.anhaenglich >= p.pers.frech ? "anhaenglich" : "dramatisch";
  if (s.laune < 25) return "traurig";
  if (s.hygiene < 35) return "stinkig";
  if (s.laune > 75 && s.energie > 50) return "gluecklich";
  if (s.laune < 40) return "gelangweilt";
  if (h >= 21 || h < 6) return "vertraeumt";
  const t = dominantTrait();
  if (t === "frech") return "frech";
  if (t === "vertraeumt") return "vertraeumt";
  if (t === "anhaenglich") return "anhaenglich";
  return "gluecklich";
}

function applyDecay() {
  const p = state.pet, s = p.stats;
  if (state.expedition) { p.lastUpdate = Date.now(); return; } // unterwegs: kein Verfall
  const hrs = (Date.now() - p.lastUpdate) / 36e5;
  if (hrs < 0.05) return;
  s.energie += p.sleeping ? hrs * 6 : -hrs * 1.5;
  s.saettigung -= hrs * 3.2;
  s.hygiene = (s.hygiene ?? 85) - hrs * 1.1;
  s.laune -= hrs * ((s.saettigung < 30 ? 1.4 : 0) + (s.hygiene < 35 ? 1.0 : 0) + 1.2) * (calmToday() ? 0.75 : 1);
  s.energie = Math.max(s.energie, 10);
  s.saettigung = Math.max(s.saettigung, 10);
  s.laune = Math.max(s.laune, 15);
  clampStats();
  if (p.sleeping && s.energie >= 95) p.sleeping = false;
  const hrsInter = (Date.now() - p.lastInteraction) / 36e5;
  if (hrsInter > 24) { bump("frech", 1); bump("anhaenglich", 1); }
  p.lastUpdate = Date.now();
}

function clampStats() {
  const s = state.pet.stats;
  s.energie = clamp(s.energie, 0, 100); s.laune = clamp(s.laune, 0, 100);
  s.saettigung = clamp(s.saettigung, 0, 100); s.bond = clamp(s.bond, 0, 100);
  s.hygiene = clamp(s.hygiene ?? 85, 0, 100);
}
function bump(trait, amt) { state.pet.pers[trait] = clamp(state.pet.pers[trait] + amt, 0, 100); }

// Level n -> n+1 kostet 100 + (n-1)*30 XP; Gesamtbedarf steigt quadratisch
function xpForNext(level) { return 120 + (level - 1) * 45; }
function xpThreshold(level) { // Gesamt-XP, um dieses Level zu ERREICHEN
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpForNext(l);
  return sum;
}
function levelFromXP(xp) {
  let level = 1;
  while (xp >= xpThreshold(level + 1)) level++;
  return level;
}
function addXP(amount) {
  const s = state.pet.stats;
  if (calmToday()) amount = Math.round(amount * 1.1); // Geerdet: +10% XP
  s.xp += amount;
  const newLevel = levelFromXP(s.xp);
  if (newLevel > s.level) { s.level = newLevel; return newLevel; }
  return null;
}

let pendingEvo = null;
function handleLevelUp(level) {
  if (level && level % 5 === 0) addChronicle("\u2B50", `Level ${level} erreicht`);
  if (!level) return;
  const msg = fmt(LEVEL_UP[level] || LEVEL_UP.default, ctx({ L: level }));
  addDiary("levelUp", { L: level });
  if (level % 2 === 0) grantQuirk();
  earnDust(20);
  const stage = petStage();
  if (stage > (state.evoSeen || 1)) {
    state.evoSeen = stage;
    pendingEvo = stage;
    state.diary.unshift({ date: Date.now(), mood: "gluecklich", text: fmt(EVOLUTION_DIARY[stage], ctx()) });
  }
  playSound("level");
  showLevelUp(level, msg);
}

function grantQuirk() {
  const owned = state.pet.memory.quirks;
  const candidates = QUIRKS.filter(q => !owned.includes(q.id));
  if (!candidates.length) return;
  const q = pick(candidates);
  owned.push(q.id);
  state.diary.unshift({ date: Date.now(), mood: computeMood(), text: q.diary });
}

function nickname() {
  const nn = state.talkFacts?.kosename;
  return !nn || nn === "__name__" ? state.userName : nn;
}
const ctx = (extra = {}) => ({ N: state.pet.name, U: state.userName, K: nickname(), ...extra });

// ---------- Engine: Diary, Reactions ----------
function addDiary(kind, extra = {}) {
  let text = "";
  const c = ctx(extra);
  if (kind === "checkin") text = fmt(pick(DIARY_TEXTS.checkin[extra.answer]), c);
  else if (kind === "interaction") text = fmt(pick(DIARY_TEXTS.interaction[extra.type]), c);
  else if (kind === "levelUp") text = fmt(pick(DIARY_TEXTS.levelUp), c);
  else if (kind === "neglect") text = fmt(pick(DIARY_TEXTS.neglect), c);
  else if (kind === "snack") text = fmt(DIARY_TEXTS.snackDiscovered, c);
  else if (kind === "game") text = fmt(extra.high ? DIARY_TEXTS.miniGameHigh : DIARY_TEXTS.miniGame, c);
  else if (kind === "achievement") text = fmt(DIARY_TEXTS.achievement, c);
  state.diary.unshift({ date: Date.now(), mood: computeMood(), text });
}

let speechTimer = null;
function showReaction(text) {
  const b = $("#speechBubble");
  $("#speechText").textContent = text;
  b.classList.remove("hidden");
  b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => b.classList.add("hidden"), 5000);
}

function genericReaction(type) {
  const def = REACTIONS[type];
  const mood = computeMood(), trait = dominantTrait();
  let pool = [...def.base];
  if (def.trait[trait]) pool = pool.concat(def.trait[trait]);
  if (def.mood[mood]) pool = pool.concat(def.mood[mood]);
  if (state.pet.stats.level >= 4 && def.high.length) pool = pool.concat(def.high);
  return fmt(pick(pool), ctx());
}

function dailyMessage() {
  const p = state.pet;
  if (p.sleeping) return fmt(pick(DAILY.sleeping), ctx());
  let pool = [...DAILY[dayPhase()]];
  const mood = computeMood();
  if (DAILY.mood[mood]) pool = pool.concat(DAILY.mood[mood]);
  if (p.streak >= 3) pool.push(`%N zählt mit: ${p.streak} Tage in Folge eingecheckt. Er tut unbeeindruckt. Ist er nicht.`);
  const days = Math.max(1, Math.floor((Date.now() - state.createdAt) / 864e5) + 1);
  if (days >= 7) pool.push(`Tag ${days} von euch beiden. %N führt keine Liste. Offiziell.`);
  const fav = favoriteInteraction();
  if (fav && DAILY.favInteraction[fav]) pool.push(DAILY.favInteraction[fav]);
  const quirkLines = p.memory.quirks.map(id => QUIRKS.find(q => q.id === id)?.daily).filter(Boolean);
  pool = pool.concat(quirkLines, quirkLines); // Macken doppelt gewichtet
  for (const key of Object.keys(state.talkFacts)) {
    const tpls = FACT_DAILY[key];
    if (tpls) pool.push(fmt(pick(tpls), ctx({ V: state.talkFacts[key] })));
  }
  const oldGrat = state.gratitude.filter(g => Date.now() - g.d > 2 * 864e5);
  if (oldGrat.length) pool.push(fmt(pick(GRATITUDE_TEXTS.daily), ctx({ V: pick(oldGrat).text })));
  const mems = recallableMoments();
  if (mems.length) pool.push(momentRecallLine(pick(mems)));
  return fmt(pick(pool), ctx());
}

function favoriteInteraction() {
  const counts = state.pet.memory.interCounts;
  let best = null, n = 4;
  for (const k of Object.keys(counts)) if (counts[k] > n) { n = counts[k]; best = k; }
  return best;
}

// ---------- Engine: Interaktionen ----------
const EFFECTS = {
  streicheln: { laune: 8, bond: 1, trait: "lieb", xp: 3 },
  reden:      { laune: 6, bond: 3, trait: "anhaenglich", xp: 6 },
  schlafen:   { energie: 25, trait: "vertraeumt", xp: 3 }
};

function recordInteraction(type) {
  const m = state.pet.memory.interCounts;
  m[type] = (m[type] || 0) + 1;
}

// Streichel-Budget: 3 belohnte Einheiten pro Stunde (rollierend)
function affectionRewarded() {
  const now = Date.now();
  state.care.streichel = (state.care.streichel || []).filter(t => now - t < 36e5);
  if (state.care.streichel.length >= 3) return false;
  state.care.streichel.push(now);
  return true;
}

function interact(type) {
  if (blockIfAway()) return;
  applyDecay();
  const p = state.pet;
  const wasTired = p.stats.energie < 50;
  p.sleeping = type === "schlafen";
  const e = EFFECTS[type];
  let rewarded = true, reactionOverride = null, xp = e.xp;

  if (type === "streicheln") {
    rewarded = affectionRewarded();
    if (!rewarded) reactionOverride = fmt(pick(AFFECTION_FULL), ctx());
  }
  if (type === "schlafen" && !wasTired) {
    rewarded = false;
    reactionOverride = fmt(pick(NOT_TIRED), ctx());
  }

  p.stats.energie += e.energie || 0; p.stats.laune += e.laune || 0;
  if (rewarded) p.stats.bond += e.bond || 0;
  if (e.trait) bump(e.trait, 1.5);
  clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction(type);
  showReaction(reactionOverride || genericReaction(type));
  if (Math.random() < 0.25) addDiary("interaction", { type });
  if (type === "streicheln") {
    wishBump("streicheln");
    if (bondTier() >= 2 && Math.random() < 0.35) homePet?.emote("heart", 1600);
  }
  if (rewarded) {
    sceneFloat(`+${xp} XP`, "#9e486b");
    handleLevelUp(addXP(xp));
  }
  if (type === "streicheln") questProgress("streicheln");
  const h = new Date().getHours();
  if (h >= 0 && h < 4) unlockAchievement("nachteule");
  checkUnlocks(); save(); renderAll();
}

function wakeUp() {
  state.pet.sleeping = false;
  showReaction(fmt("%N blinzelt. Er tut so, als wäre er längst wach gewesen.", ctx()));
  save(); renderAll();
}

// Zustands- und Belohnungslogik, getrennt von der Visualisierung
function feedApply(snackId) {
  applyDecay();
  const p = state.pet;
  p.sleeping = false;
  const snack = ALL_SNACKS.find(s => s.id === snackId);
  const wasHungry = p.stats.saettigung < 30;
  const tooFull = p.stats.saettigung >= 85;
  const isFav = snackId === p.favSnack;
  const discovery = isFav && !p.favDiscovered;
  if (tooFull && !discovery) {
    p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
    save();
    return { refused: true, snack };
  }
  return { refused: false, snack, wasHungry, isFav, discovery };
}

function feed(snackId) {
  if (blockIfAway()) return;
  const r = feedApply(snackId);
  const snack = r.snack;
  if (r.refused) {
    scrollToScene();
    homePet?.play("wiggle", 600);
    setTimeout(() => showReaction(fmt(pick(TOO_FULL), ctx())), 350);
    renderAll();
    return;
  }
  feedFinish(snackId, r, "ground");
}

function feedFinish(snackId, r, mode) {
  const { wasHungry, isFav, discovery, snack } = r;
  const p = state.pet;

  p.stats.saettigung += snack.eff.saett;
  p.stats.laune += snack.eff.laune + (isFav ? 8 : 0);
  p.stats.energie += snack.eff.energie;
  p.stats.bond += (snack.eff.bond || 0) + (isFav ? 1 : 0);
  clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction("fuettern");

  let text;
  if (discovery) {
    p.favDiscovered = true;
    addChronicle("\u2764", `Lieblingssnack entdeckt`);
    text = fmt(FEED_REACTIONS.discovery, ctx({ S: snack.title }));
    addDiary("snack", { S: snack.title });
    captureMoment("favsnack", snack.title);
    homePet?.emote("star", 2200);
    playSound("success");
  } else if (isFav) {
    homePet?.emote("star", 1500);
    text = fmt(pick(FEED_REACTIONS.favorite), ctx({ S: snack.title }));
  } else if (wasHungry) {
    text = fmt(pick(FEED_REACTIONS[snackId].concat(FEED_REACTIONS.hungry)), ctx());
  } else {
    text = fmt(pick(FEED_REACTIONS[snackId]), ctx());
  }

  let xp = 4 + (snack.eff.xp || 0);
  if (wasHungry) { xp *= 2; text = fmt(HUNGER_BONUS_TEXT, ctx()) + " " + text; }

  const onEaten = () => {
    showReaction(text);
    sceneFloat(`+${snack.eff.saett} Sättigung`, "#8ca659");
    setTimeout(() => sceneFloat(`+${xp} XP`, "#9e486b"), 350);
  };
  if (mode === "hand") handFeedSequence(isFav || discovery, onEaten);
  else feedSequence(snack.icon, isFav || discovery, onEaten);
  if (Math.random() < 0.25) addDiary("interaction", { type: "fuettern" });
  wishBump("feedSnack", snackId);
  handleLevelUp(addXP(xp));
  questProgress("fuettern");
  checkUnlocks(); save(); renderAll();
}

function talk(topicId) {
  applyDecay();
  const p = state.pet;
  p.sleeping = false;
  p.stats.laune += 6; p.stats.bond += 3; bump("anhaenglich", 1.5); clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction("reden");
  const trait = dominantTrait();
  let pool = [...TALK_REACTIONS[topicId]];
  const special = TALK_REACTIONS[`${topicId}_${trait}`];
  if (special) pool.push(special);
  showReaction(fmt(pick(pool), ctx()));
  if (Math.random() < 0.25) addDiary("interaction", { type: "reden" });
  earnDust(3);
  wishBump("reden");
  handleLevelUp(addXP(6));
  questProgress("reden");
  checkUnlocks(); save(); renderAll();
}

function doCheckIn(answerId) {
  const p = state.pet;
  if (p.lastCheckInDay === todayKey()) return;
  applyDecay();
  if (p.lastCheckInDay === yesterdayKey()) {
    p.streak += 1;
    if (p.streak === 7) captureMoment("streak7");
  }
  else if (p.lastCheckInDay === twoDaysAgoKey() && state.streakFreezes > 0) {
    state.streakFreezes--;
    p.streak += 1;
    showToast({ icon: "\u2744", title: "Streak-Schutz eingesetzt", detail: `Deine Serie lebt weiter: ${p.streak + 0} Tage. Verbleibend: ${state.streakFreezes}` });
  }
  else p.streak = 1;
  p.lastCheckInDay = todayKey();
  const m = p.memory;
  m.checkinCounts[answerId] = (m.checkinCounts[answerId] || 0) + 1;
  m.recent.unshift(answerId); m.recent = m.recent.slice(0, 7);
  recordInteraction("checkin");
  p.stats.bond += 5; p.stats.laune += 5; clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();

  let text;
  if (answerId === "super" && m.recent[1] === "stressig") text = CHECKIN_REACTIONS.comeback;
  else if (answerId === "stressig" && m.recent[1] === "stressig") text = CHECKIN_REACTIONS.stressAgain;
  else {
    text = CHECKIN_REACTIONS[answerId];
    if (p.streak > 1 && p.streak % 5 === 0) text += ` Und: ${p.streak} Tage in Folge. %N führt Buch.`;
  }
  showReaction(fmt(text, ctx()));
  addDiary("checkin", { answer: answerId });
  playSound("success");
  earnDust(Math.min(10 + p.streak * 2, 25));
  sceneFloat("+15 XP", "#9e486b");
  weeklyProgress("checkins");
  handleLevelUp(addXP(15));
  questProgress("checkin");
  checkUnlocks(); save(); renderAll();
}

function finishMiniGame(score, mode = "sterne") {
  applyDecay();
  const p = state.pet;
  p.sleeping = false;
  p.stats.laune += 14; p.stats.energie -= 10; p.stats.bond += 2;
  bump("chaotisch", 1.5); clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction("spielen");
  const isBest = score > (state.best[mode] || 0);
  if (isBest) state.best[mode] = score;
  if (mode === "sterne") p.bestScore = state.best.sterne; // Legacy-Feld mitziehen

  if (state.care.gamesDay !== todayKey()) { state.care.gamesDay = todayKey(); state.care.gamesCount = 0; }
  const gameRewarded = state.care.gamesCount < 3;
  if (gameRewarded) state.care.gamesCount++;

  const pool = mode === "huetchen" ? GAME3_REACTIONS : mode === "blasen" ? GAME2_REACTIONS : GAME_REACTIONS;
  const th = mode === "huetchen" ? [2, 5] : [5, 12];
  let text;
  if (isBest && score > 0) text = pool.newBest;
  else if (score === 0) text = pool.zero;
  else if (score <= th[0]) text = pool.low;
  else if (score <= th[1]) text = pool.mid;
  else text = pool.high;
  if (!gameRewarded) text += " " + GAME_FUN_ONLY;
  showReaction(fmt(text, ctx({ S: score })));
  if (Math.random() < 0.34 || score >= 15) addDiary("game", { S: score, high: score >= 15 });
  if (gameRewarded) {
    const dustGain = mode === "huetchen" ? Math.min(score * 3, 18) : Math.min(score, 15);
    const xpGain = mode === "huetchen" ? Math.min(4 + score * 2, 20) : Math.min(4 + Math.floor(score / 2), 18);
    earnDust(dustGain);
    handleLevelUp(addXP(xpGain));
  }
  weeklyProgress("spiele");
  wishBump("spielen");
  questProgress("spielen");
  if (mode === "blasen") questProgress("blasen");
  if (score >= 10) questProgress("minigame");
  checkUnlocks(); save(); renderAll();
  return isBest;
}

// ---------- Engine: Tageswunsch ----------
function ensureWish() {
  if (state.wish?.dayKey === todayKey()) return;
  const options = ["streicheln", "spielen", "reden", "feedSnack", "feedSnack"];
  const kind = pick(options);
  if (kind === "feedSnack") {
    const owned = SNACKS.concat(PREMIUM_SNACKS.filter(s => state.ownedSnacks.includes(s.id)));
    const s = pick(owned);
    const w = WISH_TYPES.feedSnack.make(s);
    state.wish = { dayKey: todayKey(), type: "feedSnack", snack: s.id, title: w.title, text: w.text, target: 1, progress: 0, done: false };
  } else {
    const def = WISH_TYPES[kind];
    state.wish = { dayKey: todayKey(), type: kind, title: def.title, text: def.text, target: def.target, progress: 0, done: false };
  }
}

function wishBump(kind, snackId) {
  ensureWish();
  const w = state.wish;
  if (!w || w.done) return;
  if (w.type !== kind) return;
  if (kind === "feedSnack" && w.snack !== snackId) return;
  w.progress++;
  if (w.progress >= w.target) {
    w.done = true;
    state.wishesDone++;
    state.pet.stats.bond = clamp(state.pet.stats.bond + 3, 0, 100);
    earnDust(30);
    showReaction(fmt(pick(WISH_DONE_REACTIONS), ctx({ S: 30 })));
    state.diary.unshift({ date: Date.now(), mood: "gluecklich", text: fmt(WISH_DIARY, ctx()) });
    playSound("success");
    questProgress("wunsch");
  }
}

// ---------- Minispiel: Brösels Hütchen ----------
const cup = { round: 0, mimoSlot: 0, slots: [0, 1, 2], busy: false, running: false, pet: null };

function cupSlotX(slot) { return (slot - 1) * 92; }

function openCups() {
  if (blockIfAway()) return;
  $("#cupOverlay").classList.remove("hidden");
  $("#cupTitle").textContent = CUP_TEXTS.title;
  $("#cupSub").textContent = fmt(CUP_TEXTS.intro, ctx());
  $("#cupRound").textContent = "";
  $("#cupStart").classList.remove("hidden");
  if (!cup.pet) {
    cup.pet = createPet($("#cupMimoMount"), 74, { static: true });
    cup.pet.update("frech", false, "none");
  }
  $("#cupMimoMount").classList.add("hidden");
  cupResetCups();
}

function cupResetCups() {
  cup.slots = [0, 1, 2];
  $$(".cup").forEach((el, i) => {
    el.style.setProperty("--cx", cupSlotX(i) + "px");
    el.classList.remove("lifted");
    el.dataset.cup = i;
  });
}

function startCupRound() {
  cup.round = cup.round || 1;
  cup.busy = true; cup.running = true;
  $("#cupStart").classList.add("hidden");
  $("#cupRound").textContent = fmt(CUP_TEXTS.roundLabel, ctx({ S: cup.round }));
  cupResetCups();
  // Mimo zeigen: sitzt unter zufaelligem Becher
  cup.mimoSlot = Math.floor(Math.random() * 3);
  const mm = $("#cupMimoMount");
  mm.classList.remove("hidden");
  mm.style.setProperty("--cx", cupSlotX(cup.mimoSlot) + "px");
  $$(".cup")[cup.mimoSlot].classList.add("lifted");
  setTimeout(() => {
    $$(".cup").forEach(el => el.classList.remove("lifted"));
    mm.classList.add("hidden");
    setTimeout(() => cupShuffle(), 450);
  }, 1100);
}

function cupShuffle() {
  const swaps = 3 + cup.round;
  const dur = Math.max(150, 420 - cup.round * 35);
  let i = 0;
  const doSwap = () => {
    if (i++ >= swaps) { cup.busy = false; return; }
    let a = Math.floor(Math.random() * 3), b = Math.floor(Math.random() * 3);
    while (b === a) b = Math.floor(Math.random() * 3);
    // slots[cupIndex] = slot-Position; tausche Positionen der Becher a und b
    const cups = $$(".cup");
    const slotA = cup.slots[a], slotB = cup.slots[b];
    cup.slots[a] = slotB; cup.slots[b] = slotA;
    cups[a].style.transition = `transform ${dur}ms ease-in-out`;
    cups[b].style.transition = `transform ${dur}ms ease-in-out`;
    cups[a].style.setProperty("--cx", cupSlotX(slotB) + "px");
    cups[b].style.setProperty("--cx", cupSlotX(slotA) + "px");
    setTimeout(doSwap, dur + 60);
  };
  // Mimo sitzt unter dem Becher, der auf mimoSlot startete: finde cupIndex mit slots[idx]===mimoSlot
  cup.mimoCup = cup.slots.indexOf(cup.mimoSlot);
  doSwap();
}

function cupPick(cupIndex) {
  if (cup.busy || !cup.running) return;
  cup.busy = true;
  const el = $$(".cup")[cupIndex];
  el.classList.add("lifted");
  const mimoHere = cupIndex === cup.mimoCup;
  const mm = $("#cupMimoMount");
  if (mimoHere) {
    mm.classList.remove("hidden");
    mm.style.setProperty("--cx", cupSlotX(cup.slots[cupIndex]) + "px");
    cup.pet.emote("star", 1200);
    playSound("success");
    $("#cupSub").textContent = fmt(pick(CUP_TEXTS.found), ctx());
    const won = cup.round;
    if (won >= 12) { cupEnd(won); return; }
    cup.round++;
    setTimeout(() => { mm.classList.add("hidden"); el.classList.remove("lifted"); startCupRound(); }, 1300);
  } else {
    // aufdecken, wo er wirklich war
    const realEl = $$(".cup")[cup.mimoCup];
    setTimeout(() => {
      realEl.classList.add("lifted");
      mm.classList.remove("hidden");
      mm.style.setProperty("--cx", cupSlotX(cup.slots[cup.mimoCup]) + "px");
      cup.pet.emote("bliss", 1200);
    }, 350);
    $("#cupSub").textContent = fmt(CUP_TEXTS.lost, ctx());
    setTimeout(() => cupEnd(cup.round - 1), 1600);
  }
}

function cupEnd(score) {
  cup.running = false; cup.busy = false;
  cup.round = 0;
  $("#cupOverlay").classList.add("hidden");
  questProgress("huetchen");
  finishMiniGame(score, "huetchen");
}

// ---------- Gesten-Hinweise: einmal zeigen, dann nie wieder ----------
let hintTimer = null;
function hintOnce(id) {
  state.hints = state.hints || {};
  if (state.hints[id] || !HINTS[id]) return;
  state.hints[id] = true;
  save();
  const el = $("#coachHint");
  if (!el) return;
  $("#coachHintText").textContent = fmt(HINTS[id], ctx());
  el.classList.remove("hidden");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.add("hidden"), 5200);
}

// ---------- Room: Deko zum Anfassen ----------
function gongSound() {
  try {
    if (state?.sound && !soundSettings().sfx) return;
    if (!sndInit()) return;
    const t = snd.ctx.currentTime;
    const o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g); g.connect(snd.sfx);
    o.start(t); o.stop(t + 1.9);
  } catch (e) {}
}
function crackleSound() {
  try {
    if (state?.sound && !soundSettings().sfx) return;
    if (!sndInit()) return;
    const t = snd.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
      o.type = "square"; o.frequency.value = 90 + Math.random() * 340;
      const at = t + Math.random() * 0.5;
      g.gain.setValueAtTime(0.05, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.045);
      o.connect(g); g.connect(snd.sfx);
      o.start(at); o.stop(at + 0.05);
    }
  } catch (e) {}
}

let radioOn = false;
function roomTap(id) {
  if (!ROOM_TAP[id]) return;
  const grp = $("#deco" + id.charAt(0).toUpperCase() + id.slice(1));
  if (grp) { grp.classList.remove("deco-wobble"); void grp.getBoundingClientRect(); grp.classList.add("deco-wobble"); }
  // Spezial-Effekte
  if (id === "radio") {
    radioOn = !radioOn;
    grp?.classList.toggle("radio-on", radioOn);
    if (radioOn && snd.unlocked && soundSettings().music) { playPadNote(392, 0.8); playPadNote(523.3, 0.8, 0.35); playPadNote(659.3, 1.2, 0.7); }
  } else if (id === "zen") gongSound();
  else if (id === "kamin") crackleSound();
  else if (id === "aquarium") playSound("catch");
  else if (id === "uhr") { playSound("msg"); }
  // Mimo im Room reagiert
  roomPet?.lookAt((Math.random() * 2 - 1) * 0.8, -0.3);
  setTimeout(() => roomPet?.lookAt(0, 0), 1400);
  if (Math.random() < 0.3) roomPet?.play("wiggle", 600);
  // Zimmer-Kenner
  state.roomTapped = state.roomTapped || {};
  state.roomTapped[id] = true;
  showRoomBubble(fmt(pick(ROOM_TAP[id]), ctx()));
  applyDecay();
  state.pet.stats.laune = clamp(state.pet.stats.laune + 1, 0, 100);
  checkUnlocks(); save();
}

let roomBubbleTimer = null;
function showRoomBubble(text) {
  const b = $("#roomBubble");
  if (!b) return;
  $("#roomBubbleText").textContent = text;
  b.classList.remove("hidden");
  clearTimeout(roomBubbleTimer);
  roomBubbleTimer = setTimeout(() => b.classList.add("hidden"), 4200);
}

// ---------- Engine: Chronik ----------
function addChronicle(icon, title) {
  if (!state.chronicle) state.chronicle = [];
  state.chronicle.unshift({ at: Date.now(), icon, title });
  state.chronicle = state.chronicle.slice(0, 60);
}

// ---------- Engine: Live-Stories (Echtzeit) ----------
const randMin = (a, b) => (a + Math.random() * (b - a)) * 60000;

// Nachtklammer: 23:30 - 07:30 wird auf den Morgen geschoben
function clampNight(ts) {
  const d = new Date(ts);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 23.5) { d.setDate(d.getDate() + 1); d.setHours(7, 30 + Math.floor(Math.random() * 45), 0, 0); return d.getTime(); }
  if (h < 7.5) { d.setHours(7, 30 + Math.floor(Math.random() * 45), 0, 0); return d.getTime(); }
  return ts;
}

function liveStoryDef() { return state.live ? LIVE_STORIES.find(s => s.id === state.live.storyId) : null; }

function maybeStartLiveStory() {
  if (state.live && !state.live.done) return;
  state.liveDone = state.liveDone || [];
  state.liveFinishedAt = state.liveFinishedAt || {};
  for (const story of LIVE_STORIES) {
    if (state.liveDone.includes(story.id)) continue;
    const g = story.gate || {};
    if (state.pet.stats.level < (g.level || 1)) continue;
    if (g.requires && !state.liveDone.includes(g.requires)) continue;
    if (g.daysAfter && g.requires) {
      const doneAt = state.liveFinishedAt[g.requires] || 0;
      if (!doneAt || Date.now() - doneAt < g.daysAfter * 864e5) continue;
    }
    state.live = {
      storyId: story.id, history: [], choices: {}, unread: 0,
      waitingChoice: null, nextNodeId: "start",
      availableAt: Date.now() + randMin(2, 6), done: false, startedAt: Date.now()
    };
    save();
    return;
  }
}

function processLive() {
  const lv = state.live, story = liveStoryDef();
  if (!lv || lv.done || !story) return false;
  let changed = false;
  let guard = 0;
  while (lv.nextNodeId && Date.now() >= lv.availableAt && guard++ < 60) {
    const node = story.nodes[lv.nextNodeId];
    lv.history.push({ id: lv.nextNodeId, at: lv.availableAt });
    lv.unread++;
    changed = true;
    if (node.c) { lv.waitingChoice = lv.nextNodeId; lv.nextNodeId = null; break; }
    if (node.end) { finishLiveStory(story); break; }
    const nx = story.nodes[node.next];
    lv.availableAt = clampNight(lv.availableAt + randMin(nx.d[0], nx.d[1]));
    lv.nextNodeId = node.next;
  }
  if (changed) save();
  return changed;
}

function chooseLive(idx) {
  const lv = state.live, story = liveStoryDef();
  if (!lv || !lv.waitingChoice) return;
  const node = story.nodes[lv.waitingChoice];
  const ans = node.c[idx];
  if (!ans) return;
  if (ans.key) lv.choices[ans.key] = ans.val;
  lv.history.push({ user: ans.l, at: Date.now() });
  lv.waitingChoice = null;
  lv.nextNodeId = ans.next;
  const nx = story.nodes[ans.next];
  lv.availableAt = clampNight(Date.now() + randMin(nx.d[0], nx.d[1]));
  save();
  processLive();
}

function finishLiveStory(story) {
  const lv = state.live;
  lv.done = true;
  lv.nextNodeId = null;
  state.liveDone = state.liveDone || [];
  state.liveDone.push(story.id);
  state.liveFinishedAt = state.liveFinishedAt || {};
  state.liveFinishedAt[story.id] = Date.now();
  earnDust(120);
  handleLevelUp(addXP(60));
  state.pet.stats.bond = clamp(state.pet.stats.bond + 5, 0, 100);
  if (story.id === "wand") {
    if (!state.souvenirs.includes("archivkarte")) state.souvenirs.push("archivkarte");
    unlockAchievement("wand.ende");
    captureMoment("archiv");
    addChronicle("\u{1F5DD}", "Ehren-Archivar: 'Das Geräusch hinter der Wand' bestanden");
    showToast({ icon: "\u{1F5DD}", title: "Ehren-Archivar", detail: fmt(LIVE_TEXTS.reward, ctx({ S: 120 })) });
  } else if (story.id === "inventur") {
    if (!state.souvenirs.includes("urkunde")) state.souvenirs.push("urkunde");
    unlockAchievement("inventur.ende");
    captureMoment("inventur");
    addChronicle("\u{1F4DC}", "Stellvertretender Verwalter: Brösels Inventur gemeistert");
    showToast({ icon: "\u{1F4DC}", title: "Stellvertretender Verwalter", detail: fmt(LIVE_TEXTS.reward, ctx({ S: 120 })) });
  }
  playSound("level");
  checkUnlocks(); save();
}

// ---------- Engine: Pings (Mimo schreibt von selbst) ----------
function ensurePings() {
  if (!state.pings) state.pings = { nextAt: clampNight(Date.now() + randMin(90, 200)), items: [] };
}

function processPings() {
  ensurePings();
  const pg = state.pings;
  let changed = false;
  if (Date.now() >= pg.nextAt) {
    const todayCount = pg.items.filter(i => todayKey(new Date(i.at)) === todayKey()).length;
    if (todayCount < 3) {
      const roll = Math.random();
      let item;
      if (roll < 0.35) {
        const care = pick(PING_CARE);
        item = { kind: "care", text: care.q, answers: care.a.map(a => a.l), reactions: care.a.map(a => a.r), at: Date.now(), answered: false };
      } else if (roll < 0.55 && Object.keys(state.talkFacts).length) {
        const key = pick(Object.keys(state.talkFacts).filter(k => FACT_DAILY[k]));
        item = key ? { kind: "note", text: fmt(pick(FACT_DAILY[key]), ctx({ V: state.talkFacts[key] })), at: Date.now() } : null;
      } else if (roll < 0.7 && recallableMoments().length) {
        item = { kind: "note", text: momentRecallLine(pick(recallableMoments())), at: Date.now() };
      } else {
        item = { kind: "note", text: fmt(pick(PING_THOUGHTS), ctx()), at: Date.now() };
      }
      if (item) { item.read = false; pg.items.push(item); pg.items = pg.items.slice(-20); changed = true; }
    }
    pg.nextAt = clampNight(Date.now() + randMin(150, 320));
    save();
  }
  return changed;
}

function pingAnswer(itemIdx, ansIdx) {
  const item = state.pings.items[itemIdx];
  if (!item || item.kind !== "care" || item.answered) return;
  item.answered = true;
  item.reply = item.answers[ansIdx];
  item.reaction = item.reactions[ansIdx];
  applyDecay();
  state.pet.stats.bond = clamp(state.pet.stats.bond + 1, 0, 100);
  save();
}

function pingsUnreadCount() {
  return (state.pings?.items || []).filter(i => !i.read).length;
}

function inboxUnread() {
  return (state.live && !state.live.done ? state.live.unread : 0) + pingsUnreadCount() +
    (state.live && state.live.waitingChoice ? 1 : 0);
}

// ---------- Engine: Story-Arc ----------
function arcState() {
  if (!state.arc) state.arc = { chapter: 0, doneAt: 0, choices: {} };
  return state.arc;
}

function arcNextChapter() {
  const a = arcState();
  return ARC_CHAPTERS.find(ch => ch.id === a.chapter + 1) || null;
}

// Rueckgabe: { ready:true } oder { ready:false, reason, value }
function arcGateCheck() {
  const a = arcState();
  const ch = arcNextChapter();
  if (!ch) return { ready: false, reason: "done" };
  const g = ch.gate || {};
  if (g.days && a.doneAt) {
    const daysSince = (Date.now() - a.doneAt) / 864e5;
    if (daysSince < g.days) {
      const opens = new Date(a.doneAt + g.days * 864e5);
      const label = todayKey(opens) === todayKey() ? "später heute" : opens.toLocaleDateString("de-DE", { weekday: "long" });
      return { ready: false, reason: "days", value: label };
    }
  }
  if (g.level && state.pet.stats.level < g.level) return { ready: false, reason: "level", value: g.level };
  if (g.bond && state.pet.stats.bond < g.bond) return { ready: false, reason: "bond", value: g.bond };
  return { ready: true, chapter: ch };
}

function buildArcConvo(ch) {
  return { id: "arc." + ch.id, type: "arc", nodes: ch.nodes, outro: ch.outro, _arc: ch };
}

function startArcChapter() {
  const gate = arcGateCheck();
  if (!gate.ready) return;
  startConversation(buildArcConvo(gate.chapter));
}

function finishArcChapter(ch) {
  const a = arcState();
  if (ch.id !== a.chapter + 1) return; // Schutz vor Doppelabschluss
  a.chapter = ch.id;
  a.doneAt = Date.now();
  handleLevelUp(addXP(15));
  state.pet.stats.bond = clamp(state.pet.stats.bond + 3, 0, 100);
  state.diary.unshift({ date: Date.now(), mood: "dramatisch", text: fmt(CONVO_DIARY.arc, ctx()) });
  if (ch.id === ARC_CHAPTERS.length) {
    addChronicle("\u2709", "Die Brief-Ermittlung abgeschlossen: Akte geschlossen");
    if (!state.souvenirs.includes("derbrief")) state.souvenirs.push("derbrief");
    captureMoment("brief");
    unlockAchievement("brief.ende");
    showToast({ icon: "\u2709", title: "Der Brief", detail: "Ein legendäres Andenken liegt jetzt im Album." });
    playSound("level");
  }
  checkUnlocks(); save();
}

// ---------- Engine: Innere Ruhe (Achtsamkeit) ----------
function calmToday() { return state.calm?.lastDay === todayKey(); }

function calmTier() {
  const pts = state.calm?.points || 0;
  let t = 0;
  for (let i = 0; i < CALM_TIERS.length; i++) if (pts >= CALM_TIERS[i].min) t = i;
  return t;
}

function calmDone(kind) {
  const cm = state.calm;
  applyDecay();
  const firstToday = !calmToday();
  if (firstToday) {
    cm.streak = cm.lastDay === yesterdayKey() ? cm.streak + 1 : 1;
    cm.lastDay = todayKey();
  }
  cm.points += firstToday ? 12 : 6;
  state.pet.stats.laune = clamp(state.pet.stats.laune + 8, 0, 100);
  state.pet.stats.bond = clamp(state.pet.stats.bond + 1, 0, 100);
  questProgress("achtsam");
  weeklyProgress("momente");
  const before = state.calm.tierSeen || 0;
  const t = calmTier();
  if (t > before) {
    cm.tierSeen = t;
    if (t >= 1) unlockAchievement("calm.tier2");
    if (t >= 3) unlockAchievement("calm.tier4");
    addChronicle("\u25CE", "Innere Ruhe: Stufe \u201E" + CALM_TIERS[t].name + "\u201C erreicht");
    setTimeout(() => showCelebration("Innere Ruhe: " + CALM_TIERS[t].name, fmt(CALM_TIERS[t].text, ctx())), 600);
    playSound("level");
  }
  if (homePet) homePet.svg.classList.add("calm");
  checkUnlocks(); save();
}

// ---------- Engine: Momente ----------
function captureMoment(type, detail) {
  if (!MOMENT_TYPES[type]) return;
  if (state.moments.some(m => m.type === type && m.detail === (detail || ""))) return; // keine Duplikate
  state.moments.unshift({ type, detail: detail || "", d: Date.now() });
  state.moments = state.moments.slice(0, 30);
}

function recallableMoments() {
  return state.moments.filter(m => (Date.now() - m.d) / 864e5 >= 3);
}

function momentRecallLine(m) {
  const days = Math.max(3, Math.round((Date.now() - m.d) / 864e5));
  return fmt(pick(MOMENT_TYPES[m.type].recall), ctx({ S: days, V: m.detail }));
}

function buildMemoryConvo(m) {
  const days = Math.max(3, Math.round((Date.now() - m.d) / 864e5));
  return {
    id: "erinnerung", type: "erinnerung",
    nodes: { start: {
      mimo: [...MEMORY_CONVO_INTRO, fmt(pick(MOMENT_TYPES[m.type].recall), ctx({ S: days, V: m.detail }))],
      answers: MEMORY_CONVO_ANSWERS
    }},
    outro: MEMORY_CONVO_OUTRO
  };
}

// ---------- Engine: Gespraeche ----------
function convoCond(cond) {
  const m = state.pet.memory, today = state.pet.lastCheckInDay === todayKey();
  if (cond === "stressToday") return today && m.recent[0] === "stressig" && m.recent[1] !== "stressig";
  if (cond === "superToday") return today && m.recent[0] === "super";
  if (cond === "stressStreak") return today && m.recent[0] === "stressig" && m.recent[1] === "stressig";
  return false;
}

function availableConversations() {
  const menu = [];
  const seenToday = (id) => state.convoSeen[id] === todayKey();
  // Kontext hat Vorrang (stressStreak vor stress)
  for (const id of ["ctx.stressAgain", "ctx.stress", "ctx.super"]) {
    const conv = CONVERSATIONS.find(x => x.id === id);
    if (conv && convoCond(conv.cond) && !seenToday(id)) { menu.push(conv); break; }
  }
  // Bond-Gespraeche (einmalig)
  if (!CONVERSATIONS.some(x => x.id === "deep.kosename")) CONVERSATIONS.push(NICKNAME_CONVO);
  const mems = recallableMoments();
  if (mems.length && state.convoSeen["erinnerung"] !== todayKey() && Math.random() < 0.6)
    menu.push(buildMemoryConvo(pick(mems)));
  const deeps = CONVERSATIONS.filter(x => x.type === "deep").sort((a, b) => a.minBond - b.minBond);
  for (const conv of deeps) {
    if (conv.minCalmTier && calmTier() < conv.minCalmTier) continue;
    if (state.pet.stats.bond >= conv.minBond && !state.convoSeen[conv.id]) { menu.push(conv); break; }
  }
  // Kennenlernen: max eins pro Tag, das naechste unbeantwortete
  if (state.lastFactDay !== todayKey()) {
    const nextFact = CONVERSATIONS.find(x => x.type === "fact" && !state.talkFacts[x.factKey]);
    if (nextFact) menu.push(nextFact);
  }
  // Geschichte: alle 2 Tage eine, am laengsten nicht gehoerte zuerst
  const stories = CONVERSATIONS.filter(x => x.type === "story");
  const fresh = stories.filter(s => {
    const last = state.convoSeen[s.id];
    return !last || (Date.now() - new Date(last).getTime()) / 864e5 >= 2;
  }).sort((a, b) => (state.convoSeen[a.id] || "0").localeCompare(state.convoSeen[b.id] || "0"));
  if (fresh.length) menu.push(fresh[0]);
  // Quatschen immer
  menu.push(pick(CONVERSATIONS.filter(x => x.type === "quatsch")));
  return menu.slice(0, 4);
}

function talkHasNews() {
  return inboxUnread() > 0 || availableConversations().some(c => c.type !== "quatsch");
}

const chat = { conv: null, busy: false, bondExtra: 0, finished: false, mode: "convo" };

function fmtClock(ts) {
  const d = new Date(ts);
  const hm = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (todayKey(d) === todayKey()) return hm;
  if (todayKey(d) === yesterdayKey()) return "gestern " + hm;
  return d.toLocaleDateString("de-DE", { weekday: "short" }) + " " + hm;
}

function addTimeDivider(ts) {
  const el = document.createElement("div");
  el.className = "msg-time";
  el.textContent = fmtClock(ts);
  $("#chatScroll").appendChild(el);
}

function openLiveChat() {
  const lv = state.live, story = liveStoryDef();
  if (!lv || !story) return;
  chat.mode = "live";
  $("#chatName").textContent = state.pet.name;
  $("#chatStatus").textContent = story.title;
  $("#chatScroll").innerHTML = "";
  const av = $("#chatAvatar"); av.innerHTML = "";
  createPet(av, 56, { static: true }).update("dramatisch", false, state.pet.hat);
  let lastDividerDay = null;
  for (const h of lv.history) {
    const day = todayKey(new Date(h.at));
    if (day !== lastDividerDay || lv.history.indexOf(h) === 0) { addTimeDivider(h.at); lastDividerDay = day; }
    if (h.user) addMsg("msg-user", h.user);
    else {
      const node = story.nodes[h.id];
      for (const line of node.m) {
        let out = line;
        if (out.includes("%SCHACHTEL")) out = out.replace("%SCHACHTEL", LIVE2_SCHACHTEL[lv.choices.schachtel] || LIVE2_SCHACHTEL.verwahren);
        addMsg("msg-mimo", fmt(out, ctx()));
      }
    }
  }
  renderLiveAnswers();
  lv.unread = 0; save();
  openSheet("sheet-chat");
  chatScrollDown();
}

function renderLiveAnswers() {
  const lv = state.live, story = liveStoryDef();
  const box = $("#chatAnswers");
  box.innerHTML = "";
  if (!lv) return;
  if (lv.waitingChoice) {
    const node = story.nodes[lv.waitingChoice];
    node.c.forEach((a, i) => {
      const b = document.createElement("button");
      b.textContent = a.l;
      b.onclick = () => {
        addMsg("msg-user", a.l);
        chooseLive(i);
        renderLiveAnswers();
        chatScrollDown();
      };
      box.appendChild(b);
    });
  } else if (lv.done) {
    const end = document.createElement("button");
    end.className = "chat-end";
    end.textContent = "Was für eine Geschichte";
    end.onclick = () => { closeSheets(); renderAll(); };
    box.appendChild(end);
  } else {
    const status = document.createElement("div");
    status.className = "live-status";
    const at = new Date(lv.availableAt);
    const label = todayKey(at) === todayKey()
      ? fmt(LIVE_TEXTS.nextAt, ctx({ S: at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) }))
      : fmt(LIVE_TEXTS.nextAtTomorrow, ctx());
    status.textContent = label;
    box.appendChild(status);
  }
}

function openPingsChat() {
  ensurePings();
  chat.mode = "pings";
  $("#chatName").textContent = state.pet.name;
  $("#chatStatus").textContent = "Nachrichten";
  $("#chatScroll").innerHTML = "";
  const av = $("#chatAvatar"); av.innerHTML = "";
  createPet(av, 56, { static: true }).update("anhaenglich", false, state.pet.hat);
  const items = state.pings.items.slice(-10);
  items.forEach((item) => {
    addTimeDivider(item.at);
    addMsg("msg-mimo", item.text);
    if (item.kind === "care") {
      if (item.answered) {
        addMsg("msg-user", item.reply);
        addMsg("msg-mimo", item.reaction);
      } else {
        const wrap = document.createElement("div");
        wrap.className = "ping-answers";
        item.answers.forEach((l, ai) => {
          const b = document.createElement("button");
          b.textContent = l;
          b.onclick = () => {
            pingAnswer(state.pings.items.indexOf(item), ai);
            openPingsChat(); // neu rendern mit Antwort + Reaktion
          };
          wrap.appendChild(b);
        });
        $("#chatScroll").appendChild(wrap);
      }
    }
  });
  $("#chatAnswers").innerHTML = "";
  const end = document.createElement("button");
  end.className = "chat-end";
  end.textContent = "Schließen";
  end.onclick = () => { closeSheets(); renderAll(); };
  $("#chatAnswers").appendChild(end);
  state.pings.items.forEach(i => { i.read = true; });
  save();
  openSheet("sheet-chat");
  chatScrollDown();
}

function startConversation(conv) {
  if (blockIfAway()) { closeSheets(); return; }
  chat.mode = "convo";
  chat.conv = conv; chat.busy = false; chat.bondExtra = 0; chat.finished = false;
  $("#chatName").textContent = state.pet.name;
  $("#chatStatus").textContent = "tippt gleich los";
  $("#chatScroll").innerHTML = "";
  $("#chatAnswers").innerHTML = "";
  const av = $("#chatAvatar"); av.innerHTML = "";
  const mini = createPet(av, 56, { static: true });
  mini.update("anhaenglich", false, state.pet.hat);
  openSheet("sheet-chat");
  playNode("start");
}

function chatScrollDown() {
  const sc = $("#chatScroll");
  sc.scrollTop = sc.scrollHeight;
}

function addMsg(cls, text) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.textContent = text;
  $("#chatScroll").appendChild(el);
  chatScrollDown();
  return el;
}

function pushMimoLines(lines, done) {
  chat.busy = true;
  $("#chatStatus").textContent = "tippt …";
  let i = 0;
  const next = () => {
    if (i >= lines.length) {
      chat.busy = false;
      $("#chatStatus").textContent = "wartet auf dich";
      done && done();
      return;
    }
    const line = fmt(lines[i], ctx());
    const typing = addMsg("msg-mimo msg-typing", "");
    typing.innerHTML = "<i></i><i></i><i></i>";
    setTimeout(() => {
      typing.classList.remove("msg-typing");
      typing.innerHTML = "";
      typing.textContent = line;
      chatScrollDown();
      i++;
      setTimeout(next, 260);
    }, Math.min(420 + line.length * 9, 1400));
  };
  next();
}

function showAnswers(answers) {
  $("#chatAnswers").innerHTML = "";
  for (const a of answers) {
    const b = document.createElement("button");
    b.textContent = a.label;
    b.onclick = () => {
      if (chat.busy) return;
      $("#chatAnswers").innerHTML = "";
      addMsg("msg-user", a.label);
      if (a.factValue && chat.conv.factKey) {
        state.talkFacts[chat.conv.factKey] = a.factValue;
        state.lastFactDay = todayKey();
      }
      if (a.choiceKey) arcState().choices[a.choiceKey] = a.choiceValue;
      if (a.bond) chat.bondExtra += a.bond;
      pushMimoLines(a.react || [], () => {
        if (a.next) playNode(a.next);
        else finishConvo();
      });
    };
    $("#chatAnswers").appendChild(b);
  }
  chatScrollDown();
}

function playNode(key) {
  const node = chat.conv.nodes[key];
  pushMimoLines(node.mimo, () => showAnswers(node.answers));
}

function finishConvo() {
  const conv = chat.conv;
  const outro = conv.outro && conv.outro.length ? conv.outro : [];
  pushMimoLines(outro, () => {
    if (!chat.finished) {
      chat.finished = true;
      const quatsch = conv.type === "quatsch";
      applyDecay();
      const p = state.pet;
      p.sleeping = false;
      // Quatsch-Tagesbudget: 3 belohnte Plaudereien pro Tag
      if (state.care.quatschDay !== todayKey()) { state.care.quatschDay = todayKey(); state.care.quatschCount = 0; }
      let rewarded = true;
      if (quatsch) {
        rewarded = state.care.quatschCount < 3;
        if (rewarded) state.care.quatschCount++;
      }
      p.stats.laune = clamp(p.stats.laune + 6, 0, 100);
      p.stats.bond = clamp(p.stats.bond + (rewarded ? (quatsch ? 1 : 2) : 0) + chat.bondExtra, 0, 100);
      bump("anhaenglich", 1.5);
      p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
      recordInteraction("reden");
      state.convoSeen[conv.id] = todayKey();
      state.convosDone++;
      weeklyProgress("gespraeche");
      const dust = rewarded ? (conv.type === "fact" || conv.type === "deep" ? 5 : 0) : 0;
      if (dust) earnDust(dust);
      wishBump("reden");
      if (conv.type === "arc" && conv._arc) finishArcChapter(conv._arc);
      if (conv.id === "deep.stille" && !state.souvenirs.includes("ruhestein")) {
        state.souvenirs.push("ruhestein");
        showToast({ icon: "\u{1FAA8}", title: "Der ruhige Stein", detail: "Ein legendäres Andenken liegt jetzt im Album." });
      }
      const diaryChance = { fact: 1, deep: 1, context: 0.6, story: 0.5, quatsch: 0.2, erinnerung: 0, arc: 0 }[conv.type] || 0.3;
      if (Math.random() < diaryChance)
        state.diary.unshift({ date: Date.now(), mood: computeMood(), text: fmt(CONVO_DIARY[conv.type], ctx()) });
      const rw = document.createElement("div");
      rw.className = "msg-reward";
      rw.innerHTML = rewarded
        ? `<span class="chip chip-small">+${quatsch ? 4 : 8} XP</span>${dust ? `<span class="chip chip-dust chip-small">+${dust} Staub</span>` : ""}<span class="chip chip-small" style="color:#e56b6b;background:#e56b6b22">Bond +${(quatsch ? 2 : 4) + chat.bondExtra}</span>`
        : `<span class="chip chip-small">${fmt(pick(QUATSCH_FULL), ctx())}</span>`;
      $("#chatScroll").appendChild(rw);
      chatScrollDown();
      if (rewarded) handleLevelUp(addXP(quatsch ? 4 : 8));
      questProgress("reden");
      checkUnlocks(); save();
    }
    const end = document.createElement("button");
    end.className = "chat-end";
    end.textContent = "Fertig";
    end.onclick = () => { closeSheets(); renderAll(); };
    $("#chatAnswers").innerHTML = "";
    $("#chatAnswers").appendChild(end);
  });
}

// ---------- Engine: Expeditionen ----------
function expeditionActive() { return !!state.expedition; }

function blockIfAway() {
  if (!expeditionActive()) return false;
  showReaction(fmt("%N ist gerade auf Expedition. Er kommt wieder. Mit Geschichten.", ctx()));
  return true;
}

function startExpedition(tierId) {
  if (expeditionActive()) return;
  const tier = EXPED_TIERS.find(t => t.id === tierId);
  const dest = pick(EXPED_DESTS);
  applyDecay();
  state.pet.sleeping = false;
  state.expedition = { tier: tier.id, dest: dest.id, start: Date.now(), end: Date.now() + tier.mins * 60000 };
  showReaction(fmt(pick(EXPED_TEXTS.depart), ctx()));
  questProgress("expedition");
  save(); renderAll();
}

function destMastery(destId) {
  const v = state.destVisits[destId] || 0;
  return v >= 12 ? 3 : v >= 5 ? 2 : v >= 1 ? 1 : 0;
}

function rollSouvenir(tier, destId) {
  if (Math.random() > tier.souvenirChance) return null;
  const w = tier.rarWeights;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total, rar = "gewoehnlich";
  for (const key of Object.keys(w)) { r -= w[key]; if (r <= 0) { rar = key; break; } }
  const mastery = destMastery(destId);
  let pool = SOUVENIRS.filter(s => s.rar === rar && (!s.dest || (s.dest === destId && mastery >= 2)));
  // Kenner-Bonus: exklusives Stueck bevorzugen, solange es fehlt
  const excl = pool.find(s => s.dest === destId && !state.souvenirs.includes(s.id));
  if (excl && Math.random() < 0.5) return excl;
  if (!pool.length) pool = SOUVENIRS.filter(s => s.rar === rar && !s.dest);
  return pick(pool);
}

let pendingReturn = null;
function checkExpeditionReturn() {
  const ex = state.expedition;
  if (!ex || Date.now() < ex.end) return;
  const tier = EXPED_TIERS.find(t => t.id === ex.tier);
  const dest = EXPED_DESTS.find(d => d.id === ex.dest);
  const masteryBefore = destMastery(dest.id);
  state.destVisits[dest.id] = (state.destVisits[dest.id] || 0) + 1;
  const mastery = destMastery(dest.id);
  if (mastery > masteryBefore && mastery >= 2)
    showToast({ icon: "\u{1F396}", title: `${dest.title}: ${MASTERY_NAMES[mastery]}`, detail: fmt(MASTERY_TOAST, ctx({ S: MASTERY_NAMES[mastery], V: dest.title })) });
  const masteryDustBonus = 1 + (mastery - 1) * 0.15; // Kenner +15%, Legende +30%
  const dust = Math.round((tier.dust[0] + Math.floor(Math.random() * (tier.dust[1] - tier.dust[0] + 1))) * masteryDustBonus);
  const souvenir = rollSouvenir(tier, dest.id);
  let souvenirNew = false, bonusDust = 0;
  if (souvenir) {
    if (state.souvenirs.includes(souvenir.id)) bonusDust = Math.ceil(dust / 3);
    else {
      state.souvenirs.push(souvenir.id);
      souvenirNew = true;
      if (souvenir.rar === "episch" || souvenir.rar === "legendaer") captureMoment("fund", souvenir.title);
    }
  }
  state.expedition = null;
  state.expeditionsDone++;
  if (tier.id === "lang" && !state.moments.some(m => m.type === "reise")) captureMoment("reise");
  weeklyProgress("expeds");
  earnDust(dust + bonusDust);
  state.pet.stats.laune = clamp(state.pet.stats.laune + 10, 0, 100);
  state.pet.stats.hygiene = clamp(state.pet.stats.hygiene - (tier.id === "lang" ? 30 : tier.id === "mittel" ? 22 : 14), 0, 100);
  state.pet.stats.bond = clamp(state.pet.stats.bond + 2, 0, 100);
  state.pet.lastInteraction = Date.now(); state.pet.lastUpdate = Date.now();
  handleLevelUp(addXP(tier.id === "lang" ? 50 : tier.id === "mittel" ? 25 : 10));
  state.diary.unshift({ date: Date.now(), mood: "gluecklich", text: fmt(EXPED_TEXTS.diary, ctx({ S: dest.title })) });
  let storyPool = [...dest.stories];
  const ms = EXPED_MASTER_STORIES[dest.id] || {};
  if (mastery >= 2 && ms[2]) storyPool = storyPool.concat(ms[2], ms[2]);
  if (mastery >= 3 && ms[3]) storyPool = storyPool.concat(ms[3], ms[3]);
  pendingReturn = { story: pick(storyPool).map(l => fmt(l, ctx())).join(" "), dust: dust + bonusDust, souvenir, souvenirNew, bonusDust };
  pendingAway = null; // Rueckkehr-Overlay ersetzt Willkommen-zurueck
  checkUnlocks(); save();
}

function showReturn() {
  if (!pendingReturn) return;
  const r = pendingReturn; pendingReturn = null;
  $("#returnStory").textContent = r.story;
  const mount = $("#returnPetMount"); mount.innerHTML = "";
  createPet(mount, 100, { static: true }).update("gluecklich", false, state.pet.hat);
  let loot = `<div class="loot-row"><span class="loot-icon">\u2726</span><span><strong>Sternenstaub</strong><small>Reisekasse</small></span><span class="chip chip-dust chip-small">+${r.dust}</span></div>`;
  if (r.souvenir) {
    const rar = RARITIES[r.souvenir.rar];
    loot += `<div class="loot-row"><span class="loot-icon">${r.souvenir.icon}</span>
      <span><strong>${r.souvenir.title}</strong><small>${r.souvenirNew ? fmt(r.souvenir.flavor, ctx()) : "Duplikat \u2013 in Staub getauscht"}</small></span>
      <span class="chip chip-small" style="color:${rar.color};background:${rar.color}22">${rar.label}</span></div>`;
  } else {
    loot += `<div class="loot-row"><span class="loot-icon">\uD83D\uDCAC</span><span><strong>Nur Geschichten</strong><small>${fmt(EXPED_TEXTS.noSouvenir, ctx())}</small></span></div>`;
  }
  $("#returnLoot").innerHTML = loot;
  $("#returnOverlay").classList.remove("hidden");
  setTimeout(() => homePet?.chain([["jump", 550], ["wiggle", 600]]), 300);
  if (r.souvenirNew && (r.souvenir.rar === "episch" || r.souvenir.rar === "legendaer")) {
    confettiRun = true; runConfetti($("#returnConfetti"));
  }
  playSound("level");
}

// ---------- Engine: Momente (Atmen, Dankbarkeit) ----------
const breath = { timer: null, cycle: 0, phase: 0, pattern: null };

let breathRan = false;
function startBreath(patternId = "ruhe") {
  $("#breathOverlay").classList.remove("hidden");
  const mount = $("#breathPetMount"); mount.innerHTML = "";
  createPet(mount, 120, { static: true }).update("vertraeumt", false, "none");
  breath.pattern = BREATH_PATTERNS.find(p => p.id === patternId) || BREATH_PATTERNS[0];
  breathRan = false;
  clearTimeout(breath.timer); clearInterval(breath.numTimer);
  const pats = BREATH_PATTERNS.filter(p => !p.minTier || calmTier() >= p.minTier);
  $("#breathPatterns").innerHTML = pats.map(p =>
    `<button class="${p.id === breath.pattern.id ? "active" : ""}" data-pat="${p.id}">${p.title}</button>`).join("");
  $$("#breathPatterns button").forEach(b => b.onclick = () => startBreath(b.dataset.pat));
  // Intro-Zustand: erklaeren, dann bewusst starten
  $("#breathPhase").textContent = breath.pattern.title;
  $("#breathCount").textContent = breath.pattern.desc + ` \u00b7 ${breath.pattern.cycles} Runden`;
  $("#breathNum").textContent = "";
  $("#breathGuide").textContent = fmt(BREATH_TEXTS.intro, ctx());
  $("#breathDots").innerHTML = "";
  $("#breathStart").classList.remove("hidden");
  $("#breathPatterns").classList.remove("hidden");
  $("#breathRing").className = "breath-ring";
}

function runBreath() {
  breathRan = true;
  $("#breathStart").classList.add("hidden");
  $("#breathPatterns").classList.add("hidden");
  breath.cycle = 0; breath.phase = -1;
  $("#breathDots").innerHTML = Array.from({ length: breath.pattern.cycles }, () => '<span class="bdot"></span>').join("");
  breathStep();
}

function breathStep() {
  const plan = breath.pattern.plan;
  breath.phase++;
  if (breath.phase >= plan.length) { breath.phase = 0; breath.cycle++; }
  if (breath.cycle >= breath.pattern.cycles) { finishBreath(); return; }
  const [ph, ms] = plan[breath.phase];
  $("#breathRing").className = "breath-ring " + ph;
  $("#breathPhase").textContent = BREATH_TEXTS.phases[ph];
  $("#breathGuide").textContent = pick(BREATH_GUIDE[ph]);
  $("#breathCount").textContent = `Runde ${breath.cycle + 1} von ${breath.pattern.cycles}`;
  $$("#breathDots .bdot").forEach((el, i) => el.classList.toggle("on", i <= breath.cycle));
  clearInterval(breath.numTimer);
  let secs = Math.round(ms / 1000);
  $("#breathNum").textContent = secs;
  breath.numTimer = setInterval(() => {
    secs--;
    if (secs > 0) $("#breathNum").textContent = secs;
  }, 1000);
  breath.timer = setTimeout(breathStep, ms);
}

function finishBreath(skipped) {
  clearTimeout(breath.timer); clearInterval(breath.numTimer);
  $("#breathOverlay").classList.add("hidden");
  if (!breathRan || (skipped && breath.cycle < 3)) { renderAll(); return; } // zu frueh abgebrochen: keine Belohnung
  applyDecay();
  state.pet.stats.laune = clamp(state.pet.stats.laune + 8, 0, 100);
  state.pet.stats.bond = clamp(state.pet.stats.bond + 1, 0, 100);
  if (state.lastBreathDay !== todayKey()) { earnDust(5); state.lastBreathDay = todayKey(); }
  state.breathsDone++;
  showReaction(fmt(pick(BREATH_TEXTS.done.concat(CALM_DONE_LINES)), ctx()));
  questProgress("atmen");
  calmDone("atmen");
  renderAll();
}

function saveGratitude(text) {
  state.gratitude.unshift({ d: Date.now(), text });
  state.gratitude = state.gratitude.slice(0, 40);
  applyDecay();
  state.pet.stats.bond = clamp(state.pet.stats.bond + 2, 0, 100);
  state.pet.stats.laune = clamp(state.pet.stats.laune + 5, 0, 100);
  if (state.lastGratitudeDay !== todayKey()) { earnDust(8); state.lastGratitudeDay = todayKey(); }
  showReaction(fmt(pick(GRATITUDE_TEXTS.reactions), ctx()));
  if (Math.random() < 0.5) state.diary.unshift({ date: Date.now(), mood: "anhaenglich", text: fmt(GRATITUDE_TEXTS.diary, ctx()) });
  questProgress("dankbar");
  calmDone("dankbar");
  playSound("success");
  renderAll();
}

// ---------- Engine: Drei Dinge (Grounding) ----------
const ground = { timer: null, step: -1 };

function startGround() {
  $("#groundOverlay").classList.remove("hidden");
  const mount = $("#groundPetMount"); mount.innerHTML = "";
  createPet(mount, 110, { static: true }).update("vertraeumt", false, "none");
  ground.step = -1;
  $("#groundText").textContent = fmt(THREE_THINGS.intro, ctx());
  $("#groundBar").style.width = "0%";
  clearTimeout(ground.timer);
  ground.timer = setTimeout(groundStep, 2600);
}

function groundStep() {
  ground.step++;
  if (ground.step >= THREE_THINGS.steps.length) { finishGround(false); return; }
  const st = THREE_THINGS.steps[ground.step];
  $("#groundText").textContent = st.text;
  $("#groundBar").style.transition = "none";
  $("#groundBar").style.width = "0%";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("#groundBar").style.transition = `width ${st.secs}s linear`;
    $("#groundBar").style.width = "100%";
  }));
  ground.timer = setTimeout(groundStep, st.secs * 1000);
}

function finishGround(skipped) {
  clearTimeout(ground.timer);
  $("#groundOverlay").classList.add("hidden");
  if (skipped && ground.step < 2) { renderAll(); return; }
  state.calm.erden++;
  if (state.calm.lastGroundDay !== todayKey()) { earnDust(5); state.calm.lastGroundDay = todayKey(); }
  if (state.calm.erden >= 10) unlockAchievement("erden.10");
  showReaction(fmt(pick(THREE_THINGS.done), ctx()));
  calmDone("erden");
  renderAll();
}

// ---------- Engine: Gedanken-Wolke ----------
function releaseCloud(text) {
  closeSheets();
  scrollToScene();
  const stage = $(".stage");
  const el = document.createElement("div");
  el.className = "thought-cloud";
  el.innerHTML = `<span class="tc-puff"></span><span class="tc-text"></span>`;
  el.querySelector(".tc-text").textContent = text;
  stage.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("drift")));
  homePet?.lookAt(0.4, -0.8);
  setTimeout(() => { homePet?.lookAt(0, 0); }, 3800);
  setTimeout(() => el.remove(), 6200);
  state.calm.wolken++;
  if (state.calm.wolken >= 10) unlockAchievement("wolken.10");
  if (state.calm.lastCloudDay !== todayKey()) { earnDust(5); state.calm.lastCloudDay = todayKey(); }
  if (Math.random() < 0.4) state.diary.unshift({ date: Date.now(), mood: "vertraeumt", text: fmt(CLOUD_TEXTS.diary, ctx()) });
  setTimeout(() => showReaction(fmt(pick(CLOUD_TEXTS.release), ctx())), 2600);
  calmDone("wolke");
  renderAll();
}

// ---------- Engine: Tagesabschluss ----------
const evening = { step: 0, q1: null, q2: "" };

function eveningAvailable() {
  return new Date().getHours() >= EVENING_RITUAL.minHour && state.calm.lastEveningDay !== todayKey();
}

function startEvening() {
  evening.step = 1; evening.q1 = null; evening.q2 = "";
  renderEvening();
  openSheet("sheet-evening");
}

function renderEvening() {
  const box = $("#eveningBody");
  if (evening.step === 1) {
    box.innerHTML = `<p class="muted">${fmt(EVENING_RITUAL.intro, ctx())}</p><h3>${EVENING_RITUAL.q1.text}</h3>
      <div class="sheet-options">${EVENING_RITUAL.q1.answers.map(a => `<button data-a="${a}"><span>${a}</span></button>`).join("")}</div>`;
    $$("#eveningBody button").forEach(b => b.onclick = () => {
      evening.q1 = b.dataset.a; evening.step = 2; renderEvening();
    });
  } else if (evening.step === 2) {
    box.innerHTML = `<p class="muted">${EVENING_RITUAL.q1react[evening.q1]}</p><h3>${EVENING_RITUAL.q2.text}</h3>
      <input id="eveningInput" type="text" maxlength="90" placeholder="${EVENING_RITUAL.q2.placeholder}" autocomplete="off">
      <button class="btn-primary grat-save" id="eveningNext" disabled>Weiter</button>`;
    $("#eveningInput").addEventListener("input", () => { $("#eveningNext").disabled = !$("#eveningInput").value.trim(); });
    $("#eveningNext").onclick = () => {
      evening.q2 = $("#eveningInput").value.trim();
      evening.step = 3; renderEvening();
    };
  } else if (evening.step === 3) {
    box.innerHTML = `<h3>${EVENING_RITUAL.q3.text}</h3>
      <div class="sheet-options">${EVENING_RITUAL.q3.answers.map(a => `<button data-a="${a}"><span>${a}</span></button>`).join("")}</div>`;
    $$("#eveningBody button").forEach(b => b.onclick = () => finishEvening(b.dataset.a));
  }
}

function finishEvening(q3) {
  closeSheets();
  state.calm.abende++;
  state.calm.lastEveningDay = todayKey();
  if (state.calm.abende >= 7) unlockAchievement("abend.7");
  state.diary.unshift({ date: Date.now(), mood: "vertraeumt",
    text: fmt(EVENING_RITUAL.diary, ctx({ V: evening.q1?.toLowerCase(), S: evening.q2 })) });
  state.gratitude.unshift({ d: Date.now(), text: evening.q2 });
  state.gratitude = state.gratitude.slice(0, 40);
  earnDust(8);
  showReaction(EVENING_RITUAL.q3react[q3] + " " + fmt(EVENING_RITUAL.outro, ctx()));
  calmDone("abend");
  handleLevelUp(addXP(10));
  renderAll();
}

// ---------- Engine: Wochenziele ----------
function weekKey(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Montag = 0
  return todayKey(new Date(d.getTime() - day * 864e5));
}

function ensureWeekly() {
  if (state.weekly?.weekKey === weekKey()) return;
  const types = Object.keys(WEEKLY_TYPES).sort(() => Math.random() - 0.5).slice(0, 3);
  state.weekly = { weekKey: weekKey(), list: types.map(t => ({ type: t, progress: 0 })), done: false };
}

function weeklyProgress(type, amount = 1) {
  ensureWeekly();
  const wq = state.weekly;
  if (wq.done) return;
  let changed = false;
  for (const item of wq.list) {
    if (item.type === type && item.progress < WEEKLY_TYPES[type].target) {
      item.progress = Math.min(item.progress + amount, WEEKLY_TYPES[type].target);
      changed = true;
    }
  }
  if (!changed) return;
  if (wq.list.every(i => i.progress >= WEEKLY_TYPES[i.type].target)) {
    wq.done = true;
    state.weeklyDone++;
    earnDust(WEEKLY_REWARD.dust);
    showReaction(fmt(WEEKLY_DONE_TEXT, ctx()));
    playSound("level");
    handleLevelUp(addXP(WEEKLY_REWARD.xp));
    checkUnlocks();
  }
}

// ---------- Engine: Tagesgeschenk ----------
function giftAvailable() { return state.lastGiftDay !== todayKey(); }

function rollGift() {
  let tiers = GIFT_TIERS.map(t => ({ ...t }));
  if (state.pet.streak >= 3) { // Streak verschiebt die Chancen leicht nach oben
    tiers.find(t => t.id === "common").weight -= 6;
    tiers.find(t => t.id === "rare").weight += 4;
    tiers.find(t => t.id === "epic").weight += 2;
  }
  const total = tiers.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  for (const t of tiers) { r -= t.weight; if (r <= 0) return t; }
  return tiers[0];
}

function openGiftReward() {
  const tier = rollGift();
  const amount = tier.dust[0] + Math.floor(Math.random() * (tier.dust[1] - tier.dust[0] + 1));
  state.lastGiftDay = todayKey();
  state.giftsOpened++;
  earnDust(amount);
  if (Math.random() < 0.4) state.diary.unshift({ date: Date.now(), mood: computeMood(), text: fmt(GIFT_DIARY, ctx({ S: amount })) });
  questProgress("geschenk");
  checkUnlocks(); save();
  return { tier, amount };
}

// ---------- Engine: Shop ----------
function buyItem(kind, id) {
  let item, applied;
  if (kind === "freeze") {
    if (state.streakFreezes >= STREAK_FREEZE.max) return;
    if (!spendDust(STREAK_FREEZE.cost)) {
      showToast({ icon: "\u2726", title: "Zu wenig Sternenstaub", detail: fmt(SHOP_REACTIONS.broke, ctx()) });
      return;
    }
    state.streakFreezes++;
    state.purchases++;
    playSound("success");
    showToast({ icon: "\u2744", title: "Streak-Schutz gekauft", detail: "Wird automatisch eingesetzt, wenn du einen Tag verpasst." });
    checkUnlocks(); save(); renderAll();
    return;
  }
  if (kind === "snack") {
    item = PREMIUM_SNACKS.find(s => s.id === id);
    if (state.ownedSnacks.includes(id)) return;
    applied = () => state.ownedSnacks.push(id);
  } else if (kind === "hat") {
    item = SHOP_HATS.find(h => h.id === id);
    if (state.hats.includes(id)) return;
    applied = () => state.hats.push(id);
  } else {
    item = SHOP_DECO.find(d => d.id === id);
    if (state.ownedDeco.includes(id)) return;
    applied = () => state.ownedDeco.push(id);
  }
  if (!item) return;
  if (!spendDust(item.cost)) {
    showToast({ icon: "✦", title: "Zu wenig Sternenstaub", detail: fmt(SHOP_REACTIONS.broke, ctx()) });
    return;
  }
  applied();
  state.purchases++;
  playSound("success");
  showToast({ icon: "✓", title: `${item.title} gekauft`, detail: fmt(SHOP_REACTIONS[kind], ctx()) });
  checkUnlocks(); save(); renderAll();
}

// ---------- Engine: Quests, Erfolge, Hüte ----------
function ensureQuests() {
  if (state.quests?.dayKey === todayKey()) return;
  const types = Object.keys(QUEST_TYPES).sort(() => Math.random() - 0.5).slice(0, 3);
  state.quests = { dayKey: todayKey(), list: types.map(t => ({ type: t, progress: 0 })), bonus: false };
}

function questProgress(type) {
  ensureQuests();
  const q = state.quests;
  let changed = false;
  for (const item of q.list) {
    if (item.type === type && item.progress < QUEST_TYPES[type].target) {
      item.progress++;
      changed = true;
      if (item.progress >= QUEST_TYPES[type].target) earnDust(10);
    }
  }
  if (!changed) return;
  const allDone = q.list.every(i => i.progress >= QUEST_TYPES[i.type].target);
  if (allDone && !q.bonus) {
    q.bonus = true;
    earnDust(25);
    handleLevelUp(addXP(20));
    showReaction(fmt(pick(QUEST_BONUS), ctx()));
    playSound("success");
  }
}

function unlockAchievement(id) {
  if (state.achievements.includes(id)) return;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  state.achievements.push(id);
  addDiary("achievement", { S: def.title });
  showToast({ icon: def.icon, title: "Erfolg: " + def.title, detail: def.detail });
  playSound("success");
}

function checkUnlocks() {
  const p = state.pet;
  const cond = {
    "erster.checkin": p.lastCheckInDay !== null,
    "streak.7": p.streak >= 7,
    "bond.50": p.stats.bond >= 50,
    "level.5": p.stats.level >= 5,
    "level.10": p.stats.level >= 10,
    "tagebuch.10": state.diary.length >= 10,
    "snack.entdeckt": p.favDiscovered,
    "highscore.15": (state.best.sterne || 0) >= 15,
    "reich.300": p.dustEarned >= 300,
    "shopper": state.purchases >= 1,
    "stufe.3": petStage() >= 3,
    "wunsch.5": state.wishesDone >= 5,
    "geschenk.7": state.giftsOpened >= 7,
    "exped.1": state.expeditionsDone >= 1,
    "exped.10": state.expeditionsDone >= 10,
    "sammler.8": state.souvenirs.length >= 8,
    "album.voll": state.souvenirs.length >= SOUVENIRS.length,
    "atem.5": state.breathsDone >= 5,
    "dankbar.7": state.gratitude.length >= 7,
    "bond.freunde": bondTier() >= 2,
    "bond.seelen": bondTier() >= 4,
    "level.15": p.stats.level >= 15,
    "level.20": p.stats.level >= 20,
    "woche.1": state.weeklyDone >= 1,
    "meister.1": Object.values(state.destVisits).some(v => v >= 6),
    "gespraech.15": state.convosDone >= 15,
    "level.25": p.stats.level >= 25,
    "level.30": p.stats.level >= 30,
    "exped.50": state.expeditionsDone >= 50,
    "gespraech.100": state.convosDone >= 100,
    "streak.30": p.streak >= 30,
    "staub.5000": p.dustEarned >= 5000,
    "bad.20": (state.bathsDone || 0) >= 20,
    "woche.10": state.weeklyDone >= 10,
    "facts.alle": CONVERSATIONS.filter(x => x.type === "fact").every(x => state.talkFacts[x.factKey]),
    "album.30": state.souvenirs.length >= SOUVENIRS.length,
    "spiel.sterne40": (state.best?.sterne || 0) >= 40,
    "spiel.huetchen7": (state.best?.huetchen || 0) >= 7,
    "room.alle": Object.keys(state.roomTapped || {}).length >= 10
  };
  for (const id of Object.keys(cond)) if (cond[id]) unlockAchievement(id);
  checkBondTier();
  const hatCond = {
    schleife: p.stats.level >= 3, muetze: p.streak >= 3,
    blume: p.favDiscovered, krone: p.stats.level >= 8
  };
  for (const id of Object.keys(hatCond))
    if (hatCond[id] && !state.hats.includes(id)) state.hats.push(id);
}

// ---------- Sound (WebAudio, dezent) ----------
let audioCtx = null;
function playSound(kind) {
  if (state?.sound && !soundSettings().sfx) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "catch" ? [[880, 0.06]] :
                  kind === "giggle" ? [[740, 0.05], [988, 0.05], [880, 0.07]] :
                  kind === "msg" ? [[698, 0.07], [932, 0.1]] :
                  kind === "level" ? [[523, 0.1], [784, 0.14]] : [[659, 0.09], [880, 0.12]];
    let t = audioCtx.currentTime;
    for (const [f, d] of notes) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(snd.sfx || audioCtx.destination);
      o.start(t); o.stop(t + d); t += d * 0.7;
    }
  } catch (e) {}
}

// ---------- Klang-System: Busse, Unlock, generative Musik, Ambiente ----------
const snd = {
  ctx: null, master: null, music: null, amb: null, sfx: null,
  unlocked: false, musicTimer: null, ambNodes: [], chordIdx: 0,
  notesPlayed: 0, // fuer Tests/Debug
};

function soundSettings() {
  if (!state.sound) state.sound = { music: true, ambience: true, sfx: true };
  return state.sound;
}

function sndInit() {
  if (snd.ctx) return true;
  try {
    snd.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx = snd.ctx; // bestehende Effekte auf denselben Kontext
    snd.master = snd.ctx.createGain(); snd.master.gain.value = 1;
    snd.music = snd.ctx.createGain();  snd.music.gain.value = 0.055;
    snd.amb = snd.ctx.createGain();    snd.amb.gain.value = 0.05;
    snd.sfx = snd.ctx.createGain();    snd.sfx.gain.value = 0.5;
    snd.music.connect(snd.master); snd.amb.connect(snd.master); snd.sfx.connect(snd.master);
    snd.master.connect(snd.ctx.destination);
    return true;
  } catch (e) { return false; }
}

// iOS: Audio darf erst nach einer Nutzer-Geste starten
function sndUnlock() {
  if (snd.unlocked) return;
  if (!sndInit()) return;
  snd.ctx.resume?.();
  snd.unlocked = true;
  applySoundSettings();
}

function applySoundSettings() {
  const s = soundSettings();
  if (!snd.ctx) return;
  if (s.music && snd.unlocked) startMusic(); else stopMusic();
  if (s.ambience && snd.unlocked) startAmbience(); else stopAmbience();
}

function sndSuspend(hidden) {
  if (!snd.ctx) return;
  try { hidden ? snd.ctx.suspend() : (snd.unlocked && snd.ctx.resume()); } catch (e) {}
}

// ---------- Generative Musik: Phase + Wetter formen den Klangteppich ----------
const MUSIC_SCALES = {
  morgen: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3],
  tag:    [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3],
  abend:  [220.0, 261.6, 293.7, 329.6, 392.0],
  nacht:  [261.6, 392.0, 440.0]
};
const MUSIC_ROOTS = [130.8, 110.0, 174.6, 146.8]; // C3 A2 F3 D3

function musicParams() {
  const phase = dayPhase();
  const wtr = typeof getWeather === "function" ? getWeather() : "sonnig";
  return {
    scale: MUSIC_SCALES[phase] || MUSIC_SCALES.tag,
    gapMs: (phase === "nacht" ? [5200, 9500] : phase === "abend" ? [3400, 6400] : [2400, 5200]),
    cutoff: wtr === "regen" ? 900 : wtr === "nebel" ? 1100 : 1600,
    release: wtr === "nebel" ? 4.2 : 3.0
  };
}

function playPadNote(freq, dur, whenOffset = 0) {
  const t = snd.ctx.currentTime + whenOffset;
  const p = musicParams();
  const o1 = snd.ctx.createOscillator(), o2 = snd.ctx.createOscillator();
  o1.type = "sine"; o2.type = "triangle";
  o1.frequency.value = freq; o2.frequency.value = freq * 1.003; // leichte Schwebung
  const lp = snd.ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = p.cutoff;
  const g = snd.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + Math.min(1.4, dur * 0.4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + p.release);
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(snd.music);
  o1.start(t); o2.start(t);
  o1.stop(t + dur + p.release + 0.1); o2.stop(t + dur + p.release + 0.1);
  snd.notesPlayed++;
}

function musicStep() {
  if (!snd.ctx || !soundSettings().music) return;
  const p = musicParams();
  const roll = Math.random();
  if (roll < 0.18) {
    // Grundton-Pad, laenger
    snd.chordIdx = (snd.chordIdx + (Math.random() < 0.6 ? 1 : 0)) % MUSIC_ROOTS.length;
    playPadNote(MUSIC_ROOTS[snd.chordIdx], 3.2);
  } else if (roll < 0.34) {
    // kleines Zwei-Ton-Motiv
    const a = pick(p.scale), b = pick(p.scale);
    playPadNote(a, 1.2); playPadNote(b, 1.4, 0.9);
  } else if (roll < 0.8) {
    playPadNote(pick(p.scale), 1.6);
  } // sonst: bewusste Stille
  snd.musicTimer = setTimeout(musicStep, p.gapMs[0] + Math.random() * (p.gapMs[1] - p.gapMs[0]));
}

function startMusic() {
  if (snd.musicTimer || !snd.ctx) return;
  snd.musicTimer = setTimeout(musicStep, 800);
}
function stopMusic() {
  clearTimeout(snd.musicTimer); snd.musicTimer = null;
}

// ---------- Ambiente: Regen-Rauschen, Vogel morgens, Grillen nachts ----------
function startAmbience() {
  stopAmbience();
  if (!snd.ctx) return;
  const wtr = typeof getWeather === "function" ? getWeather() : "sonnig";
  if (wtr === "regen") {
    const len = snd.ctx.sampleRate * 2;
    const buf = snd.ctx.createBuffer(1, len, snd.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.6;
    const src = snd.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = snd.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 650;
    const g = snd.ctx.createGain(); g.gain.value = 0.5;
    src.connect(lp); lp.connect(g); g.connect(snd.amb);
    src.start();
    snd.ambNodes.push(src, g);
  }
  const phase = dayPhase();
  if (phase === "morgen" || phase === "nacht") {
    const chirpLoop = () => {
      if (!snd.ambNodes.includes(chirpLoop)) return;
      if (phase === "morgen") birdChirp(); else cricket();
      setTimeout(chirpLoop, (phase === "morgen" ? 7000 : 2600) + Math.random() * 9000);
    };
    snd.ambNodes.push(chirpLoop);
    setTimeout(chirpLoop, 2000);
  }
}
function stopAmbience() {
  snd.ambNodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch (e) {} });
  snd.ambNodes = [];
}

function birdChirp() {
  try {
    const t = snd.ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
      o.type = "sine";
      const f0 = 2300 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, t + i * 0.14);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + i * 0.14 + 0.09);
      g.gain.setValueAtTime(0.12, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.12);
      o.connect(g); g.connect(snd.amb);
      o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.14);
    }
  } catch (e) {}
}
function cricket() {
  try {
    const t = snd.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
      o.type = "square"; o.frequency.value = 4200 + Math.random() * 300;
      g.gain.setValueAtTime(0.03, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.05);
      o.connect(g); g.connect(snd.amb);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.06);
    }
  } catch (e) {}
}

let purrNodes = null;
function startPurrSound() {
  try {
    if (purrNodes) return;
    if (state?.sound && !soundSettings().sfx) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
    o.type = "triangle"; o.frequency.value = 62;
    lfo.frequency.value = 21; lg.gain.value = 0.035;
    g.gain.value = 0.045;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(snd.sfx || audioCtx.destination);
    o.start(); lfo.start();
    purrNodes = { o, g, lfo };
  } catch (e) {}
}
function stopPurrSound() {
  try {
    if (!purrNodes) return;
    const { o, g, lfo } = purrNodes;
    purrNodes = null;
    g.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08);
    setTimeout(() => { try { o.stop(); lfo.stop(); } catch (e) {} }, 260);
  } catch (e) {}
}
function munchSound() {
  try {
    if (state?.sound && !soundSettings().sfx) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "square"; o.frequency.value = 150 + Math.random() * 60;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g); g.connect(snd.sfx || audioCtx.destination); o.start(t); o.stop(t + 0.07);
  } catch (e) {}
}

// ---------- Pet-Rendering (SVG) ----------
const petInstances = [];

function createPet(mount, size, opts = {}) {
  const uid = "p" + Math.random().toString(36).slice(2, 8);
  mount.innerHTML = `
  <svg class="pet" width="${size}" height="${size * 0.96}" viewBox="0 0 260 250">
    <defs>
      <radialGradient id="gb${uid}" cx="0.38" cy="0.26" r="0.95">
        <stop offset="0" stop-color="#ffdfae"/><stop offset="0.55" stop-color="#fdbb80"/><stop offset="1" stop-color="#ef8d5c"/>
      </radialGradient>
      <linearGradient id="gy${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff3d9"/><stop offset="1" stop-color="#ffdcae"/>
      </linearGradient>
      <filter id="soft${uid}" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="9"/>
      </filter>
    </defs>
    <ellipse class="shadow" cx="130" cy="234" rx="68" ry="11" fill="#3a2434" opacity="0.18"/>
    <g class="stagewrap"><g class="breath"><g class="squishwrap"><g class="hop">
      <g class="earswrap"><g class="earL" transform="rotate(-6 84 66)">
        <ellipse cx="84" cy="58" rx="21" ry="28" fill="#f79a67"/>
        <ellipse cx="84" cy="62" rx="11" ry="16" fill="#ef7a52"/>
      </g>
      <g class="earR" transform="rotate(6 176 66)">
        <ellipse cx="176" cy="58" rx="21" ry="28" fill="#f79a67"/>
        <ellipse cx="176" cy="62" rx="11" ry="16" fill="#ef7a52"/>
      </g></g>
      <ellipse class="armL" cx="42" cy="152" rx="15" ry="22" fill="#f9a873"/>
      <ellipse class="armR" cx="218" cy="152" rx="15" ry="22" fill="#f9a873"/>
      <path class="blob" fill="url(#gb${uid})" d=""/>
      <ellipse cx="130" cy="182" rx="80" ry="44" fill="#e2703f" opacity="0.26" filter="url(#soft${uid})"/>
      <ellipse cx="130" cy="160" rx="50" ry="37" fill="url(#gy${uid})" opacity="0.95"/>
      <ellipse cx="98" cy="68" rx="44" ry="19" fill="#ffffff" opacity="0.5" transform="rotate(-19 98 68)"/>
      <ellipse cx="102" cy="212" rx="15" ry="9" fill="#ef8d5c"/>
      <ellipse cx="158" cy="212" rx="15" ry="9" fill="#ef8d5c"/>
      <ellipse cx="72" cy="146" rx="15" ry="10" fill="#ff8b76" opacity="0.6"/>
      <ellipse cx="188" cy="146" rx="15" ry="10" fill="#ff8b76" opacity="0.6"/>
      <g class="spots hidden">
        <ellipse cx="70" cy="92" rx="10" ry="7" fill="#ef8d5c" opacity="0.55" transform="rotate(-18 70 92)"/>
        <ellipse cx="196" cy="86" rx="8" ry="6" fill="#ef8d5c" opacity="0.5" transform="rotate(14 196 86)"/>
      </g>
      <g class="dirt hidden">
        <ellipse class="d1" cx="86" cy="150" rx="13" ry="8" fill="#8a7355" opacity="0.5" transform="rotate(-12 86 150)"/>
        <ellipse class="d2" cx="176" cy="128" rx="10" ry="7" fill="#7d6a4e" opacity="0.45" transform="rotate(15 176 128)"/>
        <ellipse class="d3" cx="132" cy="176" rx="12" ry="7" fill="#8a7355" opacity="0.5" transform="rotate(5 132 176)"/>
      </g>
      <g class="tuft-baby hidden">
        <path d="M 126 34 Q 118 16 132 12 Q 128 22 138 24 Q 130 28 130 36" fill="#f79a67"/>
      </g>
      <g class="tuft-teen hidden">
        <path d="M 124 32 Q 116 8 134 4 Q 148 2 146 14 Q 138 10 134 16 Q 132 24 130 34" fill="#f79a67"/>
      </g>
      <g class="tail hidden" transform="translate(222 196)">
        <path d="M 0 0 Q 26 -6 30 -30 Q 33 -48 20 -52 Q 28 -38 18 -28 Q 10 -20 2 -16 Z" fill="#f2916b"/>
        <circle cx="24" cy="-46" r="9" fill="#f9a873"/>
      </g>
      <g class="heart-cheeks hidden">
        <path class="hc" d="M 66 140 c -3 -4 -9 -3 -9 2 c 0 4 5 7 9 10 c 4 -3 9 -6 9 -10 c 0 -5 -6 -6 -9 -2 z" fill="#e56b6b" opacity="0.75"/>
        <path class="hc hc2" d="M 194 140 c -3 -4 -9 -3 -9 2 c 0 4 5 7 9 10 c 4 -3 9 -6 9 -10 c 0 -5 -6 -6 -9 -2 z" fill="#e56b6b" opacity="0.75"/>
      </g>
      <g class="brows hidden">
        <path class="brow-sad hidden" d="M 86 92 Q 98 86 108 94" stroke="#3a2531" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path class="brow-sad hidden" d="M 174 92 Q 162 86 152 94" stroke="#3a2531" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path class="brow-up hidden" d="M 86 88 Q 98 82 110 88" stroke="#3a2531" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path class="brow-up hidden" d="M 174 88 Q 162 82 150 88" stroke="#3a2531" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      </g>
      <g class="eyes">
        <g class="eye-star hidden">
          <path d="M 98 100 l 3.6 7.8 8.6 0.9 -6.4 5.8 1.8 8.4 -7.6 -4.3 -7.6 4.3 1.8 -8.4 -6.4 -5.8 8.6 -0.9 z" fill="#f2b035"/>
          <path d="M 162 100 l 3.6 7.8 8.6 0.9 -6.4 5.8 1.8 8.4 -7.6 -4.3 -7.6 4.3 1.8 -8.4 -6.4 -5.8 8.6 -0.9 z" fill="#f2b035"/>
        </g>
        <g class="eye-heart hidden">
          <path d="M 98 104 c -5 -7 -15 -5 -15 3 c 0 7 8 12 15 17 c 7 -5 15 -10 15 -17 c 0 -8 -10 -10 -15 -3 z" fill="#e56b6b"/>
          <path d="M 162 104 c -5 -7 -15 -5 -15 3 c 0 7 8 12 15 17 c 7 -5 15 -10 15 -17 c 0 -8 -10 -10 -15 -3 z" fill="#e56b6b"/>
        </g>
        <g class="eye-teary hidden">
          <ellipse cx="98" cy="112" rx="11" ry="12" fill="#3a2531"/>
          <ellipse cx="98" cy="116" rx="7" ry="5" fill="#8fb8e8" opacity="0.85"/>
          <circle cx="94" cy="106" r="4" fill="#fff"/>
          <ellipse cx="162" cy="112" rx="11" ry="12" fill="#3a2531"/>
          <ellipse cx="162" cy="116" rx="7" ry="5" fill="#8fb8e8" opacity="0.85"/>
          <circle cx="158" cy="106" r="4" fill="#fff"/>
        </g>
        <g class="eye-normal">
          <ellipse cx="98" cy="112" rx="11.5" ry="13.5" fill="#3a2531"/>
          <circle cx="94" cy="106" r="4.6" fill="#fff"/><circle cx="102" cy="117" r="2.1" fill="#fff" opacity="0.8"/>
          <ellipse cx="162" cy="112" rx="11.5" ry="13.5" fill="#3a2531"/>
          <circle cx="158" cy="106" r="4.6" fill="#fff"/><circle cx="166" cy="117" r="2.1" fill="#fff" opacity="0.8"/>
        </g>
        <g class="eye-big hidden">
          <ellipse cx="98" cy="112" rx="14" ry="16" fill="#3a2531"/>
          <circle cx="93" cy="105" r="5.6" fill="#fff"/><circle cx="103" cy="118" r="2.5" fill="#fff" opacity="0.8"/>
          <ellipse cx="162" cy="112" rx="14" ry="16" fill="#3a2531"/>
          <circle cx="157" cy="105" r="5.6" fill="#fff"/><circle cx="167" cy="118" r="2.5" fill="#fff" opacity="0.8"/>
        </g>
        <g class="eye-lid hidden">
          <rect x="86" y="108" width="26" height="9" rx="4.5" fill="#3a2531"/>
          <rect x="148" y="108" width="26" height="9" rx="4.5" fill="#3a2531"/>
        </g>
        <g class="eye-sly hidden">
          <rect x="86" y="106" width="25" height="12" rx="6" fill="#3a2531" transform="rotate(-11 98 112)"/>
          <rect x="149" y="106" width="25" height="12" rx="6" fill="#3a2531" transform="rotate(-11 161 112)"/>
        </g>
        <g class="eye-closed hidden">
          <path d="M 86 112 Q 98 121 110 112" stroke="#3a2531" stroke-width="5.5" fill="none" stroke-linecap="round"/>
          <path d="M 150 112 Q 162 121 174 112" stroke="#3a2531" stroke-width="5.5" fill="none" stroke-linecap="round"/>
        </g>
      </g>
      <g class="bond-sparkle hidden">
        <circle cx="104" cy="119" r="1.8" fill="#fff" opacity="0.95"/>
        <circle cx="168" cy="119" r="1.8" fill="#fff" opacity="0.95"/>
      </g>
      <ellipse class="tongue hidden" cx="130" cy="152" rx="10" ry="7" fill="#e58a9a"/>
      <g class="bulges hidden">
        <circle cx="94" cy="146" r="13" fill="#f9a873"/>
        <circle cx="166" cy="146" r="13" fill="#f9a873"/>
      </g>
      <g class="mouths">
        <path class="m-smile" d="M 112 142 Q 130 158 148 142" stroke="#6e3a3e" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path class="m-small hidden" d="M 118 144 Q 130 153 142 144" stroke="#6e3a3e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <g class="m-open hidden">
          <path d="M 113 141 Q 130 166 147 141 Q 130 149 113 141 Z" fill="#6e3a3e"/>
          <ellipse cx="130" cy="152" rx="8" ry="4.6" fill="#ff8b76"/>
        </g>
        <rect class="m-flat hidden" x="117" y="143" width="26" height="5" rx="2.5" fill="#6e3a3e"/>
        <circle class="m-sleep hidden" cx="130" cy="146" r="5" fill="#6e3a3e" opacity="0.85"/>
      </g>
      <g class="hats">
        <g class="hat-schleife hidden" transform="translate(176 32) rotate(14)">
          <ellipse cx="-15" cy="0" rx="17" ry="10.5" fill="#b0507a" transform="rotate(-28)"/>
          <ellipse cx="15" cy="0" rx="17" ry="10.5" fill="#b0507a" transform="rotate(28)"/>
          <circle cx="0" cy="0" r="7" fill="#8a3a5f"/>
        </g>
        <g class="hat-muetze hidden">
          <path d="M 88 40 Q 130 -12 172 40 L 172 46 L 88 46 Z" fill="#b0507a"/>
          <rect x="84" y="42" width="92" height="12" rx="6" fill="#8a3a5f"/>
          <circle cx="130" cy="-2" r="9" fill="#fffdf6"/>
        </g>
        <g class="hat-blume hidden" transform="translate(84 26)">
          <ellipse cx="0" cy="-11" rx="7" ry="11" fill="#fffdf6"/>
          <ellipse cx="0" cy="-11" rx="7" ry="11" fill="#fffdf6" transform="rotate(72)"/>
          <ellipse cx="0" cy="-11" rx="7" ry="11" fill="#fffdf6" transform="rotate(144)"/>
          <ellipse cx="0" cy="-11" rx="7" ry="11" fill="#fffdf6" transform="rotate(216)"/>
          <ellipse cx="0" cy="-11" rx="7" ry="11" fill="#fffdf6" transform="rotate(288)"/>
          <circle r="7" fill="#f2c237"/>
        </g>
        <g class="hat-krone hidden">
          <path d="M 98 40 L 98 14 L 113 27 L 124 5 L 136 24 L 148 5 L 160 27 L 175 14 L 175 40 Z"
                fill="#f5c542" stroke="#d19a1e" stroke-width="2"/>
          <circle cx="112" cy="33" r="2.6" fill="#e05a5a"/><circle cx="136" cy="31" r="2.6" fill="#4f86d9"/>
          <circle cx="160" cy="33" r="2.6" fill="#5aa85e"/>
        </g>
        <g class="hat-zylinder hidden" transform="rotate(5 130 34)">
          <rect x="92" y="30" width="76" height="9" rx="4.5" fill="#3a2531"/>
          <rect x="105" y="-16" width="50" height="48" rx="7" fill="#4a3140"/>
          <rect x="105" y="19" width="50" height="10" fill="#b0507a"/>
        </g>
        <g class="hat-pilz hidden">
          <path d="M 86 38 Q 130 -16 174 38 Q 130 46 86 38 Z" fill="#d94f4f"/>
          <ellipse cx="130" cy="38" rx="44" ry="7" fill="#c23c3c"/>
          <circle cx="108" cy="16" r="6.5" fill="#fffdf6"/><circle cx="140" cy="6" r="5" fill="#fffdf6"/>
          <circle cx="156" cy="24" r="5.6" fill="#fffdf6"/><circle cx="122" cy="30" r="4" fill="#fffdf6"/>
        </g>
        <g class="hat-brille hidden">
          <circle cx="98" cy="112" r="17" fill="none" stroke="#4a3140" stroke-width="4"/>
          <circle cx="162" cy="112" r="17" fill="none" stroke="#4a3140" stroke-width="4"/>
          <path d="M 115 110 Q 130 103 145 110" fill="none" stroke="#4a3140" stroke-width="4" stroke-linecap="round"/>
          <line x1="81" y1="108" x2="66" y2="100" stroke="#4a3140" stroke-width="4" stroke-linecap="round"/>
          <line x1="179" y1="108" x2="194" y2="100" stroke="#4a3140" stroke-width="4" stroke-linecap="round"/>
        </g>
        <g class="hat-halo hidden">
          <ellipse cx="130" cy="2" rx="34" ry="9" fill="none" stroke="#ffe08a" stroke-width="8" opacity="0.55"/>
          <ellipse cx="130" cy="2" rx="34" ry="9" fill="none" stroke="#f2c237" stroke-width="5"/>
        </g>
      </g>
    </g></g></g></g>
    <text class="zzz hidden" x="194" y="44" font-size="26">z z z</text>
  </svg>`;

  const svg = mount.querySelector("svg");
  const inst = {
    svg, blob: svg.querySelector(".blob"),
    phase: Math.random() * 6.28,
    animated: !opts.static,
    blinking: false,
    mood: "gluecklich", sleeping: false,
    play(clip, ms = 600) {
      svg.classList.add("clip-" + clip);
      setTimeout(() => svg.classList.remove("clip-" + clip), ms);
    },
    chain(steps) { // [["jump",550],["wiggle",600]]
      let t = 0;
      for (const [clip, ms] of steps) { setTimeout(() => this.play(clip, ms), t); t += ms; }
      return t;
    },
    setLean(deg) {
      const hop = svg.querySelector(".hop");
      if (hop) hop.style.transform = deg ? `rotate(${deg}deg)` : "";
    },
    setPurr(on) { svg.classList.toggle("purring", on); },
    lookAt(nx, ny) { // normiert -1..1, verschiebt Augen (und Brauen) leicht
      const dx = clamp(nx, -1, 1) * 4.5, dy = clamp(ny, -1, 1) * 3;
      const eyes = svg.querySelector(".eyes"), brows = svg.querySelector(".brows");
      if (eyes) eyes.style.transform = (nx || ny) ? `translate(${dx}px, ${dy}px)` : "";
      if (brows) brows.style.transform = (nx || ny) ? `translate(${dx * 0.6}px, ${dy * 0.6}px)` : "";
    },
    emoteType: null, emoteUntil: 0,
    emote(type, ms = 1600) {
      this.emoteType = type;
      this.emoteUntil = Date.now() + ms;
      this.update(this.mood, this.sleeping, currentHat());
      setTimeout(() => {
        if (Date.now() >= this.emoteUntil) { this.emoteType = null; this.update(this.mood, this.sleeping, currentHat()); }
      }, ms + 40);
    },
    update(mood, sleeping, hat) {
      this.mood = mood; this.sleeping = sleeping;
      const emote = this.emoteType && Date.now() < this.emoteUntil ? this.emoteType : null;
      svg.classList.toggle("sleeping", sleeping);
      svg.classList.toggle("happy", mood === "gluecklich" && !sleeping);
      svg.querySelector(".zzz").classList.toggle("hidden", !sleeping);
      const eyes = { normal: 0, big: 0, lid: 0, sly: 0, closed: 0, star: 0, heart: 0, teary: 0 };
      const mouth = { smile: 0, small: 0, open: 0, flat: 0, sleep: 0 };
      let brow = null; // null | "sad" | "up"
      if (emote === "star") { eyes.star = 1; mouth.open = 1; brow = "up"; }
      else if (emote === "heart") { eyes.heart = 1; mouth.smile = 1; }
      else if (emote === "excite") { eyes.big = 1; mouth.open = 1; brow = "up"; }
      else if (emote === "bliss") { eyes.closed = 1; mouth.smile = 1; }
      else if (sleeping || this.blinking) { eyes.closed = 1; }
      else if (mood === "traurig") { eyes.teary = 1; brow = "sad"; }
      else if (mood === "muede" || mood === "vertraeumt") eyes.lid = 1;
      else if (mood === "frech") eyes.sly = 1;
      else if (mood === "dramatisch") { eyes.big = 1; brow = "up"; }
      else eyes.normal = 1;
      if (!emote) {
        if (sleeping) mouth.sleep = 1;
        else if (mood === "traurig") mouth.flat = 1;
        else if (mood === "gluecklich" || mood === "anhaenglich") mouth.smile = 1;
        else if (mood === "hungrig" || mood === "dramatisch") mouth.open = 1;
        else if (mood === "muede" || mood === "gelangweilt") mouth.flat = 1;
        else mouth.small = 1;
      }
      // Brauen
      const browsG = svg.querySelector(".brows");
      browsG.classList.toggle("hidden", !brow);
      svg.querySelectorAll(".brow-sad").forEach(el => el.classList.toggle("hidden", brow !== "sad"));
      svg.querySelectorAll(".brow-up").forEach(el => el.classList.toggle("hidden", brow !== "up"));
      // Schmutz nach Hygiene-Stand
      const hyg = state?.pet?.stats?.hygiene ?? 100;
      const dirtG = svg.querySelector(".dirt");
      if (dirtG) {
        dirtG.classList.toggle("hidden", hyg >= 75);
        dirtG.querySelector(".d1").style.display = hyg < 75 ? "" : "none";
        dirtG.querySelector(".d2").style.display = hyg < 55 ? "" : "none";
        dirtG.querySelector(".d3").style.display = hyg < 35 ? "" : "none";
      }
      // Bond-Visuals: 2. Glanz ab Stufe 2, Herz-Wangen ab 3, Schimmer ab 4
      const bt = typeof bondTier === "function" ? bondTier() : 0;
      svg.querySelector(".bond-sparkle").classList.toggle("hidden", bt < 2 || sleeping || eyes.star || eyes.heart || eyes.teary || eyes.closed);
      svg.querySelector(".heart-cheeks").classList.toggle("hidden", bt < 3);
      svg.classList.toggle("soulbond", bt >= 4);
      for (const k of Object.keys(eyes)) svg.querySelector(`.eye-${k}`).classList.toggle("hidden", !eyes[k]);
      for (const k of Object.keys(mouth)) svg.querySelector(`.m-${k}`).classList.toggle("hidden", !mouth[k]);
      for (const h of HATS) {
        if (h.id === "none") continue;
        const el = svg.querySelector(`.hat-${h.id}`);
        if (el) el.classList.toggle("hidden", h.id !== hat);
      }
      const up = (mood === "gluecklich" && !sleeping);
      svg.querySelector(".armL").setAttribute("transform", up ? "rotate(-32 42 168)" : "rotate(12 42 168)");
      svg.querySelector(".armR").setAttribute("transform", up ? "rotate(32 218 168)" : "rotate(-12 218 168)");
    },
    squish() {
      svg.classList.add("squish");
      setTimeout(() => svg.classList.remove("squish"), 180);
    },
    stage: 0, eyeScale: 1,
    applyEyes(shiftX) {
      svg.querySelector(".eyes").setAttribute("transform",
        `translate(${130 + shiftX} 112) scale(${this.eyeScale}) translate(-130 -112)`);
    },
    setStage(stage) {
      if (stage === this.stage) return;
      this.stage = stage;
      const cfg = {
        1: { body: 0.84, eyes: 1.16, ears: 0.88, spots: false },
        2: { body: 1.0,  eyes: 1.0,  ears: 1.0,  spots: false },
        3: { body: 1.1,  eyes: 0.94, ears: 1.18, spots: true }
      }[stage] || { body: 1, eyes: 1, ears: 1, spots: false };
      svg.querySelector(".stagewrap").setAttribute("transform",
        `translate(130 234) scale(${cfg.body}) translate(-130 -234)`);
      this.eyeScale = cfg.eyes;
      this.applyEyes(0);
      svg.querySelector(".earswrap").setAttribute("transform",
        `translate(130 58) scale(${cfg.ears}) translate(-130 -58)`);
      svg.querySelector(".spots").classList.toggle("hidden", !cfg.spots);
      svg.querySelector(".tuft-baby").classList.toggle("hidden", stage !== 1);
      svg.querySelector(".tuft-teen").classList.toggle("hidden", stage !== 2);
      svg.querySelector(".tail").classList.toggle("hidden", stage !== 3);
    }
  };
  inst.blob.setAttribute("d", blobPath(130, 128, 92, 86, inst.phase));
  inst.setStage(opts.stage || petStage());
  if (inst.animated) {
    // Blinzeln
    setInterval(() => {
      if (inst.sleeping) return;
      inst.blinking = true; inst.update(inst.mood, inst.sleeping, currentHat());
      setTimeout(() => { inst.blinking = false; inst.update(inst.mood, inst.sleeping, currentHat()); }, 150);
    }, 3400 + Math.random() * 900);
    // Gelegentliches Winken bei guter Laune
    setInterval(() => {
      if (inst.sleeping || Math.random() > 0.45) return;
      if (inst.mood !== "gluecklich" && inst.mood !== "anhaenglich") return;
      const arm = svg.querySelector(".armR");
      if (!arm) return;
      arm.style.transformOrigin = "218px 172px";
      arm.style.animation = "waveArm 1.1s ease-in-out";
      setTimeout(() => { arm.style.animation = ""; }, 1200);
    }, 24000 + Math.random() * 16000);

    // Blick wandert
    setInterval(() => {
      if (inst.sleeping) return;
      inst.applyEyes(pick([-5, 5, -4, 4]));
      setTimeout(() => inst.applyEyes(0), 1100);
    }, 4600 + Math.random() * 2200);
  }
  if (!opts.static) petInstances.push(inst);
  return inst;
}

// Herzchen beim Streicheln
function spawnHearts(mount, count = 4) {
  const w = mount.querySelector("svg")?.clientWidth || 200;
  for (let i = 0; i < count; i++) {
    const h = document.createElement("span");
    h.className = "heart-fly";
    h.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21 C4.5 15 2.8 10.8 5 7.8 6.8 5.2 10.4 5.4 12 8 c1.6-2.6 5.2-2.8 7-0.2 2.2 3 0.5 7.2-7 13.2 z"/></svg>';
    h.style.left = (w * 0.18 + Math.random() * w * 0.64) + "px";
    h.style.top = (10 + Math.random() * 30) + "px";
    h.style.animationDelay = (i * 0.09) + "s";
    mount.appendChild(h);
    setTimeout(() => h.remove(), 1400 + i * 90);
  }
}

function currentHat() { return state.pet.hat; }

function blobPath(cx, cy, rx, ry, phase, wob = 0.035) {
  const n = 36, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + wob * Math.sin(3 * a + phase) + wob * 0.6 * Math.cos(2 * a - 1.4 * phase);
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M ${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + " Z";
}

// Gemeinsamer Wobble-Loop
let lastFrame = performance.now();
function petLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1); lastFrame = now;
  for (const inst of petInstances) {
    if (!inst.animated) continue;
    inst.phase += dt * 0.9;
    inst.blob.setAttribute("d", blobPath(130, 128, 92, 84, inst.phase));
  }
  requestAnimationFrame(petLoop);
}
requestAnimationFrame(petLoop);

// ---------- Partikel-Hintergrund ----------
(function particles() {
  const cv = $("#particles"), cx2 = cv.getContext("2d");
  const motes = Array.from({ length: 16 }, () => ({
    x: Math.random(), y: Math.random(), s: 2.5 + Math.random() * 3,
    sp: 0.008 + Math.random() * 0.012, sw: 6 + Math.random() * 12,
    sws: 0.3 + Math.random() * 0.4, po: Math.random() * 6
  }));
  function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  addEventListener("resize", resize); resize();
  const start = performance.now();
  (function draw(now) {
    const t = (now - start) / 1000;
    cx2.clearRect(0, 0, cv.width, cv.height);
    const night = dayPhase() === "night";
    cx2.fillStyle = night ? "#f8f2b0" : "#ffffff";
    for (const m of motes) {
      let y = m.y - (t * m.sp) % 1.2; if (y < -0.05) y += 1.2;
      const x = m.x + Math.sin(t * m.sws) * (m.sw / innerWidth);
      const pulse = (Math.sin(t * 0.8 + m.po) + 1) / 2;
      cx2.globalAlpha = night ? 0.25 + pulse * 0.55 : 0.12 + pulse * 0.25;
      cx2.beginPath();
      cx2.arc(x * cv.width, y * cv.height, m.s * devicePixelRatio, 0, 7);
      cx2.fill();
    }
    cx2.globalAlpha = 1;
    requestAnimationFrame(draw);
  })(start);
})();

// ---------- UI: Rendering ----------
let homePet, roomPet, profilePet, obPet;
let currentDaily = "";

function renderAll() {
  const p = state.pet, mood = computeMood();
  document.body.className = "phase-" + dayPhase();

  // Home
  $("#petNameTitle").textContent = p.name;
  $("#levelChip").textContent = `Level ${p.stats.level} · ${STAGE_NAMES[petStage()]}`;
  $("#dustAmount").textContent = p.dust;
  const shopDust = $("#dustAmountShop"); if (shopDust) shopDust.textContent = p.dust;
  $("#streakChip").classList.toggle("hidden", p.streak < 2);
  $("#streakChip").innerHTML = `&#128293; ${p.streak} Tage`;
  const lvlBase = xpThreshold(p.stats.level);
  setRing($(".stat-ring[data-stat=hygiene] .ring-fg"), p.stats.hygiene / 100, 21);
  setRing($("#xpRing"), (p.stats.xp - lvlBase) / xpForNext(p.stats.level), 18);
  $("#moodAura").style.background = MOODS[mood].hex;
  const stage = petStage();
  for (const inst of [homePet, roomPet, profilePet]) inst?.setStage(stage);
  homePet?.update(mood, p.sleeping, p.hat);
  $("#wakeHint").classList.toggle("hidden", !p.sleeping);

  // Tagesgeschenk
  $("#giftCard").classList.toggle("hidden", !giftAvailable());

  // Expedition
  const ex = state.expedition;
  $("#expedIdle").classList.toggle("hidden", !!ex);
  $("#expedActive").classList.toggle("hidden", !ex);
  $("#expedTimer").classList.toggle("hidden", !ex);
  $("#petMount").style.display = ex ? "none" : "";
  $("#awayStage").classList.toggle("hidden", !ex);
  if (ex) {
    const dest = EXPED_DESTS.find(d => d.id === ex.dest);
    $("#expedIcon").textContent = dest.icon;
    $("#expedDest").textContent = dest.title;
    $("#expedAwayText").textContent = fmt(pick(EXPED_TEXTS.awayCard), ctx());
    $("#awayStageIcon").textContent = dest.icon;
    $("#awayStageText").textContent = fmt("%N ist unterwegs: " + dest.title, ctx());
    updateExpedProgress();
  } else {
    $("#expedIdleText").textContent = fmt("%N steht bereit. Der unsichtbare Koffer ist immer gepackt.", ctx());
  }

  // Live-Ticker
  {
    const lv = state.live;
    const hasLive = lv && (lv.history.length || !lv.done);
    const pingsUnread = pingsUnreadCount();
    const show = (hasLive && !lv.done) || pingsUnread > 0;
    $("#liveTicker").classList.toggle("hidden", !show);
    if (show) {
      let text, time = "", hot = false;
      if (lv && lv.waitingChoice) { text = fmt(LIVE_TEXTS.menuWaiting, ctx()); hot = true; }
      else if (lv && lv.unread) { text = fmt(LIVE_TEXTS.unread, ctx()) + ` (${lv.unread})`; hot = true; }
      else if (pingsUnread) { text = `${state.pet.name} hat dir geschrieben (${pingsUnread})`; hot = true; }
      else if (lv && lv.history.length && !lv.done) {
        const last = lv.history[lv.history.length - 1];
        const story = liveStoryDef();
        const snippet = last.user ? last.user : story.nodes[last.id].m[story.nodes[last.id].m.length - 1];
        text = "\u201E" + fmt(snippet, ctx()).slice(0, 64) + (snippet.length > 64 ? "\u2026" : "") + "\u201C";
        time = fmtClock(last.at);
      } else if (lv && !lv.history.length) {
        text = fmt(LIVE_TEXTS.startTeaser, ctx());
      }
      $("#liveTickerText").textContent = text || "";
      $("#liveTickerTime").textContent = time;
      $("#liveTicker").classList.toggle("hot", hot);
      $("#liveTicker").dataset.target = pingsUnread && !(lv && (lv.unread || lv.waitingChoice)) ? "pings" : "live";
    }
  }

  // Story-Arc-Karte
  {
    const a = arcState();
    const gate = arcGateCheck();
    const ch = arcNextChapter();
    $("#arcCard").classList.toggle("hidden", a.chapter >= ARC_CHAPTERS.length && !gate.ready && gate.reason === "done" && a.chapter === 0);
    if (!ch) {
      $("#arcTitle").textContent = "Akte geschlossen";
      $("#arcSub").textContent = ARC_CARD.done;
      $("#arcChip").textContent = ARC_CHAPTERS.length + "/" + ARC_CHAPTERS.length;
      $("#arcGo").style.display = "none";
      $("#arcRow").classList.add("done");
    } else {
      $("#arcChip").textContent = a.chapter + "/" + ARC_CHAPTERS.length;
      $("#arcTitle").textContent = fmt(ARC_CARD.next, ctx({ S: ch.id, V: ch.title }));
      if (gate.ready) {
        $("#arcSub").textContent = ARC_CARD.cta;
        $("#arcGo").style.display = "";
        $("#arcRow").classList.remove("done");
        $("#arcRow").style.opacity = "";
      } else {
        const map = { days: ARC_CARD.lockedDays, level: ARC_CARD.lockedLevel, bond: ARC_CARD.lockedBond };
        $("#arcSub").textContent = fmt(map[gate.reason] || "", ctx({ S: gate.value }));
        $("#arcGo").style.display = "none";
        $("#arcRow").style.opacity = ".55";
      }
    }
  }

  // Schwamm bei Bedarf
  const spongeShow = bathNeeded() && !state.expedition;
  $("#spongeBtn").classList.toggle("hidden", !spongeShow);
  if (spongeShow) hintOnce("sponge");

  renderWeather();

  // Geerdet-Status
  $("#calmChip").classList.toggle("hidden", !calmToday());
  $("#momentsSub").textContent = calmToday() ? "Heute schon bei dir gewesen" : "Fünf Wege zu dir";
  if (homePet) homePet.svg.classList.toggle("calm", calmToday());

  // Reden-Badge bei Neuigkeiten
  const talkOrb = $('.action[data-action="talk"] .orb');
  let badge = talkOrb.querySelector(".action-badge");
  if (talkHasNews()) {
    if (!badge) { badge = document.createElement("span"); badge.className = "action-badge"; talkOrb.appendChild(badge); }
  } else if (badge) badge.remove();

  // Tageswunsch
  ensureWish();
  const w = state.wish;
  $("#wishCard").classList.toggle("done", w.done);
  $("#wishText").textContent = w.done ? fmt("Erfüllt. %N ist sehr zufrieden mit dir.", ctx()) : fmt(w.text, ctx());
  $("#wishReward").textContent = w.done ? "Erledigt" : "+30 Staub";
  $("#wishProgress").innerHTML = w.target > 1
    ? Array.from({ length: w.target }, (_, i) => `<span class="wp-dot ${i < w.progress ? "on" : ""}"></span>`).join("")
    : "";
  $("#moodChip").textContent = MOODS[mood].label;
  $("#moodChip").style.color = MOODS[mood].hex;
  $("#moodChip").style.background = MOODS[mood].hex + "22";
  $("#moodText").textContent = fmt(MOOD_TEXT[mood], ctx());
  $("#dailyMsg").textContent = currentDaily;
  for (const key of ["energie", "laune", "saettigung", "bond"])
    setRing($(`.stat-ring[data-stat="${key}"] .ring-fg`), p.stats[key] / 100, 21);

  // Wochenziele
  ensureWeekly();
  const wq = state.weekly;
  $("#weeklyChip").textContent = wq.done ? "Geschafft" : `+${WEEKLY_REWARD.dust} Staub`;
  $("#weeklyList").innerHTML = wq.list.map(item => {
    const def = WEEKLY_TYPES[item.type], done = item.progress >= def.target;
    return `<div class="quest-row ${done ? "done" : ""}">
      <span class="q-icon">${done ? ICONS.check : qIcon(def)}</span>${def.title}
      <span class="q-progress">${Math.min(item.progress, def.target)}/${def.target}</span></div>`;
  }).join("");

  // Quests
  ensureQuests();
  const q = state.quests;
  const allDone = q.list.every(i => i.progress >= QUEST_TYPES[i.type].target);
  $("#questBonusChip").textContent = allDone ? "Geschafft" : "+20 XP Bonus";
  $("#questList").innerHTML = q.list.map(item => {
    const def = QUEST_TYPES[item.type], done = item.progress >= def.target;
    return `<div class="quest-row ${done ? "done" : ""}">
      <span class="q-icon">${done ? ICONS.check : qIcon(def)}</span>${def.title}
      ${def.target > 1 ? `<span class="q-progress">${item.progress}/${def.target}</span>` : ""}</div>`;
  }).join("");
  $("#checkinBtn").classList.toggle("done", p.lastCheckInDay === todayKey());

  renderRoom(mood); renderDiary(); renderProfile(mood);
}

function setRing(el, frac, r) {
  const c = 2 * Math.PI * r;
  el.style.strokeDasharray = c;
  el.style.strokeDashoffset = c * (1 - clamp(frac, 0, 1));
}

function renderRoom(mood) {
  const p = state.pet, lvl = p.stats.level, night = dayPhase() === "night";
  $("#roomTitle").textContent = `${p.name}s Zuhause`;
  $(".win-sun").classList.toggle("hidden", night);
  $(".win-moon").classList.toggle("hidden", !night);
  $(".win-stars").classList.toggle("hidden", !night);
  $("#decoKissen").classList.toggle("hidden", lvl < 2);
  $("#decoPflanze").classList.toggle("hidden", lvl < 3);
  $("#decoLampe").classList.toggle("hidden", lvl < 4);
  $("#decoStarwin").classList.toggle("hidden", lvl < 5);
  $("#decoUhr").classList.toggle("hidden", lvl < 6);
  $("#decoBuecher").classList.toggle("hidden", lvl < 8);
  $("#decoMobile").classList.toggle("hidden", lvl < 10);
  $("#decoLichterkette").classList.toggle("hidden", !state.ownedDeco.includes("lichterkette"));
  $("#decoZen").classList.toggle("hidden", calmTier() < 2);
  $("#decoGirlande").classList.toggle("hidden", !state.ownedDeco.includes("girlande"));
  $("#decoTeleskop").classList.toggle("hidden", !state.ownedDeco.includes("teleskop"));
  $("#decoRadio").classList.toggle("hidden", !state.ownedDeco.includes("radio"));
  $("#decoAquarium").classList.toggle("hidden", !state.ownedDeco.includes("aquarium"));
  $("#decoKamin").classList.toggle("hidden", !state.ownedDeco.includes("kamin"));
  roomPet?.update(mood, p.sleeping, p.hat);

  $("#wardrobe").innerHTML = HATS.map(h => {
    const unlocked = state.hats.includes(h.id), eq = p.hat === h.id;
    let inner = h.id === "none" ? "\u2205" : (unlocked ? `<span class="mini-mount" data-hat="${h.id}"></span>` : "\u{1F512}");
    const shopHat = SHOP_HATS.find(sh => sh.id === h.id);
    const hint = shopHat ? `Shop: ${shopHat.cost} Staub` : h.hint;
    return `<button class="hat-item ${eq ? "equipped" : ""} ${unlocked ? "" : "locked"}" data-hat="${h.id}" ${unlocked ? "" : "disabled"}>
      <span class="hat-circle">${inner}</span><label>${h.title}</label>
      ${unlocked ? "" : `<span class="hint">${hint}</span>`}</button>`;
  }).join("");
  $$("#wardrobe .mini-mount").forEach(m => {
    const mini = createPet(m, 46, { static: true });
    mini.animated = false;
    mini.update("gluecklich", false, m.dataset.hat);
  });
  $$("#wardrobe .hat-item").forEach(btn => btn.onclick = () => {
    if (!state.hats.includes(btn.dataset.hat)) return;
    state.pet.hat = btn.dataset.hat; save(); renderAll();
  });

  const unlocks = [["Kissen", 2], ["Pflanze", 3], ["Lampe", 4], ["Sternenfenster", 5], ["Wanduhr", 6], ["Bücherstapel", 8], ["Sternen-Mobile", 10]];
  $("#unlockList").innerHTML = unlocks.map(([name, req]) => {
    const ok = lvl >= req;
    return `<div class="unlock-row ${ok ? "" : "locked"}">
      <span class="u-icon">${ok ? "\u2713" : "\u{1F512}"}</span>${name}
      ${ok ? "" : `<span class="chip chip-small">Level ${req}</span>`}</div>`;
  }).join("");

  renderShop();
}

const ICONS = (() => {
  const w = (p) => `<svg viewBox="0 0 24 24">${p}</svg>`;
  return {
    check:   w('<path d="M5 12.5 L10 17.5 L19 7"/>'),
    flower:  w('<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6.4" r="2.6"/><circle cx="17.2" cy="10.2" r="2.6"/><circle cx="15.2" cy="16.4" r="2.6"/><circle cx="8.8" cy="16.4" r="2.6"/><circle cx="6.8" cy="10.2" r="2.6"/>'),
    bowl:    w('<path d="M4 13 h16 M6 13 a6 6 0 0 1 12 0 M9 17.5 h6"/>'),
    star:    w('<path d="M12 3.5 l2.4 5.4 5.6 0.6 -4.2 3.9 1.2 5.6 -5 -3 -5 3 1.2 -5.6 -4.2 -3.9 5.6 -0.6 z"/>'),
    bubble:  w('<path d="M4.5 6.5 a3 3 0 0 1 3-3 h9 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 H10 l-4 4 v-4 h-1.5 a3 3 0 0 1 -3-3 z"/>'),
    bubble2: w('<circle cx="12" cy="12" r="8"/><path d="M8.5 8.5 a5 5 0 0 1 3.2 -1.6"/>'),
    trophy:  w('<path d="M7 4 h10 v5 a5 5 0 0 1 -10 0 z M7 6 H4.5 a3 3 0 0 0 3 4 M17 6 h2.5 a3 3 0 0 1 -3 4 M12 14 v3 M8.5 20 h7 M10 17 h4 v3 h-4 z"/>'),
    gift:    w('<path d="M4.5 11 h15 v8.5 a1.5 1.5 0 0 1 -1.5 1.5 H6 a1.5 1.5 0 0 1 -1.5 -1.5 z M3.5 7.5 h17 V11 h-17 z M12 7.5 V21 M12 7.5 C9.5 7.5 8 6.5 8 5 8 3.8 9.2 3.3 10.2 4 c1 0.7 1.8 3.5 1.8 3.5 z M12 7.5 c2.5 0 4 -1 4 -2.5 0 -1.2 -1.2 -1.7 -2.2 -1 -1 0.7 -1.8 3.5 -1.8 3.5 z"/>'),
    sparkle: w('<path d="M12 3.5 l1.7 5.1 5.1 1.7 -5.1 1.7 -1.7 5.1 -1.7 -5.1 -5.1 -1.7 5.1 -1.7 z M18.5 15.5 l0.8 2.4 2.4 0.8 -2.4 0.8 -0.8 2.4 -0.8 -2.4 -2.4 -0.8 2.4 -0.8 z"/>'),
    compass: w('<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5 l-2.2 5 -5 2.2 2.2 -5 z"/>'),
    breath:  w('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/>'),
    heart:   w('<path d="M12 19.5 C6 14.6 4.6 11.2 6.3 8.7 7.7 6.6 10.6 6.8 12 9 c1.4-2.2 4.3-2.4 5.7-0.3 1.7 2.5 0.3 5.9-5.7 10.8 z"/>'),
    drop:    w('<path d="M12 3.5 C12 3.5 6 10.5 6 14.5 a6 6 0 0 0 12 0 C18 10.5 12 3.5 12 3.5 z"/>')
  };
})();
const qIcon = (def) => ICONS[def.ico] || def.icon || "";

const DUST_ICO = '<svg viewBox="0 0 24 24" class="dust-ico"><path d="M12 2.8 l2.5 5.6 6.1 0.6 -4.6 4.1 1.3 6 -5.3-3.1 -5.3 3.1 1.3-6 -4.6-4.1 6.1-0.6 z"/></svg>';

function renderShop() {
  const rows = [];
  const row = (kind, id, emoji, title, sub, cost, owned) => rows.push(
    `<div class="shop-row">
      <span class="shop-emoji">${emoji}</span>
      <span class="shop-info"><strong>${title}</strong><small>${sub}</small></span>
      ${owned
        ? '<span class="shop-buy owned">Gekauft</span>'
        : `<button class="shop-buy" data-kind="${kind}" data-id="${id}" ${state.pet.dust < cost ? "disabled" : ""}>${DUST_ICO}${cost}</button>`}
    </div>`);
  for (const s of PREMIUM_SNACKS) row("snack", s.id, s.icon, s.title, s.sub + " · Snack", s.cost, state.ownedSnacks.includes(s.id));
  for (const h of SHOP_HATS) row("hat", h.id, "\u{1F3A9}", h.title, "Garderobe", h.cost, state.hats.includes(h.id));
  for (const d of SHOP_DECO) row("deco", d.id, "\u{1F6CB}", d.title, d.desc, d.cost, state.ownedDeco.includes(d.id));
  rows.push(`<div class="shop-row">
    <span class="shop-emoji">\u2744</span>
    <span class="shop-info"><strong>${STREAK_FREEZE.title}${state.streakFreezes ? ` (${state.streakFreezes})` : ""}</strong><small>${STREAK_FREEZE.desc}</small></span>
    ${state.streakFreezes >= STREAK_FREEZE.max
      ? '<span class="shop-buy owned">Max.</span>'
      : `<button class="shop-buy" data-kind="freeze" data-id="freeze" ${state.pet.dust < STREAK_FREEZE.cost ? "disabled" : ""}>${DUST_ICO}${STREAK_FREEZE.cost}</button>`}
  </div>`);
  $("#shopList").innerHTML = rows.join("");
  $$("#shopList .shop-buy[data-kind]").forEach(b => b.onclick = () => buyItem(b.dataset.kind, b.dataset.id));
}

const DOT_COLORS = { super: "#efa93b", okay: "#8ca659", stressig: "#9e486b", muede: "#8c87b8", keineahnung: "#998f87" };

function renderDiary() {
  const p = state.pet;
  $("#diaryTitle").textContent = `${p.name}s Tagebuch`;
  const recent = p.memory.recent;
  $("#weekCard").classList.toggle("hidden", recent.length === 0);
  if (recent.length) {
    $("#weekDots").innerHTML = [...recent].reverse().map(id =>
      `<span class="wd"><i style="background:${DOT_COLORS[id]}"></i><small>${(CHECKIN_ANSWERS.find(a => a.id === id)?.label || "").slice(0, 2)}</small></span>`).join("");
    const counts = {};
    recent.forEach(id => counts[id] = (counts[id] || 0) + 1);
    const parts = CHECKIN_ANSWERS.filter(a => counts[a.id]).map(a => `${counts[a.id]}x ${a.label.toLowerCase()}`);
    $("#weekSummary").textContent = fmt(`Die letzten ${recent.length} Check-ins: ${parts.join(", ")}. %N führt Statistik. Rein zufällig.`, ctx());
  }
  const empty = state.diary.length === 0;
  $("#diaryEmpty").classList.toggle("hidden", !empty);
  $("#diaryList").classList.toggle("hidden", empty);
  if (empty) $("#diaryEmptyText").textContent = `Noch keine Einträge.\n${p.name} sammelt noch Material.`;
  $("#diaryList").innerHTML = state.diary.map((e, i) => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })
      + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const m = MOODS[e.mood] || MOODS.gluecklich;
    return `<div class="entry">
      <div class="marker"><i style="background:${m.hex}"></i>${i < state.diary.length - 1 ? "<span></span>" : ""}</div>
      <div class="card"><div class="e-head"><span>${dateStr}</span>
        <span class="chip chip-small" style="color:${m.hex};background:${m.hex}22">${m.label}</span></div>
        <p class="e-text">${e.text}</p></div></div>`;
  }).join("");
}

const PERS_COLORS = { frech: "#d97b40", lieb: "#e56b6b", chaotisch: "#efa93b", vertraeumt: "#7a8fcc", anhaenglich: "#9e486b" };
const PERS_LABELS = { frech: "Frech", lieb: "Lieb", chaotisch: "Chaotisch", vertraeumt: "Verträumt", anhaenglich: "Anhänglich" };

function renderSoundSettings() {
  const s = soundSettings();
  const m = $("#sndMusic"), a = $("#sndAmb"), x = $("#sndSfx");
  if (!m) return;
  m.checked = s.music; a.checked = s.ambience; x.checked = s.sfx;
}

function renderChronicle() {
  const box = $("#chronicleList");
  if (!box) return;
  const entries = (state.chronicle || []).slice();
  entries.push({ at: state.createdAt || Date.now(), icon: "\u2728", title: fmt(CHRONICLE_TEXTS.founding, ctx()) });
  box.innerHTML = entries.map(e =>
    `<li><span class="ch-icon">${e.icon}</span><span class="ch-body"><strong>${e.title}</strong><small>${new Date(e.at).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</small></span></li>`).join("");
}

function renderProfile(mood) {
  renderChronicle();
  renderSoundSettings();
  const p = state.pet;
  profilePet?.update(mood, p.sleeping, p.hat);
  $("#profileName").textContent = p.name;
  $("#profileSub").textContent = `wohnt bei ${state.userName}`;
  const baseLabel = BASE_PERSONALITIES.find(b => b.id === p.base)?.label || "";
  $("#profileChips").innerHTML =
    `<span class="chip">\u2726 Level ${p.stats.level}</span>` +
    `<span class="chip" style="color:#e56b6b;background:#e56b6b22">${baseLabel}</span>` +
    (p.streak >= 2 ? `<span class="chip chip-flame">\u{1F525} ${p.streak} Tage</span>` : "");
  $("#tileBond").textContent = Math.round(p.stats.bond);
  $("#tileXp").textContent = p.stats.xp;
  $("#tileDiary").textContent = state.diary.length;
  $("#tileBest").textContent = Math.max(state.best.sterne || 0, state.best.blasen || 0);
  $("#persBars").innerHTML = Object.keys(p.pers).map(k =>
    `<div class="pers-bar"><div class="p-head"><span>${PERS_LABELS[k]}</span><span>${Math.round(p.pers[k])}</span></div>
     <div class="p-track"><div class="p-fill" style="width:${p.pers[k]}%;background:${PERS_COLORS[k]}"></div></div></div>`).join("");
  const quirks = p.memory.quirks.map(id => QUIRKS.find(q => q.id === id)).filter(Boolean);
  $("#quirkCount").textContent = `${quirks.length}/${QUIRKS.length}`;
  $("#quirkList").innerHTML = quirks.length
    ? quirks.map(q => `<div class="quirk-row"><em>\u2726</em>${p.name} ${q.title}</div>`).join("")
    : `<p class="muted small">${p.name} hat noch keine Macken entwickelt. Das ändert sich mit jedem zweiten Level. Garantiert.</p>`;
  $("#souvCount").textContent = `${state.souvenirs.length}/${SOUVENIRS.length}`;
  $("#souvGrid").innerHTML = SOUVENIRS.map(s => {
    const owned = state.souvenirs.includes(s.id);
    return `<button class="souv ${owned ? "" : "locked"} r-${s.rar}" data-souv="${s.id}" ${owned ? "" : "disabled"}>${s.icon}</button>`;
  }).join("");
  $$("#souvGrid .souv:not(.locked)").forEach(b => b.onclick = () => {
    const s = SOUVENIRS.find(x => x.id === b.dataset.souv);
    const det = $("#souvDetail");
    det.classList.remove("hidden");
    det.innerHTML = `<strong>${s.title}</strong> \u00b7 <span style="color:${RARITIES[s.rar].color}">${RARITIES[s.rar].label}</span><br>${fmt(s.flavor, ctx())}`;
  });

  $("#achCount").textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
  $("#achGrid").innerHTML = ACHIEVEMENTS.map(a => {
    const ok = state.achievements.includes(a.id);
    return `<div class="ach ${ok ? "" : "locked"}"><span class="a-icon">${ok ? a.icon : "\u{1F512}"}</span><label>${ok ? a.title : "???"}</label></div>`;
  }).join("");
}

function updateExpedProgress() {
  const ex = state.expedition;
  if (!ex) return;
  const total = ex.end - ex.start;
  const done = clamp((Date.now() - ex.start) / total, 0, 1);
  $("#expedFill").style.width = (done * 100) + "%";
  const left = Math.max(0, ex.end - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  $("#expedTimer").textContent = m >= 60 ? `${Math.floor(m / 60)} Std ${m % 60} Min` : m > 0 ? `${m} Min` : `${s} Sek`;
}
setInterval(() => {
  const changed = processLive() | processPings();
  if (changed) {
    if (snd.unlocked && !document.hidden) playSound("msg");
    renderAll();
    if (chat.mode === "live" && !$("#sheet-chat").classList.contains("hidden")) openLiveChat();
  }
}, 30000);

setInterval(() => {
  if (!state.expedition) return;
  updateExpedProgress();
  if (Date.now() >= state.expedition.end) { checkExpeditionReturn(); renderAll(); showReturn(); }
}, 1000);

// ---------- Rubbel-Gesten: Streicheln & Baden ----------
const rub = { active: false, x: 0, y: 0, sum: 0, heartsAcc: 0, mode: "pet" };

function rubStart(x, y) { rub.active = true; rub.x = x; rub.y = y; }
function rubEnd() { rub.active = false; }

function rubMove(x, y) {
  if (!rub.active) return;
  const d = Math.hypot(x - rub.x, y - rub.y);
  rub.x = x; rub.y = y;
  if (d <= 0 || d > 120) return; // Spruenge ignorieren
  if (rub.mode === "pet") {
    // Mimo lehnt sich zur Hand, Augen selig zu, Schnurren
    const mount = $("#petMount");
    if (mount && homePet && !state.pet.sleeping && !expeditionActive()) {
      const r = mount.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      homePet.setLean(clamp(dx / 9, -9, 9));
      homePet.setPurr(true);
      startPurrSound();
      homePet.emote("bliss", 420);
    }
    rubPetProgress(d);
  } else bathProgress(d);
}

function rubRelease() {
  if (homePet) { homePet.setLean(0); homePet.setPurr(false); homePet.lookAt(0, 0); }
  stopPurrSound();
}

function rubPetProgress(d) {
  if (expeditionActive() || state.pet.sleeping) return;
  rub.sum += d; rub.heartsAcc += d;
  if (rub.heartsAcc >= 130) {
    rub.heartsAcc = 0;
    if (Math.random() < 0.6) spawnHearts($("#petMount")); else spawnNotes();
    if (navigator.vibrate) navigator.vibrate(8);
  }
  if (rub.sum >= 340) {
    rub.sum = 0;
    homePet?.chain([["jump", 550], ["wiggle", 600]]);
    applyDecay();
    const p = state.pet;
    p.stats.laune = clamp(p.stats.laune + 6, 0, 100);
    const rewarded = affectionRewarded();
    if (rewarded) {
      p.stats.bond = clamp(p.stats.bond + 1, 0, 100);
      sceneFloat("+3 XP", "#9e486b");
      handleLevelUp(addXP(3));
      showReaction(fmt(pick(RUB_REACTIONS), ctx()));
    } else {
      showReaction(fmt(pick(AFFECTION_FULL), ctx()));
    }
    bump("lieb", 1.5);
    p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
    recordInteraction("streicheln");
    wishBump("streicheln");
    questProgress("streicheln");
    if (bondTier() >= 2 && Math.random() < 0.35) homePet?.emote("heart", 1600);
    checkUnlocks(); save(); renderAll();
  }
}

// ---------- Baden ----------
const bath = { pet: null, spots: 3, rubbed: 0, finished: false };

function bathNeeded() { return state.pet.stats.hygiene < 70; }

function startBath() {
  if (expeditionActive()) { blockIfAway(); return; }
  $("#bathOverlay").classList.remove("hidden");
  const mount = $("#bathPetMount"); mount.innerHTML = "";
  bath.pet = createPet(mount, 170, { static: true });
  bath.pet.update("frech", false, "none");
  const svg = mount.querySelector("svg");
  svg.querySelector(".dirt").classList.remove("hidden");
  svg.querySelectorAll(".dirt ellipse").forEach(el => { el.style.display = ""; });
  bath.spots = 3; bath.rubbed = 0; bath.finished = false;
  rub.mode = "wash"; rub.sum = 0;
  $("#bathHint").textContent = fmt(HYGIENE_TEXTS.bathStart, ctx());
  $("#bathProgress").style.width = "0%";
  playSound("open");
}

function bathProgress(d) {
  if (bath.finished || $("#bathOverlay").classList.contains("hidden")) return;
  bath.rubbed += d;
  if (Math.random() < 0.4) spawnFoam();
  const per = 480;
  const cleaned = Math.min(3, Math.floor(bath.rubbed / per));
  const svg = $("#bathPetMount svg");
  if (svg) {
    if (cleaned >= 1) svg.querySelector(".dirt .d1").style.display = "none";
    if (cleaned >= 2) svg.querySelector(".dirt .d2").style.display = "none";
    if (cleaned >= 3) svg.querySelector(".dirt .d3").style.display = "none";
  }
  $("#bathProgress").style.width = Math.min(100, bath.rubbed / (per * 3) * 100) + "%";
  if (navigator.vibrate && Math.random() < 0.2) navigator.vibrate(6);
  if (bath.rubbed >= per * 3) finishBath();
}

function spawnFoam() {
  const stage = $("#bathStage");
  if (!stage) return;
  const f = document.createElement("span");
  f.className = "foam";
  f.style.left = (18 + Math.random() * 64) + "%";
  f.style.top = (24 + Math.random() * 46) + "%";
  f.style.setProperty("--fs", (10 + Math.random() * 18) + "px");
  stage.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}

function finishBath() {
  if (bath.finished) return;
  bath.finished = true;
  rub.mode = "pet";
  applyDecay();
  const p = state.pet;
  p.stats.hygiene = 100;
  p.stats.laune = clamp(p.stats.laune + 10, 0, 100);
  state.bathsDone++;
  const rewarded = state.care.bathDay !== todayKey();
  if (rewarded) {
    state.care.bathDay = todayKey();
    earnDust(6);
    handleLevelUp(addXP(12));
  }
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  questProgress("waschen");
  bath.pet?.emote("star", 1800);
  setTimeout(() => {
    $("#bathOverlay").classList.add("hidden");
    showReaction(fmt(pick(HYGIENE_TEXTS.bathDone), ctx()));
    if (rewarded) { sceneFloat("+12 XP", "#9e486b"); }
    checkUnlocks(); save(); renderAll();
  }, 900);
  playSound("success");
}

function cancelBath() {
  rub.mode = "pet";
  $("#bathOverlay").classList.add("hidden");
  showReaction(fmt(HYGIENE_TEXTS.bathSkip, ctx()));
  renderAll();
}

// ---------- Wetter (deterministisch pro Tag) ----------
function getWeather() {
  const k = todayKey();
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  const r = h % 100;
  return r < 45 ? "sonnig" : r < 70 ? "wolkig" : r < 90 ? "regen" : "nebel";
}

let weatherRendered = null;
function renderWeather() {
  const wtr = getWeather();
  const stage = $(".stage");
  if (!stage) return;
  const key = wtr + ":" + dayPhase();
  if (weatherRendered === key) { renderStars(); return; }
  weatherRendered = key;
  if (snd.unlocked) { stopAmbience(); if (soundSettings().ambience) startAmbience(); }
  document.body.dataset.weather = wtr;
  stage.querySelectorAll(".raindrop, .wcloud, .fog-layer").forEach(e => e.remove());
  if (wtr === "regen") {
    for (let i = 0; i < 14; i++) {
      const r = document.createElement("span");
      r.className = "raindrop";
      r.style.left = (3 + Math.random() * 94) + "%";
      r.style.animationDelay = (Math.random() * 1.4) + "s";
      r.style.animationDuration = (0.9 + Math.random() * 0.5) + "s";
      stage.appendChild(r);
    }
  }
  if (wtr === "regen" || wtr === "wolkig") {
    for (let i = 0; i < 2; i++) {
      const cl = document.createElement("button");
      cl.className = "wcloud";
      cl.innerHTML = '<span></span><span></span><span></span>';
      cl.style.top = (7 + i * 11) + "%";
      cl.style.animationDuration = (46 + i * 22) + "s";
      cl.style.animationDelay = (-i * 25) + "s";
      cl.addEventListener("click", () => {
        cl.classList.remove("poked"); void cl.offsetWidth; cl.classList.add("poked");
        homePet?.lookAt(0, -1);
        setTimeout(() => homePet?.lookAt(0, 0), 1200);
        if (Math.random() < 0.5) showReaction(fmt(pick(CLOUD_POKE), ctx()));
        applyDecay();
        state.pet.stats.laune = clamp(state.pet.stats.laune + 1, 0, 100);
        save();
      });
      stage.appendChild(cl);
    }
  }
  if (wtr === "nebel") {
    const f = document.createElement("div");
    f.className = "fog-layer";
    stage.appendChild(f);
  }
  renderStars();
}

// ---------- Sterne pfluecken (nachts) ----------
function starState() {
  if (!state.stars) state.stars = { day: null, picked: 0, total: 0 };
  if (state.stars.day !== todayKey()) { state.stars.day = todayKey(); state.stars.picked = 0; }
  return state.stars;
}

function renderStars() {
  const stage = $(".stage");
  if (!stage) return;
  const night = dayPhase() === "nacht";
  const ss = starState();
  const want = night && ss.picked < 3 ? 3 - ss.picked : 0;
  const have = stage.querySelectorAll(".pickstar").length;
  if (!night || want === 0) { stage.querySelectorAll(".pickstar").forEach(e => e.remove()); return; }
  for (let i = have; i < want; i++) {
    const s = document.createElement("button");
    s.className = "pickstar";
    s.textContent = "\u2726";
    s.style.left = (12 + Math.random() * 74) + "%";
    s.style.top = (6 + Math.random() * 16) + "%";
    s.style.animationDelay = (Math.random() * 2) + "s";
    s.addEventListener("click", () => pickStar(s), { once: true });
    stage.appendChild(s);
  }
  if (want > 0) hintOnce("stars");
}

function pickStar(el) {
  const ss = starState();
  if (ss.picked >= 3) { el.remove(); return; }
  ss.picked++; ss.total++;
  const mount = $("#petMount").getBoundingClientRect();
  const stage = $(".stage").getBoundingClientRect();
  el.classList.add("falling");
  el.style.left = (mount.left + mount.width / 2 - stage.left) + "px";
  el.style.top = (mount.top + mount.height * 0.4 - stage.top) + "px";
  homePet?.lookAt(0, -1);
  setTimeout(() => {
    el.remove();
    homePet?.emote("star", 1400);
    homePet?.play("jump", 550);
    homePet?.lookAt(0, 0);
    earnDust(2);
    sceneFloat("+2 Staub", "#c9a13f");
    showReaction(fmt(pick(ss.picked >= 3 ? [STAR_TEXTS.done] : STAR_TEXTS.pick), ctx()));
    if (ss.total >= 30) unlockAchievement("sterne.30");
    playSound("catch");
    checkUnlocks(); save(); renderAll();
  }, 620);
}

// ---------- Freies Herumlaufen in der Szene ----------
let petPos = 0; // px-Versatz von der Mitte

function petBounds() {
  const stage = $(".stage");
  if (!stage) return 100;
  // Sichtbare Breite (Stage ragt 20px je Seite ueber den Viewport) minus halbe Mimo-Breite
  const visible = Math.min(stage.getBoundingClientRect().width - 40, window.innerWidth || 9999);
  return Math.max(60, visible / 2 - 105);
}

function applyPetPos(animate = true) {
  const mount = $("#petMount");
  if (!mount) return;
  mount.style.transition = animate ? "transform .45s cubic-bezier(.4,1.25,.5,1)" : "none";
  mount.style.transform = `translateX(calc(-50% + ${Math.round(petPos)}px))`;
}

function walkTo(x, done) {
  const b = petBounds();
  x = clamp(x, -b, b);
  const hops = Math.max(1, Math.min(4, Math.round(Math.abs(x - petPos) / 95)));
  const stepX = (x - petPos) / hops;
  let i = 0;
  idleBusy(hops * 480 + 400);
  const hop = () => {
    if (i++ >= hops) { done && done(); return; }
    petPos += stepX;
    homePet?.play("jump", 450);
    applyPetPos();
    setTimeout(hop, 470);
  };
  hop();
}

// ---------- Koerperzonen: gezielte Beruehrungen ----------
function zoneFor(rx, ry) {
  if (ry < 0.3) return rx < 0.42 ? "earL" : rx > 0.58 ? "earR" : "head";
  if (ry < 0.58) return "nose";
  return "belly";
}

function petTap(zone) {
  if (!homePet || state.pet.sleeping || expeditionActive()) return;
  idleBusy(1600);
  if (zone === "earL" || zone === "earR") {
    homePet.svg.classList.add("clip-" + zone);
    setTimeout(() => homePet.svg.classList.remove("clip-" + zone), 650);
  } else if (zone === "head") {
    homePet.emote("bliss", 1100);
    homePet.setPurr(true);
    setTimeout(() => homePet.setPurr(false), 1100);
  } else if (zone === "nose") {
    homePet.squish();
    homePet.emote("excite", 800);
    playSound("catch");
  } else if (zone === "belly") {
    homePet.chain([["wiggle", 500]]);
    homePet.squish();
    setTimeout(() => homePet.squish(), 220);
    playSound("giggle");
  }
  if (Math.random() < 0.45) showReaction(fmt(pick(TAP_TEXTS[zone]), ctx()));
  applyDecay();
  state.pet.stats.laune = clamp(state.pet.stats.laune + 1, 0, 100);
  save();
}

// ---------- Idle-Leben: Mimo tut Dinge von allein ----------
let idleBusyUntil = 0;
const idleBusy = (ms) => { idleBusyUntil = Math.max(idleBusyUntil, Date.now() + ms); };

function idleTick() {
  if (document.hidden || !state.onboarded) return;
  if (Date.now() < idleBusyUntil || rub.active || drag.el) return;
  if (state.pet.sleeping || expeditionActive()) return;
  if (!$("#screen-home") || $("#screen-home").classList.contains("hidden")) return;
  const roll = Math.random();
  if (roll < 0.22) { // umsehen
    idleBusy(2600);
    homePet?.lookAt(Math.random() < 0.5 ? -1 : 1, -0.2);
    setTimeout(() => homePet?.lookAt(Math.random() < 0.5 ? -0.6 : 0.6, 0), 900);
    setTimeout(() => homePet?.lookAt(0, 0), 2100);
  } else if (roll < 0.34) { // kleiner Hopser
    idleBusy(1400);
    homePet?.play("jump", 550);
  } else if (roll < 0.44) { // Koerper-Wackeln
    idleBusy(1400);
    homePet?.play("wiggle", 600);
  } else if (roll < 0.62) { // Schmetterling!
    spawnButterfly();
  } else if (roll < 0.8) { // umherstreifen
    const b = petBounds();
    walkTo(petPos + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120));
  } else if (roll < 0.88 && WEATHER_IDLE[getWeather()] && Math.random() < 0.5) {
    idleBusy(2200);
    homePet?.lookAt(0.6, -0.7);
    showReaction(fmt(pick(WEATHER_IDLE[getWeather()]), ctx()));
    setTimeout(() => homePet?.lookAt(0, 0), 1800);
  }
}
setInterval(idleTick, 9000);

let butterflyEl = null;
function spawnButterfly() {
  const stage = $(".stage");
  if (!stage || butterflyEl) return;
  idleBusy(7000);
  const b = document.createElement("button");
  b.className = "butterfly";
  b.innerHTML = '<span class="bw bw1"></span><span class="bw bw2"></span>';
  const fromLeft = Math.random() < 0.5;
  b.style.setProperty("--fromX", fromLeft ? "-8%" : "108%");
  b.style.setProperty("--toX", fromLeft ? "108%" : "-8%");
  b.style.top = (26 + Math.random() * 22) + "%";
  stage.appendChild(b);
  butterflyEl = b;
  // Mimo verfolgt den Flug mit den Augen
  const t0 = Date.now(), dur = 6400;
  const follow = setInterval(() => {
    const prog = (Date.now() - t0) / dur;
    if (prog >= 1 || !butterflyEl) { clearInterval(follow); homePet?.lookAt(0, 0); return; }
    const x = fromLeft ? prog * 2 - 1 : 1 - prog * 2;
    homePet?.lookAt(clamp(x, -1, 1), -0.5);
  }, 200);
  b.addEventListener("pointerdown", () => {
    if (!butterflyEl) return;
    b.classList.add("dart");
    homePet?.emote("excite", 1400);
    homePet?.play("jump", 550);
    applyDecay();
    state.pet.stats.laune = clamp(state.pet.stats.laune + 3, 0, 100);
    save();
    setTimeout(() => { b.remove(); butterflyEl = null; homePet?.lookAt(0, 0); }, 600);
  }, { once: true });
  setTimeout(() => { if (butterflyEl === b) { b.remove(); butterflyEl = null; } }, dur + 300);
}

// ---------- Szenen-Feedback ----------
function scrollToScene() {
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
}

function sceneFloat(text, color) {
  const stage = $(".stage");
  if (!stage) return;
  const el = document.createElement("div");
  el.className = "scene-float";
  el.textContent = text;
  el.style.color = color || "#9e486b";
  el.style.left = (38 + Math.random() * 24) + "%";
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ---------- Drag-Fuettern: Snack mit dem Finger zum Mund ziehen ----------
const drag = { snackId: null, el: null, active: false, nearMouth: false };

function mouthAnchor() {
  const m = $("#petMount").getBoundingClientRect();
  return { x: m.left + m.width / 2, y: m.top + m.height * 0.56 };
}

function spawnDragSnack(snackId) {
  cancelDragSnack();
  const snack = ALL_SNACKS.find(s => s.id === snackId);
  const stage = $(".stage");
  scrollToScene();
  const el = document.createElement("div");
  el.className = "drag-snack";
  el.textContent = snack.icon;
  stage.appendChild(el);
  drag.snackId = snackId; drag.el = el; drag.active = false; drag.nearMouth = false;
  homePet?.emote("excite", 1600);
  homePet?.play("excite", 800);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    drag.active = true;
    el.setPointerCapture?.(e.pointerId);
    dragTo(e.clientX, e.clientY);
  });
  el.addEventListener("pointermove", (e) => { if (drag.active) dragTo(e.clientX, e.clientY); });
  el.addEventListener("pointerup", (e) => { if (drag.active) dragRelease(e.clientX, e.clientY); });
  el.addEventListener("pointercancel", () => cancelDragSnack());
}

function dragTo(x, y) {
  if (!drag.el) return;
  const stage = $(".stage").getBoundingClientRect();
  drag.el.style.left = (x - stage.left) + "px";
  drag.el.style.top = (y - stage.top) + "px";
  drag.el.classList.add("lifted");
  const a = mouthAnchor();
  const dx = x - a.x, dy = y - a.y;
  const dist = Math.hypot(dx, dy);
  // Mimo verfolgt den Snack mit Augen und Koerper
  homePet?.lookAt(clamp(dx / 140, -1, 1), clamp(dy / 140, -1, 1));
  homePet?.setLean(clamp(dx / 14, -10, 10));
  const near = dist < 120;
  if (near !== drag.nearMouth) {
    drag.nearMouth = near;
    if (near) homePet?.emote("excite", 4000); // Mund auf, grosse Augen
  }
}

function dragRelease(x, y) {
  if (!drag.el) return;
  const a = mouthAnchor();
  const dist = Math.hypot(x - a.x, y - a.y);
  const snackId = drag.snackId;
  const el = drag.el;
  drag.el = null; drag.snackId = null; drag.active = false;
  homePet?.setLean(0); homePet?.lookAt(0, 0);
  if (dist < 90) {
    // Direkt in den Mund: sofort mampfen
    el.remove();
    const r = feedApply(snackId);
    if (r.refused) {
      homePet?.play("wiggle", 600);
      setTimeout(() => showReaction(fmt(pick(TOO_FULL), ctx())), 300);
      renderAll();
      return;
    }
    feedFinish(snackId, r, "hand");
  } else {
    // Fallen gelassen: Mimo holt ihn sich (Bodenpfad)
    el.remove();
    const r = feedApply(snackId);
    if (r.refused) {
      homePet?.play("wiggle", 600);
      setTimeout(() => showReaction(fmt(pick(TOO_FULL), ctx())), 300);
      renderAll();
      return;
    }
    feedFinish(snackId, r, "ground");
  }
}

function cancelDragSnack() {
  if (drag.el) drag.el.remove();
  drag.el = null; drag.snackId = null; drag.active = false;
  homePet?.setLean(0); homePet?.lookAt(0, 0);
}

// Aus der Hand: sofort mampfen, dann schlecken und feiern
function handFeedSequence(celebrate, done) {
  if (!homePet) { done && done(); return; }
  idleBusy(4200);
  homePet.svg.classList.add("clip-munch");
  let bites = 0;
  const biteTimer = setInterval(() => {
    spawnCrumbs();
    munchSound();
    if (navigator.vibrate) navigator.vibrate(6);
    if (++bites >= 3) {
      clearInterval(biteTimer);
      homePet.svg.classList.remove("clip-munch");
      homePet.play("lick", 500);
      done && done();
      setTimeout(() => {
        if (celebrate) {
          homePet.emote("star", 1900);
          homePet.chain([["jump", 550], ["jump", 550], ["wiggle", 600]]);
          spawnHearts($("#petMount"));
        } else {
          homePet.chain([["jump", 550], ["wiggle", 600]]);
        }
      }, 520);
    }
  }, 330);
}

// Fuetter-Choreografie: bemerken -> hinhuepfen -> mampfen -> schlecken -> feiern
function feedSequence(icon, celebrate, done) {
  idleBusy(5200);
  scrollToScene();
  const stage = $(".stage"), mount = $("#petMount");
  if (!stage || !mount || !homePet) { done && done(); return; }
  const b = petBounds();
  const side = petPos > b * 0.45 ? -1 : petPos < -b * 0.45 ? 1 : (Math.random() < 0.5 ? -1 : 1);
  const target = clamp(petPos + side * (70 + Math.random() * 50), -b, b);
  const el = document.createElement("div");
  el.className = "drop-snack";
  el.textContent = icon;
  el.style.left = `calc(50% + ${target}px)`;
  stage.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("land")));

  // 1) Bemerken: grosse Augen, aufgeregtes Hopsen auf der Stelle
  homePet.emote("excite", 1300);
  homePet.play("excite", 800);
  homePet.lookAt(target > petPos ? 1 : -1, 0.3);

  // 2) Hinlaufen
  setTimeout(() => { homePet.lookAt(0, 0); walkTo(target); }, 620);

  // 3) Mampfen: Kau-Bob + Backen-Beulen + Kruemel im Takt
  setTimeout(() => {
    el.classList.add("eaten");
    homePet.svg.classList.add("clip-munch");
    let bites = 0;
    const biteTimer = setInterval(() => {
      spawnCrumbs();
      munchSound();
      if (navigator.vibrate) navigator.vibrate(6);
      if (++bites >= 3) {
        clearInterval(biteTimer);
        homePet.svg.classList.remove("clip-munch");
        // 4) Zungen-Schlecker
        homePet.play("lick", 500);
        done && done();
        // 5) Feiern und zurueck zur Mitte
        setTimeout(() => {
          if (celebrate) {
            homePet.emote("star", 1900);
            homePet.chain([["jump", 550], ["jump", 550], ["wiggle", 600]]);
            spawnHearts($("#petMount"));
          } else {
            homePet.chain([["jump", 550], ["wiggle", 600]]);
          }
        }, 520);
      }
    }, 330);
  }, 1250);

  setTimeout(() => el.remove(), 1900);
}

function spawnNotes() {
  const stage = $(".stage");
  if (!stage) return;
  for (let i = 0; i < 2; i++) {
    const n = document.createElement("span");
    n.className = "note-float";
    n.textContent = Math.random() < 0.5 ? "\u266A" : "\u266B";
    n.style.left = (42 + Math.random() * 16) + "%";
    n.style.top = (34 + Math.random() * 14) + "%";
    stage.appendChild(n);
    setTimeout(() => n.remove(), 1150);
  }
}

function spawnCrumbs() {
  const stage = $(".stage");
  if (!stage) return;
  for (let i = 0; i < 6; i++) {
    const cr = document.createElement("span");
    cr.className = "crumb";
    cr.style.left = `calc(50% + ${(Math.random() * 80 - 40)}px)`;
    cr.style.setProperty("--dx", (Math.random() * 60 - 30) + "px");
    stage.appendChild(cr);
    setTimeout(() => cr.remove(), 900);
  }
}

// ---------- UI: Toast + Level-Up ----------
let toastTimer = null;
function showToast(def) {
  $("#toastIcon").textContent = def.icon;
  $("#toastTitle").textContent = def.title;
  $("#toastDetail").textContent = def.detail;
  const t = $("#toast");
  t.classList.remove("hidden");
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3500);
}

let confettiRun = false;
function showLevelUp(level, msg) {
  showCelebration("Level " + level, msg);
}

function showCelebration(title, msg, stage) {
  $("#levelupTitle").textContent = title;
  $("#levelupText").textContent = msg;
  $("#levelupOverlay").classList.remove("hidden");
  const mount = $("#levelupPetMount");
  mount.innerHTML = "";
  const pet = createPet(mount, 110, { static: true, stage: stage || petStage() });
  pet.update("gluecklich", false, state.pet.hat);
  runConfetti();
}

function showEvolution(stage) {
  const evo = EVOLUTION[stage];
  showCelebration(evo.title + "!", fmt(evo.text, ctx()), stage);
  playSound("level");
}

// ---------- Geschenk-Overlay ----------
function openGiftOverlay() {
  if (!giftAvailable()) return;
  $("#giftOverlay").classList.remove("hidden");
  $("#giftStage").classList.remove("hidden");
  $("#giftReveal").classList.add("hidden");
}

function revealGift() {
  const { tier, amount } = openGiftReward();
  $("#giftStage").classList.add("hidden");
  $("#giftReveal").classList.remove("hidden");
  const chip = $("#giftRarity");
  chip.textContent = tier.label;
  chip.className = "chip rarity-" + tier.id;
  $("#giftAmount").textContent = "+" + amount;
  $("#giftFlavor").textContent = fmt(pick(tier.texts), ctx());
  playSound(tier.id === "rare" || tier.id === "epic" ? "level" : "success");
  if (tier.id === "rare" || tier.id === "epic") { confettiRun = true; runConfetti($("#giftConfetti")); }
}

function closeGiftOverlay() {
  confettiRun = false;
  $("#giftOverlay").classList.add("hidden");
  renderAll();
}

// ---------- Willkommen zurueck ----------
let pendingAway = null;
function checkAway() {
  if (!state.onboarded || !state.lastSeen) return;
  const hrs = (Date.now() - state.lastSeen) / 36e5;
  if (hrs < 3) return;
  pendingAway = { dust: Math.min(Math.floor(hrs * 2), 40), text: fmt(pick(AWAY_TEXTS), ctx()) };
}

function showAway() {
  if (!pendingAway) return;
  $("#awayText").textContent = pendingAway.text;
  $("#awayDust").textContent = "+" + pendingAway.dust;
  const mount = $("#awayPetMount");
  mount.innerHTML = "";
  const pet = createPet(mount, 100, { static: true });
  pet.update("anhaenglich", false, state.pet.hat);
  $("#awayOverlay").classList.remove("hidden");
}
function runConfetti(cv = $("#confetti")) {
  const c2 = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ["#9e486b", "#efa93b", "#e56b6b", "#8ca659", "#fcbd87", "#7a8fcc"];
  const parts = Array.from({ length: 42 }, () => ({
    x: Math.random(), delay: Math.random() * 0.7, c: pick(colors),
    s: 6 + Math.random() * 5, sp: 0.55 + Math.random() * 0.45,
    sw: 8 + Math.random() * 18, spin: 1.5 + Math.random() * 2.5
  }));
  confettiRun = true;
  const start = performance.now();
  (function draw(now) {
    if (!confettiRun) return;
    const t = (now - start) / 1000;
    c2.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      const time = t - p.delay;
      if (time < 0) continue;
      const y = time * p.sp * cv.height * 0.45 - 20;
      if (y > cv.height + 20) continue;
      const x = p.x * cv.width + Math.sin(time * 3) * p.sw;
      c2.save(); c2.translate(x, y); c2.rotate(time * p.spin);
      c2.fillStyle = p.c;
      c2.beginPath();
      c2.roundRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6, 2);
      c2.fill(); c2.restore();
    }
    requestAnimationFrame(draw);
  })(start);
}

// ---------- UI: Sheets ----------
function openSheet(id) {
  $("#sheetBackdrop").classList.remove("hidden");
  $("#" + id).classList.remove("hidden");
}
function closeSheets() {
  $("#sheetBackdrop").classList.add("hidden");
  $$(".sheet").forEach(s => s.classList.add("hidden"));
}
$("#sheetBackdrop").addEventListener("click", closeSheets);

function buildSheets() {
  $("#checkinSub").textContent = fmt("%N hört zu. Angeblich neutral.", ctx());
  $("#checkinOptions").innerHTML = CHECKIN_ANSWERS.map(a =>
    `<button data-answer="${a.id}"><em>${a.icon}</em>${a.label}</button>`).join("");
  $$("#checkinOptions button").forEach(b => b.onclick = () => { closeSheets(); doCheckIn(b.dataset.answer); });

  const sattHint = state.pet.stats.saettigung >= 85 ? " \u2013 Achtung: Mimo ist gerade pappsatt." : "";
  $("#feedSub").textContent = (state.pet.favDiscovered
    ? `Lieblingssnack: ${SNACKS.find(s => s.id === state.pet.favSnack).title}`
    : fmt("%N hat einen geheimen Lieblingssnack.", ctx())) + sattHint;
  const feedSnacks = SNACKS.concat(PREMIUM_SNACKS.filter(s => state.ownedSnacks.includes(s.id)));
  $("#feedGrid").innerHTML = feedSnacks.map(s => {
    const fav = state.pet.favDiscovered && s.id === state.pet.favSnack;
    const fx = [`+${s.eff.saett} Satt`];
    if (s.eff.laune >= 7) fx.push(`+${s.eff.laune} Laune`);
    if (s.eff.xp) fx.push(`+${s.eff.xp} XP`);
    if (s.eff.bond) fx.push(`+${s.eff.bond} Bond`);
    return `<button data-snack="${s.id}">${fav ? '<span class="fav">\u2665</span>' : ""}
      <em>${s.icon}</em><strong>${s.title}</strong><small>${s.sub}</small>
      <span class="feed-fx">${fx.join(" \u00b7 ")}</span></button>`;
  }).join("");
  $$("#feedGrid button").forEach(b => b.onclick = () => {
    closeSheets();
    if (blockIfAway()) return;
    spawnDragSnack(b.dataset.snack);
    showToast({ icon: "\u{1F449}", title: "Zieh den Snack zu Mimo", detail: "Direkt zum Mund für die schnelle Mahlzeit." });
  });

  $("#gamesSub").textContent = fmt("%N ist bereits in Position.", ctx());
  $("#gamesOptions").innerHTML = Object.keys(GAME_DEFS).map(m => {
    const best = state.best[m] || 0;
    return `<button data-mode="${m}"><em>${m === "sterne" ? "\u2605" : "\u25EF"}</em>${GAME_DEFS[m].title}
      ${best ? `<span class="q-progress" style="margin-left:auto">Rekord ${best}</span>` : ""}</button>`;
  }).join("") + `<button data-mode="huetchen"><em>\u{1F3A9}</em><span>${GAME_MENU_HUETCHEN.title}<span class="talk-option-hint">${GAME_MENU_HUETCHEN.sub}${state.best?.huetchen ? " \u00b7 Rekord: Runde " + state.best.huetchen : ""}</span></span></button>`;
  $$("#gamesOptions button").forEach(b => b.onclick = () => {
    closeSheets();
    if (b.dataset.mode === "huetchen") openCups(); else openGame(b.dataset.mode);
  });

  $("#expedSub").textContent = fmt("%N verspricht, unterwegs an dich zu denken. Mindestens zweimal.", ctx());
  $("#expedOptions").innerHTML = EXPED_TIERS.map(t => {
    const dur = t.mins >= 60 ? `${t.mins / 60} Std` : `${t.mins} Min`;
    return `<button data-tier="${t.id}"><em>\u{1F9ED}</em><span>${t.title}<span class="talk-option-hint">${t.desc}</span></span>
      <span class="q-progress" style="margin-left:auto">${dur}</span></button>`;
  }).join("");
  $$("#expedOptions button").forEach(b => b.onclick = () => { closeSheets(); startExpedition(b.dataset.tier); });
  $("#expedLog").innerHTML = EXPED_DESTS.map(d => {
    const v = state.destVisits[d.id] || 0, m = destMastery(d.id);
    const next = m >= 3 ? "" : ` \u00b7 noch ${(m >= 2 ? 12 : m >= 1 ? 5 : 1) - v} bis ${MASTERY_NAMES[m + 1] || "Besucher"}`;
    return `<div class="log-row"><span class="log-icon">${d.icon}</span>
      <span class="log-info"><strong>${d.title}</strong><small>${v}x besucht${next}</small></span>
      <span class="chip chip-small" style="${m >= 3 ? "color:#c98a12;background:#c98a1222" : ""}">${m ? MASTERY_NAMES[m] : "Neu"}</span></div>`;
  }).join("");

  // Momente-Hub
  const tier = calmTier();
  $("#momentsCalm").textContent = `Innere Ruhe: ${CALM_TIERS[tier].name} \u00b7 ${state.calm.points} Punkte` +
    (tier < CALM_TIERS.length - 1 ? ` \u00b7 nächste Stufe ab ${CALM_TIERS[tier + 1].min}` : "");
  const evOk = eveningAvailable();
  const exercises = [
    { id:"atmen",  icon:"\u25CE", title:"Atemreise", sub: calmTier() >= 1 ? "3 Muster wählbar" : "Beruhigen & Fokus", done: state.lastBreathDay === todayKey() },
    { id:"erden",  icon:"\u{1F331}", title:"Drei Dinge", sub:"In einer Minute geerdet", done: state.calm.lastGroundDay === todayKey() },
    { id:"wolke",  icon:"\u2601", title:"Gedanken-Wolke", sub:"Etwas dem Wind geben", done: state.calm.lastCloudDay === todayKey() },
    { id:"dankbar",icon:"\u2661", title:"Dankbarkeit", sub:`Im Glas: ${state.gratitude.length}`, done: state.lastGratitudeDay === todayKey() },
    { id:"abend",  icon:"\u{1F319}", title:"Tagesabschluss", sub: new Date().getHours() < EVENING_RITUAL.minHour ? EVENING_RITUAL.lockedHint : "Drei Fragen, dann Feierabend",
      done: state.calm.lastEveningDay === todayKey(), locked: !evOk && state.calm.lastEveningDay !== todayKey() }
  ];
  $("#momentsList").innerHTML = exercises.map(e =>
    `<button data-ex="${e.id}" ${e.locked ? "disabled style='opacity:.45'" : ""}>
      <em>${e.icon}</em><span>${e.title}${e.done ? " \u2713" : ""}<span class="talk-option-hint">${e.sub}</span></span></button>`).join("");
  $$("#momentsList button").forEach(b => b.onclick = () => {
    closeSheets();
    const ex = b.dataset.ex;
    if (ex === "atmen") startBreath("ruhe");
    else if (ex === "erden") startGround();
    else if (ex === "wolke") { buildSheets(); $("#cloudInput").value = ""; $("#cloudRelease").disabled = true; openSheet("sheet-cloud"); }
    else if (ex === "dankbar") { buildSheets(); $("#gratInput").value = ""; $("#gratSave").disabled = true; openSheet("sheet-gratitude"); }
    else if (ex === "abend") startEvening();
  });
  $("#cloudPrompt").textContent = fmt(CLOUD_TEXTS.prompt, ctx());
  $("#cloudInput").placeholder = CLOUD_TEXTS.placeholder;

  $("#gratPrompt").textContent = fmt(GRATITUDE_TEXTS.prompt, ctx());
  const jar = state.gratitude || [];
  $("#gratJarTitle").textContent = JAR_TEXTS.title + (jar.length ? ` \u00b7 ${jar.length === 1 ? "1 Licht" : jar.length + " Lichter"} gesammelt` : "");
  $("#gratJar").innerHTML = jar.length
    ? jar.slice(0, 10).map(e => `<li><span class="jar-dot"></span><span class="jar-text">${(e.text || "").replace(/[<>&]/g, "")}</span><span class="jar-date">${new Date(e.d).toLocaleDateString("de-DE", { weekday: "short" })}</span></li>`).join("")
    : `<li class="jar-empty">${JAR_TEXTS.empty}</li>`;
  const recent = state.gratitude.slice(0, 3);
  $("#gratRecent").classList.toggle("hidden", recent.length === 0);
  $("#gratRecent").innerHTML = recent.map(g =>
    `<div>${new Date(g.d).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} \u00b7 ${g.text}</div>`).join("");

  $("#talkSub").textContent = fmt("%N hat Zeit. %N hat immer Zeit.", ctx());
  const menu = availableConversations();
  const ICONS = { fact: "?", context: "\u2665", story: "\u2726", deep: "\u2727", quatsch: "\u263A" };
  let liveRows = "";
  if (state.live && !state.live.done) {
    const story = liveStoryDef();
    const label = state.live.waitingChoice ? fmt(LIVE_TEXTS.menuWaiting, ctx()) : fmt(LIVE_TEXTS.menuLive, ctx({ S: story.title }));
    liveRows += `<button data-live="1"><em>\u2709</em><span>${label}<span class="talk-option-hint">${story.title}</span></span>${state.live.unread || state.live.waitingChoice ? '<span class="talk-new"></span>' : ""}</button>`;
  } else if (state.live?.done) {
    liveRows += `<button data-live="1"><em>\u2709</em><span>${liveStoryDef().title}<span class="talk-option-hint">Nochmal lesen</span></span></button>`;
  }
  if (state.pings?.items?.length) {
    const pu = pingsUnreadCount();
    liveRows += `<button data-pings="1"><em>\u{1F4EC}</em><span>Nachrichten von ${state.pet.name}${pu ? ` (${pu} neu)` : ""}</span>${pu ? '<span class="talk-new"></span>' : ""}</button>`;
  }
  $("#talkOptions").innerHTML = liveRows + menu.map((cv, i) =>
    `<button data-idx="${i}"><em>${ICONS[cv.type]}</em><span>${TALK_MENU_HINTS[cv.type]}
      ${cv.type === "fact" || cv.type === "deep" || cv.type === "context" ? "" : ""}</span>
      ${cv.type !== "quatsch" ? '<span class="talk-new"></span>' : ""}</button>`).join("");
  $$("#talkOptions button").forEach(b => b.onclick = () => {
    closeSheets();
    if (b.dataset.live) { openLiveChat(); return; }
    if (b.dataset.pings) { openPingsChat(); return; }
    startConversation(menu[+b.dataset.idx]);
  });
}

// ---------- Mini-Game ----------
const game = {
  mode: "sterne",
  running: false, items: [], pops: [], floats: [], petX: 0.5, score: 0, timeLeft: 30,
  spawnAcc: 0, lastTick: 0, t: 0, submitted: false, raf: null,
  combo: 0, comboLast: 0, comboBest: 0
};

// Combo: Treffer innerhalb des Fensters bauen die Serie auf; ab 3 gilt x2
function registerCatch(now, windowMs) {
  if (now - game.comboLast < windowMs) game.combo++;
  else game.combo = 1;
  game.comboLast = now;
  game.comboBest = Math.max(game.comboBest, game.combo);
  return game.combo >= 3 ? 2 : 1;
}

function addFloat(x, y, text, color) {
  game.floats.push({ x, y, t: 0, text, color: color || "#9e486b" });
}

function openGame(mode = "sterne") {
  if (blockIfAway()) { closeSheets(); return; }
  game.mode = mode;
  $("#gameOverlay").classList.remove("hidden");
  $("#gameReady").classList.remove("hidden");
  $("#gameFinished").classList.add("hidden");
  $("#gameReady .serif").textContent = GAME_DEFS[mode].title;
  const extra = mode === "sterne" ? " Schnelle Fänge bauen Combos auf. Sternschnuppen bringen 5." : " Schnelle Treffer bauen Combos auf. Finger weg von Stachelblasen.";
  $("#gameIntro").textContent = fmt(GAME_DEFS[mode].desc, ctx()) + extra + " 30 Sekunden.";
  const best = state.best[mode] || 0;
  $("#gameBestChip").classList.toggle("hidden", best === 0);
  $("#gameBestChip").textContent = `\u{1F3C6} Rekord: ${best}`;
  const cv = $("#gameCanvas");
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  drawGame();
}

function startGame() {
  Object.assign(game, { running: true, items: [], pops: [], floats: [], petX: 0.5, score: 0, timeLeft: 30, spawnAcc: 0, t: 0, submitted: false, lastTick: performance.now(), combo: 0, comboLast: 0, comboBest: 0 });
  $("#gameReady").classList.add("hidden");
  $("#gameFinished").classList.add("hidden");
  $("#gameScore").textContent = "0";
  cancelAnimationFrame(game.raf);
  game.raf = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  const dt = Math.min((now - game.lastTick) / 1000, 0.1);
  game.lastTick = now;
  if (game.running) {
    game.timeLeft -= dt;
    $("#gameTime").textContent = Math.max(0, Math.ceil(game.timeLeft));
    if (game.timeLeft <= 0) { endGame(); return; }
    game.t += dt;
    game.spawnAcc += dt;
    if (game.mode === "sterne") {
      const interval = Math.max(0.45, 0.9 - (30 - game.timeLeft) * 0.012);
      if (game.spawnAcc >= interval) {
        game.spawnAcc = 0;
        const shoot = Math.random() < 0.06;
        game.items.push({
          x: 0.08 + Math.random() * 0.84, y: -0.05,
          sp: (0.28 + Math.random() * 0.14) * (shoot ? 2.4 : 1),
          gold: !shoot && Math.random() < 0.1, shoot, rot: Math.random() * 6
        });
      }
      let caughtAny = false;
      game.items = game.items.filter(it => {
        it.y += it.sp * dt;
        if (it.y >= 0.755 && it.y <= 0.845 && Math.abs(it.x - game.petX) < 0.11) {
          const mult = registerCatch(now, 1500);
          const value = (it.shoot ? 5 : it.gold ? 3 : 1) * mult;
          game.score += value;
          addFloat(it.x, 0.74, (mult > 1 ? `Combo x2! +${value}` : `+${value}`), it.shoot ? "#e56b6b" : it.gold ? "#c98a12" : "#9e486b");
          caughtAny = true;
          return false;
        }
        return it.y <= 1.1;
      });
      if (caughtAny) {
        $("#gameScore").textContent = game.score;
        playSound("catch");
        if (navigator.vibrate) navigator.vibrate(10);
      }
    } else {
      const interval = Math.max(0.4, 0.75 - (30 - game.timeLeft) * 0.008);
      if (game.spawnAcc >= interval) {
        game.spawnAcc = 0;
        const spike = Math.random() < 0.11;
        game.items.push({ x: 0.12 + Math.random() * 0.76, y: 1.08, sp: 0.13 + Math.random() * 0.1,
          r: 20 + Math.random() * 14, gold: !spike && Math.random() < 0.08, spike, wob: Math.random() * 6, dx: 0 });
      }
      game.items = game.items.filter(it => { it.y -= it.sp * dt; return it.y > -0.1; });
    }
    game.pops = game.pops.filter(p => (p.t += dt) < 0.4);
    game.floats = game.floats.filter(f => (f.t += dt) < 0.9);
  }
  drawGame();
  game.raf = requestAnimationFrame(gameLoop);
}

function drawGame() {
  const cv = $("#gameCanvas"), c2 = cv.getContext("2d");
  const W = cv.width, H = cv.height, dpr = devicePixelRatio;
  c2.clearRect(0, 0, W, H);
  // Pop-Ringe
  for (const p of game.pops) {
    c2.globalAlpha = 1 - p.t / 0.4;
    c2.strokeStyle = p.gold ? "#efa93b" : "#ffffff";
    c2.lineWidth = 3 * dpr;
    c2.beginPath(); c2.arc(p.x * W, p.y * H, (p.r + p.t * 90) * dpr, 0, 7); c2.stroke();
    c2.globalAlpha = 1;
  }
  // Score-Floats
  for (const f of game.floats) {
    c2.globalAlpha = Math.max(0, 1 - f.t / 0.9);
    c2.fillStyle = f.color;
    c2.font = `bold ${15 * dpr}px -apple-system, sans-serif`;
    c2.textAlign = "center";
    c2.fillText(f.text, f.x * W, (f.y - f.t * 0.06) * H);
    c2.globalAlpha = 1;
  }
  if (game.mode === "blasen") {
    for (const it of game.items) {
      it.dx = it.x + Math.sin(game.t * 1.8 + it.wob) * 0.035;
      const x = it.dx * W, y = it.y * H, r = it.r * dpr;
      if (it.spike) {
        c2.fillStyle = "rgba(70,50,70,.5)";
        c2.strokeStyle = "rgba(50,32,50,.9)";
        c2.lineWidth = 2.2 * dpr;
        c2.beginPath(); c2.arc(x, y, r, 0, 7); c2.fill(); c2.stroke();
        c2.strokeStyle = "rgba(50,32,50,.9)"; c2.lineWidth = 2.6 * dpr;
        for (let a = 0; a < 8; a++) {
          const ang = a / 8 * Math.PI * 2 + game.t;
          c2.beginPath();
          c2.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
          c2.lineTo(x + Math.cos(ang) * (r + 7 * dpr), y + Math.sin(ang) * (r + 7 * dpr));
          c2.stroke();
        }
        continue;
      }
      c2.fillStyle = it.gold ? "rgba(242,194,55,.32)" : "rgba(255,255,255,.22)";
      c2.strokeStyle = it.gold ? "rgba(217,150,20,.85)" : "rgba(255,255,255,.8)";
      c2.lineWidth = 2.2 * dpr;
      c2.beginPath(); c2.arc(x, y, r, 0, 7); c2.fill(); c2.stroke();
      c2.strokeStyle = "rgba(255,255,255,.9)"; c2.lineWidth = 2.6 * dpr;
      c2.beginPath(); c2.arc(x - r * 0.28, y - r * 0.28, r * 0.5, Math.PI * 1.05, Math.PI * 1.5); c2.stroke();
    }
    return;
  }
  // Sterne
  for (const it of game.items) {
    drawStar(c2, it.x * W, it.y * H, (it.gold ? 17 : 13) * dpr, it.gold ? "#efa93b" : "#ffd94d", it.rot + it.y * 4);
  }
  // Pet (vereinfachter Blob)
  const px = game.petX * W, py = 0.8 * H, r = 44 * dpr;
  c2.fillStyle = "rgba(66,48,58,.14)";
  c2.beginPath(); c2.ellipse(px, py + r * 0.95, r * 0.8, r * 0.16, 0, 0, 7); c2.fill();
  const grad = c2.createLinearGradient(0, py - r, 0, py + r);
  grad.addColorStop(0, "#fdbb80"); grad.addColorStop(1, "#ef8d5c");
  c2.fillStyle = "#f79a67";
  c2.beginPath(); c2.ellipse(px - r * 0.58, py - r * 0.82, r * 0.2, r * 0.28, 0, 0, 7); c2.fill();
  c2.beginPath(); c2.ellipse(px + r * 0.58, py - r * 0.82, r * 0.2, r * 0.28, 0, 0, 7); c2.fill();
  c2.fillStyle = grad;
  c2.beginPath(); c2.ellipse(px, py, r, r * 0.92, 0, 0, 7); c2.fill();
  c2.fillStyle = "#3a2531";
  c2.beginPath(); c2.arc(px - r * 0.33, py - r * 0.2, r * 0.11, 0, 7); c2.fill();
  c2.beginPath(); c2.arc(px + r * 0.33, py - r * 0.2, r * 0.11, 0, 7); c2.fill();
  c2.strokeStyle = "#6e3a3e"; c2.lineWidth = 4 * dpr; c2.lineCap = "round";
  c2.beginPath(); c2.moveTo(px - r * 0.18, py + r * 0.12);
  c2.quadraticCurveTo(px, py + r * 0.3, px + r * 0.18, py + r * 0.12); c2.stroke();
}

function drawStar(c2, x, y, r, color, rot) {
  c2.save(); c2.translate(x, y); c2.rotate(rot);
  c2.fillStyle = color;
  c2.shadowColor = "rgba(255,220,120,.6)"; c2.shadowBlur = 8;
  c2.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    c2[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c2.closePath(); c2.fill(); c2.restore();
}

function endGame() {
  game.running = false;
  if (game.comboBest >= 5) unlockAchievement("combo.5");
  submitGame();
  if (game.score > 0 && game.score >= (state.best[game.mode] || 0)) {
    homePet?.emote("star", 2200);
    if (game.score >= 12) captureMoment("rekord", `${game.score} bei ${GAME_DEFS[game.mode].title}`);
  }
  $("#gameFinalScore").textContent = `${game.score} ${game.mode === "blasen" ? "Blasen" : "Sterne"}`;
  const isBest = game.score >= (state.best[game.mode] || 0) && game.score > 0;
  $("#gameNewBest").classList.toggle("hidden", !isBest);
  $("#gameBestText").textContent = isBest ? "" : `Rekord: ${state.best[game.mode] || 0}`;
  $("#gameFinished").classList.remove("hidden");
  drawGame();
}

function submitGame() {
  if (game.submitted) return;
  game.submitted = true;
  finishMiniGame(game.score, game.mode);
}

function bindGameInput() {
  const cv = $("#gameCanvas");
  const move = (clientX) => {
    if (!game.running || game.mode !== "sterne") return;
    game.petX = clamp(clientX / innerWidth, 0.08, 0.92);
  };
  const tap = (clientX, clientY) => {
    if (!game.running || game.mode !== "blasen") return;
    const tx = clientX / innerWidth, ty = clientY / innerHeight;
    let hit = null, hd = 1;
    for (const it of game.items) {
      const rr = (it.r * 1.5) / Math.min(innerWidth, innerHeight);
      const d = Math.hypot((it.dx || it.x) - tx, it.y - ty);
      if (d < rr && d < hd) { hit = it; hd = d; }
    }
    if (hit) {
      game.items.splice(game.items.indexOf(hit), 1);
      game.pops.push({ x: hit.dx || hit.x, y: hit.y, r: hit.r, t: 0, gold: hit.gold, spike: hit.spike });
      if (hit.spike) {
        game.combo = 0;
        game.score = Math.max(0, game.score - 3);
        addFloat(hit.dx || hit.x, hit.y, "-3", "#c03a3a");
        if (navigator.vibrate) navigator.vibrate(60);
      } else {
        const mult = registerCatch(performance.now(), 1200);
        const value = (hit.gold ? 3 : 1) * mult;
        game.score += value;
        addFloat(hit.dx || hit.x, hit.y, (mult > 1 ? `Combo x2! +${value}` : `+${value}`), hit.gold ? "#c98a12" : "#9e486b");
        playSound("catch");
        if (navigator.vibrate) navigator.vibrate(10);
      }
      $("#gameScore").textContent = game.score;
    }
  };
  cv.addEventListener("pointerdown", e => { move(e.clientX); tap(e.clientX, e.clientY); });
  cv.addEventListener("pointermove", e => { if (e.buttons || e.pointerType === "touch") move(e.clientX); });
  cv.addEventListener("touchmove", e => { e.preventDefault(); move(e.touches[0].clientX); }, { passive: false });
}

// ---------- Onboarding ----------
let obStep = 0, obBase = "frech";
function renderOnboarding() {
  $$(".ob-progress .dot").forEach((d, i) => d.classList.toggle("active", i <= obStep));
  $$(".ob-step").forEach(s => s.classList.toggle("hidden", +s.dataset.step !== obStep));
  $("#obBack").classList.toggle("hidden", obStep === 0);
  $("#obNext").textContent = obStep < 2 ? "Weiter" : "Los geht's";
  $("#obNext").disabled = obStep === 0 && !$("#obUserName").value.trim();
  if (obStep === 2) {
    const pn = $("#obPetName").value.trim() || "Mimo";
    $("#obPersTitle").textContent = `Welcher Typ soll ${pn} sein?`;
    $("#obPersList").innerHTML = BASE_PERSONALITIES.map(b =>
      `<button class="pers-option ${b.id === obBase ? "selected" : ""}" data-id="${b.id}">
        <span><strong>${b.label}</strong><small>${b.desc}</small></span><span class="radio"></span></button>`).join("");
    $$(".pers-option").forEach(btn => btn.onclick = () => { obBase = btn.dataset.id; renderOnboarding(); });
  }
  obPet?.update(obStep === 2 ? "frech" : "gluecklich", false, "none");
}

function completeOnboarding() {
  state.userName = $("#obUserName").value.trim();
  state.pet.name = $("#obPetName").value.trim() || "Mimo";
  state.pet.base = obBase;
  state.pet.pers = { frech: 20, lieb: 20, chaotisch: 20, vertraeumt: 20, anhaenglich: 20 };
  state.pet.pers[obBase] = 45;
  state.createdAt = Date.now();
  state.onboarded = true;
  save();
  $("#onboarding").classList.add("hidden");
  bootApp();
}

// ---------- Navigation + Init ----------
function switchTab(tab) {
  $$("main.screen").forEach(s => s.classList.add("hidden"));
  $("#screen-" + tab).classList.remove("hidden");
  if (tab === "room") hintOnce("room");
  $$("#dock button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const idx = ["home", "room", "diary", "profile"].indexOf(tab);
  $("#dockPill").style.left = `calc(6px + ${idx} * (25% - 3px))`;
  window.scrollTo(0, 0);
}

function dailyGreeting() {
  if (!state.onboarded || state.lastGreetDay === todayKey()) return;
  state.lastGreetDay = todayKey();
  let text;
  const last = state.pet.memory.recent[0];
  if (last === "stressig" && state.pet.lastCheckInDay === yesterdayKey()) text = GREETINGS.afterStress;
  else if (last === "super" && state.pet.lastCheckInDay === yesterdayKey()) text = GREETINGS.afterSuper;
  else text = pick(GREETINGS[dayPhase()]);
  setTimeout(() => showReaction(fmt(text, ctx())), 900);
  setTimeout(() => showReaction(fmt(pick(WEATHER[getWeather()].lines), ctx())), 6200);
  save();
}

function timeTick() {
  document.body.className = "phase-" + dayPhase();
  checkExpeditionReturn();
  maybeStartLiveStory();
  processLive();
  processPings();
  const hrs = (Date.now() - state.pet.lastInteraction) / 36e5;
  applyDecay();
  if (hrs > 36 && state.onboarded && !state._neglectNoted) {
    addDiary("neglect"); state._neglectNoted = true;
  }
  if (hrs < 36) state._neglectNoted = false;
  currentDaily = dailyMessage();
  ensureQuests();
  save(); renderAll();
}

function bootApp() {
  checkAway();
  checkExpeditionReturn();
  $("#dock").classList.remove("hidden");
  homePet = createPet($("#petMount"), 210);
  roomPet = createPet($("#roomPetMount"), 135);
  const roomSvg = $("#screen-room svg.room-scene") || $("#screen-room svg");
  roomSvg?.addEventListener("pointerdown", (e) => {
    const grp = e.target.closest?.('g[id^="deco"]');
    if (grp && !grp.classList.contains("hidden")) roomTap(grp.id.replace("deco", "").toLowerCase());
  });
  profilePet = createPet($("#profilePetMount"), 115);
  createPet($("#diaryPetMount"), 110).update("vertraeumt", false, "none");
  $("#petMount").addEventListener("click", () => {
    homePet.squish();
    if (state.pet.sleeping) { wakeUp(); }
    else { spawnHearts($("#petMount")); interact("streicheln"); }
  });
  buildSheets();
  timeTick();
  switchTab("home");
  showAway();
  showReturn();
  dailyGreeting();
  maybeStartLiveStory();
  processLive();
  processPings();
  if (state.onboarded) {
    setTimeout(() => hintOnce("rub"), 6000);
    setTimeout(() => hintOnce("zones"), 40000);
  }
  setInterval(timeTick, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { timeTick(); showReturn(); } });
}

// ---------- Events ----------
document.addEventListener("DOMContentLoaded", () => {
  $$("#dock button").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $$(".action").forEach(btn => btn.addEventListener("click", () => {
    const a = btn.dataset.action;
    if (a === "streicheln") {
      scrollToScene();
      showReaction(fmt(RUB_HINT, ctx()));
      $("#petMount").classList.add("rub-pulse");
      setTimeout(() => $("#petMount").classList.remove("rub-pulse"), 2600);
    }
    else if (a === "schlafen") { scrollToScene(); homePet?.squish(); interact(a); }
    else if (a === "feed") { buildSheets(); openSheet("sheet-feed"); }
    else if (a === "talk") { buildSheets(); openSheet("sheet-talk"); }
    else if (a === "checkin") { buildSheets(); openSheet("sheet-checkin"); }
    else if (a === "game") { buildSheets(); openSheet("sheet-games"); }
  }));

  const petArea = $("#petMount");
  const stageEl = $(".stage");
  let tapInfo = null;
  const pd = (e) => {
    rub.mode = "pet";
    rubStart(e.clientX, e.clientY);
    const r = petArea.getBoundingClientRect();
    tapInfo = { t: Date.now(), x: e.clientX, y: e.clientY, rx: (e.clientX - r.left) / r.width, ry: (e.clientY - r.top) / r.height };
  };
  const pm = (e) => rubMove(e.clientX, e.clientY);
  petArea.addEventListener("pointerdown", pd);
  stageEl.addEventListener("pointermove", pm);
  document.addEventListener("pointerdown", sndUnlock, { once: false });
  [["sndMusic", "music"], ["sndAmb", "ambience"], ["sndSfx", "sfx"]].forEach(([id, key]) => {
    $("#" + id).addEventListener("change", (e) => {
      soundSettings()[key] = e.target.checked;
      save();
      sndUnlock();
      applySoundSettings();
    });
  });
  document.addEventListener("visibilitychange", () => sndSuspend(document.hidden));
  window.addEventListener("pointerup", (e) => {
    if (tapInfo && Date.now() - tapInfo.t < 320 && Math.hypot(e.clientX - tapInfo.x, e.clientY - tapInfo.y) < 12) {
      petTap(zoneFor(tapInfo.rx, tapInfo.ry));
    }
    tapInfo = null;
    rubEnd(); rubRelease();
  });
  stageEl.addEventListener("pointerleave", () => { rubEnd(); rubRelease(); });

  const bathStage = $("#bathStage");
  bathStage.addEventListener("pointerdown", (e) => { rub.mode = "wash"; rubStart(e.clientX, e.clientY); });
  bathStage.addEventListener("pointermove", pm);
  bathStage.addEventListener("pointerleave", rubEnd);
  $("#bathSkip").addEventListener("click", cancelBath);
  $("#cupStart").addEventListener("click", () => { cup.round = 1; startCupRound(); });
  $("#cupClose").addEventListener("click", () => {
    if (cup.running && cup.round > 1) { cupEnd(cup.round - 1); }
    else { cup.running = false; cup.round = 0; $("#cupOverlay").classList.add("hidden"); }
  });
  $$(".cup").forEach(el => el.addEventListener("pointerdown", () => cupPick(+el.dataset.cup)));
  $("#spongeBtn").addEventListener("click", startBath);
  $("#arcRow").addEventListener("click", () => { if (arcGateCheck().ready) startArcChapter(); });
  $("#liveTicker").addEventListener("click", () => {
    if ($("#liveTicker").dataset.target === "pings") openPingsChat(); else openLiveChat();
  });

  $("#chatClose").addEventListener("click", () => { closeSheets(); renderAll(); });
  $("#expedOpen").addEventListener("click", () => { buildSheets(); openSheet("sheet-exped"); });
  $("#momentsRow").addEventListener("click", () => { buildSheets(); openSheet("sheet-momente"); });
  $("#breathSkip").addEventListener("click", () => finishBreath(true));
  $("#breathStart").addEventListener("click", runBreath);
  $("#groundSkip").addEventListener("click", () => finishGround(true));
  $("#cloudInput").addEventListener("input", () => { $("#cloudRelease").disabled = !$("#cloudInput").value.trim(); });
  $("#cloudRelease").addEventListener("click", () => {
    const t = $("#cloudInput").value.trim();
    if (t) releaseCloud(t);
  });
  $("#gratInput").addEventListener("input", () => { $("#gratSave").disabled = !$("#gratInput").value.trim(); });
  $("#gratSave").addEventListener("click", () => {
    const text = $("#gratInput").value.trim();
    if (!text) return;
    closeSheets();
    saveGratitude(text);
  });
  $("#returnClose").addEventListener("click", () => {
    confettiRun = false;
    $("#returnOverlay").classList.add("hidden");
    renderAll();
  });
  $("#giftCard").addEventListener("click", openGiftOverlay);
  $("#giftBig").addEventListener("click", revealGift);
  $("#giftClose").addEventListener("click", closeGiftOverlay);
  $("#awayClose").addEventListener("click", () => {
    if (pendingAway) { earnDust(pendingAway.dust); pendingAway = null; save(); }
    $("#awayOverlay").classList.add("hidden");
    renderAll();
  });

  $("#levelupClose").addEventListener("click", () => {
    confettiRun = false;
    $("#levelupOverlay").classList.add("hidden");
    if (pendingEvo) { const s = pendingEvo; pendingEvo = null; setTimeout(() => showEvolution(s), 250); }
    else setTimeout(maybeShowBondTier, 250);
    renderAll();
  });

  $("#gameStart").addEventListener("click", startGame);
  $("#gameAgain").addEventListener("click", startGame);
  $("#gameDone").addEventListener("click", () => { cancelAnimationFrame(game.raf); $("#gameOverlay").classList.add("hidden"); });
  $("#gameClose").addEventListener("click", () => {
    if (game.running) { game.running = false; submitGame(); }
    cancelAnimationFrame(game.raf);
    $("#gameOverlay").classList.add("hidden");
  });
  bindGameInput();

  $("#resetBtn").addEventListener("click", () => {
    if (confirm(`${state.pet.name} und alle Daten werden gelöscht. Das Onboarding startet neu.`)) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });

  // Onboarding
  if (!state.onboarded) {
    $("#onboarding").classList.remove("hidden");
    obPet = createPet($("#obPetMount"), 150);
    obPet.update("gluecklich", false, "none");
    $("#obUserName").addEventListener("input", renderOnboarding);
    $("#obNext").addEventListener("click", () => {
      if (obStep < 2) { obStep++; renderOnboarding(); } else completeOnboarding();
    });
    $("#obBack").addEventListener("click", () => { obStep--; renderOnboarding(); });
    renderOnboarding();
  } else {
    bootApp();
  }
});
