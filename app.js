// FitLog M003-1 — V1 client
// Static, BYOK Gemini, localStorage persistence.

(function () {
'use strict';

// ============ Constants ============

const STORAGE_PREFIX = 'm003_1';
const KEY_APIKEY = `${STORAGE_PREFIX}_apiKey`;
const KEY_MODEL = `${STORAGE_PREFIX}_model`;
const KEY_PROMPT = `${STORAGE_PREFIX}_systemPrompt`;
const KEY_PROMPT_VERSION = `${STORAGE_PREFIX}_systemPromptVersion`;
const KEY_KOALA_MODE = `${STORAGE_PREFIX}_koalaMode`;
const KEY_THEME = `${STORAGE_PREFIX}_theme`;
const KEY_LIBRARY = `${STORAGE_PREFIX}_library`;
const KEY_LIBRARY_SEED = `${STORAGE_PREFIX}_librarySeedVersion`;
const KEY_DAILY = `${STORAGE_PREFIX}_dailyLog`;
const KEY_HISTORY = `${STORAGE_PREFIX}_foodHistory`;
const KEY_GYM = `${STORAGE_PREFIX}_gymLog`;
const KEY_GYM_FAVS = `${STORAGE_PREFIX}_gymFavorites`;
const KEY_GYM_CUSTOMS = `${STORAGE_PREFIX}_gymCustomExercises`;
const KEY_PROFILE = `${STORAGE_PREFIX}_profile`;

const SUPPORTED_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_KOALA_MODE = 'j';
const DEFAULT_THEME = 'dark';
const ICON_LEAF = '🌿';
const ICON_SEARCH = '🔎';
const ICON_DART = '🎯';
const ICON_BULB = '💡';
const ICON_DARK_BULB = '●';
const ICON_FIRE = '🔥';

// Fallback preference order. When the selected primary model 5xx's, try these
// in order (skipping the primary). gemini-3-flash-preview is preferred because
// it lives on a separate capacity pool from 2.5-flash and is on free tier.
// gemini-2.0-flash is last because some accounts have free_tier limit=0 on it.
const FALLBACK_PRIORITY = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const GEMINI_PROXY_URL = '/api/gemini';

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
const MEAL_HINTS = [
  ['breakfast', 'Breakfast'],
  ['brunch', 'Brunch'],
  ['lnunch', 'Lunch'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['supper', 'Supper'],
  ['teatime', 'Teatime'],
  ['tea time', 'Teatime'],
  ['snack', 'Snack'],
];
const DAILY_DATE_WINDOW_DAYS = 30;
const CUSTOM_WEIGHT_LABEL = 'Custom weight training';
const CUSTOM_CARDIO_LABEL = 'Custom cardio';
const MAX_LIBRARY_ITEMS = 30;
const MAX_GYM_CUSTOMS = 10;
const GYM_ACTIVITY_DATALIST_ID = 'fl-gym-activity-options';
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
- Item labels in English.
- EVERY non-Total item label MUST include a measurable weight in grams or millilitres (g/ml/kg/l/oz/lb). This is non-negotiable — even for items the user described without a weight, estimate one and include it in the label. The weight is the basis used for kcal/p/f/c/su/fb.
- For PROCESSED / PACKAGED items where a package is the natural serving unit (canned drinks, bottled drinks, protein bars, scoops of powder, packets, sachets, sticks, containers, tins), include BOTH the package count and the weight equivalent in parentheses (e.g. "Heineken (1 can, 320ml)", "Protein bar (1 bar, 60g)", "Whey (1 scoop, 30g)"). The numeric weight inside parentheses must match the row's nutrition basis.
- For unprocessed / generic items (rice, chicken, vegetables, tea, water, etc.), use just the gram or millilitre weight (e.g. "rice 150g", "chicken breast 120g", "black tea 250ml"). Do NOT add cup/tbsp/slice qualifiers — they are descriptive only; the weight is the canonical serving.
- No additional columns. No markdown. JSON only.

Library priority:
- If a LIBRARY_CONTEXT block is appended below, those entries are pre-saved by the user with brand/portion-specific values.
- For each user-described item, first check LIBRARY_CONTEXT for a match (by item name + brand). If found, copy that entry's per-portion values (scaling to user-stated portion if needed) and prefix the item label with "[lib] ".
- Otherwise estimate from your knowledge using brand information the user provided. If brand is ambiguous, portion is unspecified, or the item is unrecognizable, add a "notes" line asking the user to clarify. Output ONLY the items described by the user.`;

const SYSTEM_PROMPT_VERSION = '2026-05-11-v3';
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
    apiKey: safeLS.get(KEY_APIKEY) || '',
    model: SUPPORTED_MODELS.includes(safeLS.get(KEY_MODEL)) ? safeLS.get(KEY_MODEL) : DEFAULT_MODEL,
    koalaMode: ['j', 'p'].includes(safeLS.get(KEY_KOALA_MODE)) ? safeLS.get(KEY_KOALA_MODE) : DEFAULT_KOALA_MODE,
    theme: ['dark', 'light'].includes(safeLS.get(KEY_THEME)) ? safeLS.get(KEY_THEME) : DEFAULT_THEME,
    systemPrompt: safeLS.get(KEY_PROMPT) ?? DEFAULT_SYSTEM_PROMPT,
  };
}

function saveSettings(s) {
  safeLS.set(KEY_APIKEY, String(s.apiKey || '').trim());
  safeLS.set(KEY_MODEL, SUPPORTED_MODELS.includes(s.model) ? s.model : DEFAULT_MODEL);
  safeLS.set(KEY_KOALA_MODE, ['j', 'p'].includes(s.koalaMode) ? s.koalaMode : DEFAULT_KOALA_MODE);
  safeLS.set(KEY_THEME, ['dark', 'light'].includes(s.theme) ? s.theme : DEFAULT_THEME);
  safeLS.set(KEY_PROMPT, s.systemPrompt ?? '');
  safeLS.set(KEY_PROMPT_VERSION, SYSTEM_PROMPT_VERSION);
  syncToFirestore('settings', settingsCloudPayload(s));
}

function settingsCloudPayload(s) {
  return {
    model: SUPPORTED_MODELS.includes(s.model) ? s.model : DEFAULT_MODEL,
    koalaMode: ['j', 'p'].includes(s.koalaMode) ? s.koalaMode : DEFAULT_KOALA_MODE,
    theme: ['dark', 'light'].includes(s.theme) ? s.theme : DEFAULT_THEME,
    systemPrompt: s.systemPrompt ?? '',
  };
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
  const hostEntries = [];
  const userEntries = [];
  (Array.isArray(lib) ? lib : []).forEach((entry) => {
    if (isHostLibraryEntry(entry)) hostEntries.push(entry);
    else userEntries.push(entry);
  });
  const clean = [...hostEntries, ...userEntries.slice(0, MAX_LIBRARY_ITEMS)];
  safeLS.setJSON(KEY_LIBRARY, clean);
  syncToFirestore('library', clean);
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
function loadGymFavs() { return safeLS.getJSON(KEY_GYM_FAVS, []); }
function saveGymFavs(favs) {
  const clean = (Array.isArray(favs) ? favs : []).slice(0, 5);
  safeLS.setJSON(KEY_GYM_FAVS, clean);
  syncToFirestore('gymFavorites', clean);
}
function normalizeGymCustoms(customs) {
  const seen = new Set();
  const clean = [];
  (Array.isArray(customs) ? customs : []).forEach((item) => {
    const kind = item?.kind === 'cardio' ? 'cardio' : 'weight';
    const name = String(item?.name || '').trim().slice(0, 50);
    if (!name) return;
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    clean.push({ id: item?.id || uid(), kind, name, savedAt: item?.savedAt || new Date().toISOString() });
  });
  return clean.slice(0, MAX_GYM_CUSTOMS);
}
function loadGymCustoms() { return normalizeGymCustoms(safeLS.getJSON(KEY_GYM_CUSTOMS, [])); }
function saveGymCustoms(customs) {
  const clean = normalizeGymCustoms(customs);
  safeLS.setJSON(KEY_GYM_CUSTOMS, clean);
  syncToFirestore('gymCustomExercises', clean);
}
function saveGymCustomActivity(kind, name) {
  const cleanKind = kind === 'cardio' ? 'cardio' : 'weight';
  const cleanName = String(name || '').trim().slice(0, 50);
  if (!cleanName) return null;
  const current = loadGymCustoms();
  const key = `${cleanKind}:${cleanName.toLowerCase()}`;
  const existing = current.find((item) => `${item.kind}:${item.name.toLowerCase()}` === key);
  const next = current.filter((item) => `${item.kind}:${item.name.toLowerCase()}` !== key);
  next.unshift({
    id: existing?.id || uid(),
    kind: cleanKind,
    name: cleanName,
    savedAt: new Date().toISOString(),
  });
  saveGymCustoms(next.slice(0, MAX_GYM_CUSTOMS));
  return { group: 'Custom', kind: cleanKind, name: cleanName, custom: true };
}

function gymCustomByNameKind(name, kind) {
  const cleanName = String(name || '').trim();
  const cleanKind = kind === 'cardio' ? 'cardio' : 'weight';
  return loadGymCustoms().find((item) => item.kind === cleanKind && item.name === cleanName) || null;
}

function deleteGymCustomExercise(kind, name) {
  const custom = gymCustomByNameKind(name, kind);
  if (!custom) return;
  if (!confirm(`Delete "${custom.name}" from custom exercise dropdown? Existing workout rows will stay unchanged.`)) return;
  const key = `${custom.kind}:${custom.name.toLowerCase()}`;
  saveGymCustoms(loadGymCustoms().filter((item) => `${item.kind}:${item.name.toLowerCase()}` !== key));
  renderGymActivityOptions();
  ensureGymActivityDatalist();
  renderGym();
  renderLibrary();
}
function loadProfile() {
  return safeLS.getJSON(KEY_PROFILE, {
    gender: 'female',
    age: null,
    weight: null,
    height: null,
    activityLevel: 'sedentary',
    customTdee: { kcal: null, p: null, f: null, sugarMax: null, fiberMin: null },
  });
}
function saveProfile(p) {
  safeLS.setJSON(KEY_PROFILE, p);
  syncToFirestore('profile', p);
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

function geminiEndpoint(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function geminiRequestBody({ systemPrompt, input, images = [] }) {
  const parts = [{ text: input }];
  images.forEach((img) => {
    if (!img || !img.mimeType || !img.data) return;
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: FOOD_RESPONSE_SCHEMA,
    },
  };
  if (systemPrompt && systemPrompt.trim()) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  return body;
}

async function callGemini({ model, systemPrompt, input, images = [] }) {
  if (!currentUser) {
    const e = new Error('Sign in required.');
    e.status = 401;
    throw e;
  }
  const apiKey = String(state.apiKey || '').trim();
  const body = geminiRequestBody({ systemPrompt, input, images });
  const res = apiKey
    ? await fetch(geminiEndpoint(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    : await (async () => {
        const token = await currentUser.getIdToken();
        return fetch(GEMINI_PROXY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ model, body }),
        });
      })();
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

// ============ Calculations ============

const ACTIVITY_FACTOR = {
  sedentary: 1.20, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.90,
};

function computeBMR(p) {
  if (!p.weight || !p.height || !p.age) return null;
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return p.gender === 'male' ? base + 5 : base - 161;
}

function computeBMI(p) {
  if (!p.weight || !p.height) return null;
  const m = p.height / 100;
  return p.weight / (m * m);
}

function bmiClass(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25)   return 'Normal';
  if (bmi < 30)   return 'Overweight';
  return 'Obese';
}

function tdeeNormal(p) {
  const bmr = computeBMR(p);
  if (bmr == null) return null;
  return Math.round(bmr * (ACTIVITY_FACTOR[p.activityLevel] || 1.20));
}

function macrosFor(mode, p, kcal) {
  const RULES = {
    normal: { p: 1.0,  f: 0.9 },
    diet:   { p: 1.75, f: 0.8 },
    high:   { p: 1.75, f: 1.0 },
  };
  const r = RULES[mode];
  if (!r || !p.weight) return null;
  const proteinG = Math.round(r.p * p.weight);
  const fatG     = Math.round(r.f * p.weight);
  const carbG    = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, p: proteinG, f: fatG, c: carbG };
}

function carbFromKcal(kcal, pG, fG) {
  return Math.max(0, Math.round((kcal - pG * 4 - fG * 9) / 4));
}

function sugarMaxG(kcalNormal) {
  return Math.min(50, Math.round((kcalNormal * 0.10 / 4) / 5) * 5);
}

function fiberMinG(gender) {
  return gender === 'male' ? 38 : 25;
}

function targetForDate(date) {
  const all = loadDaily();
  const mode = (all[date] && all[date].targetMode) || 'normal';
  if (mode === 'none') return null;
  if (mode === 'custom') {
    const c = profileState.customTdee;
    if (!c || c.kcal == null) return null;
    return {
      kcal: c.kcal, p: c.p, f: c.f, c: carbFromKcal(c.kcal, c.p || 0, c.f || 0),
      sugarMax: c.sugarMax ?? null, fiberMin: c.fiberMin ?? null,
    };
  }
  const normal = tdeeNormal(profileState);
  if (normal == null) return null;
  const kcal = mode === 'diet' ? normal - 300 : mode === 'high' ? normal + 200 : normal;
  const macros = macrosFor(mode, profileState, kcal);
  if (!macros) return null;
  return { ...macros, sugarMax: sugarMaxG(normal), fiberMin: fiberMinG(profileState.gender) };
}

// ============ State ============

let state = loadSettings();
let profileState = loadProfile();
let lastPreview = null; // { rows: [...], notes: [...] }
let selectedDailyDate = todayISO();
let selectedGymDate = todayISO();
let foodImages = [null, null]; // ephemeral compressed images for the next AI estimate only
let koalaMode = state.koalaMode || DEFAULT_KOALA_MODE; // j = preview-confirm, p = direct log
let activeGymFilter = 'all'; // 'all' | 'Push' | 'Pull' | 'Upper' | 'Lower' | 'Cardio' | 'Custom'
let gymLocked = false; // when true, gym tables render read-only
let gymDraftAll = null;
let gymDirtyDates = new Set();

// ============ DOM refs ============

const els = {
  welcome: $('#fl-welcome'),
  welcomeSigninBtn: $('#fl-welcome-signin-btn'),
  brandLogo: $('#fl-brand-logo'),
  brandMotto: $('#fl-brand-motto'),
  tabsNav: $('#fl-tabs-nav'),
  main: $('#fl-main'),
  headerAuth: $('#fl-header-auth'),
  headerAccount: $('#fl-header-account'),
  headerThemeToggle: $('#fl-header-theme-toggle'),
  headerAvatar: $('#fl-header-avatar'),
  headerName: $('#fl-header-name'),
  profileSync: $('#fl-profile-sync'),
  settingsBtn: $('#fl-settings-btn'),
  settingsClose: $('#fl-settings-close'),
  settingsStatus: $('#fl-settings-status'),
  setModel: $('#fl-set-model'),
  setApiKey: $('#fl-set-apikey'),
  clearApiKey: $('#fl-clear-apikey'),
  setPrompt: $('#fl-set-prompt'),
  setReset: $('#fl-set-reset'),
  testBtn: $('#fl-test-btn'),
  testOutput: $('#fl-test-output'),
  settingKoalaButtons: Array.from(document.querySelectorAll('[data-setting-koala-mode]')),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-option]')),
  tabs: Array.from(document.querySelectorAll('.fl-tab')),
  panels: Array.from(document.querySelectorAll('.fl-panel')),
  input: $('#fl-input'),
  sendBtn: $('#fl-send-btn'),
  modeButtons: Array.from(document.querySelectorAll('.fl-mode-btn')),
  imageInputs: [$('#fl-image-0')],
  imageDrops: Array.from(document.querySelectorAll('.fl-image-drop')),
  validation: $('#fl-validation'),
  status: $('#fl-status'),
  nutritionBoard: $('#fl-nutrition-board'),
  preview: $('#fl-preview'),
  previewTable: $('#fl-preview-table'),
  previewNotes: $('#fl-preview-notes'),
  logBtn: $('#fl-log-btn'),
  dailyDate: $('#fl-daily-date'),
  dailyTable: $('#fl-daily-table'),
  logDayBtn: $('#fl-log-day-btn'),
  clearDayBtn: $('#fl-clear-day-btn'),
  historyTable: $('#fl-history-table'),
  historyEmpty: $('#fl-history-empty'),
  exportHistoryBtn: $('#fl-export-history-btn'),
  clearHistoryBtn: $('#fl-clear-history-btn'),
  libraryCount: $('#fl-library-count'),
  libraryFoodCount: $('#fl-library-food-count'),
  libraryTable: $('#fl-library-table'),
  libraryEmpty: $('#fl-library-empty'),
  gymCustomCount: $('#fl-gym-custom-count'),
  gymCustomList: $('#fl-gym-custom-list'),
  gymFavCount: $('#fl-gym-fav-count'),
  gymActivity: $('#fl-gym-activity'),
  gymCustomName: $('#fl-gym-custom-name'),
  gymLogBtn: $('#fl-gym-log-btn'),
  gymLockBtn: $('#fl-gym-lock-btn'),
  gymValidation: $('#fl-gym-validation'),
  gymDate: $('#fl-gym-date'),
  gymSummary: $('#fl-gym-summary'),
  gymTable: $('#fl-gym-table'),
  gymSavedTime: $('#fl-gym-saved-time'),
  gymNoteShell: $('#fl-gym-note-shell'),
  gymClearDay: $('#fl-gym-clear-day'),
  gymFilters: $('#fl-gym-filters'),
  gymPreset: $('#fl-gym-preset'),
  gymFavName: $('#fl-gym-fav-name'),
  gymFavOptions: $('#fl-gym-fav-options'),
  gymSaveFav: $('#fl-gym-save-fav'),
  gymFavList: $('#fl-gym-fav-list'),
  momentumSummary: $('#fl-momentum-summary'),
  momentumMonth: $('#fl-momentum-month'),
  momentumCalendar: $('#fl-momentum-calendar'),
  signoutBtn: $('#fl-signout-btn'),
  profileAge: $('#fl-profile-age'),
  profileWeight: $('#fl-profile-weight'),
  profileHeight: $('#fl-profile-height'),
  profileActivity: $('#fl-profile-activity'),
  profileSaveMetrics: $('#fl-profile-save-metrics'),
  profileSummaryText: $('#fl-profile-summary-text'),
  profileCopyFrom: $('#fl-profile-copy-from'),
  profileSaveCustom: $('#fl-save-custom'),
  customKcal: $('#fl-custom-kcal'),
  customP: $('#fl-custom-p'),
  customF: $('#fl-custom-f'),
  customCarb: $('#fl-custom-carb'),
  customSu: $('#fl-custom-su'),
  customFb: $('#fl-custom-fb'),
  dailyTargetMode: $('#fl-daily-target-mode'),
  libraryLinks: Array.from(document.querySelectorAll('[data-open-library]')),
};

// ============ UI helpers ============

function setStatus(msg, kind) {
  if (!msg) { els.status.hidden = true; els.status.textContent = ''; return; }
  els.status.hidden = false;
  els.status.textContent = msg;
  els.status.className = 'fl-status' + (kind === 'error' ? ' fl-status-error' : '');
}

function showBrandMotto() {
  if (!els.brandMotto) return;
  els.brandMotto.hidden = false;
  els.brandMotto.classList.add('fl-show');
  clearTimeout(showBrandMotto.timer);
  showBrandMotto.timer = setTimeout(() => {
    els.brandMotto.classList.remove('fl-show');
    els.brandMotto.hidden = true;
  }, 2400);
}

function showValidation(msg) {
  if (!msg) { els.validation.hidden = true; els.validation.textContent = ''; return; }
  els.validation.hidden = false;
  els.validation.textContent = msg;
}

function visiblePanelName() {
  const panel = els.panels.find((p) => !p.hidden);
  return panel?.dataset.panel || 'logging';
}

function profileComplete() {
  const p = profileState || {};
  return !!(p.gender && p.age && p.weight && p.height && p.activityLevel);
}

function setSettingsStatus(msg) {
  if (!els.settingsStatus) return;
  if (!msg) {
    els.settingsStatus.hidden = true;
    els.settingsStatus.textContent = '';
    return;
  }
  els.settingsStatus.hidden = false;
  els.settingsStatus.textContent = msg;
}

function applyTheme(theme, persist = false) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = next;
  if (els.headerThemeToggle) {
    const nextMode = next === 'light' ? 'dark' : 'light';
    els.headerThemeToggle.textContent = nextMode === 'light' ? ICON_BULB : ICON_DARK_BULB;
    els.headerThemeToggle.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    els.headerThemeToggle.setAttribute('aria-pressed', next === 'light' ? 'true' : 'false');
    els.headerThemeToggle.classList.toggle('fl-next-light', nextMode === 'light');
    els.headerThemeToggle.classList.toggle('fl-next-dark', nextMode === 'dark');
  }
  els.themeButtons.forEach((btn) => {
    const active = btn.dataset.themeOption === next;
    btn.classList.toggle('fl-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (persist) {
    state = { ...state, theme: next };
    saveSettings(state);
    setSettingsStatus(`Theme saved: ${next}.`);
  }
}

function applyKoalaMode(mode, persist = false) {
  const next = mode === 'p' ? 'p' : 'j';
  koalaMode = next;
  state = { ...state, koalaMode: next };
  els.modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === next;
    btn.classList.toggle('fl-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  els.settingKoalaButtons.forEach((btn) => {
    const active = btn.dataset.settingKoalaMode === next;
    btn.classList.toggle('fl-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (els.sendBtn) {
    els.sendBtn.textContent = next === 'p' ? ICON_LEAF : ICON_SEARCH;
    els.sendBtn.setAttribute('aria-label', next === 'p' ? 'Log meal directly' : 'Audit meal estimate');
    els.sendBtn.title = next === 'p' ? 'P Koala direct log' : 'J Koala audit';
  }
  if (els.logBtn) {
    els.logBtn.textContent = ICON_LEAF;
    els.logBtn.title = 'J OK';
  }
  if (persist) {
    saveSettings(state);
    setSettingsStatus(`${next.toUpperCase()} Koala saved.`);
  }
}

function showTab(name) {
  if (currentUser && !profileComplete() && !['profile', 'settings'].includes(name)) {
    name = 'profile';
    setSyncStatus('Save metrics to unlock FitLog');
  }
  if (visiblePanelName() === 'gym' && name !== 'gym' && gymHasUnsavedChanges()) {
    const leave = confirm('GymLog has unsaved changes. Leave without saving?');
    if (!leave) return false;
    resetGymDraft();
  }
  els.tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.setAttribute('aria-selected', active ? 'true' : 'false');
    t.classList.toggle('fl-tab-active', active);
    t.disabled = !!(currentUser && !profileComplete());
  });
  els.panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'logging') renderDaily();
  if (name === 'library') renderLibrary();
  if (name === 'gym') renderGym();
  if (name === 'momentum') renderMomentum();
  if (name === 'profile') updateProfileUI();
  if (name === 'settings') loadSettingsIntoUI();
  return true;
}

// ============ Settings page ============

function loadSettingsIntoUI() {
  if (els.setModel) els.setModel.value = state.model;
  if (els.setApiKey) els.setApiKey.value = state.apiKey || '';
  if (els.setPrompt) els.setPrompt.value = state.systemPrompt;
  applyKoalaMode(state.koalaMode || DEFAULT_KOALA_MODE, false);
  applyTheme(state.theme || DEFAULT_THEME, false);
}

function openSettings() {
  showTab('settings');
}

function saveSettingsFromUI() {
  state = {
    apiKey: els.setApiKey ? els.setApiKey.value.trim() : state.apiKey,
    model: els.setModel ? (els.setModel.value || DEFAULT_MODEL) : state.model,
    koalaMode,
    theme: state.theme || DEFAULT_THEME,
    systemPrompt: els.setPrompt ? els.setPrompt.value : state.systemPrompt,
  };
  saveSettings(state);
  applyKoalaMode(state.koalaMode, false);
  applyTheme(state.theme, false);
  setSettingsStatus('Settings saved.');
}
if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettings);
if (els.settingsClose) els.settingsClose.addEventListener('click', saveSettingsFromUI);
if (els.setReset && els.setPrompt) {
  els.setReset.addEventListener('click', () => { els.setPrompt.value = DEFAULT_SYSTEM_PROMPT; });
}
if (els.clearApiKey && els.setApiKey) {
  els.clearApiKey.addEventListener('click', () => {
    els.setApiKey.value = '';
    state = { ...state, apiKey: '' };
    saveSettings(state);
    els.testOutput.hidden = false;
    els.testOutput.textContent = 'BYOK cleared. Host key proxy will be used when configured.';
    setSettingsStatus('BYOK cleared.');
  });
}

// Minimal probe to isolate "is the proxy + shared key working?" from prompt complexity.
async function testConnection() {
  els.testBtn.disabled = true;
  els.testOutput.hidden = false;
  const model = els.setModel.value || DEFAULT_MODEL;
  const apiKey = els.setApiKey ? els.setApiKey.value.trim() : '';
  if (!currentUser) {
    els.testOutput.textContent = 'Not signed in — sign in first.';
    els.testBtn.disabled = false;
    return;
  }
  els.testOutput.textContent = apiKey
    ? `Probing ${model} with BYOK direct…`
    : `Probing ${model} via /api/gemini…`;
  const body = { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: pong' }] }] };
  let res, json, text;
  try {
    if (apiKey) {
      res = await fetch(geminiEndpoint(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      const token = await currentUser.getIdToken();
      res = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ model, body }),
      });
    }
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch (netErr) {
    els.testOutput.textContent = `Network error: ${netErr.message || netErr}\n\n` +
      `(Could be CORS, offline, or DNS — check the browser console.)`;
    els.testBtn.disabled = false;
    return;
  }
  const lines = [];
  lines.push(apiKey
    ? `Endpoint: Google direct BYOK (model=${model})`
    : `Endpoint: POST ${GEMINI_PROXY_URL} (model=${model})`);
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
    lines.push('✓ Proxy works. If meal-logging Send still fails, the issue is prompt-specific (try shorter input, different model, or check the raw output box).');
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

els.tabs.forEach((t) => t.addEventListener('click', () => {
  const target = t.dataset.tab;
  if (target === 'logging') {
    selectedDailyDate = todayISO();
  } else if (target === 'gym') {
    selectedGymDate = todayISO();
  }
  showTab(target);
}));

// ============ Ephemeral image uploads ============

const IMAGE_MAX_EDGE = 1024;
const IMAGE_QUALITY = 0.72;
const IMAGE_TARGET_BYTES = 750 * 1024;

function bytesLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}

function imageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image.'));
    };
    img.src = url;
  });
}

async function compressFoodImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const img = await imageElementFromFile(file);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const mimeType = file.type === 'image/png' ? 'image/jpeg' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, IMAGE_QUALITY));
  if (!blob) throw new Error('Could not compress image.');
  const dataUrl = await blobToDataURL(blob);
  const data = dataUrl.split(',')[1] || '';
  return {
    name: file.name || 'image',
    mimeType,
    data,
    previewUrl: dataUrl,
    bytes: blob.size,
    width,
    height,
  };
}

function renderFoodImageSlot(index) {
  const drop = els.imageDrops[0];
  const images = foodImages.filter(Boolean);
  if (!drop) return;
  drop.classList.toggle('fl-has-image', !!images.length);
  const input = els.imageInputs[0];
  drop.innerHTML = '';
  if (input) drop.appendChild(input);
  if (!images.length) {
    const plus = document.createElement('span');
    plus.className = 'fl-image-plus';
    plus.textContent = '+';
    const hint = document.createElement('span');
    hint.className = 'fl-image-hint';
    hint.textContent = 'Photo';
    drop.title = 'Photo';
    drop.append(plus, hint);
    return;
  }
  drop.title = 'Photo';
  const thumbs = document.createElement('span');
  thumbs.className = 'fl-image-thumbs';
  images.slice(0, 1).forEach((image) => {
    const img = document.createElement('img');
    img.src = image.previewUrl;
    img.alt = '';
    thumbs.appendChild(img);
  });
  const meta = document.createElement('span');
  meta.className = 'fl-image-meta';
  meta.textContent = '1';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'fl-image-remove';
  remove.textContent = '×';
  remove.title = 'Remove photo';
  remove.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    foodImages = [null, null];
    if (input) input.value = '';
    renderFoodImageSlot(0);
  });
  drop.append(thumbs, meta, remove);
}

function clearFoodImages() {
  foodImages = [null, null];
  els.imageInputs.forEach((input) => { if (input) input.value = ''; });
  renderFoodImageSlot(0);
}

els.imageInputs.forEach((input, idx) => {
  if (!input) return;
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []).filter((file) => /^image\//i.test(file.type)).slice(0, 1);
    if (!files.length) return;
    showValidation(null);
    setStatus('Compressing image…', 'info');
    try {
      const compressed = [];
      for (const file of files) compressed.push(await compressFoodImage(file));
      foodImages = [compressed[0] || null, null];
      renderFoodImageSlot(0);
      const largest = compressed.reduce((max, img) => Math.max(max, img.bytes), 0);
      if (largest > IMAGE_TARGET_BYTES) {
        setStatus(`Photo compressed. Try a smaller crop if the request fails.`, 'error');
      } else {
        setStatus('Photo ready.', 'info');
        setTimeout(() => setStatus(null), 1800);
      }
    } catch (e) {
      input.value = '';
      setStatus(formatError(e), 'error');
    }
  });
  renderFoodImageSlot(idx);
});

// ============ Send + preview ============

async function send() {
  showValidation(null);
  setStatus(null);
  const input = els.input.value.trim();
  const images = foodImages.filter(Boolean);
  if (!input && !images.length) { showValidation('Type a description or add at least one image.'); return; }
  if (input.length > 2000) { showValidation('Keep under 2000 characters.'); return; }
  if (!currentUser) {
    setStatus('Sign in to log meals with AI.', 'error');
    return;
  }

  els.sendBtn.disabled = true;
  els.preview.hidden = true;
  setStatus('Calling Gemini…', 'info');

  // Library lookup pass — find candidates and inject into prompt.
  const lib = loadLibrary();
  const matched = libraryLookup(input, lib);
  const promptWithContext = buildPromptWithContext(state.systemPrompt, matched);
  const requestText = input
    ? `${input}\n\nImage context: Use any attached images as supporting evidence for portion size, nutrition facts, packaging, or other food details.`
    : 'Estimate the food or nutrition information from the attached images. If details are ambiguous, include a notes line asking for clarification.';

  // Build fallback chain: text requests may fall back; image requests use one call to avoid burning quota.
  const primary = state.model;
  const chain = images.length
    ? [primary]
    : [primary, ...FALLBACK_PRIORITY.filter((m) => m !== primary)].slice(0, 3);
  let lastErr = null;
  let triedModels = [];

  try {
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      triedModels.push(model);
      if (i > 0) setStatus(`${chain[0]} overloaded — falling back to ${model}…`, 'info');
      try {
        const opts = { model, systemPrompt: promptWithContext, input: requestText, images };
        const result = images.length ? await callGemini(opts) : await callGeminiWithRetry(opts);
        setStatus(null);
        if (!result.parsed || !Array.isArray(result.parsed.rows)) {
          setStatus(`Gemini (${model}) returned non-JSON or wrong shape. Raw output below — try rephrasing or switching model in Settings.`, 'error');
          renderRawFallback(result.raw);
          return;
        }
        if (koalaMode === 'p') {
          const logged = logParsedMeal(result.parsed, input);
          setStatus(`Logged ${logged.name} with ${fmtNum(logged.kcal, 0)} kcal. ${ICON_LEAF}`, 'info');
        } else {
          renderPreview(result.parsed, input);
        }
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

function renderPreview(parsed, sourceInput = '') {
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
  lastPreview = { rows, notes, sourceInput };

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
        btn.textContent = 'Saved item';
        btn.title = 'This item is already saved';
        btn.disabled = true;
      } else {
        btn.textContent = '+ Save item';
        btn.title = 'Save this item for future estimates';
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
els.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyKoalaMode(btn.dataset.mode === 'p' ? 'p' : 'j', true);
  });
});
els.settingKoalaButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyKoalaMode(btn.dataset.settingKoalaMode === 'p' ? 'p' : 'j', true);
  });
});
els.themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.themeOption === 'light' ? 'light' : 'dark', true);
  });
});
if (els.headerThemeToggle) {
  els.headerThemeToggle.addEventListener('click', () => {
    applyTheme((state.theme || DEFAULT_THEME) === 'light' ? 'dark' : 'light', true);
  });
}

// ============ Add to FoodLibrary (per item) ============

// Measurable weight units (g/ml/oz/lb/kg/l) — AI always includes one of these per system prompt.
const FL_WEIGHT_UNIT_RE = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb)\b/i;
// Packaging qualifiers — appear on processed/branded items where the package IS the serving unit.
// Their presence makes us prefix the serving as "<qty> <pkg> (<weight>)".
const FL_PACKAGING_UNIT_RE = /(\d+(?:\.\d+)?)\s*(can|cans|bottle|bottles|bar|bars|scoop|scoops|packet|packets|sachet|sachets|stick|sticks|container|containers|pack|packs|box|boxes|tin|tins|serving|servings)\b/i;
// Measurement qualifiers — generic portion descriptors (cup/tbsp/slice/piece). We DROP these
// and keep only the gram/ml weight, since they're not the canonical serving unit.
const FL_MEASUREMENT_UNIT_RE = /(\d+(?:\.\d+)?)\s*(cup|cups|tsp|tbsp|slice|slices|piece|pieces|pcs?)\b/i;

function parseFoodItemLabel(label) {
  const clean = String(label ?? '').trim().replace(/^\[lib\]\s+/i, '');
  const weightMatch = clean.match(FL_WEIGHT_UNIT_RE);
  const pkgMatch = clean.match(FL_PACKAGING_UNIT_RE);
  const measMatch = clean.match(FL_MEASUREMENT_UNIT_RE);

  let serving;
  if (pkgMatch) {
    // Processed/packaged item: "<qty> <pkg> (<weight>)" or just "<qty> <pkg>" if AI omitted weight.
    const qty = pkgMatch[1];
    const qualifier = pkgMatch[2].toLowerCase();
    serving = weightMatch
      ? `${qty} ${qualifier} (${weightMatch[1]}${weightMatch[2].toLowerCase()})`
      : `${qty} ${qualifier}`;
  } else if (weightMatch) {
    // Generic item with measurable weight — drop any measurement qualifier (cup/tbsp/slice).
    serving = `${weightMatch[1]}${weightMatch[2].toLowerCase()}`;
  } else if (measMatch) {
    // Measurement qualifier only (no weight) — shouldn't happen per AI contract; record as-is.
    serving = `${measMatch[1]} ${measMatch[2].toLowerCase()}`;
  } else {
    serving = '';
  }

  // Item name — strip every matched token + connector noise.
  let itemName = clean;
  if (pkgMatch) itemName = itemName.replace(pkgMatch[0], ' ');
  if (measMatch) itemName = itemName.replace(measMatch[0], ' ');
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
      btn.textContent = 'Saved item';
      btn.disabled = true;
    }
    return;
  }
  const userCount = lib.filter((entry) => !isHostLibraryEntry(entry)).length;
  if (userCount >= MAX_LIBRARY_ITEMS) {
    if (btn) {
      btn.textContent = 'Max 30 items';
      btn.disabled = true;
    }
    alert('Custom Food is limited to 30 items. Delete one in UserLibrary before adding another.');
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

function selectedDate() {
  return selectedDailyDate || todayISO();
}

function dayMeals(day) {
  if (day && Array.isArray(day.meals)) {
    return day.meals.map((m) => ({
      id: m.id || uid(),
      name: String(m.name || 'Meal'),
      loggedAt: m.loggedAt || '',
      items: Array.isArray(m.items) ? m.items : [],
    }));
  }
  const meals = [];
  MEAL_SLOTS.forEach((slot) => {
    const items = (day && day[slot] && Array.isArray(day[slot].items)) ? day[slot].items : [];
    if (items.length) {
      meals.push({ id: `legacy-${slot}`, name: MEAL_LABELS[slot], loggedAt: '', items });
    }
  });
  return meals;
}

function mealNameFromInput(day, input) {
  const text = String(input || '').toLowerCase();
  const hinted = MEAL_HINTS.find(([word]) => {
    const pattern = new RegExp(`(^|\\W)${word.replace(' ', '\\s+')}($|\\W)`, 'i');
    return pattern.test(text);
  });
  if (hinted) return hinted[1];
  const maxMeal = dayMeals(day).reduce((max, meal) => {
    const m = String(meal.name || '').match(/^Meal\s+(\d+)$/i);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `Meal ${maxMeal + 1}`;
}

function rowsToItems(rows) {
  return rows
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
}

function logItemsAsMeal(items, sourceInput = '') {
  if (!items.length) return;

  const date = selectedDate();
  const all = loadDaily();
  if (!all[date]) all[date] = blankDay();
  const day = all[date];
  const meals = dayMeals(day);
  const name = mealNameFromInput(day, sourceInput);
  const newMeal = {
    id: uid(),
    name,
    loggedAt: new Date().toISOString(),
    items,
  };
  meals.unshift(newMeal);
  day.meals = meals;
  saveDaily(all);

  renderDaily();
  els.input.value = '';
  clearFoodImages();
  showValidation(null);
  clearPreviewState();
  return { count: items.length, name, kcal: sumItems(items).kcal };
}

function logParsedMeal(parsed, sourceInput = '') {
  const rows = withComputedTotal((parsed.rows || []).filter((r) => r && r.item != null));
  const logged = logItemsAsMeal(rowsToItems(rows), sourceInput);
  return logged || { count: 0, name: 'Meal', kcal: 0 };
}

function logMeal() {
  if (!lastPreview || !lastPreview.rows.length) {
    setStatus('Nothing to log — Send a meal description first.', 'error');
    return;
  }

  const logged = logItemsAsMeal(rowsToItems(lastPreview.rows), lastPreview.sourceInput || els.input.value.trim());
  if (!logged) return;
  setStatus(`Logged ${logged.name} with ${fmtNum(logged.kcal, 0)} kcal. ${ICON_LEAF}`, 'info');
}

function blankDay() {
  return { meals: [] };
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

function saveMealsForDate(date, meals) {
  const all = loadDaily();
  const day = getDay(all, date);
  day.meals = meals;
  all[date] = day;
  saveDaily(all);
  renderDaily();
}

function stomachMealKey(date, meal, mealIdx) {
  return `stomach:${date}:${meal?.id || mealIdx}`;
}

function removeDailyItem(date, mealIndex, itemIndex) {
  const all = loadDaily();
  const day = getDay(all, date);
  const meals = dayMeals(day);
  const meal = meals[mealIndex];
  if (!meal) return;
  if (itemIndex == null) {
    meals.splice(mealIndex, 1);
  } else {
    meal.items = Array.isArray(meal.items) ? [...meal.items] : [];
    meal.items.splice(itemIndex, 1);
    if (!meal.items.length) meals.splice(mealIndex, 1);
  }
  saveMealsForDate(date, meals);
}

function dailyProgress(total, target) {
  if (!target || !target.kcal) return 0;
  return Math.max(0, Math.min(100, (total.kcal / target.kcal) * 100));
}

function metricValueForTarget(target, key) {
  if (!target) return null;
  if (key === 'su') return target.sugarMax;
  if (key === 'fb') return target.fiberMin;
  return target[key];
}

function renderMetricChip(label, key, total, target) {
  const targetValue = metricValueForTarget(target, key);
  const short = { Protein: 'P', Fat: 'F', Carb: 'C', Sugar: 'Su', Fiber: 'Fb' }[label] || label;
  if (targetValue == null) {
    return `${short} ${key === 'kcal' ? fmtNum(total[key], 0) : fmtNum(total[key], 0)}`;
  } else if (key === 'su') {
    return `${short} ${fmtNum(total[key], 0)}/<${fmtNum(targetValue, 0)}`;
  } else if (key === 'fb') {
    return `${short} ${fmtNum(total[key], 0)}/> ${fmtNum(targetValue, 0)}`.replace('> ', '>');
  }
  return `${short} ${fmtNum(total[key], 0)}/${fmtNum(targetValue, 0)}`;
}

function targetModeShort(mode) {
  return { normal: 'N', high: 'H', diet: 'D', custom: 'C', none: '-' }[mode] || 'N';
}

function renderNutritionBoard(total, target) {
  if (!els.nutritionBoard) return;
  const remain = target ? target.kcal - total.kcal : null;
  const progress = dailyProgress(total, target);
  els.nutritionBoard.innerHTML = '';

  const hero = document.createElement('article');
  hero.className = 'fl-kcal-hero';
  if (els.dailyTargetMode) {
    const targetPicker = document.createElement('label');
    targetPicker.className = 'fl-kcal-target-picker';
    const display = document.createElement('span');
    display.className = 'fl-kcal-target-display';
    display.textContent = `${ICON_DART} ${targetModeShort(els.dailyTargetMode.value)}`;
    targetPicker.appendChild(els.dailyTargetMode);
    targetPicker.appendChild(display);
    hero.appendChild(targetPicker);
  }
  const eyebrow = document.createElement('span');
  eyebrow.className = 'fl-kcal-eyebrow';
  eyebrow.textContent = 'KCAL GOAL';
  const value = document.createElement('strong');
  value.textContent = target ? `${fmtNum(total.kcal, 0)} / ${fmtNum(target.kcal, 0)}` : fmtNum(total.kcal, 0);
  const remainEl = document.createElement('span');
  remainEl.className = 'fl-kcal-remain';
  remainEl.textContent = target
    ? (remain >= 0 ? `${fmtNum(remain, 0)} left` : `${fmtNum(Math.abs(remain), 0)} over`)
    : 'Set a target to track remain';
  const bar = document.createElement('div');
  bar.className = 'fl-kcal-bar';
  const fill = document.createElement('span');
  fill.style.width = `${progress}%`;
  fill.className = target && total.kcal > target.kcal ? 'fl-over' : '';
  bar.appendChild(fill);

  const macros = document.createElement('p');
  macros.className = 'fl-macro-line';
  macros.textContent = [
    ['Protein', 'p'],
    ['Fat', 'f'],
    ['Carb', 'c'],
    ['Sugar', 'su'],
    ['Fiber', 'fb'],
  ].map(([label, key]) => renderMetricChip(label, key, total, target)).join(' · ');

  hero.append(eyebrow, value, remainEl, bar, macros);
  els.nutritionBoard.append(hero);
}

function renderStomach(date, meals) {
  const totalItems = meals.reduce((sum, meal) => sum + (Array.isArray(meal.items) ? meal.items.length : 0), 0);
  const open = expandedMeals.has('stomach');
  const card = document.createElement('article');
  card.className = 'fl-stomach-card' + (open ? ' fl-expanded' : '');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fl-stomach-toggle';
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  const name = document.createElement('span');
  name.textContent = 'KOALA STOMACH';
  const count = document.createElement('small');
  count.textContent = `${meals.length} meal${meals.length === 1 ? '' : 's'} · ${totalItems} item${totalItems === 1 ? '' : 's'}`;
  button.append(name, count);
  button.addEventListener('click', () => {
    if (expandedMeals.has('stomach')) expandedMeals.delete('stomach');
    else expandedMeals.add('stomach');
    renderDaily();
  });
  card.appendChild(button);

  if (!open) return card;

  const body = document.createElement('div');
  body.className = 'fl-stomach-body';
  if (!meals.length) {
    const empty = document.createElement('p');
    empty.className = 'fl-empty';
    empty.textContent = 'No meals logged yet.';
    body.appendChild(empty);
  }
  meals.forEach((meal, mealIdx) => {
    const subtotal = sumItems(meal.items || []);
    const mealKey = stomachMealKey(date, meal, mealIdx);
    const mealOpen = expandedMeals.has(mealKey);
    const mealRow = document.createElement('div');
    mealRow.className = 'fl-stomach-row fl-stomach-meal-row' + (mealOpen ? ' fl-expanded' : '');
    const mealToggle = document.createElement('button');
    mealToggle.type = 'button';
    mealToggle.className = 'fl-stomach-meal-toggle';
    mealToggle.setAttribute('aria-expanded', mealOpen ? 'true' : 'false');
    const title = document.createElement('strong');
    title.textContent = meal.name || `Meal ${mealIdx + 1}`;
    const meta = document.createElement('span');
    meta.textContent = `${fmtNum(subtotal.kcal, 0)} kcal · ${(meal.items || []).length} item${(meal.items || []).length === 1 ? '' : 's'}`;
    mealToggle.append(title, meta);
    mealToggle.addEventListener('click', () => {
      if (expandedMeals.has(mealKey)) expandedMeals.delete(mealKey);
      else expandedMeals.add(mealKey);
      renderDaily();
    });
    const delMeal = document.createElement('button');
    delMeal.type = 'button';
    delMeal.className = 'fl-row-del-btn';
    delMeal.textContent = '×';
    delMeal.title = 'Remove meal';
    delMeal.addEventListener('click', () => removeDailyItem(date, mealIdx, null));
    mealRow.append(mealToggle, delMeal);
    body.appendChild(mealRow);

    if (!mealOpen) return;

    (meal.items || []).forEach((it, itemIdx) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'fl-stomach-row fl-stomach-item-row';
      const itemMain = document.createElement('div');
      const itemTitle = document.createElement('strong');
      itemTitle.textContent = String(it.item ?? '');
      const itemMeta = document.createElement('span');
      itemMeta.textContent = `P ${fmtNum(it.p, 1)} · F ${fmtNum(it.f, 1)} · C ${fmtNum(it.c, 1)} · Su ${fmtNum(it.su, 1)} · Fb ${fmtNum(it.fb, 1)}`;
      itemMain.append(itemTitle, itemMeta);
      const side = document.createElement('div');
      side.className = 'fl-stomach-item-side';
      const cal = document.createElement('span');
      cal.textContent = `${fmtNum(it.kcal, 0)} kcal`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'fl-row-del-btn';
      del.textContent = '×';
      del.title = 'Remove item';
      del.addEventListener('click', () => removeDailyItem(date, mealIdx, itemIdx));
      side.append(cal, del);
      itemRow.append(itemMain, side);
      body.appendChild(itemRow);
    });
  });
  card.appendChild(body);
  return card;
}

function renderDaily() {
  const date = selectedDate();
  renderDailyDateOptions();

  const all = loadDaily();

  // Sync target mode dropdown with stored mode for this date
  if (els.dailyTargetMode) {
    const storedMode = (all[date] && all[date].targetMode) || 'normal';
    els.dailyTargetMode.value = storedMode;
  }

  const day = getDay(all, date);
  // Day total accumulator
  const dayTotal = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };
  const meals = dayMeals(day);

  meals.forEach((meal) => {
    const subtotal = sumItems(meal.items || []);
    NUMERIC_COLS.forEach((k) => { dayTotal[k] += subtotal[k]; });
  });

  const target = targetForDate(date);
  renderNutritionBoard(dayTotal, target);

  const stack = els.dailyTable;
  stack.innerHTML = '';
  stack.appendChild(renderStomach(date, meals));

  // Auto-sync today's totals → Food History
  const hasAny = NUMERIC_COLS.some((k) => dayTotal[k] > 0);
  if (hasAny) {
    const targetObj = targetForDate(date);
    const entry = {
      date,
      target: targetObj ? targetObj.kcal : null,
      kcal: dayTotal.kcal, p: dayTotal.p, f: dayTotal.f, c: dayTotal.c, su: dayTotal.su, fb: dayTotal.fb,
      savedAt: new Date().toISOString(),
    };
    const hist = loadHistory();
    const idx = hist.findIndex((h) => h.date === date);
    if (idx >= 0) hist[idx] = entry; else hist.push(entry);
    hist.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    saveHistory(hist);
    renderHistory();
  } else {
    const hist = loadHistory();
    if (hist.some((h) => h.date === date)) {
      saveHistory(hist.filter((h) => h.date !== date));
      renderHistory();
    }
  }
}

els.clearDayBtn.addEventListener('click', () => {
  const date = selectedDate();
  if (!confirm(`Reset FoodLog for ${date}? Items already logged will be removed.`)) return;
  const all = loadDaily();
  delete all[date];
  saveDaily(all);
  const hist = loadHistory().filter((h) => h.date !== date);
  saveHistory(hist);
  renderDaily();
  renderHistory();
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
      name: (els.gymCustomName.value || '').trim(),
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

function suggestedGymRows(kind, name = '') {
  if (kind === 'cardio') return [{ speed: '6', incline: '0', time: '20' }];
  const lower = String(name).toLowerCase();
  const kg = /leg press|squat|deadlift|hip thrust/.test(lower) ? '40'
    : /bench|row|pulldown|press/.test(lower) ? '20'
      : /curl|raise|extension|fly/.test(lower) ? '8'
        : '10';
  return [{ kg, rep: '10' }, { kg, rep: '10' }, { kg, rep: '10' }];
}

function defaultGymRows(kind, rows = [], name = '') {
  const normalized = normalizeGymRows(Array.isArray(rows) ? rows : [], kind);
  if (!normalized.length) return suggestedGymRows(kind, name);
  return normalized;
}

function gymActivityByName(name) {
  const clean = String(name || '').trim();
  const custom = loadGymCustoms().find((a) => a.name === clean);
  if (custom) return { group: 'Custom', kind: custom.kind, name: custom.name, custom: true };
  return GYM_ACTIVITIES.find((a) => a.name === clean) || null;
}

function gymActivityOptions() {
  return [
    { group: 'Custom', kind: 'custom-weight', name: CUSTOM_WEIGHT_LABEL, customMode: 'weight' },
    { group: 'Custom', kind: 'custom-cardio', name: CUSTOM_CARDIO_LABEL, customMode: 'cardio' },
    ...loadGymCustoms().map((a) => ({ group: 'Custom', kind: a.kind, name: a.name, custom: true })),
    ...GYM_ACTIVITIES,
  ];
}

function ensureGymActivityDatalist() {
  let list = document.getElementById(GYM_ACTIVITY_DATALIST_ID);
  if (!list) {
    list = document.createElement('datalist');
    list.id = GYM_ACTIVITY_DATALIST_ID;
    document.body.appendChild(list);
  }
  list.innerHTML = '';
  gymActivityOptions().forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.name;
    opt.label = a.group === 'Custom' ? `Custom · ${a.kind === 'cardio' || a.customMode === 'cardio' ? 'cardio' : 'weight'}` : a.group;
    list.appendChild(opt);
  });
  return list;
}

function parseGymActivityInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const customPrefixes = [
    { label: CUSTOM_WEIGHT_LABEL, kind: 'weight' },
    { label: CUSTOM_CARDIO_LABEL, kind: 'cardio' },
  ];
  for (const item of customPrefixes) {
    if (raw === item.label) return { customMode: item.kind, name: '' };
    const prefix = `${item.label}:`;
    if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
      return { customMode: item.kind, name: raw.slice(prefix.length).trim() };
    }
  }
  return gymActivityByName(raw);
}

function resolveGymActivityInput(value) {
  const parsed = parseGymActivityInput(value);
  if (!parsed) return null;
  if (parsed.customMode) {
    let name = parsed.name;
    if (!name) name = window.prompt('Custom exercise name') || '';
    const saved = saveGymCustomActivity(parsed.customMode, name);
    if (saved) ensureGymActivityDatalist();
    return saved;
  }
  return parsed;
}

function touchGymDay(day) {
  day.savedAt = new Date().toISOString();
  return day;
}

function normalizeGymRows(rows, kind) {
  return rows.map((r) => kind === 'cardio'
    ? { speed: String(r.speed ?? ''), incline: String(r.incline ?? ''), time: String(r.time ?? '') }
    : { kg: String(r.kg ?? ''), rep: String(r.rep ?? '') });
}

function gymDay(all, date) {
  const day = all[date];
  if (day && Array.isArray(day.activities)) return day;
  return { activities: [], note: '' };
}

function cloneGymLog(log) {
  return JSON.parse(JSON.stringify(log || {}));
}

function gymLogSignature(log) {
  return JSON.stringify(log || {});
}

function gymDraftData() {
  if (!gymDraftAll) gymDraftAll = cloneGymLog(loadGym());
  return gymDraftAll;
}

function resetGymDraft() {
  gymDraftAll = cloneGymLog(loadGym());
  gymDirtyDates = new Set();
}

function gymHasUnsavedChanges() {
  return !!gymDraftAll && gymLogSignature(gymDraftAll) !== gymLogSignature(loadGym());
}

function markGymDraftChanged(date = selectedGymDate) {
  if (date) gymDirtyDates.add(date);
  renderGymSavedTime(gymDay(gymDraftData(), selectedGymDate));
}

function saveGymDraft(lockAfter = false) {
  const all = gymDraftData();
  const dates = new Set(gymDirtyDates);
  if (lockAfter) dates.add(selectedGymDate);
  if (!dates.size && gymHasUnsavedChanges()) dates.add(selectedGymDate);
  dates.forEach((date) => {
    const day = gymDay(all, date);
    if (isGymDayEmpty(day)) {
      delete all[date];
    } else {
      all[date] = touchGymDay(day);
    }
  });
  saveGym(cloneGymLog(all));
  resetGymDraft();
  gymLocked = !!lockAfter;
  showGymValidation(null);
  renderGym();
}

function isGymDayEmpty(day) {
  const noActs = !day || !Array.isArray(day.activities) || !day.activities.some((a) => String(a?.name || '').trim());
  const noNote = !day || !day.note || !String(day.note).trim();
  return noActs && noNote;
}

function setGymNote(date, text) {
  const all = gymDraftData();
  const day = gymDay(all, date);
  day.note = String(text || '');
  if (isGymDayEmpty(day)) {
    delete all[date];
  } else {
    all[date] = day;
  }
  markGymDraftChanged(date);
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
  els.gymActivity.innerHTML = '<option value="" disabled selected>Add exercise...</option>';

  // 1) Custom always first
  const custom = document.createElement('optgroup');
  custom.label = 'Custom';
  [
    ['custom-weight:', CUSTOM_WEIGHT_LABEL],
    ['custom-cardio:', CUSTOM_CARDIO_LABEL],
  ].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    custom.appendChild(opt);
  });
  loadGymCustoms().forEach((a) => {
    const opt = document.createElement('option');
    opt.value = `${a.kind}:${a.name}`;
    opt.textContent = a.name;
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

function renderGymPresetOptions() {
  const favs = loadGymFavs();
  if (els.gymPreset) {
    els.gymPreset.innerHTML = '<option value="">Load Preset</option>';
    favs.forEach((fav) => {
      const opt = document.createElement('option');
      opt.value = fav.id;
      opt.textContent = fav.name;
      els.gymPreset.appendChild(opt);
    });
  }
  if (els.gymFavOptions) {
    els.gymFavOptions.innerHTML = '';
    favs.forEach((fav) => {
      const opt = document.createElement('option');
      opt.value = fav.name || '';
      els.gymFavOptions.appendChild(opt);
    });
  }
}

function addActivity() {
  if (gymLocked) return;
  showGymValidation(null);
  const activity = selectedGymActivity();
  if (!activity.kind) {
    showGymValidation('Choose an activity first.');
    return;
  }
  if (activity.custom && !activity.name) {
    showGymValidation('Type a custom activity name first.');
    return;
  }
  if (activity.custom) saveGymCustomActivity(activity.kind, activity.name);
  const date = selectedGymDate || todayISO();
  const all = gymDraftData();
  const day = gymDay(all, date);
  day.activities = day.activities || [];
  day.activities.push({
    id: uid(),
    name: activity.name || '',
    kind: activity.kind,
    rows: suggestedGymRows(activity.kind, activity.name),
  });
  all[date] = day;
  markGymDraftChanged(date);
  if (activity.custom) {
    els.gymCustomName.value = '';
    renderGymActivityOptions();
    ensureGymActivityDatalist();
  }
  renderGym();
}

function updateSetValue(activityIdx, setIdx, key, value) {
  if (gymLocked) return;
  const date = selectedGymDate;
  const all = gymDraftData();
  const day = gymDay(all, date);
  const a = day.activities[activityIdx];
  if (!a) return;
  if (!a.rows[setIdx]) a.rows[setIdx] = {};
  a.rows[setIdx][key] = String(value);
  all[date] = day;
  markGymDraftChanged(date);
}

function insertSetBelow(activityIdx, setIdx) {
  if (gymLocked) return;
  const date = selectedGymDate;
  const all = gymDraftData();
  const day = gymDay(all, date);
  const a = day.activities[activityIdx];
  if (!a) return;
  a.rows = defaultGymRows(a.kind, a.rows, a.name);
  const seed = a.rows[setIdx] || blankGymRow(a.kind);
  a.rows.splice(setIdx + 1, 0, { ...seed });
  all[date] = day;
  markGymDraftChanged(date);
  renderGym();
}

function removeSet(activityIdx, setIdx) {
  if (gymLocked) return;
  const date = selectedGymDate;
  const all = gymDraftData();
  const day = gymDay(all, date);
  const a = day.activities[activityIdx];
  if (!a) return;
  a.rows = defaultGymRows(a.kind, a.rows, a.name);
  a.rows.splice(setIdx, 1);
  if (a.rows.length === 0) {
    // Last set removed — drop the activity itself.
    day.activities.splice(activityIdx, 1);
  }
  if (isGymDayEmpty(day)) delete all[date]; else all[date] = day;
  markGymDraftChanged(date);
  renderGym();
}

function toggleGymLock() {
  if (gymLocked) {
    gymLocked = false;
    renderGym();
    return;
  }
  saveGymDraft(true);
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

function buildGymNoteField(initialText, onChange, locked) {
  const wrap = document.createElement('div');
  wrap.className = 'fl-gym-note';

  const heading = document.createElement('h3');
  heading.className = 'fl-gym-section-heading';
  heading.textContent = 'KOALA NOTE';
  wrap.appendChild(heading);

  const textarea = document.createElement('textarea');
  textarea.className = 'fl-gym-note-input';
  textarea.rows = 3;
  textarea.placeholder = 'How was today? 💪';
  textarea.value = initialText || '';
  if (locked) textarea.readOnly = true;

  if (!locked) {
    // Debounced save on input + immediate save on blur.
    let saveTimer = null;
    const flush = () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      onChange(textarea.value);
    };
    textarea.addEventListener('input', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => onChange(textarea.value), 500);
    });
    textarea.addEventListener('blur', flush);
  }

  wrap.appendChild(textarea);
  return wrap;
}

function formatGymSavedTime(iso) {
  if (!iso) return 'Not saved yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not saved yet';
  return `Logged ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderGymSavedTime(day) {
  if (!els.gymSavedTime) return;
  els.gymSavedTime.textContent = gymHasUnsavedChanges() ? 'Unsaved changes' : formatGymSavedTime(day?.savedAt);
}

function gymDaySummary(day) {
  const activities = Array.isArray(day?.activities) ? day.activities : [];
  const named = activities.filter((a) => String(a?.name || '').trim());
  const rows = named.reduce((sum, a) => sum + (Array.isArray(a.rows) ? a.rows.length : 0), 0);
  const weightKg = named.reduce((sum, a) => {
    if (a.kind === 'cardio') return sum;
    return sum + (Array.isArray(a.rows) ? a.rows.reduce((s, r) => s + num(r.kg), 0) : 0);
  }, 0);
  const weightReps = named.reduce((sum, a) => {
    if (a.kind === 'cardio') return sum;
    return sum + (Array.isArray(a.rows) ? a.rows.reduce((s, r) => s + num(r.rep), 0) : 0);
  }, 0);
  const cardioMin = named.reduce((sum, a) => {
    if (a.kind !== 'cardio') return sum;
    return sum + (Array.isArray(a.rows) ? a.rows.reduce((s, r) => s + num(r.time), 0) : 0);
  }, 0);
  return {
    activities: named.length,
    rows,
    weightKg,
    weightReps,
    cardioMin,
    hasNote: !!String(day?.note || '').trim(),
  };
}

function cloneGymActivities(activities) {
  return (activities || []).map((a) => ({
    id: uid(),
    name: a.name || '',
    kind: a.kind === 'cardio' ? 'cardio' : 'weight',
    rows: defaultGymRows(a.kind === 'cardio' ? 'cardio' : 'weight', a.rows, a.name),
  }));
}

function saveCurrentGymAsFavourite() {
  const name = String(els.gymFavName?.value || '').trim().slice(0, 15);
  if (!name) { showGymValidation('Name preset first.'); return; }
  const day = gymDay(gymDraftData(), selectedGymDate);
  const activities = (day.activities || []).filter((a) => String(a?.name || '').trim());
  if (!activities.length) { showGymValidation('Add a workout before saving preset.'); return; }
  const current = loadGymFavs();
  const existing = current.find((f) => String(f.name || '').toLowerCase() === name.toLowerCase());
  const favs = current.filter((f) => String(f.name || '').toLowerCase() !== name.toLowerCase());
  favs.unshift({
    id: existing?.id || uid(),
    name,
    activities: cloneGymActivities(activities),
    savedAt: new Date().toISOString(),
  });
  if (!existing && favs.length > 5) {
    showGymValidation('Max 5 presets. Delete one in UserLibrary first.');
    return;
  }
  saveGymFavs(favs.slice(0, 5));
  if (els.gymFavName) els.gymFavName.value = '';
  showGymValidation(null);
  renderGymPresetOptions();
  renderLibrary();
}

function applyGymFavourite(favId) {
  if (gymLocked) return;
  const fav = loadGymFavs().find((f) => f.id === favId);
  if (!fav) return;
  const all = gymDraftData();
  const day = gymDay(all, selectedGymDate);
  day.activities = cloneGymActivities(fav.activities);
  all[selectedGymDate] = day;
  markGymDraftChanged(selectedGymDate);
  renderGym();
}

function deleteGymFavourite(favId) {
  saveGymFavs(loadGymFavs().filter((f) => f.id !== favId));
  renderGymPresetOptions();
  renderLibrary();
}

function updateGymFavourite(favId, updater, rerender = true) {
  const next = loadGymFavs().map((fav) => {
    if (fav.id !== favId) return fav;
    const draft = { ...fav, activities: cloneGymActivities(fav.activities || []) };
    updater(draft);
    draft.activities = (draft.activities || []).filter((a) => String(a?.name || '').trim());
    draft.savedAt = new Date().toISOString();
    return draft;
  });
  saveGymFavs(next);
  if (rerender) {
    renderGymPresetOptions();
    renderGymFavLibrary();
  }
}

function setGymFavActivityAt(favId, activityIdx, name) {
  const preset = resolveGymActivityInput(name);
  if (!preset) return;
  updateGymFavourite(favId, (fav) => {
    fav.activities = Array.isArray(fav.activities) ? fav.activities : [];
    const current = fav.activities[activityIdx];
    fav.activities[activityIdx] = {
      id: current?.id || uid(),
      name: preset.name,
      kind: preset.kind,
      rows: defaultGymRows(preset.kind, preset.kind === current?.kind ? current.rows : [], preset.name),
    };
  });
}

function updateGymFavMetric(favId, activityIdx, setIdx, key, value) {
  updateGymFavourite(favId, (fav) => {
    const a = fav.activities?.[activityIdx];
    if (!a) return;
    a.rows = defaultGymRows(a.kind, a.rows, a.name);
    if (!a.rows[setIdx]) a.rows[setIdx] = blankGymRow(a.kind);
    a.rows[setIdx][key] = String(value);
  }, false);
}

function insertGymFavSet(favId, activityIdx, setIdx) {
  updateGymFavourite(favId, (fav) => {
    const a = fav.activities?.[activityIdx];
    if (!a) return;
    a.rows = defaultGymRows(a.kind, a.rows, a.name);
    const seed = a.rows[setIdx] || blankGymRow(a.kind);
    a.rows.splice(setIdx + 1, 0, { ...seed });
  });
}

function removeGymFavSet(favId, activityIdx, setIdx) {
  updateGymFavourite(favId, (fav) => {
    const a = fav.activities?.[activityIdx];
    if (!a) return;
    a.rows = defaultGymRows(a.kind, a.rows, a.name);
    a.rows.splice(setIdx, 1);
    if (!a.rows.length) fav.activities.splice(activityIdx, 1);
  });
}

function removeGymFavActivity(favId, activityIdx) {
  updateGymFavourite(favId, (fav) => {
    fav.activities = (fav.activities || []).filter((_, idx) => idx !== activityIdx);
  });
}

function gymOptionSelect(selectedName, rowIdx, locked, onChange = setGymActivityAt) {
  const select = document.createElement('select');
  select.className = 'fl-gym-row-activity';
  select.disabled = locked;

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Add exercise';
  select.appendChild(empty);

  const appendGroup = (label, options) => {
    if (!options.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    options.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.customMode ? a.name : a.name;
      opt.textContent = a.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  };

  const customOptions = [
    { name: CUSTOM_WEIGHT_LABEL, customMode: 'weight' },
    { name: CUSTOM_CARDIO_LABEL, customMode: 'cardio' },
    ...loadGymCustoms(),
  ];
  appendGroup('Custom', customOptions);
  const hasSelectedOption = !selectedName
    || customOptions.some((a) => a.name === selectedName)
    || GYM_ACTIVITIES.some((a) => a.name === selectedName);
  if (!hasSelectedOption) appendGroup('Current', [{ name: selectedName }]);
  ['Push Upper', 'Push Lower', 'Pull Upper', 'Pull Lower', 'Cardio'].forEach((group) => {
    appendGroup(group, GYM_ACTIVITIES.filter((a) => a.group === group));
  });

  select.value = selectedName || '';
  select.addEventListener('change', () => {
    if (select.value) onChange(rowIdx, select.value);
  });
  return select;
}

function setGymActivityAt(activityIdx, name) {
  if (gymLocked || !name) return;
  const all = gymDraftData();
  const day = gymDay(all, selectedGymDate);
  day.activities = Array.isArray(day.activities) ? day.activities : [];
  const current = day.activities[activityIdx];
  let preset = resolveGymActivityInput(name);
  if (!preset && current?.name === name && current.kind) {
    preset = { name: current.name, kind: current.kind };
  }
  if (!preset) {
    showGymValidation('Choose an exercise from the list, or use Custom weight training: name / Custom cardio: name.');
    renderGym();
    return;
  }
  showGymValidation(null);
  day.activities[activityIdx] = {
    id: current?.id || uid(),
    name: preset.name,
    kind: preset.kind,
    rows: defaultGymRows(preset.kind, preset.kind === current?.kind ? current.rows : [], preset.name),
  };
  all[selectedGymDate] = day;
  markGymDraftChanged(selectedGymDate);
  renderGymActivityOptions();
  ensureGymActivityDatalist();
  renderGym();
}

function updateGymActivityMetric(activityIdx, setIdx, key, value) {
  if (gymLocked) return;
  const all = gymDraftData();
  const day = gymDay(all, selectedGymDate);
  const a = day.activities?.[activityIdx];
  if (!a) return;
  a.rows = defaultGymRows(a.kind, a.rows, a.name);
  if (!a.rows[setIdx]) a.rows[setIdx] = blankGymRow(a.kind);
  a.rows[setIdx][key] = String(value);
  all[selectedGymDate] = day;
  markGymDraftChanged(selectedGymDate);
}

function removeGymActivity(activityIdx) {
  if (gymLocked) return;
  const all = gymDraftData();
  const day = gymDay(all, selectedGymDate);
  day.activities = (day.activities || []).filter((_, idx) => idx !== activityIdx);
  if (isGymDayEmpty(day)) delete all[selectedGymDate]; else all[selectedGymDate] = day;
  markGymDraftChanged(selectedGymDate);
  renderGym();
}

function weightSetEditor(a, activityIdx, setIdx, locked) {
  const row = defaultGymRows(a.kind, a.rows, a.name)[setIdx] || blankGymRow('weight');
  const wrap = document.createElement('span');
  wrap.className = 'fl-gym-set-pair';
  if (locked) {
    wrap.textContent = `${row.kg || '—'} kg x ${row.rep || '—'}`;
    return wrap;
  }
  [['kg', 'kg', '0.1'], ['rep', 'rep', '1']].forEach(([key, label, step]) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.min = '0';
    input.step = step;
    input.placeholder = label;
    input.value = row[key] || '';
    input.addEventListener('input', () => updateGymActivityMetric(activityIdx, setIdx, key, input.value));
    wrap.appendChild(input);
  });
  return wrap;
}

function cardioMetricEditor(a, activityIdx, setIdx, metricIdx, locked) {
  const fields = [['speed', 'speed', '0.1'], ['incline', 'incline', '0.1'], ['time', 'min', '1']];
  const [key, label, step] = fields[metricIdx];
  const row = defaultGymRows(a.kind, a.rows, a.name)[setIdx] || blankGymRow('cardio');
  if (locked) {
    const span = document.createElement('span');
    span.textContent = row[key] || '—';
    return span;
  }
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.min = '0';
  input.step = step;
  input.placeholder = label;
  input.value = row[key] || '';
  input.addEventListener('input', () => updateGymActivityMetric(activityIdx, setIdx, key, input.value));
  return input;
}

function gymActionButton(label, title, onClick, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `fl-gym-mini-action ${extraClass}`.trim();
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function gymMetricInput(value, key, onChange) {
  const input = document.createElement('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.min = '0';
  input.step = key === 'kg' || key === 'speed' || key === 'incline' ? '0.1' : '1';
  input.placeholder = key === 'time' ? 'min' : key;
  input.value = value || '';
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function renderGymSection(container, activities, opts = {}) {
  container.innerHTML = '';
  const list = Array.isArray(activities) ? activities : [];
  const locked = !!opts.locked;
  const onActivityChange = opts.onActivityChange || setGymActivityAt;
  const onMetricChange = opts.onMetricChange || updateGymActivityMetric;
  const onInsertSet = opts.onInsertSet || insertSetBelow;
  const onRemoveSet = opts.onRemoveSet || removeSet;
  const onRemoveActivity = opts.onRemoveActivity || removeGymActivity;
  const table = document.createElement('table');
  table.className = 'fl-gym-koala-table';
  const colgroup = document.createElement('colgroup');
  ['fl-gym-activity-col', 'fl-gym-metric-col', 'fl-gym-metric-col', 'fl-gym-metric-col', 'fl-gym-actions-width-col'].forEach((className) => {
    const col = document.createElement('col');
    col.className = className;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  [
    ['Exercise'],
    ['Set', 'Speed'],
    ['Kg', 'Incline'],
    ['Rep', 'Min'],
    [''],
  ].forEach((parts) => {
    const th = document.createElement('th');
    if (parts.length === 1) {
      th.textContent = parts[0];
    } else {
      parts.forEach((part, idx) => {
        if (idx) th.appendChild(document.createElement('br'));
        th.appendChild(document.createTextNode(part));
      });
    }
    head.appendChild(th);
  });
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const rows = opts.showDraft === false ? list : [...list, null];
  rows.forEach((a, activityIdx) => {
    if (locked && !a) return;
    const sets = a ? defaultGymRows(a.kind, a.rows, a.name) : [null];
    sets.forEach((setRow, setIdx) => {
      const tr = document.createElement('tr');
      if (!a) tr.className = 'fl-gym-draft-row';
      if (setIdx === 0) {
        const tdActivity = document.createElement('td');
        tdActivity.className = 'fl-gym-activity-merged';
        tdActivity.rowSpan = sets.length;
        const activityBox = document.createElement('div');
        activityBox.className = 'fl-gym-activity-box';
        const select = gymOptionSelect(a?.name || '', activityIdx, locked, onActivityChange);
        activityBox.appendChild(select);
        if (a && !locked) {
          activityBox.appendChild(gymActionButton('×', 'Remove activity', () => onRemoveActivity(activityIdx), 'fl-gym-activity-delete'));
        } else {
          const removeSpacer = document.createElement('span');
          removeSpacer.className = 'fl-gym-activity-action-spacer';
          removeSpacer.setAttribute('aria-hidden', 'true');
          activityBox.appendChild(removeSpacer);
        }
        tdActivity.appendChild(activityBox);
        tr.appendChild(tdActivity);
      }
      const td = document.createElement('td');
      td.className = 'fl-gym-actions-col';
      if (a) {
        if (a.kind === 'cardio') {
          ['speed', 'incline', 'time'].forEach((key) => {
            const tdMetric = document.createElement('td');
            tdMetric.className = 'fl-gym-metric-cell';
            if (locked) {
              tdMetric.textContent = setRow[key] || '—';
            } else {
              tdMetric.appendChild(gymMetricInput(setRow[key], key, (value) => onMetricChange(activityIdx, setIdx, key, value)));
            }
            tr.appendChild(tdMetric);
          });
        } else {
          const tdSet = document.createElement('td');
          tdSet.className = 'fl-gym-set-label';
          tdSet.textContent = `Set ${setIdx + 1}`;
          tr.appendChild(tdSet);
          ['kg', 'rep'].forEach((key) => {
            const tdMetric = document.createElement('td');
            tdMetric.className = 'fl-gym-metric-cell';
            if (locked) {
              tdMetric.textContent = setRow[key] || '—';
            } else {
              tdMetric.appendChild(gymMetricInput(setRow[key], key, (value) => onMetricChange(activityIdx, setIdx, key, value)));
            }
            tr.appendChild(tdMetric);
          });
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const tdMetric = document.createElement('td');
          tdMetric.textContent = '—';
          tr.appendChild(tdMetric);
        }
      }
      if (a && !locked) {
        td.append(
          gymActionButton('+', 'Add set row', () => onInsertSet(activityIdx, setIdx)),
          gymActionButton('×', 'Delete set row', () => onRemoveSet(activityIdx, setIdx), 'fl-gym-set-delete'),
        );
      }
      if (!a && !locked) {
        td.appendChild(gymActionButton('○', 'Choose an activity', () => {
          const picker = tr.querySelector('.fl-gym-row-activity');
          if (picker) picker.focus();
        }));
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  });
  table.appendChild(tbody);
  const wrap = document.createElement('div');
  wrap.className = 'fl-table-wrap';
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function updateGymCustomNameVisibility() {
  const activity = selectedGymActivity();
  els.gymCustomName.hidden = !activity.custom;
}

function renderGymSummary(day) {
  if (!els.gymSummary) return;
  const info = gymDaySummary(day);
  els.gymSummary.innerHTML = '';
  els.gymSummary.className = 'fl-gym-summary fl-gym-summary-banner';
  [
    [String(info.activities), 'exe', '📋'],
    [fmtNum(info.weightKg, 0), 'kg', 'dumbbell'],
    [fmtNum(info.weightReps, 0), 'rep', '🔁'],
    [fmtNum(info.cardioMin, 0), 'min', '🏃'],
  ].forEach(([value, label, icon]) => {
    const item = document.createElement('span');
    const top = document.createElement('b');
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const iconEl = icon === 'dumbbell' ? createDumbbellIcon('fl-gym-summary-dumbbell') : document.createElement('small');
    if (icon !== 'dumbbell') iconEl.textContent = icon;
    const caption = document.createElement('em');
    caption.textContent = label;
    item.title = label;
    top.append(strong, iconEl);
    item.append(top, caption);
    els.gymSummary.appendChild(item);
  });
}

function renderGym() {
  renderGymDateOptions();
  renderGymPresetOptions();
  ensureGymActivityDatalist();
  updateGymCustomNameVisibility();
  const all = gymDraftData();
  const day = gymDay(all, selectedGymDate);
  renderGymSummary(day);
  renderGymSection(els.gymTable, day.activities, {
    locked: gymLocked,
  });
  renderGymSavedTime(day);
  if (els.gymLockBtn) {
    els.gymLockBtn.textContent = gymLocked ? '🔓 Unlock' : '🔒 Lock';
    els.gymLockBtn.title = gymLocked ? 'Unlock GymLog for editing' : 'Lock and log GymLog';
    els.gymLockBtn.setAttribute('aria-pressed', gymLocked ? 'true' : 'false');
    els.gymLockBtn.classList.toggle('fl-gym-unlock-btn', gymLocked);
  }
  if (els.gymPreset) els.gymPreset.disabled = gymLocked;
  if (els.gymClearDay) els.gymClearDay.disabled = gymLocked;
  if (els.gymNoteShell) {
    els.gymNoteShell.innerHTML = '';
    els.gymNoteShell.appendChild(buildGymNoteField(day.note || '', (text) => setGymNote(selectedGymDate, text), gymLocked));
  }
}

function monthISO(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function createDumbbellIcon(extraClass = '') {
  const span = document.createElement('span');
  span.className = `fl-dumbbell-icon ${extraClass}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg class="fl-dumbbell-svg" viewBox="0 0 32 20" focusable="false"><path d="M2 7h4v6H2V7Zm6-3h4v12H8V4Zm12 0h4v12h-4V4Zm6 3h4v6h-4V7ZM12 9h8v2h-8V9Z"/></svg>';
  return span;
}

function gymHasWorkout(day) {
  return gymDaySummary(day).activities > 0;
}

function renderMomentumStat(value, icon, label) {
  const item = document.createElement('span');
  const top = document.createElement('b');
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  top.appendChild(strong);
  if (icon === 'dumbbell') {
    top.appendChild(createDumbbellIcon('fl-momentum-dumbbell'));
  } else {
    const small = document.createElement('small');
    small.textContent = icon;
    top.appendChild(small);
  }
  const caption = document.createElement('em');
  caption.textContent = label;
  item.append(top, caption);
  return item;
}

function renderMomentum() {
  if (!els.momentumSummary || !els.momentumMonth || !els.momentumCalendar) return;
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daily = loadDaily();
  const gym = loadGym();
  const foodByDate = {};
  const exerciseByDate = {};
  let kcalSum = 0;
  let kcalDays = 0;
  let activeDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = monthISO(year, monthIndex, day);
    const kcal = dayTotals(getDay(daily, iso)).kcal;
    foodByDate[iso] = kcal;
    if (kcal > 0) {
      kcalSum += kcal;
      kcalDays += 1;
    }
    const exerciseCount = gymDaySummary(gym[iso]).activities;
    exerciseByDate[iso] = exerciseCount;
    if (exerciseCount > 0) activeDays += 1;
  }

  els.momentumSummary.innerHTML = '';
  els.momentumSummary.className = 'fl-gym-summary fl-momentum-summary';
  els.momentumSummary.append(
    renderMomentumStat(kcalDays ? fmtNum(kcalSum / kcalDays, 0) : '0', ICON_LEAF, 'avg kcal'),
    renderMomentumStat(String(activeDays), ICON_FIRE, 'active day'),
  );

  els.momentumMonth.textContent = `${String(monthIndex + 1).padStart(2, '0')}/${year}`;
  els.momentumCalendar.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'fl-momentum-table';
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    head.appendChild(th);
  });
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let currentDay = 1;
  for (let week = 0; week < 6 && currentDay <= daysInMonth; week++) {
    const tr = document.createElement('tr');
    for (let weekday = 0; weekday < 7; weekday++) {
      const td = document.createElement('td');
      if ((week === 0 && weekday < firstWeekday) || currentDay > daysInMonth) {
        td.className = 'fl-momentum-empty-day';
        tr.appendChild(td);
        continue;
      }
      const iso = monthISO(year, monthIndex, currentDay);
      if (iso === todayISO()) td.classList.add('fl-momentum-today');
      const dayNum = document.createElement('strong');
      dayNum.textContent = String(currentDay);
      const food = document.createElement('span');
      food.className = 'fl-momentum-food-line';
      food.textContent = foodByDate[iso] > 0 ? `${fmtNum(foodByDate[iso], 0)} ${ICON_LEAF}` : '-';
      const gymLine = document.createElement('span');
      gymLine.className = 'fl-momentum-gym-line';
      gymLine.textContent = exerciseByDate[iso] > 0 ? `${exerciseByDate[iso]} ${ICON_FIRE}` : '-';
      td.append(dayNum, food, gymLine);
      tr.appendChild(td);
      currentDay += 1;
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  els.momentumCalendar.appendChild(table);
}

function clearGymDay() {
  if (gymLocked) return;
  const date = selectedGymDate || todayISO();
  if (!confirm(`Reset GymLog for ${date}? Workout rows will return to Add exercise.`)) return;
  const all = gymDraftData();
  delete all[date];
  markGymDraftChanged(date);
  renderGym();
}

renderGymActivityOptions();
els.gymFilters.addEventListener('click', onGymFilterClick);
els.gymActivity.addEventListener('change', () => {
  els.gymCustomName.value = '';
  updateGymCustomNameVisibility();
  showGymValidation(null);
});
els.gymLogBtn.addEventListener('click', addActivity);
els.gymLockBtn.addEventListener('click', toggleGymLock);
if (els.gymSaveFav) els.gymSaveFav.addEventListener('click', saveCurrentGymAsFavourite);
if (els.gymPreset) els.gymPreset.addEventListener('change', () => applyGymFavourite(els.gymPreset.value));
els.gymDate.addEventListener('change', () => {
  selectedGymDate = els.gymDate.value || todayISO();
  renderGym();
});
els.gymClearDay.addEventListener('click', clearGymDay);
window.addEventListener('beforeunload', (ev) => {
  if (!gymHasUnsavedChanges()) return;
  ev.preventDefault();
  ev.returnValue = '';
});

// ============ Saved food data panel (hidden from navigation) ============

const LIB_COLS = ['item', 'serving', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

function isHostLibraryEntry(entry) {
  return String(entry?.id ?? '').startsWith('seed-') || entry?.addedAt === DEFAULT_LIBRARY_VERSION;
}

function renderLibrary() {
  const lib = loadLibrary().filter((entry) => !isHostLibraryEntry(entry));
  const favs = loadGymFavs();
  const customs = loadGymCustoms();
  els.libraryCount.textContent = `${lib.length}/${MAX_LIBRARY_ITEMS} food · ${customs.length}/${MAX_GYM_CUSTOMS} exercise · ${favs.length}/5 presets`;
  if (els.libraryFoodCount) els.libraryFoodCount.textContent = `${lib.length}/${MAX_LIBRARY_ITEMS}`;
  if (els.gymCustomCount) els.gymCustomCount.textContent = `${customs.length}/${MAX_GYM_CUSTOMS}`;
  if (els.gymFavCount) els.gymFavCount.textContent = `${favs.length}/5`;
  document.querySelectorAll('.fl-library-section').forEach((section) => { section.open = false; });

  const tbl = els.libraryTable;
  tbl.innerHTML = '';

  if (!lib.length) {
    els.libraryEmpty.hidden = false;
    renderGymCustomLibrary();
    renderGymFavLibrary();
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
    const hostEntry = isHostLibraryEntry(entry);
    const tr = document.createElement('tr');
    LIB_COLS.forEach((c) => {
      const td = document.createElement('td');
      const v = entry[c];
      if (!hostEntry) {
        const input = document.createElement('input');
        input.className = 'fl-library-edit-input';
        input.value = String(v ?? '');
        if (!['item', 'serving'].includes(c)) {
          input.type = 'number';
          input.inputMode = 'decimal';
          input.min = '0';
          input.step = c === 'kcal' ? '1' : '0.1';
          td.classList.add('fl-num');
        }
        input.addEventListener('change', () => {
          const next = loadLibrary().map((x) => {
            if (x.id !== entry.id) return x;
            const raw = input.value.trim();
            const value = ['item', 'serving'].includes(c) ? raw : num(raw);
            return { ...x, [c]: value };
          });
          saveLibrary(next);
          renderLibrary();
        });
        td.appendChild(input);
      } else if (c === 'item' || c === 'serving') {
        td.textContent = String(v ?? '');
      } else {
        td.classList.add('fl-num');
        td.textContent = c === 'kcal' ? fmtNum(v, 0) : fmtNum(v, 1);
      }
      tr.appendChild(td);
    });
    const tdDel = document.createElement('td');
    if (!hostEntry) {
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
  renderGymCustomLibrary();
  renderGymFavLibrary();
}

function renderGymCustomLibrary() {
  if (!els.gymCustomList) return;
  const customs = loadGymCustoms();
  if (els.gymCustomCount) els.gymCustomCount.textContent = `${customs.length}/${MAX_GYM_CUSTOMS}`;
  els.gymCustomList.innerHTML = '';
  if (!customs.length) {
    const empty = document.createElement('p');
    empty.className = 'fl-empty';
    empty.textContent = 'No custom exercises yet.';
    els.gymCustomList.appendChild(empty);
    return;
  }
  customs.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'fl-gym-custom-row';
    const name = document.createElement('span');
    name.textContent = item.name;
    const kind = document.createElement('small');
    kind.textContent = item.kind === 'cardio' ? 'Cardio' : 'Weight';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fl-row-del-btn fl-gym-custom-delete';
    del.textContent = '×';
    del.title = 'Delete custom exercise';
    del.addEventListener('click', () => deleteGymCustomExercise(item.kind, item.name));
    row.append(name, kind, del);
    els.gymCustomList.appendChild(row);
  });
}

function renderGymFavLibrary() {
  if (!els.gymFavList) return;
  const favs = loadGymFavs();
  els.gymFavList.innerHTML = '';
  if (!favs.length) {
    const empty = document.createElement('p');
    empty.className = 'fl-empty';
    empty.textContent = 'No gym presets yet.';
    els.gymFavList.appendChild(empty);
    return;
  }
  favs.forEach((fav) => {
    const card = document.createElement('article');
    card.className = 'fl-gym-fav-card';
    const head = document.createElement('header');
    head.className = 'fl-gym-fav-row';
    const input = document.createElement('input');
    input.maxLength = 15;
    input.value = fav.name || '';
    input.addEventListener('change', () => {
      const next = loadGymFavs().map((f) => f.id === fav.id ? { ...f, name: input.value.trim().slice(0, 15) || f.name } : f);
      saveGymFavs(next);
      renderGymPresetOptions();
      renderGymFavLibrary();
    });
    const meta = document.createElement('span');
    meta.textContent = `${(fav.activities || []).length} activities`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fl-row-del-btn';
    del.textContent = '×';
    del.title = 'Delete preset';
    del.addEventListener('click', () => deleteGymFavourite(fav.id));
    head.append(input, meta, del);
    const tableShell = document.createElement('div');
    tableShell.className = 'fl-gym-fav-table';
    card.append(head, tableShell);
    els.gymFavList.appendChild(card);
    renderGymSection(tableShell, fav.activities || [], {
      onActivityChange: (activityIdx, name) => setGymFavActivityAt(fav.id, activityIdx, name),
      onMetricChange: (activityIdx, setIdx, key, value) => updateGymFavMetric(fav.id, activityIdx, setIdx, key, value),
      onInsertSet: (activityIdx, setIdx) => insertGymFavSet(fav.id, activityIdx, setIdx),
      onRemoveSet: (activityIdx, setIdx) => removeGymFavSet(fav.id, activityIdx, setIdx),
      onRemoveActivity: (activityIdx) => removeGymFavActivity(fav.id, activityIdx),
    });
  });
}

// ============ Food History ============

const HIST_COLS = ['date', 'target', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

function dayTotals(day) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };
  dayMeals(day).forEach((meal) => {
    const sub = sumItems(meal.items || []);
    NUMERIC_COLS.forEach((k) => { t[k] += sub[k]; });
  });
  return t;
}

function logDay() {
  const date = selectedDate();
  const all = loadDaily();
  const day = getDay(all, date);
  const totals = dayTotals(day);

  const targetObj = targetForDate(date);
  const targetKcal = targetObj ? targetObj.kcal : null;

  const hasAny = NUMERIC_COLS.some((k) => totals[k] > 0);
  if (!hasAny) {
    setStatus('Nothing to snapshot — log a meal first.', 'error');
    setTimeout(() => setStatus(null), 2500);
    return;
  }

  const entry = {
    date,
    target: targetKcal,
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
  if (!els.historyTable || !els.historyEmpty) return;
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

if (els.clearHistoryBtn) {
  els.clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('Clear all Food History snapshots? This cannot be undone.')) return;
    saveHistory([]);
    renderHistory();
  });
}

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
  dayMeals(day).forEach((meal) => {
    (meal.items || []).forEach((it) => {
      rows.push([date, meal.name || 'Meal', it.item,
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

function exportGymCSV() {
  const date = selectedGymDate || todayISO();
  const all = gymDraftData();
  const day = gymDay(all, date);
  const rows = [['date', 'type', 'activity_idx', 'activity', 'set_idx', 'kg', 'rep', 'speed', 'incline', 'time_min']];
  (day.activities || []).forEach((a, ai) => {
    const setRows = Array.isArray(a.rows) && a.rows.length ? a.rows : [{}];
    setRows.forEach((r, si) => {
      if (a.kind === 'cardio') {
        rows.push([date, 'cardio', ai + 1, a.name || '', si + 1, '', '',
          r.speed ?? '', r.incline ?? '', r.time ?? '']);
      } else {
        rows.push([date, 'weight', ai + 1, a.name || '', si + 1,
          r.kg ?? '', r.rep ?? '', '', '', '']);
      }
    });
  });
  if (day.note && String(day.note).trim()) {
    rows.push([date, 'note', '', '', '', '', '', '', '', String(day.note).trim()]);
  }
  downloadCSV(`fitlog_gym_${date}.csv`, rows);
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

if (els.exportHistoryBtn) els.exportHistoryBtn.addEventListener('click', exportHistoryCSV);

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
    if (e.code === 'auth/popup-closed-by-user') return; // user cancelled — no alert
    const msg = 'Sign-in failed: ' + e.message;
    setStatus(msg, 'error');
    if (!currentUser) alert(msg); // Welcome page is shown — #fl-status is hidden
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
  if (!els.profileSync) return;
  if (!msg || !currentUser) {
    els.profileSync.hidden = true;
    els.profileSync.textContent = '';
    return;
  }
  const now = new Date().toLocaleTimeString();
  els.profileSync.textContent = `${msg} (${now})`;
  els.profileSync.hidden = false;
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
  await syncToFirestore('settings', settingsCloudPayload(loadSettings()));
  await syncToFirestore('library', loadLibrary());
  await syncToFirestore('dailyLog', loadDaily());
  await syncToFirestore('foodHistory', loadHistory());
  await syncToFirestore('gymLog', loadGym());
  await syncToFirestore('gymFavorites', loadGymFavs());
  await syncToFirestore('gymCustomExercises', loadGymCustoms());
  await syncToFirestore('profile', profileState);
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
        // settings (model, system prompt) — local wins; nothing to restore from cloud here.
        // Legacy cloud `apiKey` is ignored; BYOK stays local-only in this browser.
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
      } else if (category === 'gymFavorites') {
        const local = loadGymFavs();
        if (Array.isArray(data) && data.length > local.length) { saveGymFavs(data); hasChanges = true; }
      } else if (category === 'gymCustomExercises') {
        const local = loadGymCustoms();
        if (Array.isArray(data) && data.length > local.length) { saveGymCustoms(data); hasChanges = true; }
      } else if (category === 'profile') {
        profileState = { ...loadProfile(), ...data };
        saveProfile(profileState);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      renderDaily();
      renderHistory();
      renderLibrary();
      renderGym();
      renderMomentum();
      loadProfileIntoUI();
    }
    setSyncStatus('Synced from cloud');
  } catch (e) {
    console.error('[fitlog] sync-from error', e);
    setSyncStatus('Sync failed');
  }
}

function updateProfileUI() {
  if (currentUser) {
    els.welcome.hidden = true;
    els.tabsNav.hidden = false;
    els.main.hidden = false;
    els.headerAuth.hidden = false;
    els.headerAvatar.src = currentUser.photoURL || '';
    els.headerName.textContent = currentUser.displayName || currentUser.email || 'Account';
  } else {
    els.welcome.hidden = false;
    els.tabsNav.hidden = true;
    els.main.hidden = true;
    els.headerAuth.hidden = true;
    els.headerAvatar.src = '';
    els.headerName.textContent = '';
    if (els.profileSync) {
      els.profileSync.hidden = true;
      els.profileSync.textContent = '';
    }
  }
  els.tabs.forEach((t) => { t.disabled = !!(currentUser && !profileComplete()); });
  loadProfileIntoUI();
}

function isProfileEmpty() {
  return !profileComplete();
}

// ============ Profile Metrics ============

function renderProfileSummary() {
  const p = profileState;
  const bmi = computeBMI(p);
  const bmr = computeBMR(p);
  const bmiStr = bmi != null ? `${bmi.toFixed(1)} (${bmiClass(bmi)})` : '—';
  const bmrStr = bmr != null ? `${Math.round(bmr).toLocaleString()} kcal` : '—';
  if (els.profileSummaryText) {
    els.profileSummaryText.innerHTML =
      `BMI <strong>${bmiStr}</strong> &nbsp;·&nbsp; BMR <strong>${bmrStr}</strong>`;
  }
}

function getDistributionValues(mode) {
  const p = profileState;
  if (mode === 'custom') {
    const c = p.customTdee || {};
    const kcal = c.kcal ?? null;
    const pG = c.p ?? null;
    const fG = c.f ?? null;
    const carbG = (kcal != null && pG != null && fG != null) ? carbFromKcal(kcal, pG, fG) : null;
    return { kcal, p: pG, f: fG, c: carbG, sugarMax: c.sugarMax ?? null, fiberMin: c.fiberMin ?? null };
  }
  const normal = tdeeNormal(p);
  if (normal == null) return { kcal: null, p: null, f: null, c: null, sugarMax: null, fiberMin: null };
  const kcal = mode === 'diet' ? normal - 300 : mode === 'high' ? normal + 200 : normal;
  const macros = macrosFor(mode, p, kcal);
  return {
    kcal: macros ? macros.kcal : null,
    p: macros ? macros.p : null,
    f: macros ? macros.f : null,
    c: macros ? macros.c : null,
    sugarMax: sugarMaxG(normal),
    fiberMin: fiberMinG(p.gender),
  };
}

function fmtCell(v) { return v != null ? String(v) : '—'; }

function renderTargetsTable() {
  const rowIds = ['normal', 'diet', 'high'];
  rowIds.forEach((mode) => {
    const row = document.getElementById(`fl-targets-row-${mode}`);
    if (!row) return;
    const vals = getDistributionValues(mode);
    const cells = row.querySelectorAll('td');
    // cells[0] = label; 1=kcal 2=p 3=f 4=c 5=su 6=fb
    cells[1].textContent = fmtCell(vals.kcal);
    cells[2].textContent = fmtCell(vals.p);
    cells[3].textContent = fmtCell(vals.f);
    cells[4].textContent = fmtCell(vals.c);
    cells[5].textContent = fmtCell(vals.sugarMax);
    cells[6].textContent = fmtCell(vals.fiberMin);
  });
  // Custom row: load from profileState.customTdee into inputs
  const c = profileState.customTdee || {};
  if (els.customKcal) els.customKcal.value = c.kcal ?? '';
  if (els.customP) els.customP.value = c.p ?? '';
  if (els.customF) els.customF.value = c.f ?? '';
  if (els.customSu) els.customSu.value = c.sugarMax ?? '';
  if (els.customFb) els.customFb.value = c.fiberMin ?? '';
  updateCustomCarb();
}

function updateCustomCarb() {
  const kcal = Number(els.customKcal ? els.customKcal.value : 0) || 0;
  const pG = Number(els.customP ? els.customP.value : 0) || 0;
  const fG = Number(els.customF ? els.customF.value : 0) || 0;
  if (els.customCarb) {
    els.customCarb.textContent = (kcal || pG || fG) ? carbFromKcal(kcal, pG, fG) : '—';
  }
}

function loadProfileIntoUI() {
  const p = profileState;
  const radio = document.querySelector(`input[name="fl-profile-gender"][value="${p.gender || 'female'}"]`);
  if (radio) radio.checked = true;
  if (els.profileAge) els.profileAge.value = p.age ?? '';
  if (els.profileWeight) els.profileWeight.value = p.weight ?? '';
  if (els.profileHeight) els.profileHeight.value = p.height ?? '';
  if (els.profileActivity) els.profileActivity.value = p.activityLevel || 'sedentary';
  renderProfileSummary();
  renderTargetsTable();
}

function saveProfileFromUI() {
  const genderRadio = document.querySelector('input[name="fl-profile-gender"]:checked');
  const next = {
    ...profileState,
    gender: genderRadio ? genderRadio.value : '',
    age: els.profileAge && els.profileAge.value ? Number(els.profileAge.value) : null,
    weight: els.profileWeight && els.profileWeight.value ? Number(els.profileWeight.value) : null,
    height: els.profileHeight && els.profileHeight.value ? Number(els.profileHeight.value) : null,
    activityLevel: els.profileActivity ? (els.profileActivity.value || '') : '',
  };
  if (!(next.gender && next.age && next.weight && next.height && next.activityLevel)) {
    setSyncStatus('Fill all Body Metrics fields before saving');
    return;
  }
  profileState = next;
  saveProfile(profileState);
  renderProfileSummary();
  renderTargetsTable();
  renderDaily();
  updateProfileUI();
  setSyncStatus('Body Metrics saved');
  showTab('logging');
}

// ============ Profile input events ============

if (els.profileSaveMetrics) els.profileSaveMetrics.addEventListener('click', saveProfileFromUI);

// Custom row inputs → auto-derive carb
[els.customKcal, els.customP, els.customF].forEach((el) => {
  if (el) el.addEventListener('input', updateCustomCarb);
});

// "Copy from" dropdown → prefill Custom row inputs from preset
if (els.profileCopyFrom) {
  els.profileCopyFrom.addEventListener('change', () => {
    const preset = els.profileCopyFrom.value;
    const vals = getDistributionValues(preset);
    if (els.customKcal) els.customKcal.value = vals.kcal ?? '';
    if (els.customP) els.customP.value = vals.p ?? '';
    if (els.customF) els.customF.value = vals.f ?? '';
    if (els.customSu) els.customSu.value = vals.sugarMax ?? '';
    if (els.customFb) els.customFb.value = vals.fiberMin ?? '';
    updateCustomCarb();
  });
}

// Save as Custom — reads Custom row inputs → persists to profileState
if (els.profileSaveCustom) {
  els.profileSaveCustom.addEventListener('click', () => {
    profileState.customTdee = {
      kcal: els.customKcal ? (Number(els.customKcal.value) || null) : null,
      p: els.customP ? (Number(els.customP.value) || null) : null,
      f: els.customF ? (Number(els.customF.value) || null) : null,
      sugarMax: els.customSu ? (Number(els.customSu.value) || null) : null,
      fiberMin: els.customFb ? (Number(els.customFb.value) || null) : null,
    };
    saveProfile(profileState);
  });
}

// ============ FoodLog Target mode dropdown ============

if (els.dailyTargetMode) {
  els.dailyTargetMode.addEventListener('change', () => {
    const date = selectedDate();
    const all = loadDaily();
    if (!all[date]) all[date] = blankDay();
    all[date].targetMode = els.dailyTargetMode.value;
    saveDaily(all);
    renderDaily();
  });
}

auth.onAuthStateChanged(async (user) => {
  const changed = (currentUser?.uid !== user?.uid);
  currentUser = user;
  console.info('[fitlog] auth state', user ? `signed-in: ${user.uid}` : 'signed-out');
  updateProfileUI();

  if (changed && user) {
    await syncFromFirestore();
    showTab(isProfileEmpty() ? 'profile' : 'logging');
  }
});

els.welcomeSigninBtn.addEventListener('click', signInWithGoogle);
if (els.brandLogo) els.brandLogo.addEventListener('click', showBrandMotto);
els.libraryLinks.forEach((btn) => btn.addEventListener('click', (ev) => {
  ev.preventDefault();
  showTab('library');
}));
els.headerAccount.addEventListener('click', () => showTab('profile'));
els.signoutBtn.addEventListener('click', signOut);

// ============ Init ============

applyTheme(state.theme || DEFAULT_THEME, false);
applyKoalaMode(state.koalaMode || DEFAULT_KOALA_MODE, false);
loadSettingsIntoUI();

// Initial tab state — actual visibility is governed by updateProfileUI based on auth.
showTab('logging');
renderDaily();
renderHistory();
renderLibrary();
loadProfileIntoUI();

console.info('[fitlog] mounted', { date: todayISO(), libraryCount: loadLibrary().length });

})();
