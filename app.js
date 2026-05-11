// FitLog M003-1 — V1 client
// Static, BYOK Gemini, localStorage persistence.

(function () {
'use strict';

// ============ Constants ============

const STORAGE_PREFIX = 'm003_1';
const KEY_API = `${STORAGE_PREFIX}_apiKey`;
const KEY_MODEL = `${STORAGE_PREFIX}_model`;
const KEY_PROMPT = `${STORAGE_PREFIX}_systemPrompt`;
const KEY_PROMPT_VERSION = `${STORAGE_PREFIX}_systemPromptVersion`;
const KEY_LIBRARY = `${STORAGE_PREFIX}_library`;
const KEY_LIBRARY_SEED = `${STORAGE_PREFIX}_librarySeedVersion`;
const KEY_DAILY = `${STORAGE_PREFIX}_dailyLog`;
const KEY_HISTORY = `${STORAGE_PREFIX}_foodHistory`;
const KEY_GYM = `${STORAGE_PREFIX}_gymLog`;

const SUPPORTED_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_MODEL = 'gemini-3-flash-preview';

// Fallback preference order. When the selected primary model 5xx's, try these
// in order (skipping the primary). gemini-3-flash-preview is preferred because
// it lives on a separate capacity pool from 2.5-flash and is on free tier.
// gemini-2.0-flash is last because some accounts have free_tier limit=0 on it.
const FALLBACK_PRIORITY = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const GEMINI_URL = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

const COLS = ['item', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

// Authoritative schema sent to Gemini via generationConfig.responseSchema.
// Forces structured output — without this, gemini-3-flash-preview will
// invent its own field names (e.g. {meal, calories, protein_g, ...}).
const FOOD_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          kcal: { type: 'number' },
          p: { type: 'number' },
          f: { type: 'number' },
          c: { type: 'number' },
          su: { type: 'number' },
          fb: { type: 'number' },
        },
        required: ['item', 'kcal', 'p', 'f', 'c', 'su', 'fb'],
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['rows'],
};
const NUMERIC_COLS = ['kcal', 'p', 'f', 'c', 'su', 'fb'];
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const DAILY_DATE_WINDOW_DAYS = 30;
const GYM_ACTIVITIES = [
  { group: 'Push Upper', kind: 'weight', name: 'Bench Press - barbell/dumbbell (decline)' },
  { group: 'Push Upper', kind: 'weight', name: 'Bench Press - barbell/dumbbell (flat)' },
  { group: 'Push Upper', kind: 'weight', name: 'Bench Press - barbell/dumbbell (incline)' },
  { group: 'Push Upper', kind: 'weight', name: 'Bench Press - machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Bench Press - Smith machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Chest Fly - barbell/dumbbell' },
  { group: 'Push Upper', kind: 'weight', name: 'Chest Fly - cable' },
  { group: 'Push Upper', kind: 'weight', name: 'Chest Fly - machine (pec deck)' },
  { group: 'Push Upper', kind: 'weight', name: 'Dip - bodyweight' },
  { group: 'Push Upper', kind: 'weight', name: 'Dip - machine (assisted)' },
  { group: 'Push Upper', kind: 'weight', name: 'Front Raise - barbell/dumbbell' },
  { group: 'Push Upper', kind: 'weight', name: 'Front Raise - cable' },
  { group: 'Push Upper', kind: 'weight', name: 'Lateral Raise - barbell/dumbbell' },
  { group: 'Push Upper', kind: 'weight', name: 'Lateral Raise - cable' },
  { group: 'Push Upper', kind: 'weight', name: 'Lateral Raise - machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Push-Up - bodyweight' },
  { group: 'Push Upper', kind: 'weight', name: 'Shoulder Press - barbell/dumbbell' },
  { group: 'Push Upper', kind: 'weight', name: 'Shoulder Press - machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Shoulder Press - Smith machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Skull Crusher - barbell/dumbbell' },
  { group: 'Push Upper', kind: 'weight', name: 'Tricep Extension - barbell/dumbbell (overhead)' },
  { group: 'Push Upper', kind: 'weight', name: 'Tricep Extension - cable (overhead)' },
  { group: 'Push Upper', kind: 'weight', name: 'Tricep Extension - machine' },
  { group: 'Push Upper', kind: 'weight', name: 'Tricep Pushdown - cable' },
  { group: 'Push Lower', kind: 'weight', name: 'Calf Raise - barbell/dumbbell' },
  { group: 'Push Lower', kind: 'weight', name: 'Calf Raise - machine (seated)' },
  { group: 'Push Lower', kind: 'weight', name: 'Calf Raise - machine (standing)' },
  { group: 'Push Lower', kind: 'weight', name: 'Hip Thrust - barbell/dumbbell' },
  { group: 'Push Lower', kind: 'weight', name: 'Hip Thrust - machine' },
  { group: 'Push Lower', kind: 'weight', name: 'Leg Extension - machine' },
  { group: 'Push Lower', kind: 'weight', name: 'Leg Press - machine' },
  { group: 'Push Lower', kind: 'weight', name: 'Lunge - barbell/dumbbell' },
  { group: 'Push Lower', kind: 'weight', name: 'Squat - barbell/dumbbell (back)' },
  { group: 'Push Lower', kind: 'weight', name: 'Squat - barbell/dumbbell (front)' },
  { group: 'Push Lower', kind: 'weight', name: 'Squat - barbell/dumbbell (goblet)' },
  { group: 'Push Lower', kind: 'weight', name: 'Squat - machine (hack)' },
  { group: 'Push Lower', kind: 'weight', name: 'Squat - Smith machine' },
  { group: 'Pull Upper', kind: 'weight', name: 'Bicep Curl - barbell/dumbbell' },
  { group: 'Pull Upper', kind: 'weight', name: 'Bicep Curl - cable' },
  { group: 'Pull Upper', kind: 'weight', name: 'Bicep Curl - machine' },
  { group: 'Pull Upper', kind: 'weight', name: 'Face Pull - cable' },
  { group: 'Pull Upper', kind: 'weight', name: 'Lat Pulldown - cable' },
  { group: 'Pull Upper', kind: 'weight', name: 'Lat Pulldown - machine' },
  { group: 'Pull Upper', kind: 'weight', name: 'Pull-Up - bodyweight' },
  { group: 'Pull Upper', kind: 'weight', name: 'Pull-Up - machine (assisted)' },
  { group: 'Pull Upper', kind: 'weight', name: 'Pullover - barbell/dumbbell' },
  { group: 'Pull Upper', kind: 'weight', name: 'Pullover - cable' },
  { group: 'Pull Upper', kind: 'weight', name: 'Reverse Fly - barbell/dumbbell' },
  { group: 'Pull Upper', kind: 'weight', name: 'Reverse Fly - cable' },
  { group: 'Pull Upper', kind: 'weight', name: 'Reverse Fly - machine (rear delt)' },
  { group: 'Pull Upper', kind: 'weight', name: 'Row - barbell/dumbbell' },
  { group: 'Pull Upper', kind: 'weight', name: 'Row - cable (seated)' },
  { group: 'Pull Upper', kind: 'weight', name: 'Row - machine' },
  { group: 'Pull Upper', kind: 'weight', name: 'Row - T-bar' },
  { group: 'Pull Upper', kind: 'weight', name: 'Shrug - barbell/dumbbell' },
  { group: 'Pull Lower', kind: 'weight', name: 'Deadlift - barbell/dumbbell (conventional)' },
  { group: 'Pull Lower', kind: 'weight', name: 'Deadlift - barbell/dumbbell (Romanian)' },
  { group: 'Pull Lower', kind: 'weight', name: 'Deadlift - Smith machine' },
  { group: 'Pull Lower', kind: 'weight', name: 'Deadlift - trap bar' },
  { group: 'Pull Lower', kind: 'weight', name: 'Good Morning - barbell/dumbbell' },
  { group: 'Pull Lower', kind: 'weight', name: 'Leg Curl - machine (lying)' },
  { group: 'Pull Lower', kind: 'weight', name: 'Leg Curl - machine (seated)' },
  { group: 'Cardio', kind: 'cardio', name: 'Treadmill' },
  { group: 'Cardio', kind: 'cardio', name: 'Cycling' },
  { group: 'Cardio', kind: 'cardio', name: 'Rowing Machine' },
  { group: 'Cardio', kind: 'cardio', name: 'Elliptical' },
];

const DEFAULT_SYSTEM_PROMPT = `You are a nutrition estimator. The user describes a meal in any language with portions and skip-eat notes. Output JSON ONLY in this exact shape:

{
  "table_id": "T1",
  "title": "Meal item data",
  "columns": ["item", "kcal", "p", "f", "c", "su", "fb"],
  "rows": [
    {"item": "...", "kcal": 0, "p": 0.0, "f": 0.0, "c": 0.0, "su": 0.0, "fb": 0.0},
    {"item": "Total", "kcal": 0, "p": 0.0, "f": 0.0, "c": 0.0, "su": 0.0, "fb": 0.0}
  ],
  "notes": ["..."]
}

Rules:
- p, f, c, su, fb are grams (1 decimal). kcal is integer.
- c is total carb (sugar is a subset, fiber is included; net carb = c - fb).
- The last row MUST be {"item":"Total", ...} with column-wise sums.
- For skips like "skip eat 80%", reflect actual eaten portion in numbers AND label (e.g. "anchovies, ate 20%").
- Item labels in English. Every non-Total item label MUST include the exact serving amount used for that row's nutrition values.
- Prefer measurable serving units such as g or ml whenever the food or drink can be measured that way (e.g. "rice 150g", "black tea 250ml"). The serving amount in the label must be the same serving basis used for kcal/p/f/c/su/fb.
- No additional columns. No markdown. JSON only.

Library priority:
- If a LIBRARY_CONTEXT block is appended below, those entries are pre-saved by the user with brand/portion-specific values.
- For each user-described item, first check LIBRARY_CONTEXT for a match (by item name + brand). If found, copy that entry's per-portion values (scaling to user-stated portion if needed) and prefix the item label with "[lib] ".
- Otherwise estimate from your knowledge using brand information the user provided. If brand is ambiguous, portion is unspecified, or the item is unrecognizable, add a "notes" line asking the user to clarify. Output ONLY the items described by the user.`;

const SYSTEM_PROMPT_VERSION = '2026-05-08-v2';
const DEFAULT_LIBRARY_VERSION = '2026-05-07-reference';
const DEFAULT_LIBRARY_CSV = `Category,Item,Size,kcal,Protein (g),Fat (g),Carb (g),Sugar (g),Fiber (g)
Beverage,GutC Better Soda (Mixed Berries),1 can (250ml),15,0,0,3.8,1.3,6
Beverage,Heineken,1 can (320ml),134,4.2,0,32.6,0,0
Dairy/Plant,Oatside Oat Milk,100ml,65,0.6,3.2,8.1,2.8,0
Dairy/Plant,Oatside Protein Chocolate,100ml,66,8,1.4,4.8,1.6,1.2
Dairy/Plant,So Good Almond Milk,100ml,39,0.8,2.6,2.8,1.6,0.5
Dairy/Plant,Homesoy (No Sugar),100ml,30,2.5,1.6,1.2,0.5,0.5
Dairy/Plant,Chobani Greek Yogurt (Light),100g,56,9.3,0.2,4,3.3,0
Dairy/Plant,Chobani No Sugar Strawberry,100g,66,8.1,1.7,4.2,2.9,0.2
Dairy/Plant,Farmers Union Protein Greek Yogurt,100g,55,8.3,0.2,4.9,4.9,0
Dairy/Plant,Arla Lactofree Fresh Cheese,100g,190,7.8,16,3.3,3.3,0
Dairy/Plant,Family Brand Low Fat Mozzarella,100g,260,27,16,2.6,0.5,0
High-Fiber,Chia Seeds,10g,51.6,2,3.3,3,0,3
High-Fiber,Biogrow Oat Bran,1 scoop,26,1.9,0.5,2.7,0.1,3.1
High-Fiber,Avocado (Raw),100g,160,2,14.7,8.5,0.7,6.7
High-Fiber,Spinach (Raw),100g,23,2.9,0.4,3.6,0.4,2.2
High-Fiber,Broccoli (Raw),100g,34,2.8,0.4,6.6,1.7,2.6
High-Fiber,Raspberries (Raw),100g,52,1.2,0.7,11.9,4.4,6.5
High-Fiber,Lentils (Cooked),100g,116,9,0.4,20.1,1.8,7.9
High-Fiber,Black Beans (Cooked),100g,132,8.9,0.5,23.7,0.3,8.7
High-Fiber,Australian Celery (Raw),100g,14,0.7,0.2,3,1.3,1.6
Homemake,Chobani Yogurt Basque Cake (0415),1 cake (220g raw),279,18.9,4,40.8,33.5,0.2
Meat,Chicken Breast (Raw),100g,120,22,3,0,0,0
Meat,Sea Prawn (Raw),100g,106,20.3,1.7,1,0,0
Meat,"Salmon (Atlantic, Raw)",100g,208,20,13,0,0,0
Meat,Ayamas Black Pepper Sausage,1 pc,59,7.1,1.6,3.5,0,0
Pantry,Symphony Dark Choc Spread,100g,502,5.6,39.1,51,0,7.5
Pantry,Sunshine Bread (Malaysia),100g,269,10.7,3.2,47.2,12.7,4.3
Pantry,Jobbie Pure Peanut Butter (Creamy),100g,618,33.6,46.3,5.4,5.1,11.2
Pantry,Steamed White Rice,150g,195,4,0.4,42,0.1,1
Pantry,Cooked White Rice,100g,130,2.7,0.3,28,0.1,0.4
Pantry,Cooked Brown Rice,100g,123,2.7,1,25.6,0.2,1.6
Pantry,Weetbix,30g,106,3.6,0.4,20.1,0.8,3
Pantry,Weet-Bix Bites (Honey Crunch),100g,369,11.4,1.4,72.6,18.8,8
Pantry,Ceres Organic Rice Cake,3 pcs,69,1.5,0.5,14.7,0.4,0.6
Pantry,Woolworths Baked Pretzels,25g,98,2.5,1,19,0.9,0.9
Pantry,Mama Noodle (Pork),1 pack (60g),290,6,13,36,3,0
Pantry,Mama Noodle (Tomyum),1 pack (55g),250,6,11,32,3,0
Pantry,Realfoods Cornthins (Sesame),3 pcs,69,1.9,0.6,12.6,0.1,1.5
Pantry,Rolled Oats,100g,358,15,7,55,0,0
Pantry,Mimo Shirataki Noodle,100g,5,0,0,1,0,3
Pantry,Sunshine Shokupan Purple Sweet Potato,1 pc (30g),80.5,3.2,1,14.2,3.8,1.3
Pantry,Meizhoushike Sea Salt Choc Oatmeal,100g,418,9.2,7.9,76.5,0,0
Pantry,Radiant Organic Muesli,100g,414,10,10.7,69.4,8.1,13.5
Ready-to-Eat,Betagro Tender Chicken (Garlic Butter),1 pack,100,19.1,1,3.8,1.4,0
Ready-to-Eat,Betagro Tender Chicken (Hot & Spicy),1 pack,97,18.6,1.3,2.7,1.2,1.2
Ready-to-Eat,Betagro Tender Chicken (Herb),1 pack,96,20.8,1.3,0.4,0,0.6
Seasoning,Blue Elephant Tom Yum,15g,40,0,2.5,5,3,0
Seasoning,Blue Elephant Krapow Paste,15g,30,3.1,2.5,3,1,0
Snack,Gullon Sugar Free Maria,1 pc,25,0.4,0.7,4.5,0.5,0.3
Snack,Gullon No Sugar Twins,1 pc,43,0.5,1.8,6.8,0.3,0.9
Snack,Gullon Sugar Free Fibre,1 pc,37,0.5,1.4,5.5,0.4,0.8
Snack,Ovaltine Choc Malt Cookies,3 pcs,150,2,8,19,7,1
Snack,Lexus Sandwich Biscuit,1 sachet (2 pcs),92,1.7,4.2,11.6,4.7,0.8
Snack,鳕鱼香丝 (Fish Strips),100g,324,24,0.3,52.4,0,0
Snack,Tong Garden Noi Cassava Chips,30g,150,0,6,22,1,0
Snack,Benns 99.9% Dark Chocolate,1 pc (4g),23,0.6,1.7,1.3,0,0.9
Snack,Tiger Chocolate Mini Biscuit,1 pc,15.7,0.3,0.7,2.5,0.9,0
Snack,Carada Nori Seaweed Snack,1 bag (64g),280,2,8,50,18,0
Snack,Lay's Baked Chips,1 serv (28g),130,2,5,20,2,1
Snack,Oreo Sandwich Biscuit,1 pc,42,0.4,1.8,5.9,3.2,0.3
Supplements,Performa Whey (Milk Tea),1 serv,140,25.2,0.9,8.1,3.2,2
Supplements,MyProtein Whey (Choc),1 serv,113,22,1.9,2,1.5,0
Tofu,Lousam Soft Tofu,100g,53,5.9,2.5,1.8,0,0`;

// ============ Firebase Configuration ============

const firebaseConfig = {
  apiKey: "AIzaSyAkZEa4mnvTl2tW1__2JBLaEcWgQxD9qfU",
  authDomain: "fitlog-koala.firebaseapp.com",
  projectId: "fitlog-koala",
  storageBucket: "fitlog-koala.firebasestorage.app",
  messagingSenderId: "245806267209",
  appId: "1:245806267209:web:d3c9ebc33876344a117898",
  measurementId: "G-67YPW24858"
};

// Initialize Firebase (Compat)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;

// ============ Storage helpers ============

const safeLS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  getJSON(k, fb) {
    const raw = this.get(k);
    if (raw == null) return fb;
    try { return JSON.parse(raw); } catch { return fb; }
  },
  setJSON(k, v) { this.set(k, JSON.stringify(v)); },
};

