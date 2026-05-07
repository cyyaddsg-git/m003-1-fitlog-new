// FitLog M003-1 — V1 client
// Static, BYOK Gemini, localStorage persistence.

(function () {
'use strict';

// ============ Constants ============

const STORAGE_PREFIX = 'm003_1';
const KEY_API = `${STORAGE_PREFIX}_apiKey`;
const KEY_MODEL = `${STORAGE_PREFIX}_model`;
const KEY_PROMPT = `${STORAGE_PREFIX}_systemPrompt`;
const KEY_LIBRARY = `${STORAGE_PREFIX}_library`;
const KEY_DAILY = `${STORAGE_PREFIX}_dailyLog`;

const SUPPORTED_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_MODEL = 'gemini-2.5-flash';

const GEMINI_URL = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

const COLS = ['item', 'kcal', 'p', 'f', 'c', 'su', 'fb'];
const NUMERIC_COLS = ['kcal', 'p', 'f', 'c', 'su', 'fb'];
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

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
- Item labels in English. Include qty/unit in the label (e.g. "nasi 150g").
- No additional columns. No markdown. JSON only.

Library priority:
- If a LIBRARY_CONTEXT block is appended below, those entries are pre-saved by the user with brand/portion-specific values.
- For each user-described item, first check LIBRARY_CONTEXT for a match (by item name + brand). If found, copy that entry's per-portion values (scaling to user-stated portion if needed) and prefix the item label with "[lib] ".
- Otherwise estimate using brand information the user provided. If brand is ambiguous, portion is unspecified, or the dish is unrecognizable, add a "notes" line asking the user to clarify (e.g. "Specify brand for nasi lemak — kcal varies 400–700 across kopitiam vs packaged"). The user can refine and re-send.`;

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
}

function loadLibrary() { return safeLS.getJSON(KEY_LIBRARY, []); }
function saveLibrary(lib) { safeLS.setJSON(KEY_LIBRARY, lib); }
function loadDaily() { return safeLS.getJSON(KEY_DAILY, {}); }
function saveDaily(d) { safeLS.setJSON(KEY_DAILY, d); }

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
    generationConfig: { responseMimeType: 'application/json' },
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
  const matched = [];
  for (const entry of library) {
    const hay = (entry.item + ' ' + (entry.brand || '')).toLowerCase();
    const hit = tokens.some((t) => hay.includes(t));
    if (hit) matched.push(entry);
  }
  return matched;
}

function buildPromptWithContext(basePrompt, matched) {
  if (!matched.length) return basePrompt;
  const slim = matched.map((e) => ({
    item: e.item,
    brand: e.brand || '',
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
  clearDayBtn: $('#fl-clear-day-btn'),
  libraryCount: $('#fl-library-count'),
  libraryClear: $('#fl-library-clear'),
  libraryTable: $('#fl-library-table'),
  libraryEmpty: $('#fl-library-empty'),
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
}

// ============ Settings modal ============

function openSettings() {
  els.setApikey.value = state.apiKey;
  els.setModel.value = state.model;
  els.setPrompt.value = state.systemPrompt;
  els.settingsModal.hidden = false;
}
function closeSettings() {
  state = {
    apiKey: els.setApikey.value.trim(),
    model: els.setModel.value || DEFAULT_MODEL,
    systemPrompt: els.setPrompt.value,
  };
  saveSettings(state);
  els.settingsModal.hidden = true;
}
els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.setReset.addEventListener('click', () => { els.setPrompt.value = DEFAULT_SYSTEM_PROMPT; });

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

  // Build fallback chain: try primary model; if it 503s, try the other model once.
  const primary = state.model;
  const fallback = primary === 'gemini-2.5-flash' ? 'gemini-2.0-flash' : 'gemini-2.5-flash';
  const chain = [primary, fallback];
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

function renderPreview(parsed) {
  // Restore table element if it was swapped out by renderRawFallback.
  if (els.previewTable.tagName !== 'TABLE') {
    const tbl = document.createElement('table');
    tbl.className = 'fl-table';
    tbl.id = 'fl-preview-table';
    els.previewTable.replaceWith(tbl);
    els.previewTable = tbl;
  }
  const rows = (parsed.rows || []).filter((r) => r && r.item != null);
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
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r, i) => {
    const isTotal = String(r.item).toLowerCase() === 'total';
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
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fl-row-add-btn';
      btn.textContent = '+ Library';
      btn.title = 'Add this item to Library';
      btn.addEventListener('click', () => addRowToLibrary(r, btn));
      tdAdd.appendChild(btn);
    }
    tr.appendChild(tdAdd);
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

// ============ Add to Library (per item) ============

function addRowToLibrary(row, btn) {
  // Parse "name 150g" → item + qty/unit best-effort.
  const label = String(row.item ?? '').trim();
  const m = label.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|oz|lb|cup|cups|tsp|tbsp|piece|pieces|slice|slices)\b/i);
  const itemName = m ? m[1].trim() : label;
  const qty = m ? Number(m[2]) : '';
  const unit = m ? m[3].toLowerCase() : '';

  const entry = {
    id: uid(),
    item: itemName,
    brand: '',
    qty: qty,
    unit: unit,
    kcal: num(row.kcal),
    p: num(row.p),
    f: num(row.f),
    c: num(row.c),
    su: num(row.su),
    fb: num(row.fb),
    addedAt: new Date().toISOString(),
  };
  const lib = loadLibrary();
  lib.unshift(entry);
  saveLibrary(lib);

  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  }
}

// ============ Log button ============

function getSelectedMeal() {
  const r = document.querySelector('input[name="fl-meal"]:checked');
  return r ? r.value : null;
}

function logMeal() {
  if (!lastPreview || !lastPreview.rows.length) {
    setStatus('Nothing to log — Send a meal description first.', 'error');
    return;
  }
  const slot = getSelectedMeal();
  if (!slot) { setStatus('Pick a meal slot first.', 'error'); return; }

  const items = lastPreview.rows
    .filter((r) => String(r.item).toLowerCase() !== 'total')
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

  const date = todayISO();
  const all = loadDaily();
  if (!all[date]) all[date] = blankDay();
  if (!all[date][slot]) all[date][slot] = { items: [] };
  all[date][slot].items.push(...items);
  saveDaily(all);

  renderDaily();
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

function renderDaily() {
  const date = todayISO();
  els.dailyDate.textContent = date;

  const all = loadDaily();
  const day = all[date] || blankDay();

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
        td.colSpan = COLS.length;
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
  tbody.appendChild(trTotal);

  // Target row (blank in V1)
  const trTarget = document.createElement('tr');
  trTarget.classList.add('fl-target-row');
  const tdT = document.createElement('td');
  tdT.textContent = 'Target';
  trTarget.appendChild(tdT);
  NUMERIC_COLS.forEach(() => {
    const td = document.createElement('td');
    td.classList.add('fl-num');
    td.textContent = '—';
    trTarget.appendChild(td);
  });
  tbody.appendChild(trTarget);

  // Remain row (blank in V1)
  const trRemain = document.createElement('tr');
  trRemain.classList.add('fl-remain-row');
  const tdR = document.createElement('td');
  tdR.textContent = 'Remain';
  trRemain.appendChild(tdR);
  NUMERIC_COLS.forEach(() => {
    const td = document.createElement('td');
    td.classList.add('fl-num');
    td.textContent = '—';
    trRemain.appendChild(td);
  });
  tbody.appendChild(trRemain);

  tbl.appendChild(tbody);
}

els.clearDayBtn.addEventListener('click', () => {
  if (!confirm("Clear today's log? Items already logged will be removed.")) return;
  const all = loadDaily();
  delete all[todayISO()];
  saveDaily(all);
  renderDaily();
});

// ============ Library tab ============

const LIB_COLS = ['item', 'brand', 'qty', 'unit', 'kcal', 'p', 'f', 'c', 'su', 'fb'];

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
    if (['kcal','p','f','c','su','fb','qty'].includes(c)) th.classList.add('fl-num');
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
      if (c === 'item' || c === 'brand' || c === 'unit') {
        td.textContent = String(v ?? '');
      } else if (c === 'qty') {
        td.classList.add('fl-num');
        td.textContent = v === '' || v == null ? '' : String(v);
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
    del.title = 'Delete';
    del.addEventListener('click', () => {
      const cur = loadLibrary().filter((x) => x.id !== entry.id);
      saveLibrary(cur);
      renderLibrary();
    });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

els.libraryClear.addEventListener('click', () => {
  if (!confirm("Clear entire library? This can't be undone.")) return;
  saveLibrary([]);
  renderLibrary();
});

// ============ Init ============

showTab('logging');
renderDaily();
renderLibrary();

console.info('[fitlog] mounted', { date: todayISO(), libraryCount: loadLibrary().length });

})();
