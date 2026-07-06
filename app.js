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
const fmt = (tpl, ctx) => tpl
  .replaceAll("%N", ctx.N ?? "").replaceAll("%U", ctx.U ?? "")
  .replaceAll("%S", ctx.S ?? "").replaceAll("%L", ctx.L ?? "");

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
      stats: { energie: 80, laune: 70, saettigung: 70, bond: 10, xp: 0, level: 1 },
      pers: { frech: 20, lieb: 20, chaotisch: 20, vertraeumt: 20, anhaenglich: 20 },
      lastInteraction: Date.now(), lastUpdate: Date.now(),
      lastCheckInDay: null, streak: 0, sleeping: false,
      favSnack: pick(SNACKS).id, favDiscovered: false,
      bestScore: 0, hat: "none",
      memory: { checkinCounts: {}, interCounts: {}, recent: [], quirks: [] }
    },
    diary: [],
    quests: null,           // { dayKey, list:[{type,progress}], bonus }
    achievements: [],
    hats: ["none"]
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

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

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
  const hrs = (Date.now() - p.lastUpdate) / 36e5;
  if (hrs < 0.05) return;
  s.energie += p.sleeping ? hrs * 6 : -hrs * 1.5;
  s.saettigung -= hrs * 2.5;
  s.laune -= hrs * 1.2;
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
}
function bump(trait, amt) { state.pet.pers[trait] = clamp(state.pet.pers[trait] + amt, 0, 100); }

function addXP(amount) {
  const s = state.pet.stats;
  s.xp += amount;
  const newLevel = Math.floor(s.xp / 100) + 1;
  if (newLevel > s.level) { s.level = newLevel; return newLevel; }
  return null;
}

function handleLevelUp(level) {
  if (!level) return;
  const msg = fmt(LEVEL_UP[level] || LEVEL_UP.default, ctx({ L: level }));
  addDiary("levelUp", { L: level });
  if (level % 2 === 0) grantQuirk();
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

const ctx = (extra = {}) => ({ N: state.pet.name, U: state.userName, ...extra });

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
  streicheln: { laune: 8, bond: 2, trait: "lieb", xp: 5 },
  reden:      { laune: 6, bond: 3, trait: "anhaenglich", xp: 6 },
  schlafen:   { energie: 25, trait: "vertraeumt", xp: 3 }
};

function recordInteraction(type) {
  const m = state.pet.memory.interCounts;
  m[type] = (m[type] || 0) + 1;
}

function interact(type) {
  applyDecay();
  const p = state.pet;
  p.sleeping = type === "schlafen";
  const e = EFFECTS[type];
  p.stats.energie += e.energie || 0; p.stats.laune += e.laune || 0; p.stats.bond += e.bond || 0;
  if (e.trait) bump(e.trait, 1.5);
  clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction(type);
  showReaction(genericReaction(type));
  if (Math.random() < 0.25) addDiary("interaction", { type });
  handleLevelUp(addXP(e.xp));
  if (type === "streicheln") questProgress("streicheln");
  if (type === "reden") questProgress("reden");
  const h = new Date().getHours();
  if (h >= 0 && h < 4) unlockAchievement("nachteule");
  checkUnlocks(); save(); renderAll();
}

function wakeUp() {
  state.pet.sleeping = false;
  showReaction(fmt("%N blinzelt. Er tut so, als wäre er längst wach gewesen.", ctx()));
  save(); renderAll();
}

function feed(snackId) {
  applyDecay();
  const p = state.pet;
  p.sleeping = false;
  const snack = SNACKS.find(s => s.id === snackId);
  const isFav = snackId === p.favSnack;
  const discovery = isFav && !p.favDiscovered;
  p.stats.saettigung += snack.eff.saett;
  p.stats.laune += snack.eff.laune + (isFav ? 8 : 0);
  p.stats.energie += snack.eff.energie;
  if (isFav) p.stats.bond += 2;
  clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction("fuettern");

  let text;
  if (discovery) {
    p.favDiscovered = true;
    text = fmt(FEED_REACTIONS.discovery, ctx({ S: snack.title }));
    addDiary("snack", { S: snack.title });
    playSound("success");
  } else if (isFav) {
    text = fmt(pick(FEED_REACTIONS.favorite), ctx({ S: snack.title }));
  } else if (computeMood() === "hungrig") {
    text = fmt(pick(FEED_REACTIONS[snackId].concat(FEED_REACTIONS.hungry)), ctx());
  } else {
    text = fmt(pick(FEED_REACTIONS[snackId]), ctx());
  }
  showReaction(text);
  if (Math.random() < 0.25) addDiary("interaction", { type: "fuettern" });
  handleLevelUp(addXP(5));
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
  handleLevelUp(addXP(6));
  questProgress("reden");
  checkUnlocks(); save(); renderAll();
}