function loadSettings() {
  const version = safeLS.get(KEY_PROMPT_VERSION);
  if (version !== SYSTEM_PROMPT_VERSION) {
    // Force update the prompt if version changed.
    safeLS.set(KEY_PROMPT, DEFAULT_SYSTEM_PROMPT);
    safeLS.set(KEY_PROMPT_VERSION, SYSTEM_PROMPT_VERSION);
  }

  return {
    apiKey: safeLS.get(KEY_API) || '',
    model: SUPPORTED_MODELS.includes(safeLS.get(KEY_MODEL)) ? safeLS.get(KEY_MODEL) : DEFAULT_MODEL,
    systemPrompt: safeLS.get(KEY_PROMPT) ?? DEFAULT_SYSTEM_PROMPT,
  };
}

function saveSettings(s) {
  safeLS.set(KEY_API, s.apiKey || '');
  safeLS.set(KEY_MODEL, SUPPORTED_MODELS.includes(s.model) ? s.model : DEFAULT_MODEL);
  safeLS.set(KEY_PROMPT, s.systemPrompt ?? '');
  safeLS.set(KEY_PROMPT_VERSION, SYSTEM_PROMPT_VERSION);
  syncToFirestore('settings', s);
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseServingSize(size) {
  const s = String(size || '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+|pcs?|serv|sachet|scoop|cake|can|pack|bag)\b/i);
  return {
    serving: s,
    qty: m ? Number(m[1]) : '',
    unit: m ? m[2].toLowerCase() : '',
  };
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function defaultLibraryEntries() {
  const lines = DEFAULT_LIBRARY_CSV.trim().split(/\r?\n/);
  return lines.slice(1).map((line) => {
    const [, item, size, kcal, p, f, c, su, fb] = parseCSVLine(line);
    const serving = parseServingSize(size);
    return {
      id: `seed-${slug(item)}-${slug(size)}`,
      item,
      brand: '',
      ...serving,
      kcal: Number(kcal) || 0,
      p: Number(p) || 0,
      f: Number(f) || 0,
      c: Number(c) || 0,
      su: Number(su) || 0,
      fb: Number(fb) || 0,
      addedAt: DEFAULT_LIBRARY_VERSION,
    };
  });
}

function loadLibrary() {
  const lib = safeLS.getJSON(KEY_LIBRARY, []);
  if (safeLS.get(KEY_LIBRARY_SEED) === DEFAULT_LIBRARY_VERSION) return lib;

  const existingKeys = new Set(lib.map((e) =>
    `${String(e.item || '').toLowerCase()}|${String(e.serving || e.qty || '').toLowerCase()}|${String(e.unit || '').toLowerCase()}`
  ));
  const seeded = defaultLibraryEntries().filter((e) => {
    const key = `${e.item.toLowerCase()}|${e.serving.toLowerCase()}|${e.unit.toLowerCase()}`;
    return !existingKeys.has(key);
  });
  const merged = [...seeded, ...lib];
  safeLS.setJSON(KEY_LIBRARY, merged);
  safeLS.set(KEY_LIBRARY_SEED, DEFAULT_LIBRARY_VERSION);
  return merged;
}
function saveLibrary(lib) {
  safeLS.setJSON(KEY_LIBRARY, lib);
  syncToFirestore('library', lib);
}
function loadDaily() { return safeLS.getJSON(KEY_DAILY, {}); }
function saveDaily(d) {
  safeLS.setJSON(KEY_DAILY, d);
  syncToFirestore('dailyLog', d);
}
function loadHistory() { return safeLS.getJSON(KEY_HISTORY, []); }
function saveHistory(h) {
  // Prune to 30 days
  const pruned = h.slice(0, 30);
  safeLS.setJSON(KEY_HISTORY, pruned);
  syncToFirestore('foodHistory', pruned);
}
function loadGym() { return safeLS.getJSON(KEY_GYM, {}); }
function saveGym(g) {
  safeLS.setJSON(KEY_GYM, g);
  syncToFirestore('gymLog', g);
}

// ============ Utilities ============

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtNum(v, decimals) {
  const n = num(v);
  if (decimals === 0) return String(Math.round(n));
  return n.toFixed(decimals);
}

function $(sel) { return document.querySelector(sel); }

// ============ Gemini call ============

async function callGemini({ apiKey, model, systemPrompt, input }) {
  const url = GEMINI_URL(model, apiKey);
  const body = {
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_RESPONSE_SCHEMA,
    },
  };
  if (systemPrompt && systemPrompt.trim()) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = null; }
    const e = new Error(errBody?.error?.message || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const json = await res.json();
  const finish = json?.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    const e = new Error(`Generation stopped: ${finish}`);
    e.finishReason = finish;
    throw e;
  }
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = tryParseJSON(raw);
  return { raw, parsed };
}

// Tolerant JSON parser — strips markdown fences and trims to outermost {...}.
// gemini-2.5-flash sometimes wraps output in ```json ... ``` despite responseMimeType.
function tryParseJSON(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  try { return JSON.parse(text); } catch { return null; }
}

function formatError(e) {
  if (!e) return 'Unknown error.';
  const s = e.status;
  const msg = e.message || '';
  // Always include Google's verbatim error message — it carries the real reason.
  const tag = (label) => `${label} — Google says: "${msg}"`;
  if (s === 400) return tag('HTTP 400 (bad request)');
  if (s === 401 || s === 403) {
    // Common 403 reasons: API not enabled, key restricted, billing not set up.
    return tag('HTTP ' + s + ' (auth / permission)');
  }
  if (s === 404) return tag('HTTP 404 (model not found)');
  if (s === 429) {
    // 429 covers per-minute quota, per-day quota, AND "API not enabled" on some projects.
    // Google's error message is the only way to tell them apart.
    return tag('HTTP 429 (quota / rate limit)');
  }
  if (s === 503) return tag('HTTP 503 (Gemini capacity)');
  if (s >= 500) return tag(`HTTP ${s} (server error)`);
  if (e.finishReason) return `Stopped: ${e.finishReason} — try shorter input or different prompt.`;
  return msg ? `Error: ${msg}` : 'Unknown error.';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGeminiWithRetry(opts) {
  const DELAYS = [0, 1000, 3000];
  let lastErr = null;
  for (let i = 0; i < DELAYS.length; i++) {
    if (DELAYS[i] > 0) {
      setStatus(`Gemini busy — retry ${i + 1}/${DELAYS.length} in ${DELAYS[i] / 1000}s…`, 'info');
      await sleep(DELAYS[i]);
    }
    try { return await callGemini(opts); }
    catch (e) {
      lastErr = e;
      const transient = !e.status || (e.status >= 500 && e.status <= 504);
      if (!transient) throw e;
      if (e.finishReason) throw e;
    }
  }
  throw lastErr;
}

// ============ Library lookup ============

const STOP_TOKENS = new Set([
  'a','an','and','or','of','the','with','some','my','your','our','for','to','in','on','at',
  'is','was','were','be','been','being','it','this','that','these','those','from','by',
  'g','kg','ml','l','oz','lb','cup','cups','tsp','tbsp','piece','pieces','slice','slices',
  'about','approx','around','roughly','consists','contains','include','includes','plus',
  'no','yes','skip','eat','ate','half','quarter',
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[(){}\[\],.;:!?"'/\\]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length >= 3 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t));
}

function libraryLookup(input, library) {
  const tokens = tokenize(input);
  if (!tokens.length || !library.length) return [];
  
  const scored = [];
  const seen = new Set();

  for (const entry of library) {
    const item = String(entry.item || '').toLowerCase();
    const brand = String(entry.brand || '').toLowerCase();
    const hay = `${item} ${brand}`;
    
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) {
        score += 1;
        // Bonus for word-boundary match to avoid "ice" matching "rice"
        const regex = new RegExp(`\\b${t}\\b`, 'i');
        if (regex.test(hay)) score += 2;
        // Bonus for "starts with"
        if (item.startsWith(t)) score += 1;
      }
    }
    
    if (score > 0) {
      // Deduplicate by item|brand|serving
      const key = `${entry.item}|${entry.brand}|${entry.serving || entry.qty + entry.unit}`;
      if (!seen.has(key)) {
        scored.push({ entry, score });
        seen.add(key);
      }
    }
  }
  
  // Sort by score descending and limit to top 12 matches to keep prompt focused.
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => s.entry);
}

function buildPromptWithContext(basePrompt, matched) {
  if (!matched.length) return basePrompt;
  const slim = matched.map((e) => ({
    item: e.item,
    brand: e.brand || '',
    serving: e.serving || '',
    qty: e.qty || '',
    unit: e.unit || '',
    kcal: num(e.kcal),
    p: num(e.p),
    f: num(e.f),
    c: num(e.c),
    su: num(e.su),
    fb: num(e.fb),
  }));
  return basePrompt + '\n\nLIBRARY_CONTEXT:\n```json\n' + JSON.stringify(slim, null, 2) + '\n```';
}

// ============ State ============

let state = loadSettings();
let lastPreview = null; // { rows: [...], notes: [...] }
let selectedDailyDate = todayISO();
let selectedGymDate = todayISO();
let gymDraftRows = [{ kg: '', rep: '' }];
let activeGymFilter = 'all'; // 'all' | 'Push' | 'Pull' | 'Upper' | 'Lower' | 'Cardio' | 'Custom'
let gymDraftCustomName = ''; // typed activity name when Custom is selected
let gymEditingIdx = null; // index in day.activities being edited (selectedGymDate)
let gymEditDraft = null; // { rows: [...] } working copy while editing

// ============ DOM refs ============

const els = {
  settingsBtn: $('#fl-settings-btn'),
  settingsModal: $('#fl-settings-modal'),
  settingsClose: $('#fl-settings-close'),
  setApikey: $('#fl-set-apikey'),
  setModel: $('#fl-set-model'),
  setPrompt: $('#fl-set-prompt'),
  setReset: $('#fl-set-reset'),
  testBtn: $('#fl-test-btn'),
  testOutput: $('#fl-test-output'),
  tabs: Array.from(document.querySelectorAll('.fl-tab')),
  panels: Array.from(document.querySelectorAll('.fl-panel')),
  input: $('#fl-input'),
  sendBtn: $('#fl-send-btn'),
  validation: $('#fl-validation'),
  status: $('#fl-status'),
  preview: $('#fl-preview'),
  previewTable: $('#fl-preview-table'),
  previewNotes: $('#fl-preview-notes'),
  logBtn: $('#fl-log-btn'),
  dailyDate: $('#fl-daily-date'),
  dailyTable: $('#fl-daily-table'),
  logDayBtn: $('#fl-log-day-btn'),
  exportDailyBtn: $('#fl-export-daily-btn'),
  clearDayBtn: $('#fl-clear-day-btn'),
  historyTable: $('#fl-history-table'),
  historyEmpty: $('#fl-history-empty'),
  exportHistoryBtn: $('#fl-export-history-btn'),
  clearHistoryBtn: $('#fl-clear-history-btn'),
  libraryCount: $('#fl-library-count'),
  libraryClear: $('#fl-library-clear'),
  libraryTable: $('#fl-library-table'),
  libraryEmpty: $('#fl-library-empty'),
  gymActivity: $('#fl-gym-activity'),
  gymSets: $('#fl-gym-sets'),
  gymAddSet: $('#fl-gym-add-set'),
  gymLogBtn: $('#fl-gym-log-btn'),
  gymValidation: $('#fl-gym-validation'),
  gymDate: $('#fl-gym-date'),
  gymTable: $('#fl-gym-table'),
  gymClearDay: $('#fl-gym-clear-day'),
  gymLogDay: $('#fl-gym-log-day'),
  gymFilters: $('#fl-gym-filters'),
  profileOut: $('#fl-profile-out'),
  profileIn: $('#fl-profile-in'),
  profileImg: $('#fl-profile-img'),
  profileName: $('#fl-profile-name'),
  profileEmail: $('#fl-profile-email'),
  signinBtn: $('#fl-signin-btn'),
  signoutBtn: $('#fl-signout-btn'),
  syncStatus: $('#fl-sync-status'),
};

// ============ UI helpers ============

function setStatus(msg, kind) {
  if (!msg) { els.status.hidden = true; els.status.textContent = ''; return; }
  els.status.hidden = false;
  els.status.textContent = msg;
  els.status.className = 'fl-status' + (kind === 'error' ? ' fl-status-error' : '');
}

function showValidation(msg) {
  if (!msg) { els.validation.hidden = true; els.validation.textContent = ''; return; }
  els.validation.hidden = false;
  els.validation.textContent = msg;
}

function showTab(name) {
  els.tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.classList.toggle('fl-tab-active', active);
  });
  els.panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'library') renderLibrary();
  if (name === 'gym') renderGym();
  if (name === 'profile') updateProfileUI();
}

// ============ Settings modal ============

function openSettings() {
  els.setApikey.value = state.apiKey;
  els.setModel.value = state.model;
  if (els.setPrompt) els.setPrompt.value = state.systemPrompt;
  els.settingsModal.hidden = false;
}
function closeSettings() {
  state = {
    apiKey: els.setApikey.value.trim(),
    model: els.setModel.value || DEFAULT_MODEL,
    systemPrompt: els.setPrompt ? els.setPrompt.value : state.systemPrompt,
  };
  saveSettings(state);
  els.settingsModal.hidden = true;
}
els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
if (els.setReset && els.setPrompt) {
  els.setReset.addEventListener('click', () => { els.setPrompt.value = DEFAULT_SYSTEM_PROMPT; });
}

// Minimal probe to isolate "is the key working at all?" from prompt complexity.
async function testConnection() {
  els.testBtn.disabled = true;
  els.testOutput.hidden = false;
  const apiKey = els.setApikey.value.trim();
  const model = els.setModel.value || DEFAULT_MODEL;
  if (!apiKey) {
    els.testOutput.textContent = 'Paste an API key first.';
    els.testBtn.disabled = false;
    return;
  }
  els.testOutput.textContent = `Probing ${model}…`;
  const url = GEMINI_URL(model, apiKey);
  const body = { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: pong' }] }] };
  let res, json, text;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch (netErr) {
    els.testOutput.textContent = `Network error: ${netErr.message || netErr}\n\n` +
      `(Could be CORS, offline, or DNS — check the browser console.)`;
    els.testBtn.disabled = false;
    return;
  }
  const lines = [];
  lines.push(`Endpoint: POST ${url.replace(/key=[^&]+/, 'key=…' + apiKey.slice(-4))}`);
  lines.push(`Status: ${res.status} ${res.statusText}`);
  if (json?.error) {
    lines.push('');
    lines.push(`Google error code: ${json.error.code}`);
    lines.push(`Google error status: ${json.error.status}`);
    lines.push(`Google error message: ${json.error.message}`);
    if (Array.isArray(json.error.details) && json.error.details.length) {
      lines.push('Google error details:');
      lines.push(JSON.stringify(json.error.details, null, 2));
    }
  } else if (res.ok) {
    const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text in response)';
    lines.push('');
    lines.push(`Reply: ${reply.trim()}`);
    lines.push('');
    lines.push('✓ Key works. If meal-logging Send still fails, the issue is prompt-specific (try shorter input, different model, or check the raw output box).');
  } else {
    lines.push('');
    lines.push('Raw response body:');
    lines.push(text);
  }
  els.testOutput.textContent = lines.join('\n');
  els.testBtn.disabled = false;
}
els.testBtn.addEventListener('click', testConnection);