function doCheckIn(answerId) {
  const p = state.pet;
  if (p.lastCheckInDay === todayKey()) return;
  applyDecay();
  p.streak = p.lastCheckInDay === yesterdayKey() ? p.streak + 1 : 1;
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
  handleLevelUp(addXP(15));
  questProgress("checkin");
  checkUnlocks(); save(); renderAll();
}

function finishMiniGame(score) {
  applyDecay();
  const p = state.pet;
  p.sleeping = false;
  p.stats.laune += 14; p.stats.energie -= 10; p.stats.bond += 2;
  bump("chaotisch", 1.5); clampStats();
  p.lastInteraction = Date.now(); p.lastUpdate = Date.now();
  recordInteraction("spielen");
  const isBest = score > p.bestScore;
  if (isBest) p.bestScore = score;

  let text;
  if (isBest && score > 0) text = GAME_REACTIONS.newBest;
  else if (score === 0) text = GAME_REACTIONS.zero;
  else if (score <= 5) text = GAME_REACTIONS.low;
  else if (score <= 12) text = GAME_REACTIONS.mid;
  else text = GAME_REACTIONS.high;
  showReaction(fmt(text, ctx({ S: score })));
  if (Math.random() < 0.34 || score >= 15) addDiary("game", { S: score, high: score >= 15 });
  handleLevelUp(addXP(Math.min(8 + Math.floor(score / 2), 25)));
  questProgress("spielen");
  if (score >= 10) questProgress("minigame");
  checkUnlocks(); save(); renderAll();
  return isBest;
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
    if (item.type === type && item.progress < QUEST_TYPES[type].target) { item.progress++; changed = true; }
  }
  if (!changed) return;
  const allDone = q.list.every(i => i.progress >= QUEST_TYPES[i.type].target);
  if (allDone && !q.bonus) {
    q.bonus = true;
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
  showToast(def);
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
    "highscore.15": p.bestScore >= 15
  };
  for (const id of Object.keys(cond)) if (cond[id]) unlockAchievement(id);
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
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "catch" ? [[880, 0.06]] :
                  kind === "level" ? [[523, 0.1], [784, 0.14]] : [[659, 0.09], [880, 0.12]];
    let t = audioCtx.currentTime;
    for (const [f, d] of notes) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + d); t += d * 0.7;
    }
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
    <g class="breath"><g class="squishwrap"><g class="hop">
      <g class="earL" transform="rotate(-6 84 66)">
        <ellipse cx="84" cy="58" rx="21" ry="28" fill="#f79a67"/>
        <ellipse cx="84" cy="62" rx="11" ry="16" fill="#ef7a52"/>
      </g>
      <g class="earR" transform="rotate(6 176 66)">
        <ellipse cx="176" cy="58" rx="21" ry="28" fill="#f79a67"/>
        <ellipse cx="176" cy="62" rx="11" ry="16" fill="#ef7a52"/>
      </g>
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
      <g class="eyes">
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
      </g>
    </g></g></g>
    <text class="zzz hidden" x="194" y="44" font-size="26">z z z</text>
  </svg>`;

  const svg = mount.querySelector("svg");
  const inst = {
    svg, blob: svg.querySelector(".blob"),
    phase: Math.random() * 6.28,
    animated: !opts.static,
    blinking: false,
    mood: "gluecklich", sleeping: false,
    update(mood, sleeping, hat) {
      this.mood = mood; this.sleeping = sleeping;
      svg.classList.toggle("sleeping", sleeping);
      svg.classList.toggle("happy", mood === "gluecklich" && !sleeping);
      svg.querySelector(".zzz").classList.toggle("hidden", !sleeping);
      const eyes = { normal: 0, big: 0, lid: 0, sly: 0, closed: 0 };
      const mouth = { smile: 0, small: 0, open: 0, flat: 0, sleep: 0 };
      if (sleeping || this.blinking) { eyes.closed = 1; }
      else if (mood === "muede" || mood === "vertraeumt") eyes.lid = 1;
      else if (mood === "frech") eyes.sly = 1;
      else if (mood === "dramatisch") eyes.big = 1;
      else eyes.normal = 1;
      if (sleeping) mouth.sleep = 1;
      else if (mood === "gluecklich" || mood === "anhaenglich") mouth.smile = 1;
      else if (mood === "hungrig" || mood === "dramatisch") mouth.open = 1;
      else if (mood === "muede" || mood === "gelangweilt") mouth.flat = 1;
      else mouth.small = 1;
      for (const k of Object.keys(eyes)) svg.querySelector(`.eye-${k}`).classList.toggle("hidden", !eyes[k]);
      for (const k of Object.keys(mouth)) svg.querySelector(`.m-${k}`).classList.toggle("hidden", !mouth[k]);
      for (const h of HATS) {
        if (h.id === "none") continue;
        svg.querySelector(`.hat-${h.id}`).classList.toggle("hidden", h.id !== hat);
      }
      const up = (mood === "gluecklich" && !sleeping);
      svg.querySelector(".armL").setAttribute("transform", up ? "rotate(-32 42 168)" : "rotate(12 42 168)");
      svg.querySelector(".armR").setAttribute("transform", up ? "rotate(32 218 168)" : "rotate(-12 218 168)");
    },
    squish() {
      svg.classList.add("squish");
      setTimeout(() => svg.classList.remove("squish"), 180);
    }
  };
  inst.blob.setAttribute("d", blobPath(130, 128, 92, 86, inst.phase));
  if (inst.animated) {
    // Blinzeln
    setInterval(() => {
      if (inst.sleeping) return;
      inst.blinking = true; inst.update(inst.mood, inst.sleeping, currentHat());
      setTimeout(() => { inst.blinking = false; inst.update(inst.mood, inst.sleeping, currentHat()); }, 150);
    }, 3400 + Math.random() * 900);
    // Blick wandert
    const eyesEl = svg.querySelector(".eyes");
    setInterval(() => {
      if (inst.sleeping) return;
      eyesEl.style.transform = `translateX(${pick([-5, 5, -4, 4])}px)`;
      setTimeout(() => { eyesEl.style.transform = ""; }, 1100);
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
  $("#levelChip").textContent = "Level " + p.stats.level;
  $("#streakChip").classList.toggle("hidden", p.streak < 2);
  $("#streakChip").innerHTML = `&#128293; ${p.streak} Tage`;
  setRing($("#xpRing"), (p.stats.xp % 100) / 100, 18);
  $("#moodAura").style.background = MOODS[mood].hex;
  homePet?.update(mood, p.sleeping, p.hat);
  $("#wakeHint").classList.toggle("hidden", !p.sleeping);
  $("#moodChip").textContent = MOODS[mood].label;
  $("#moodChip").style.color = MOODS[mood].hex;
  $("#moodChip").style.background = MOODS[mood].hex + "22";
  $("#moodText").textContent = fmt(MOOD_TEXT[mood], ctx());
  $("#dailyMsg").textContent = currentDaily;
  for (const key of ["energie", "laune", "saettigung", "bond"])
    setRing($(`.stat-ring[data-stat="${key}"] .ring-fg`), p.stats[key] / 100, 21);

  // Quests
  ensureQuests();
  const q = state.quests;
  const allDone = q.list.every(i => i.progress >= QUEST_TYPES[i.type].target);
  $("#questBonusChip").textContent = allDone ? "Geschafft" : "+20 XP Bonus";
  $("#questList").innerHTML = q.list.map(item => {
    const def = QUEST_TYPES[item.type], done = item.progress >= def.target;
    return `<div class="quest-row ${done ? "done" : ""}">
      <span class="q-icon">${done ? "\u2713" : def.icon}</span>${def.title}
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
  roomPet?.update(mood, p.sleeping, p.hat);

  $("#wardrobe").innerHTML = HATS.map(h => {
    const unlocked = state.hats.includes(h.id), eq = p.hat === h.id;
    let inner = h.id === "none" ? "\u2205" : (unlocked ? `<span class="mini-mount" data-hat="${h.id}"></span>` : "\u{1F512}");
    return `<button class="hat-item ${eq ? "equipped" : ""} ${unlocked ? "" : "locked"}" data-hat="${h.id}" ${unlocked ? "" : "disabled"}>
      <span class="hat-circle">${inner}</span><label>${h.title}</label>
      ${unlocked ? "" : `<span class="hint">${h.hint}</span>`}</button>`;
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

  const unlocks = [["Kissen", 2], ["Pflanze", 3], ["Lampe", 4], ["Sternenfenster", 5]];
  $("#unlockList").innerHTML = unlocks.map(([name, req]) => {
    const ok = lvl >= req;
    return `<div class="unlock-row ${ok ? "" : "locked"}">
      <span class="u-icon">${ok ? "\u2713" : "\u{1F512}"}</span>${name}
      ${ok ? "" : `<span class="chip chip-small">Level ${req}</span>`}</div>`;
  }).join("");
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

function renderProfile(mood) {
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
  $("#tileBest").textContent = p.bestScore;
  $("#persBars").innerHTML = Object.keys(p.pers).map(k =>
    `<div class="pers-bar"><div class="p-head"><span>${PERS_LABELS[k]}</span><span>${Math.round(p.pers[k])}</span></div>
     <div class="p-track"><div class="p-fill" style="width:${p.pers[k]}%;background:${PERS_COLORS[k]}"></div></div></div>`).join("");
  const quirks = p.memory.quirks.map(id => QUIRKS.find(q => q.id === id)).filter(Boolean);
  $("#quirkCount").textContent = `${quirks.length}/${QUIRKS.length}`;
  $("#quirkList").innerHTML = quirks.length
    ? quirks.map(q => `<div class="quirk-row"><em>\u2726</em>${p.name} ${q.title}</div>`).join("")
    : `<p class="muted small">${p.name} hat noch keine Macken entwickelt. Das ändert sich mit jedem zweiten Level. Garantiert.</p>`;
  $("#achCount").textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
  $("#achGrid").innerHTML = ACHIEVEMENTS.map(a => {
    const ok = state.achievements.includes(a.id);
    return `<div class="ach ${ok ? "" : "locked"}"><span class="a-icon">${ok ? a.icon : "\u{1F512}"}</span><label>${ok ? a.title : "???"}</label></div>`;
  }).join("");
}

// ---------- UI: Toast + Level-Up ----------
let toastTimer = null;
function showToast(def) {
  $("#toastIcon").textContent = def.icon;
  $("#toastTitle").textContent = "Erfolg: " + def.title;
  $("#toastDetail").textContent = def.detail;
  const t = $("#toast");
  t.classList.remove("hidden");
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3500);
}

let confettiRun = false;
function showLevelUp(level, msg) {
  $("#levelupTitle").textContent = "Level " + level;
  $("#levelupText").textContent = msg;
  $("#levelupOverlay").classList.remove("hidden");
  const mount = $("#levelupPetMount");
  mount.innerHTML = "";
  const pet = createPet(mount, 110, { static: true });
  pet.update("gluecklich", false, state.pet.hat);
  runConfetti();
}
function runConfetti() {
  const cv = $("#confetti"), c2 = cv.getContext("2d");
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

  $("#feedSub").textContent = state.pet.favDiscovered
    ? `Lieblingssnack: ${SNACKS.find(s => s.id === state.pet.favSnack).title}`
    : fmt("%N hat einen geheimen Lieblingssnack.", ctx());
  $("#feedGrid").innerHTML = SNACKS.map(s => {
    const fav = state.pet.favDiscovered && s.id === state.pet.favSnack;
    return `<button data-snack="${s.id}">${fav ? '<span class="fav">\u2665</span>' : ""}
      <em>${s.icon}</em><strong>${s.title}</strong><small>${s.sub}</small></button>`;
  }).join("");
  $$("#feedGrid button").forEach(b => b.onclick = () => { closeSheets(); feed(b.dataset.snack); });

  $("#talkSub").textContent = fmt("%N hat Zeit. %N hat immer Zeit.", ctx());
  $("#talkOptions").innerHTML = TALK_TOPICS.map(t =>
    `<button data-topic="${t.id}"><em>${t.icon}</em>${t.title}</button>`).join("");
  $$("#talkOptions button").forEach(b => b.onclick = () => { closeSheets(); talk(b.dataset.topic); });
}

// ---------- Mini-Game ----------
const game = {
  running: false, items: [], petX: 0.5, score: 0, timeLeft: 30,
  spawnAcc: 0, lastTick: 0, submitted: false, raf: null
};

function openGame() {
  $("#gameOverlay").classList.remove("hidden");
  $("#gameReady").classList.remove("hidden");
  $("#gameFinished").classList.add("hidden");
  $("#gameIntro").textContent = `Zieh ${state.pet.name} mit dem Finger hin und her. Goldene Sterne zählen dreifach. 30 Sekunden.`;
  const best = state.pet.bestScore;
  $("#gameBestChip").classList.toggle("hidden", best === 0);
  $("#gameBestChip").textContent = `\u{1F3C6} Rekord: ${best}`;
  const cv = $("#gameCanvas");
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  drawGame();
}

function startGame() {
  Object.assign(game, { running: true, items: [], petX: 0.5, score: 0, timeLeft: 30, spawnAcc: 0, submitted: false, lastTick: performance.now() });
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
    game.spawnAcc += dt;
    const interval = Math.max(0.45, 0.9 - (30 - game.timeLeft) * 0.012);
    if (game.spawnAcc >= interval) {
      game.spawnAcc = 0;
      game.items.push({ x: 0.08 + Math.random() * 0.84, y: -0.05, sp: 0.28 + Math.random() * 0.14, gold: Math.random() < 0.1, rot: Math.random() * 6 });
    }
    let caught = 0;
    game.items = game.items.filter(it => {
      it.y += it.sp * dt;
      if (it.y >= 0.755 && it.y <= 0.845 && Math.abs(it.x - game.petX) < 0.11) {
        caught += it.gold ? 3 : 1; return false;
      }
      return it.y <= 1.1;
    });
    if (caught) {
      game.score += caught;
      $("#gameScore").textContent = game.score;
      playSound("catch");
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }
  drawGame();
  game.raf = requestAnimationFrame(gameLoop);
}

function drawGame() {
  const cv = $("#gameCanvas"), c2 = cv.getContext("2d");
  const W = cv.width, H = cv.height, dpr = devicePixelRatio;
  c2.clearRect(0, 0, W, H);
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
  submitGame();
  $("#gameFinalScore").textContent = `${game.score} Sterne`;
  const isBest = game.score >= state.pet.bestScore && game.score > 0;
  $("#gameNewBest").classList.toggle("hidden", !isBest);
  $("#gameBestText").textContent = isBest ? "" : `Rekord: ${state.pet.bestScore}`;
  $("#gameFinished").classList.remove("hidden");
  drawGame();
}

function submitGame() {
  if (game.submitted) return;
  game.submitted = true;
  finishMiniGame(game.score);
}

function bindGameInput() {
  const cv = $("#gameCanvas");
  const move = (clientX) => {
    if (!game.running) return;
    game.petX = clamp(clientX / innerWidth, 0.08, 0.92);
  };
  cv.addEventListener("pointerdown", e => move(e.clientX));
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
  $$("#dock button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const idx = ["home", "room", "diary", "profile"].indexOf(tab);
  $("#dockPill").style.left = `calc(6px + ${idx} * (25% - 3px))`;
  window.scrollTo(0, 0);
}

function timeTick() {
  document.body.className = "phase-" + dayPhase();
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
  $("#dock").classList.remove("hidden");
  homePet = createPet($("#petMount"), 210);
  roomPet = createPet($("#roomPetMount"), 135);
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
  setInterval(timeTick, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) timeTick(); });
}

// ---------- Events ----------
document.addEventListener("DOMContentLoaded", () => {
  $$("#dock button").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $$(".action").forEach(btn => btn.addEventListener("click", () => {
    const a = btn.dataset.action;
    if (a === "streicheln") { homePet?.squish(); spawnHearts($("#petMount")); interact(a); }
    else if (a === "schlafen") { homePet?.squish(); interact(a); }
    else if (a === "feed") { buildSheets(); openSheet("sheet-feed"); }
    else if (a === "talk") { buildSheets(); openSheet("sheet-talk"); }
    else if (a === "checkin") { buildSheets(); openSheet("sheet-checkin"); }
    else if (a === "game") { openGame(); }
  }));

  $("#levelupClose").addEventListener("click", () => {
    confettiRun = false;
    $("#levelupOverlay").classList.add("hidden");
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