// ============ Tabs ============

els.tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ============ Send + preview ============

async function send() {
  showValidation(null);
  setStatus(null);
  const input = els.input.value.trim();
  if (!input) { showValidation('Type a meal description first.'); return; }
  if (input.length > 2000) { showValidation('Keep under 2000 characters.'); return; }
  if (!state.apiKey) {
    setStatus('No Gemini API key — open Settings to add one.', 'error');
    return;
  }

  els.sendBtn.disabled = true;
  els.preview.hidden = true;
  setStatus('Calling Gemini…', 'info');

  // Library lookup pass — find candidates and inject into prompt.
  const lib = loadLibrary();
  const matched = libraryLookup(input, lib);
  const promptWithContext = buildPromptWithContext(state.systemPrompt, matched);

  // Build fallback chain: try primary, then up to 2 alternatives in priority order.
  const primary = state.model;
  const chain = [primary, ...FALLBACK_PRIORITY.filter((m) => m !== primary)].slice(0, 3);
  let lastErr = null;
  let triedModels = [];

  try {
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      triedModels.push(model);
      if (i > 0) setStatus(`${chain[0]} overloaded — falling back to ${model}…`, 'info');
      try {
        const result = await callGeminiWithRetry({
          apiKey: state.apiKey,
          model,
          systemPrompt: promptWithContext,
          input,
        });
        setStatus(null);
        if (!result.parsed || !Array.isArray(result.parsed.rows)) {
          setStatus(`Gemini (${model}) returned non-JSON or wrong shape. Raw output below — try rephrasing or switching model in Settings.`, 'error');
          renderRawFallback(result.raw);
          return;
        }
        renderPreview(result.parsed);
        return;
      } catch (e) {
        lastErr = e;
        // Only fall back on transient 5xx; bail on auth / quota / format errors.
        const transient = !e.status || (e.status >= 500 && e.status <= 504);
        if (!transient || e.finishReason) throw e;
      }
    }
    throw lastErr;
  } catch (e) {
    setStatus(formatError(e) + ` (Tried ${triedModels.join(', ')}.)`, 'error');
  } finally {
    els.sendBtn.disabled = false;
  }
}

function renderRawFallback(raw) {
  lastPreview = null;
  els.previewTable.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'fl-raw-fallback';
  pre.textContent = raw || '(empty response)';
  els.previewTable.replaceWith(pre);
  pre.id = 'fl-preview-table';
  els.previewTable = pre;
  els.previewNotes.hidden = true;
  els.previewNotes.innerHTML = '';
  els.preview.hidden = false;
}

function isTotalRow(row) {
  return String(row?.item ?? '').trim().toLowerCase() === 'total';
}

function withComputedTotal(rows) {
  const items = rows.filter((r) => r && r.item != null && !isTotalRow(r));
  const total = sumItems(items);
  return [
    ...items,
    {
      item: 'Total',
      kcal: total.kcal,
      p: total.p,
      f: total.f,
      c: total.c,
      su: total.su,
      fb: total.fb,
    },
  ];
}

function clearPreviewState() {
  lastPreview = null;
  els.preview.hidden = true;
  els.previewTable.innerHTML = '';
  els.previewNotes.hidden = true;
  els.previewNotes.innerHTML = '';
}

function removePreviewRow(index) {
  if (!lastPreview) return;
  const rows = lastPreview.rows.filter((r) => !isTotalRow(r));
  rows.splice(index, 1);
  if (!rows.length) {
    clearPreviewState();
    setStatus('All preview rows removed.', 'info');
    setTimeout(() => setStatus(null), 2000);
    return;
  }
  renderPreview({ rows, notes: lastPreview.notes });
}

function renderPreview(parsed) {
  // Restore table element if it was swapped out by renderRawFallback.
  if (els.previewTable.tagName !== 'TABLE') {
    const tbl = document.createElement('table');
    tbl.className = 'fl-table';
    tbl.id = 'fl-preview-table';
    els.previewTable.replaceWith(tbl);
    els.previewTable = tbl;
  }
  const rows = withComputedTotal((parsed.rows || []).filter((r) => r && r.item != null));
  const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  lastPreview = { rows, notes };

  // Table
  const tbl = els.previewTable;
  tbl.innerHTML = '';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  COLS.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    if (c !== 'item') th.classList.add('fl-num');
    trh.appendChild(th);
  });
  const thAdd = document.createElement('th');
  thAdd.textContent = '';
  trh.appendChild(thAdd);
  const thRemove = document.createElement('th');
  thRemove.textContent = '';
  trh.appendChild(thRemove);
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  let itemIndex = 0;
  rows.forEach((r, i) => {
    const isTotal = isTotalRow(r);
    const currentItemIndex = itemIndex;
    const tr = document.createElement('tr');
    if (isTotal) tr.classList.add('fl-total');
    COLS.forEach((c) => {
      const td = document.createElement('td');
      const v = r[c];
      if (c === 'item') td.textContent = String(v ?? '');
      else {
        td.classList.add('fl-num');
        td.textContent = c === 'kcal' ? fmtNum(v, 0) : fmtNum(v, 1);
      }
      tr.appendChild(td);
    });
    const tdAdd = document.createElement('td');
    if (!isTotal) {
      const isLibraryRow = /^\s*\[lib\]/i.test(String(r.item ?? ''));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fl-row-add-btn';
      if (isLibraryRow) {
        btn.textContent = 'In FoodLibrary';
        btn.title = 'This item is already from FoodLibrary';
        btn.disabled = true;
      } else {
        btn.textContent = '+ FoodLibrary';
        btn.title = 'Add this item to FoodLibrary';
        btn.addEventListener('click', () => addRowToLibrary(r, btn));
      }
      tdAdd.appendChild(btn);
    }
    tr.appendChild(tdAdd);
    const tdRemove = document.createElement('td');
    if (!isTotal) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fl-row-del-btn';
      btn.textContent = '×';
      btn.title = 'Remove preview row';
      btn.addEventListener('click', () => removePreviewRow(currentItemIndex));
      tdRemove.appendChild(btn);
      itemIndex += 1;
    }
    tr.appendChild(tdRemove);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);

  // Notes
  if (notes.length) {
    els.previewNotes.hidden = false;
    els.previewNotes.innerHTML = '';
    notes.forEach((n) => {
      const li = document.createElement('li');
      li.textContent = String(n ?? '');
      els.previewNotes.appendChild(li);
    });
  } else {
    els.previewNotes.hidden = true;
    els.previewNotes.innerHTML = '';
  }

  els.preview.hidden = false;
}

els.sendBtn.addEventListener('click', send);
els.input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
});

// ============ Add to FoodLibrary (per item) ============

// Measurable units (gram/volume/imperial) — these provide an exact weight.
const FL_WEIGHT_UNIT_RE = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb)\b/i;
// Discrete serving qualifiers — presence triggers the "1 serving (...)" format.
const FL_SERVING_UNIT_RE = /(\d+(?:\.\d+)?)\s*(cup|cups|tsp|tbsp|piece|pieces|slice|slices|pcs?|scoop|scoops|serving|servings|can|cans|bottle|bottles|stick|sticks)\b/i;

function parseFoodItemLabel(label) {
  const clean = String(label ?? '').trim().replace(/^\[lib\]\s+/i, '');
  const weightMatch = clean.match(FL_WEIGHT_UNIT_RE);
  const servingMatch = clean.match(FL_SERVING_UNIT_RE);

  // Serving string — always populated per spec.
  let serving;
  if (servingMatch) {
    serving = weightMatch
      ? `1 serving (${weightMatch[1]}${weightMatch[2].toLowerCase()})`
      : '1 serving';
  } else if (weightMatch) {
    serving = `${weightMatch[1]}${weightMatch[2].toLowerCase()}`;
  } else {
    serving = '1 serving';
  }

  // Item name — strip matched serving/weight tokens + connector noise.
  let itemName = clean;
  if (servingMatch) itemName = itemName.replace(servingMatch[0], ' ');
  if (weightMatch) itemName = itemName.replace(weightMatch[0], ' ');
  itemName = itemName
    .replace(/[\(\),]/g, ' ')
    .replace(/\bof\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!itemName) itemName = clean;

  return { itemName, serving, weightMatch };
}

function addRowToLibrary(row, btn) {
  const { itemName, serving, weightMatch } = parseFoodItemLabel(row.item);

  const lib = loadLibrary();
  const exists = lib.some((e) =>
    String(e.item || '').toLowerCase() === itemName.toLowerCase() &&
    String(e.serving || '') === serving
  );
  if (exists) {
    if (btn) {
      btn.textContent = 'In FoodLibrary';
      btn.disabled = true;
    }
    return;
  }

  const entry = {
    id: uid(),
    item: itemName,
    brand: '',
    serving,
    qty: weightMatch ? Number(weightMatch[1]) : '',
    unit: weightMatch ? weightMatch[2].toLowerCase() : '',
    kcal: num(row.kcal),
    p: num(row.p),
    f: num(row.f),
    c: num(row.c),
    su: num(row.su),
    fb: num(row.fb),
    addedAt: new Date().toISOString(),
  };
  lib.unshift(entry);
  saveLibrary(lib);

  if (btn) {
    btn.textContent = '✓ Saved';
    btn.disabled = true;
  }
}

// ============ Log button ============

function getSelectedMeal() {
  const r = document.querySelector('input[name="fl-meal"]:checked');
  return r ? r.value : null;
}

function selectedDate() {
  return selectedDailyDate || todayISO();
}

function logMeal() {
  if (!lastPreview || !lastPreview.rows.length) {
    setStatus('Nothing to log — Send a meal description first.', 'error');
    return;
  }
  const slot = getSelectedMeal();
  if (!slot) { setStatus('Pick a meal slot first.', 'error'); return; }

  const items = lastPreview.rows
    .filter((r) => !isTotalRow(r))
    .map((r) => ({
      item: String(r.item ?? ''),
      kcal: num(r.kcal),
      p: num(r.p),
      f: num(r.f),
      c: num(r.c),
      su: num(r.su),
      fb: num(r.fb),
    }));
  if (!items.length) return;

  const date = selectedDate();
  const all = loadDaily();
  if (!all[date]) all[date] = blankDay();
  if (!all[date][slot]) all[date][slot] = { items: [] };
  all[date][slot].items.push(...items);
  saveDaily(all);

  renderDaily();
  els.input.value = '';
  showValidation(null);
  clearPreviewState();
  setStatus(`Logged ${items.length} item(s) under ${MEAL_LABELS[slot]}.`, 'info');
  setTimeout(() => setStatus(null), 2500);
}

function blankDay() {
  const d = {};
  MEAL_SLOTS.forEach((s) => { d[s] = { items: [] }; });
  return d;
}

els.logBtn.addEventListener('click', logMeal);

// ============ Daily Log ============

const expandedMeals = new Set(); // meal slots currently expanded in UI

function sumItems(items) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };
  items.forEach((it) => NUMERIC_COLS.forEach((k) => { t[k] += num(it[k]); }));
  return t;
}

function dateOffsetISO(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function dailyDateOptions() {
  const dates = [];
  for (let i = DAILY_DATE_WINDOW_DAYS - 1; i >= 0; i--) dates.push(dateOffsetISO(-i));
  return dates;
}

function renderDailyDateOptions() {
  const dates = dailyDateOptions();
  if (!dates.includes(selectedDailyDate)) selectedDailyDate = todayISO();
  els.dailyDate.innerHTML = '';
  dates.forEach((date) => {
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = date === todayISO() ? `${date} (today)` : date;
    els.dailyDate.appendChild(opt);
  });
  els.dailyDate.value = selectedDailyDate;
}

function getDay(all, date) {
  return all[date] || blankDay();
}

function removeDailyItem(date, slot, index) {
  const all = loadDaily();
  const day = getDay(all, date);
  const items = (day[slot] && Array.isArray(day[slot].items)) ? [...day[slot].items] : [];
  items.splice(index, 1);
  day[slot] = { items };
  all[date] = day;
  saveDaily(all);
  renderDaily();
}

function renderDaily() {
  const date = selectedDate();
  renderDailyDateOptions();

  const all = loadDaily();
  const day = getDay(all, date);

  const tbl = els.dailyTable;
  tbl.innerHTML = '';

  // Header
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  COLS.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c === 'item' ? '' : c;
    if (c !== 'item') th.classList.add('fl-num');
    trh.appendChild(th);
  });
  const thDel = document.createElement('th');
  trh.appendChild(thDel);
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Day total accumulator
  const dayTotal = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };

  MEAL_SLOTS.forEach((slot) => {
    const items = (day[slot] && day[slot].items) || [];
    const subtotal = sumItems(items);
    NUMERIC_COLS.forEach((k) => { dayTotal[k] += subtotal[k]; });

    // Meal header row (clickable)
    const trMeal = document.createElement('tr');
    trMeal.classList.add('fl-meal-row');
    if (expandedMeals.has(slot)) trMeal.classList.add('fl-expanded');
    const tdName = document.createElement('td');
    tdName.textContent = `${MEAL_LABELS[slot]} (${items.length})`;
    trMeal.appendChild(tdName);
    NUMERIC_COLS.forEach((k) => {
      const td = document.createElement('td');
      td.classList.add('fl-num');
      td.textContent = k === 'kcal' ? fmtNum(subtotal[k], 0) : fmtNum(subtotal[k], 1);
      trMeal.appendChild(td);
    });
    const tdMealAction = document.createElement('td');
    trMeal.appendChild(tdMealAction);
    trMeal.addEventListener('click', () => {
      if (expandedMeals.has(slot)) expandedMeals.delete(slot);
      else expandedMeals.add(slot);
      renderDaily();
    });
    tbody.appendChild(trMeal);

    if (expandedMeals.has(slot)) {
      if (!items.length) {
        const tr = document.createElement('tr');
        tr.classList.add('fl-empty-row');
        const td = document.createElement('td');
        td.colSpan = COLS.length + 1;
        td.textContent = '(no items)';
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        items.forEach((it, idx) => {
          const tr = document.createElement('tr');
          tr.classList.add('fl-item-row');
          const tdN = document.createElement('td');
          tdN.textContent = String(it.item ?? '');
          tr.appendChild(tdN);
          NUMERIC_COLS.forEach((k) => {
            const td = document.createElement('td');
            td.classList.add('fl-num');
            td.textContent = k === 'kcal' ? fmtNum(it[k], 0) : fmtNum(it[k], 1);
            tr.appendChild(td);
          });
          const tdDel = document.createElement('td');
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'fl-row-del-btn';
          del.textContent = '×';
          del.title = `Remove from ${MEAL_LABELS[slot]}`;
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            removeDailyItem(date, slot, idx);
          });
          tdDel.appendChild(del);
          tr.appendChild(tdDel);
          tbody.appendChild(tr);
        });
      }
    }
  });

  // Total row
  const trTotal = document.createElement('tr');
  trTotal.classList.add('fl-total');
  const tdTotalLabel = document.createElement('td');
  tdTotalLabel.textContent = 'Total';
  trTotal.appendChild(tdTotalLabel);
  NUMERIC_COLS.forEach((k) => {
    const td = document.createElement('td');
    td.classList.add('fl-num');
    td.textContent = k === 'kcal' ? fmtNum(dayTotal[k], 0) : fmtNum(dayTotal[k], 1);
    trTotal.appendChild(td);
  });
  trTotal.appendChild(document.createElement('td'));
  tbody.appendChild(trTotal);

  // Target kcal stays hidden until profile support lands.
  const targetKcal = null;
  const trTarget = document.createElement('tr');
  trTarget.classList.add('fl-target-row');
  const tdT = document.createElement('td');
  tdT.textContent = 'Target';
  trTarget.appendChild(tdT);
  NUMERIC_COLS.forEach((k) => {
    const td = document.createElement('td');
    td.classList.add('fl-num');
    td.textContent = k === 'kcal' && targetKcal != null ? fmtNum(targetKcal, 0) : '—';
    trTarget.appendChild(td);
  });
  trTarget.appendChild(document.createElement('td'));
  tbody.appendChild(trTarget);

  // Remain row — kcal only.
  const trRemain = document.createElement('tr');
  trRemain.classList.add('fl-remain-row');
  const tdR = document.createElement('td');
  tdR.textContent = 'Remain';
  trRemain.appendChild(tdR);
  NUMERIC_COLS.forEach((k) => {
    const td = document.createElement('td');
    td.classList.add('fl-num');
    td.textContent = k === 'kcal' && targetKcal != null
      ? fmtNum(targetKcal - dayTotal.kcal, 0)
      : '—';
    trRemain.appendChild(td);
  });
  trRemain.appendChild(document.createElement('td'));
  tbody.appendChild(trRemain);

  tbl.appendChild(tbody);
}

els.clearDayBtn.addEventListener('click', () => {
  const date = selectedDate();
  if (!confirm(`Clear log for ${date}? Items already logged will be removed.`)) return;
  const all = loadDaily();
  delete all[date];
  saveDaily(all);
  renderDaily();
});

els.dailyDate.addEventListener('change', () => {
  selectedDailyDate = els.dailyDate.value || todayISO();
  renderDaily();
});

// ============ GymLog tab ============

function selectedGymActivity() {
  const raw = els.gymActivity.value || '';
  const [kind, ...nameParts] = raw.split(':');
  const name = nameParts.join(':');
  if (kind === 'custom-weight' || kind === 'custom-cardio') {
    return {
      kind: kind === 'custom-cardio' ? 'cardio' : 'weight',
      name: gymDraftCustomName.trim(),
      custom: true,
    };
  }
  return { kind, name, custom: false };
}

function activityMatchesFilter(a) {
  if (activeGymFilter === 'all') return true;
  if (activeGymFilter === 'Custom') return false;
  if (activeGymFilter === 'Cardio') return a.group === 'Cardio';
  // Push / Pull / Upper / Lower: exact-token match against group ("Push Upper" etc.)
  return a.group.split(' ').includes(activeGymFilter);
}

function movementInfo(activity) {
  // Custom records store ul/pp directly.
  if (activity.ul || activity.pp) {
    const ul = activity.ul && activity.ul !== 'N/A' ? activity.ul : '—';
    const pp = activity.pp && activity.pp !== 'N/A' ? activity.pp : '—';
    return { ul, pp };
  }
  // Preset records: derive from GYM_ACTIVITIES via name lookup (handles legacy rows).
  const preset = GYM_ACTIVITIES.find((a) => a.name === activity.name);
  if (!preset) return { ul: '—', pp: '—' };
  if (preset.group === 'Cardio') return { ul: 'Cardio', pp: '—' };
  const [pp, ul] = preset.group.split(' ');
  return { ul: ul || '—', pp: pp || '—' };
}

function blankGymRow(kind) {
  return kind === 'cardio'
    ? { speed: '', incline: '', time: '' }
    : { kg: '', rep: '' };
}

function normalizeGymRows(rows, kind) {
  return rows.map((r) => kind === 'cardio'
    ? { speed: String(r.speed ?? ''), incline: String(r.incline ?? ''), time: String(r.time ?? '') }
    : { kg: String(r.kg ?? ''), rep: String(r.rep ?? '') });
}

function gymDay(all, date) {
  const day = all[date];
  return day && Array.isArray(day.activities) ? day : { activities: [] };
}

const WEIGHT_GROUP_ORDER = ['Push Upper', 'Push Lower', 'Pull Upper', 'Pull Lower'];

function appendActivityOptgroup(label, matches) {
  if (!matches.length) return;
  const og = document.createElement('optgroup');
  og.label = label;
  matches.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = `${a.kind}:${a.name}`;
    opt.textContent = a.name;
    og.appendChild(opt);
  });
  els.gymActivity.appendChild(og);
}

function renderGymActivityOptions() {
  els.gymActivity.innerHTML = '<option value="" disabled selected>— Select activity —</option>';

  // 1) Custom always first
  const custom = document.createElement('optgroup');
  custom.label = 'Custom';
  [
    ['custom-weight:', 'Custom weight activity'],
    ['custom-cardio:', 'Custom cardio activity'],
  ].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    custom.appendChild(opt);
  });
  els.gymActivity.appendChild(custom);

  // 2) Weight groups in natural order (Push first, then Pull; Upper before Lower within each)
  WEIGHT_GROUP_ORDER.forEach((group) => {
    const matches = GYM_ACTIVITIES.filter((a) => a.group === group && activityMatchesFilter(a));
    appendActivityOptgroup(group, matches);
  });

  // 3) Cardio last
  const cardioMatches = GYM_ACTIVITIES.filter((a) => a.group === 'Cardio' && activityMatchesFilter(a));
  appendActivityOptgroup('Cardio', cardioMatches);
}

function onGymFilterClick(ev) {
  const btn = ev.target.closest('.fl-filter-pill');
  if (!btn) return;
  activeGymFilter = btn.dataset.filter;
  els.gymFilters.querySelectorAll('.fl-filter-pill').forEach((b) => {
    b.classList.toggle('fl-active', b === btn);
  });
  renderGymActivityOptions();
}

function showGymValidation(msg) {
  if (!msg) { els.gymValidation.hidden = true; els.gymValidation.textContent = ''; return; }
  els.gymValidation.hidden = false;
  els.gymValidation.textContent = msg;
}

function renderGymDateOptions() {
  const dates = dailyDateOptions();
  if (!dates.includes(selectedGymDate)) dates.unshift(selectedGymDate);
  els.gymDate.innerHTML = '';
  dates.forEach((date) => {
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = date === todayISO() ? `${date} (today)` : date;
    els.gymDate.appendChild(opt);
  });
  els.gymDate.value = selectedGymDate;
}

function renderGymDraft() {
  const activity = selectedGymActivity();
  els.gymAddSet.textContent = activity.kind === 'cardio' ? 'Add interval' : 'Add set';

  gymDraftRows = normalizeGymRows(gymDraftRows, activity.kind);
  if (!gymDraftRows.length) gymDraftRows = [blankGymRow(activity.kind)];

  els.gymSets.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'fl-table fl-gym-draft-table';

  // Header — Activity first, then SET per row.
  // Weight tables emit an empty 4th metric col so they align with cardio's 4 metric cols.
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const headers = activity.kind === 'cardio'
    ? ['Activity', 'SET', 'Speed', 'Incline', 'Time']
    : ['Activity', 'SET', 'kg', 'rep', ''];
  headers.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (i > 0) th.classList.add('fl-gym-mcol');
    trh.appendChild(th);
  });
  // delete column
  const thDel = document.createElement('th');
  thDel.className = 'fl-gym-actions-col';
  trh.appendChild(thDel);
  thead.appendChild(trh);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  gymDraftRows.forEach((row, idx) => {
    const tr = document.createElement('tr');

    if (idx === 0) {
      const tdAct = document.createElement('td');
      tdAct.rowSpan = gymDraftRows.length;
      tdAct.className = 'fl-gym-draft-activity';
      if (activity.custom) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Activity name';
        input.value = gymDraftCustomName;
        input.addEventListener('input', () => { gymDraftCustomName = input.value; });
        tdAct.appendChild(input);
      } else {
        tdAct.textContent = activity.name || '—';
      }
      tr.appendChild(tdAct);
    }

    const tdSeq = document.createElement('td');
    tdSeq.className = 'fl-gym-mcol';
    tdSeq.textContent = String(idx + 1);
    tr.appendChild(tdSeq);

    const fields = activity.kind === 'cardio'
      ? [['speed', '0.1'], ['incline', '0.1'], ['time', '1']]
      : [['kg', '0.1'], ['rep', '1']];

    fields.forEach(([key, step]) => {
      const td = document.createElement('td');
      td.className = 'fl-gym-mcol';
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.min = '0';
      input.step = step;
      input.value = row[key] || '';
      input.addEventListener('input', () => {
        gymDraftRows[idx] = { ...gymDraftRows[idx], [key]: input.value };
      });
      td.appendChild(input);
      tr.appendChild(td);
    });

    // Weight rows: emit empty 4th metric cell so columns align with cardio's 4 cols
    if (activity.kind !== 'cardio') {
      const tdPad = document.createElement('td');
      tdPad.className = 'fl-gym-mcol';
      tr.appendChild(tdPad);
    }

    const tdDel = document.createElement('td');
    tdDel.className = 'fl-gym-actions-col';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fl-row-del-btn';
    del.textContent = '×';
    del.title = activity.kind === 'cardio' ? 'Remove interval' : 'Remove set';
    del.disabled = gymDraftRows.length <= 1;
    del.addEventListener('click', () => {
      if (gymDraftRows.length <= 1) return;
      gymDraftRows.splice(idx, 1);
      renderGymDraft();
    });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  els.gymSets.appendChild(table);
}

function addGymDraftRow() {
  const activity = selectedGymActivity();
  const last = gymDraftRows[gymDraftRows.length - 1] || blankGymRow(activity.kind);
  gymDraftRows.push({ ...last });
  renderGymDraft();
}

function validGymRows(kind) {
  return normalizeGymRows(gymDraftRows, kind).filter((r) => {
    if (kind === 'cardio') return r.speed || r.incline || r.time;
    return r.kg || r.rep;
  });
}

function logGymActivity() {
  showGymValidation(null);
  const activity = selectedGymActivity();
  if (!activity.name) {
    showGymValidation('Choose or type an activity first.');
    return;
  }
  const rows = validGymRows(activity.kind);
  if (!rows.length) {
    showGymValidation(activity.kind === 'cardio'
      ? 'Fill at least one speed, incline, or time value.'
      : 'Fill at least one kg or rep value.');
    return;
  }

  const date = selectedGymDate || todayISO();
  const all = loadGym();
  const day = gymDay(all, date);
  day.activities.push({
    id: uid(),
    name: activity.name,
    kind: activity.kind,
    rows,
  });
  all[date] = day;
  saveGym(all);
  gymDraftRows = [blankGymRow(activity.kind)];
  if (activity.custom) gymDraftCustomName = '';
  renderGym();
}

function gymMetricText(activity) {
  const rows = Array.isArray(activity.rows) ? activity.rows : [];
  if (!rows.length) return '—';
  return rows.map((r, idx) => {
    if (activity.kind === 'cardio') {
      const parts = [];
      if (r.speed) parts.push(`speed ${r.speed}`);
      if (r.incline) parts.push(`incline ${r.incline}`);
      if (r.time) parts.push(`${r.time} min`);
      return `interval ${idx + 1}: ${parts.join(', ') || '—'}`;
    }
    const kg = r.kg ? `${r.kg}kg` : '—kg';
    const rep = r.rep ? `${r.rep}rep` : '—rep';
    return `set ${idx + 1}: ${kg} x ${rep}`;
  }).join('; ');
}

const GYM_METRIC_FIELDS = {
  weight: [['kg', '0.1'], ['rep', '1']],
  cardio: [['speed', '0.1'], ['incline', '0.1'], ['time', '1']],
};

function buildGymSubTable(kind, items, opts) {
  const table = document.createElement('table');
  table.className = 'fl-table fl-gym-table';

  // Weight headers carry an empty 4th metric col so the SET/Speed/Incline/Time positions
  // line up with cardio's four metric columns across tables.
  const headers = kind === 'cardio'
    ? ['#', 'Activity', 'SET', 'Speed', 'Incline', 'Time']
    : ['#', 'Activity', 'SET', 'kg', 'rep', ''];

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (h === '#') th.classList.add('fl-num');
    else if (i >= 2) th.classList.add('fl-gym-mcol');
    trh.appendChild(th);
  });
  if (opts.onEdit || opts.onDelete) {
    const thAct = document.createElement('th');
    thAct.className = 'fl-gym-actions-col';
    trh.appendChild(thAct);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const fields = GYM_METRIC_FIELDS[kind === 'cardio' ? 'cardio' : 'weight'];

  const tbody = document.createElement('tbody');
  items.forEach(({ a, i: activityIdx }) => {
    const isEditing = activityIdx === gymEditingIdx;
    const sourceRows = isEditing && gymEditDraft ? gymEditDraft.rows : (a.rows || []);
    const rows = sourceRows.length ? sourceRows : [{}];

    rows.forEach((r, setIdx) => {
      const tr = document.createElement('tr');

      if (setIdx === 0) {
        const tdActIdx = document.createElement('td');
        tdActIdx.className = 'fl-num';
        tdActIdx.rowSpan = rows.length;
        tdActIdx.textContent = String(activityIdx + 1);
        tr.appendChild(tdActIdx);

        const tdName = document.createElement('td');
        tdName.rowSpan = rows.length;
        tdName.className = 'fl-gym-activity-name';
        tdName.textContent = a.name || '';
        tr.appendChild(tdName);
      }

      const tdSeq = document.createElement('td');
      tdSeq.className = 'fl-gym-mcol';
      tdSeq.textContent = String(setIdx + 1);
      tr.appendChild(tdSeq);

      fields.forEach(([key, step]) => {
        const td = document.createElement('td');
        td.className = 'fl-gym-mcol';
        if (isEditing) {
          const input = document.createElement('input');
          input.type = 'number';
          input.inputMode = 'decimal';
          input.min = '0';
          input.step = step;
          input.value = r[key] || '';
          input.addEventListener('input', () => {
            if (!gymEditDraft.rows[setIdx]) gymEditDraft.rows[setIdx] = {};
            gymEditDraft.rows[setIdx][key] = input.value;
          });
          td.appendChild(input);
        } else {
          const val = r[key];
          td.textContent = (val === undefined || val === null || val === '') ? '—' : String(val);
        }
        tr.appendChild(td);
      });

      // Weight rows: empty 4th metric cell to align with cardio's 4 cols
      if (kind !== 'cardio') {
        const tdPad = document.createElement('td');
        tdPad.className = 'fl-gym-mcol';
        tr.appendChild(tdPad);
      }

      if ((opts.onEdit || opts.onDelete) && setIdx === 0) {
        const tdAct = document.createElement('td');
        tdAct.rowSpan = rows.length;
        tdAct.className = 'fl-gym-actions-col';
        if (opts.onEdit) {
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = isEditing ? 'fl-row-save-btn' : 'fl-row-edit-btn';
          editBtn.textContent = isEditing ? 'Save' : 'Edit';
          editBtn.addEventListener('click', () => opts.onEdit(activityIdx));
          tdAct.appendChild(editBtn);
        }
        if (opts.onDelete) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'fl-row-del-btn';
          del.textContent = '×';
          del.title = 'Remove activity';
          del.addEventListener('click', () => opts.onDelete(activityIdx));
          tdAct.appendChild(del);
        }
        tr.appendChild(tdAct);
      }
      tbody.appendChild(tr);
    });
  });
  table.appendChild(tbody);
  return table;
}

function renderGymSection(container, activities, opts = {}) {
  container.innerHTML = '';

  if (!activities.length) {
    const empty = document.createElement('p');
    empty.className = 'fl-empty';
    empty.textContent = '(no activities)';
    container.appendChild(empty);
    return;
  }

  const indexed = activities.map((a, i) => ({ a, i }));
  const weight = indexed.filter(({ a }) => a.kind !== 'cardio');
  const cardio = indexed.filter(({ a }) => a.kind === 'cardio');

  if (weight.length) {
    const heading = document.createElement('h3');
    heading.className = 'fl-gym-section-heading';
    heading.textContent = 'Weight';
    container.appendChild(heading);
    const wrap = document.createElement('div');
    wrap.className = 'fl-table-wrap';
    wrap.appendChild(buildGymSubTable('weight', weight, opts));
    container.appendChild(wrap);
  }
  if (cardio.length) {
    const heading = document.createElement('h3');
    heading.className = 'fl-gym-section-heading';
    heading.textContent = 'Cardio';
    container.appendChild(heading);
    const wrap = document.createElement('div');
    wrap.className = 'fl-table-wrap';
    wrap.appendChild(buildGymSubTable('cardio', cardio, opts));
    container.appendChild(wrap);
  }
}

function removeGymActivity(date, index) {
  gymEditingIdx = null;
  gymEditDraft = null;
  const all = loadGym();
  const day = gymDay(all, date);
  day.activities.splice(index, 1);
  if (day.activities.length) all[date] = day;
  else delete all[date];
  saveGym(all);
  renderGym();
}

function toggleGymEdit(date, index) {
  if (gymEditingIdx === index) {
    // Save
    const all = loadGym();
    const day = gymDay(all, date);
    const activity = day.activities[index];
    if (activity && gymEditDraft) {
      activity.rows = normalizeGymRows(gymEditDraft.rows, activity.kind);
      all[date] = day;
      saveGym(all);
    }
    gymEditingIdx = null;
    gymEditDraft = null;
  } else {
    // Start (or switch) edit
    const all = loadGym();
    const day = gymDay(all, date);
    const activity = day.activities[index];
    if (!activity) return;
    gymEditingIdx = index;
    gymEditDraft = { rows: JSON.parse(JSON.stringify(activity.rows || [])) };
  }
  renderGym();
}

function renderGym() {
  renderGymDateOptions();
  renderGymDraft();
  const all = loadGym();
  const day = gymDay(all, selectedGymDate);
  renderGymSection(els.gymTable, day.activities, {
    onDelete: (idx) => removeGymActivity(selectedGymDate, idx),
    onEdit: (idx) => toggleGymEdit(selectedGymDate, idx),
  });
}

function clearGymDay() {
  const date = selectedGymDate || todayISO();
  if (!confirm(`Clear GymLog for ${date}? Activities already logged will be removed.`)) return;
  gymEditingIdx = null;
  gymEditDraft = null;
  const all = loadGym();
  delete all[date];
  saveGym(all);
  renderGym();
}

renderGymActivityOptions();
els.gymFilters.addEventListener('click', onGymFilterClick);
els.gymActivity.addEventListener('change', () => {
  gymDraftCustomName = '';
  gymEditingIdx = null;
  gymEditDraft = null;
  const activity = selectedGymActivity();
  gymDraftRows = [blankGymRow(activity.kind)];
  showGymValidation(null);
  renderGymDraft();
});
els.gymAddSet.addEventListener('click', addGymDraftRow);
els.gymLogBtn.addEventListener('click', logGymActivity);
els.gymDate.addEventListener('change', () => {
  selectedGymDate = els.gymDate.value || todayISO();
  gymEditingIdx = null;
  gymEditDraft = null;
  renderGym();
});
els.gymClearDay.addEventListener('click', clearGymDay);
els.gymLogDay.addEventListener('click', () => {
  // Stub for GymLog Log Day — snapshot/history surface comes in a later phase.
  showGymValidation('Day logged. History view coming in a later phase.');
  setTimeout(() => showGymValidation(null), 2500);
});

// ============ FoodLibrary tab ============

const LIB_COLS = ['item', 'serving', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

function isHostLibraryEntry(entry) {
  return String(entry?.id ?? '').startsWith('seed-') || entry?.addedAt === DEFAULT_LIBRARY_VERSION;
}

function renderLibrary() {
  const lib = loadLibrary();
  els.libraryCount.textContent = lib.length === 1 ? '1 item' : `${lib.length} items`;

  const tbl = els.libraryTable;
  tbl.innerHTML = '';

  if (!lib.length) {
    els.libraryEmpty.hidden = false;
    return;
  }
  els.libraryEmpty.hidden = true;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  LIB_COLS.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    if (['kcal','p','f','c','su','fb'].includes(c)) th.classList.add('fl-num');
    trh.appendChild(th);
  });
  const thDel = document.createElement('th');
  trh.appendChild(thDel);
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  lib.forEach((entry) => {
    const tr = document.createElement('tr');
    LIB_COLS.forEach((c) => {
      const td = document.createElement('td');
      const v = entry[c];
      if (c === 'item' || c === 'serving') {
        td.textContent = String(v ?? '');
      } else {
        td.classList.add('fl-num');
        td.textContent = c === 'kcal' ? fmtNum(v, 0) : fmtNum(v, 1);
      }
      tr.appendChild(td);
    });
    const tdDel = document.createElement('td');
    if (!isHostLibraryEntry(entry)) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'fl-row-del-btn';
      del.textContent = '×';
      del.title = 'Delete user item';
      del.addEventListener('click', () => {
        const cur = loadLibrary().filter((x) => x.id !== entry.id);
        saveLibrary(cur);
        renderLibrary();
      });
      tdDel.appendChild(del);
    }
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

els.libraryClear.addEventListener('click', () => {
  if (!confirm("Clear user-added FoodLibrary items? Host items will remain.")) return;
  saveLibrary(loadLibrary().filter(isHostLibraryEntry));
  renderLibrary();
});

// ============ Food History ============

const HIST_COLS = ['date', 'target', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

function dayTotals(day) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };
  MEAL_SLOTS.forEach((slot) => {
    const sub = sumItems((day[slot] && day[slot].items) || []);
    NUMERIC_COLS.forEach((k) => { t[k] += sub[k]; });
  });
  return t;
}

function logDay() {
  const date = selectedDate();
  const all = loadDaily();
  const day = getDay(all, date);
  const totals = dayTotals(day);

  const target = null;

  const hasAny = NUMERIC_COLS.some((k) => totals[k] > 0);
  if (!hasAny && (target == null || target === '')) {
    setStatus('Nothing to snapshot — log a meal first.', 'error');
    setTimeout(() => setStatus(null), 2500);
    return;
  }

  const entry = {
    date,
    target: target == null || target === '' ? null : num(target),
    kcal: totals.kcal,
    p: totals.p,
    f: totals.f,
    c: totals.c,
    su: totals.su,
    fb: totals.fb,
    savedAt: new Date().toISOString(),
  };

  const hist = loadHistory();
  const idx = hist.findIndex((h) => h.date === date);
  if (idx >= 0) hist[idx] = entry; else hist.push(entry);
  hist.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  saveHistory(hist);

  renderHistory();
  setStatus(`Snapshot saved for ${date}.`, 'info');
  setTimeout(() => setStatus(null), 2500);
}

function renderHistory() {
  const hist = loadHistory();
  const tbl = els.historyTable;
  tbl.innerHTML = '';

  if (!hist.length) {
    els.historyEmpty.hidden = false;
    return;
  }
  els.historyEmpty.hidden = true;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  HIST_COLS.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c === 'target' ? 'target kcal' : c;
    if (c !== 'date') th.classList.add('fl-num');
    trh.appendChild(th);
  });
  const thDel = document.createElement('th');
  trh.appendChild(thDel);
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  hist.forEach((entry) => {
    const tr = document.createElement('tr');
    HIST_COLS.forEach((c) => {
      const td = document.createElement('td');
      const v = entry[c];
      if (c === 'date') {
        td.textContent = String(v ?? '');
      } else if (c === 'target') {
        td.classList.add('fl-num');
        td.textContent = v == null || v === '' ? '—' : fmtNum(v, 0);
      } else {
        td.classList.add('fl-num');
        td.textContent = c === 'kcal' ? fmtNum(v, 0) : fmtNum(v, 1);
      }
      tr.appendChild(td);
    });
    const tdDel = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fl-row-del-btn';
    del.textContent = '×';
    del.title = 'Delete snapshot';
    del.addEventListener('click', () => {
      const cur = loadHistory().filter((h) => h.date !== entry.date);
      saveHistory(cur);
      renderHistory();
    });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

els.logDayBtn.addEventListener('click', logDay);
els.clearHistoryBtn.addEventListener('click', () => {
  if (!confirm('Clear all Food History snapshots? This cannot be undone.')) return;
  saveHistory([]);
  renderHistory();
});

// ============ CSV export ============

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDailyCSV() {
  const date = selectedDate();
  const all = loadDaily();
  const day = getDay(all, date);
  const target = null;

  const rows = [['date', 'meal', 'item', ...NUMERIC_COLS]];
  MEAL_SLOTS.forEach((slot) => {
    const items = (day[slot] && day[slot].items) || [];
    items.forEach((it) => {
      rows.push([date, MEAL_LABELS[slot], it.item,
        fmtNum(it.kcal, 0), fmtNum(it.p, 1), fmtNum(it.f, 1),
        fmtNum(it.c, 1), fmtNum(it.su, 1), fmtNum(it.fb, 1)]);
    });
  });
  const totals = dayTotals(day);
  rows.push([date, 'Total', '',
    fmtNum(totals.kcal, 0), fmtNum(totals.p, 1), fmtNum(totals.f, 1),
    fmtNum(totals.c, 1), fmtNum(totals.su, 1), fmtNum(totals.fb, 1)]);
  rows.push([date, 'Target', '',
    target == null || target === '' ? '' : fmtNum(target, 0),
    '', '', '', '', '']);

  downloadCSV(`fitlog_daily_${date}.csv`, rows);
}

function exportHistoryCSV() {
  const hist = loadHistory();
  const rows = [['date', 'target_kcal', 'kcal', 'p', 'f', 'c', 'su', 'fb']];
  hist.forEach((e) => {
    rows.push([
      e.date,
      e.target == null || e.target === '' ? '' : fmtNum(e.target, 0),
      fmtNum(e.kcal, 0), fmtNum(e.p, 1), fmtNum(e.f, 1),
      fmtNum(e.c, 1), fmtNum(e.su, 1), fmtNum(e.fb, 1),
    ]);
  });
  downloadCSV('fitlog_food_history.csv', rows);
}

els.exportDailyBtn.addEventListener('click', exportDailyCSV);
els.exportHistoryBtn.addEventListener('click', exportHistoryCSV);

// ============ Authentication ============

async function signInWithGoogle() {
  try {
    setStatus('Opening Google sign-in...', 'info');
    const result = await auth.signInWithPopup(googleProvider);
    console.info('[fitlog] sign-in success', result.user?.uid);
    setStatus('Sign-in successful.', 'info');
    setTimeout(() => setStatus(null), 3000);
  } catch (e) {
    console.error('[fitlog] sign-in error', e);
    const msg = e.code === 'auth/popup-closed-by-user' 
      ? 'Sign-in window closed before completion.'
      : 'Sign-in failed: ' + e.message;
    setStatus(msg, 'error');
  }
}

async function signOut() {
  if (!confirm('Sign out? Offline data stays on this device, but sync will stop.')) return;
  try {
    await auth.signOut();
  } catch (e) {
    console.error('[fitlog] sign-out error', e);
  }
}

function setSyncStatus(msg) {
  if (!els.syncStatus) return;
  const now = new Date().toLocaleTimeString();
  els.syncStatus.textContent = msg ? `${msg} (${now})` : '';
}

async function syncToFirestore(category, data) {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('data').doc(category).set({
      payload: JSON.stringify(data),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    setSyncStatus('Synced to cloud');
  } catch (e) {
    console.error(`[fitlog] sync error (${category})`, e);
    setSyncStatus('Sync failed');
  }
}

async function syncAllToFirestore() {
  if (!currentUser) return;
  console.info('[fitlog] migrating local data to cloud');
  await syncToFirestore('settings', loadSettings());
  await syncToFirestore('library', loadLibrary());
  await syncToFirestore('dailyLog', loadDaily());
  await syncToFirestore('foodHistory', loadHistory());
  await syncToFirestore('gymLog', loadGym());
}

async function syncFromFirestore() {
  if (!currentUser) return;
  setSyncStatus('Syncing from cloud…');
  console.info('[fitlog] sync: starting fetch for uid', currentUser.uid);
  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('data').get();
    console.info('[fitlog] sync: cloud snap received, docs:', snap.size);
    if (snap.empty) {
      console.info('[fitlog] sync: cloud empty, pushing local');
      await syncAllToFirestore();
      setSyncStatus('Local data migrated to cloud');
      return;
    }
    let hasChanges = false;
    snap.forEach((doc) => {
      const category = doc.id;
      let data;
      try {
        data = JSON.parse(doc.data().payload);
      } catch (e) {
        console.error(`[fitlog] sync: failed to parse ${category}`, e);
        return;
      }
      console.info(`[fitlog] sync: processing ${category}`);
      if (category === 'settings') {
        const local = loadSettings();
        if (data.apiKey && !local.apiKey) {
          state = data;
          saveSettings(data);
          hasChanges = true;
        }
      } else if (category === 'library') {
        const local = loadLibrary();
        if (data.length > local.length) { saveLibrary(data); hasChanges = true; }
      } else if (category === 'dailyLog') {
        const local = loadDaily();
        const merged = { ...local, ...data };
        saveDaily(merged);
        hasChanges = true;
      } else if (category === 'foodHistory') {
        saveHistory(data);
        hasChanges = true;
      } else if (category === 'gymLog') {
        const local = loadGym();
        const merged = { ...local, ...data };
        saveGym(merged);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      renderDaily();
      renderHistory();
      renderLibrary();
      renderGym();
    }
    setSyncStatus('Synced from cloud');
  } catch (e) {
    console.error('[fitlog] sync-from error', e);
    setSyncStatus('Sync failed');
  }
}

function updateProfileUI() {
  if (currentUser) {
    els.profileOut.hidden = true;
    els.profileIn.hidden = false;
    els.profileImg.src = currentUser.photoURL || '';
    els.profileName.textContent = currentUser.displayName || 'No Name';
    els.profileEmail.textContent = currentUser.email || 'No Email';
  } else {
    els.profileOut.hidden = false;
    els.profileIn.hidden = true;
    els.profileImg.src = '';
    els.profileName.textContent = '';
    els.profileEmail.textContent = '';
    els.syncStatus.textContent = '';
  }
}

auth.onAuthStateChanged((user) => {
  const changed = (currentUser?.uid !== user?.uid);
  currentUser = user;
  console.info('[fitlog] auth state', user ? `signed-in: ${user.uid}` : 'signed-out');
  updateProfileUI();
  
  if (changed && user) {
    syncFromFirestore();
  }
});

els.signinBtn.addEventListener('click', signInWithGoogle);
els.signoutBtn.addEventListener('click', signOut);

// ============ Init ============

showTab('logging');
renderDaily();
renderHistory();
renderLibrary();

console.info('[fitlog] mounted', { date: todayISO(), libraryCount: loadLibrary().length });

})();
