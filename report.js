/* ============================================================================
 * Fitlog-Koala Monthly Health Report
 * Renders a clinician-grade PDF via pdfmake from local logs.
 * Cream-palette, A4 portrait, 5 pages (Cover / Body / Nutrition / Movement / Methodology).
 * ============================================================================ */

(function () {
  'use strict';

  // ---- Palette (matches the site's light theme tokens) -----------------------
  const C = {
    ink: '#171717',
    muted: '#665f55',
    paper: '#fffaf2',
    card: '#fffdf8',
    line: '#d4c9ba',
    accent: '#1d4f7a',
    warm: '#c77a1e',
    good: '#7a9d62',
    warn: '#c77a1e',
    bad: '#b42318',
    fill: '#f2e6d5',
  };

  // ---- Helpers ---------------------------------------------------------------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function monthBounds(ym) {
    // ym = "YYYY-MM"
    const [y, m] = ym.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= dim; d++) days.push(`${y}-${pad2(m)}-${pad2(d)}`);
    return { y, m, dim, days };
  }
  function prevMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${pad2(pm)}`;
  }
  function fmt(n, d = 1) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(d);
  }
  function delta(a, b) {
    if (a == null || b == null) return null;
    return +(a - b).toFixed(1);
  }
  function sign(n) { if (n == null) return ''; return n > 0 ? '+' : ''; }
  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // ---- Data extraction (reads same localStorage keys app.js uses) -----------
  const STORAGE_PREFIX = 'm003_1';
  function readKey(k, fallback) {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}_${k}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function gatherMonth(ym) {
    const { days } = monthBounds(ym);
    const daily = readKey('dailyLog', {});
    const gym   = readKey('gymLog', {});
    const body  = readKey('bodyLog', {});
    const profile = readKey('profile', {});

    // Per-day series
    const series = days.map((iso) => {
      const d = daily[iso] || { meals: [] };
      let t = { kcal: 0, p: 0, f: 0, c: 0, su: 0, fb: 0 };
      (d.meals || []).forEach((m) => {
        (m.items || []).forEach((it) => {
          ['kcal','p','f','c','su','fb'].forEach((k) => {
            t[k] += Number(it[k]) || 0;
          });
        });
      });
      const g = gym[iso] || {};
      const acts = Array.isArray(g.activities) ? g.activities : [];
      let weightReps = 0, cardioMin = 0;
      acts.forEach((a) => {
        const rows = Array.isArray(a.rows) ? a.rows : [];
        rows.forEach((r) => {
          if (a.kind === 'cardio') cardioMin += Number(r.time) || 0;
          else weightReps += Number(r.rep) || 0;
        });
      });
      const b = body[iso] || {};
      return {
        iso,
        kcal: t.kcal, p: t.p, f: t.f, c: t.c, su: t.su, fb: t.fb,
        move: weightReps + cardioMin,
        w: b.w ?? null, mm: b.mm ?? null, bf: b.bf ?? null,
        fatKg: (b.w != null && b.bf != null) ? +((b.w * b.bf) / 100).toFixed(1) : null,
      };
    });

    // Prior-month deltas (for KPI tiles)
    const pm = prevMonth(ym);
    const pmBounds = monthBounds(pm);
    const pmSeries = pmBounds.days.map((iso) => {
      const b = body[iso] || {};
      return {
        w: b.w ?? null,
        mm: b.mm ?? null,
        fatKg: (b.w != null && b.bf != null) ? +((b.w * b.bf) / 100).toFixed(1) : null,
      };
    });

    return { series, pmSeries, profile, daily, gym, body };
  }

  function lastNonNull(arr, key) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i][key] != null) return arr[i][key];
    return null;
  }
  function firstNonNull(arr, key) {
    for (let i = 0; i < arr.length; i++) if (arr[i][key] != null) return arr[i][key];
    return null;
  }
  function meanNonNull(arr, key) {
    const xs = arr.map((r) => r[key]).filter((v) => v != null);
    if (!xs.length) return null;
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  }
  function maxOf(arr, key) {
    const xs = arr.map((r) => r[key]).filter((v) => v != null);
    return xs.length ? Math.max(...xs) : null;
  }
  function minOf(arr, key) {
    const xs = arr.map((r) => r[key]).filter((v) => v != null);
    return xs.length ? Math.min(...xs) : null;
  }
  function countWhere(arr, fn) { return arr.filter(fn).length; }

  // ---- Verdict / interpretation generator -----------------------------------
  function gradeMonth(series, pmSeries, profile) {
    const foodDays = countWhere(series, (d) => d.kcal > 0);
    const bodyDays = countWhere(series, (d) => d.w != null);
    const moveDays = countWhere(series, (d) => d.move >= 50);

    const wStart = firstNonNull(series, 'w');
    const wEnd   = lastNonNull(series, 'w');
    const fStart = firstNonNull(series, 'fatKg');
    const fEnd   = lastNonNull(series, 'fatKg');
    const mStart = firstNonNull(series, 'mm');
    const mEnd   = lastNonNull(series, 'mm');

    const dW = delta(wEnd, wStart);
    const dF = delta(fEnd, fStart);
    const dM = delta(mEnd, mStart);

    const pmW = lastNonNull(pmSeries, 'w');
    const pmF = lastNonNull(pmSeries, 'fatKg');
    const pmM = lastNonNull(pmSeries, 'mm');

    // Verdict
    let verdict = 'Insufficient data';
    let tone = 'muted';
    let para = 'Log body composition daily and meals on at least 60% of days for a meaningful read next month.';
    if (bodyDays >= 10 && foodDays >= 10) {
      if ((dW != null && dW <= 0) && (dM != null && dM >= 0) && moveDays / series.length >= 0.5) {
        verdict = 'Thriving';
        tone = 'good';
        para = `Genuine progress — ${dW <= 0 ? `weight down ${Math.abs(dW)} kg` : 'weight stable'}${dM >= 0 ? ` with muscle up ${fmt(dM)} kg` : ''}. Keep the cadence; this is recomposition working.`;
      } else if (Math.abs(dW || 0) <= 0.5 && (dF == null || dF <= 0.5)) {
        verdict = 'Steady';
        tone = 'good';
        para = `Holding the line. ${fmt(dW)} kg change is within natural fluctuation. Use next month to push one variable — protein floor or weekly active days.`;
      } else if ((dW != null && dW > 2) || (dM != null && dM < -1)) {
        verdict = 'Regressing';
        tone = 'bad';
        para = `Direction has reversed. ${dW != null && dW > 0 ? `Weight up ${fmt(dW)} kg` : ''}${dM != null && dM < 0 ? ` and muscle down ${fmt(Math.abs(dM))} kg` : ''} suggests cumulative surplus combined with insufficient stimulus. Re-tighten targets and book 3+ resistance days/week.`;
      } else if ((dW != null && dW > 1) || (dF != null && dF > 1)) {
        verdict = 'Drifting';
        tone = 'warn';
        para = `Slow drift. ${dW != null && dW > 0 ? `Weight up ${fmt(dW)} kg` : ''}${dF != null && dF > 0 ? ` (~${fmt(dF)} kg added fat mass)` : ''}. Adherence on logging is the lever — aim to log meals 5/7 days.`;
      }
    }

    return {
      verdict, tone, para,
      kpi: {
        weight: { now: wEnd, delta: dW, vsPrev: delta(wEnd, pmW) },
        fatKg:  { now: fEnd, delta: dF, vsPrev: delta(fEnd, pmF) },
        muscle: { now: mEnd, delta: dM, vsPrev: delta(mEnd, pmM) },
      },
      adherence: {
        food: { d: foodDays, n: series.length },
        body: { d: bodyDays, n: series.length },
        move: { d: moveDays, n: series.length },
      },
    };
  }

  // ---- SVG chart primitives --------------------------------------------------
  function svgLineChart(opts) {
    // opts: { values: [{x, y}], width, height, title, yLabel, color, bandLo, bandHi }
    const { values, width = 480, height = 140, color = C.accent, bandLo, bandHi } = opts;
    const pad = { l: 32, r: 8, t: 8, b: 22 };
    const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
    const xs = values.map((d) => d.x);
    const ys = values.map((d) => d.y).filter((v) => v != null);
    if (!ys.length) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${width/2}" y="${height/2}" text-anchor="middle" fill="${C.muted}" font-family="Helvetica" font-size="10">No data</text></svg>`;
    }
    const xMin = 1, xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (bandLo != null) yMin = Math.min(yMin, bandLo);
    if (bandHi != null) yMax = Math.max(yMax, bandHi);
    const yRange = yMax - yMin || 1;
    yMin -= yRange * 0.1;
    yMax += yRange * 0.1;
    const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * W;
    const sy = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * H;

    let band = '';
    if (bandLo != null && bandHi != null) {
      const y1 = sy(bandHi), y2 = sy(bandLo);
      band = `<rect x="${pad.l}" y="${y1}" width="${W}" height="${y2 - y1}" fill="${C.good}" fill-opacity="0.12"/>`;
    }

    // gridlines (top, mid, bottom)
    const gridY = [yMax, (yMax + yMin) / 2, yMin];
    const grid = gridY.map((g) =>
      `<line x1="${pad.l}" x2="${pad.l + W}" y1="${sy(g)}" y2="${sy(g)}" stroke="${C.line}" stroke-width="0.4"/>`
      + `<text x="${pad.l - 4}" y="${sy(g) + 3}" text-anchor="end" fill="${C.muted}" font-family="Helvetica" font-size="8">${g.toFixed(1)}</text>`
    ).join('');

    // line path: connect every non-null point, skipping null days entirely so
    // a single trend line emerges even when the log cadence is alternate-day.
    const pts = values.filter((d) => d.y != null);
    let lines = '';
    if (pts.length >= 2) {
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
      lines = `<path d="${path}" stroke="${color}" stroke-width="1.4" fill="none"/>`;
    }
    lines += pts.map((p) => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="2" fill="${color}"/>`).join('');

    // x-axis day ticks (every 5)
    const ticks = [];
    for (let d = 5; d <= xMax; d += 5) {
      ticks.push(`<text x="${sx(d)}" y="${pad.t + H + 12}" text-anchor="middle" fill="${C.muted}" font-family="Helvetica" font-size="7">${d}</text>`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${band}${grid}${lines}${ticks.join('')}
    </svg>`;
  }

  function svgBarChart(opts) {
    const { values, width = 480, height = 130, color = C.accent, target } = opts;
    const pad = { l: 32, r: 8, t: 8, b: 22 };
    const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
    const max = Math.max(target || 0, ...values.map((d) => d.y || 0)) || 1;
    const barW = W / values.length * 0.7;
    const gap  = W / values.length * 0.3;

    const grid = [max, max / 2, 0].map((g) =>
      `<line x1="${pad.l}" x2="${pad.l + W}" y1="${pad.t + (1 - g/max) * H}" y2="${pad.t + (1 - g/max) * H}" stroke="${C.line}" stroke-width="0.4"/>`
      + `<text x="${pad.l - 4}" y="${pad.t + (1 - g/max) * H + 3}" text-anchor="end" fill="${C.muted}" font-family="Helvetica" font-size="8">${Math.round(g)}</text>`
    ).join('');

    const bars = values.map((d, i) => {
      const h = ((d.y || 0) / max) * H;
      const x = pad.l + i * (barW + gap);
      const y = pad.t + H - h;
      const fill = d.color || color;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="0.5"/>`;
    }).join('');

    const targetLine = target != null ?
      `<line x1="${pad.l}" x2="${pad.l + W}" y1="${pad.t + (1 - target/max) * H}" y2="${pad.t + (1 - target/max) * H}" stroke="${C.warm}" stroke-width="0.8" stroke-dasharray="3 2"/>` : '';

    const ticks = [];
    for (let d = 5; d <= values.length; d += 5) {
      const x = pad.l + (d - 1) * (barW + gap) + barW / 2;
      ticks.push(`<text x="${x}" y="${pad.t + H + 12}" text-anchor="middle" fill="${C.muted}" font-family="Helvetica" font-size="7">${d}</text>`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${grid}${bars}${targetLine}${ticks.join('')}
    </svg>`;
  }

  function svgDonut(pct, label) {
    const size = 90, r = 30, stroke = 10;
    const c = size / 2;
    const circ = 2 * Math.PI * r;
    const dash = Math.max(0, Math.min(1, pct)) * circ;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 18}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.line}" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.accent}" stroke-width="${stroke}"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c + 4}" text-anchor="middle" fill="${C.ink}" font-family="Helvetica" font-weight="700" font-size="14">${Math.round(pct * 100)}%</text>
      <text x="${c}" y="${size + 12}" text-anchor="middle" fill="${C.muted}" font-family="Helvetica" font-size="8" text-transform="uppercase" letter-spacing="0.05em">${label}</text>
    </svg>`;
  }

  // ---- Build pdfmake document definition ------------------------------------
  function buildDocDef(ym, who) {
    const { series, pmSeries, profile } = gatherMonth(ym);
    const g = gradeMonth(series, pmSeries, profile);

    const xs = series.map((s, i) => ({ x: i + 1, y: s.w }));
    const ys = series.map((s, i) => ({ x: i + 1, y: s.mm }));
    const fs = series.map((s, i) => ({ x: i + 1, y: s.fatKg }));
    const kcals = series.map((s) => ({ y: s.kcal }));
    const moves = series.map((s) => {
      const m = s.move;
      let color = C.line;
      if (m >= 200) color = C.accent;
      else if (m >= 150) color = '#7a9d62';
      else if (m >= 100) color = '#c8b057';
      else if (m >= 50) color = '#d28a52';
      else if (m >= 1) color = '#c45134';
      return { y: m, color };
    });

    // Targets (using profile + default mode)
    const h = profile.height || 165;
    const bmi22Target = +(22 * (h/100) * (h/100)).toFixed(1);
    const kcalTargetFn = () => {
      // Mifflin–St Jeor estimate using current weight
      const w = lastNonNull(series, 'w') || profile.weight || 60;
      const age = profile.age || 30;
      const isMale = profile.gender === 'male';
      const bmr = isMale ? 10*w + 6.25*h - 5*age + 5 : 10*w + 6.25*h - 5*age - 161;
      const af = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 }[profile.activityLevel || 'sedentary'] || 1.2;
      return Math.round(bmr * af);
    };
    const kcalTarget = kcalTargetFn();

    // Quality flags
    const fiberMin = profile.gender === 'male' ? 38 : 25;
    const sugarOver = countWhere(series, (s) => s.kcal > 0 && s.su * 4 > 0.10 * s.kcal);
    const fiberUnder = countWhere(series, (s) => s.kcal > 0 && s.fb < fiberMin);
    const proteinThresh = Math.round(((lastNonNull(series, 'mm')) || 25) * 1.6);
    const proteinUnder = countWhere(series, (s) => s.kcal > 0 && s.p < proteinThresh);

    // Top moves and top foods
    const moveAgg = {};
    const exAgg = {};
    series.forEach((s, i) => {
      const iso = s.iso;
      const day = readKey('gymLog', {})[iso] || {};
      (day.activities || []).forEach((a) => {
        const name = a.name || '—';
        const rows = a.rows || [];
        if (!exAgg[name]) exAgg[name] = { count: 0, kg: 0, reps: 0, min: 0, kind: a.kind };
        rows.forEach((r) => {
          exAgg[name].count++;
          if (a.kind === 'cardio') exAgg[name].min += Number(r.time) || 0;
          else { exAgg[name].kg += Number(r.kg) || 0; exAgg[name].reps += Number(r.rep) || 0; }
        });
      });
    });
    const topExercises = Object.entries(exAgg)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, v]) => ({ name, ...v }));

    // Avg macros
    const avg = (k) => meanNonNull(series.filter((s) => s.kcal > 0), k);
    const avgKcal = avg('kcal'), avgP = avg('p'), avgF = avg('f'), avgC = avg('c');
    const totalCal = (avgP || 0) * 4 + (avgF || 0) * 9 + (avgC || 0) * 4 || 1;
    const macroPct = {
      p: ((avgP || 0) * 4) / totalCal * 100,
      f: ((avgF || 0) * 9) / totalCal * 100,
      c: ((avgC || 0) * 4) / totalCal * 100,
    };

    // ---- Page components -----------------------------------------------------
    const verdictColor = ({ good: C.good, warn: C.warn, bad: C.bad, muted: C.muted }[g.tone]) || C.muted;

    const cover = [
      { columns: [
        { text: 'Fitlog-Koala', color: C.warm, bold: true, fontSize: 14, characterSpacing: 0.5 },
        { text: '', alignment: 'right' },
      ]},
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.7, lineColor: C.line }] },
      { text: 'Monthly Health Report', alignment: 'center', fontSize: 28, bold: true, color: C.ink, margin: [0, 40, 0, 4] },
      { text: monthLabel(ym), alignment: 'center', fontSize: 14, color: C.muted, margin: [0, 0, 0, 2] },
      { text: who, alignment: 'center', fontSize: 11, color: C.muted, margin: [0, 0, 0, 28] },

      // Verdict card
      { table: { widths: ['*'], body: [[
        { stack: [
          { text: g.verdict.toUpperCase(), color: verdictColor, bold: true, fontSize: 12, characterSpacing: 0.06*10, alignment: 'center' },
          { text: g.para, color: C.ink, fontSize: 11, lineHeight: 1.35, alignment: 'center', margin: [16, 8, 16, 4] },
        ], fillColor: C.card, border: [false, false, false, false], margin: [0, 14, 0, 14] }
      ]] }, layout: 'noBorders', margin: [0, 0, 0, 24] },

      // KPI tiles
      { columns: [
        kpiTile('Weight', g.kpi.weight.now, 'kg', g.kpi.weight.delta),
        kpiTile('Body Fat Mass', g.kpi.fatKg.now, 'kg', g.kpi.fatKg.delta),
        kpiTile('Muscle Mass', g.kpi.muscle.now, 'kg', g.kpi.muscle.delta),
      ], columnGap: 10, margin: [0, 0, 0, 24] },

      // Adherence donuts
      { text: 'ADHERENCE', color: C.muted, fontSize: 9, bold: true, characterSpacing: 1, margin: [0, 8, 0, 6] },
      { columns: [
        { svg: svgDonut(g.adherence.food.d / g.adherence.food.n, `Food ${g.adherence.food.d}/${g.adherence.food.n}`), alignment: 'center' },
        { svg: svgDonut(g.adherence.body.d / g.adherence.body.n, `Body ${g.adherence.body.d}/${g.adherence.body.n}`), alignment: 'center' },
        { svg: svgDonut(g.adherence.move.d / g.adherence.move.n, `Move ${g.adherence.move.d}/${g.adherence.move.n}`), alignment: 'center' },
      ]},
    ];

    function kpiTile(label, val, unit, delta) {
      const dColor = delta == null ? C.muted : (delta < 0 ? C.good : (delta > 0 ? C.warm : C.muted));
      const dText  = delta == null ? '—' : `${sign(delta)}${fmt(delta)} ${unit}`;
      return {
        table: { widths: ['*'], body: [[
          { stack: [
            { text: label.toUpperCase(), color: C.muted, fontSize: 8, characterSpacing: 1, margin: [0, 0, 0, 2] },
            { text: val != null ? `${fmt(val)} ${unit}` : '—', color: C.ink, fontSize: 18, bold: true },
            { text: dText, color: dColor, fontSize: 9, margin: [0, 4, 0, 0] },
          ], fillColor: C.card, border: [false, false, false, false], margin: [10, 10, 10, 10] }
        ]] }, layout: 'noBorders'
      };
    }

    const body = [
      sectionHead('Body Composition', `${monthLabel(ym)} · daily series`),
      chartBlock('Weight (kg)', svgLineChart({ values: xs, color: C.accent }), bodyStats(series, 'w', 'kg')),
      chartBlock('Muscle Mass (kg)', svgLineChart({ values: ys, color: C.good }), bodyStats(series, 'mm', 'kg')),
      chartBlock('Body Fat Mass (kg)', svgLineChart({ values: fs, color: C.warm }), bodyStats(series, 'fatKg', 'kg')),
      interpretation(bodyInterpretation(g, series)),
    ];

    const nutrition = [
      sectionHead('Nutrition', `Avg ${avgKcal != null ? Math.round(avgKcal) : '—'} kcal · target ${kcalTarget} kcal`),
      { svg: svgBarChart({ values: kcals, color: C.accent, target: kcalTarget }), margin: [0, 0, 0, 8] },
      // Macro stacked bar
      { text: 'AVERAGE MACRO SPLIT', color: C.muted, fontSize: 8, characterSpacing: 1, bold: true, margin: [0, 6, 0, 4] },
      { svg: stackedMacro(macroPct), margin: [0, 0, 0, 8] },
      { columns: [
        miniStat('P', avgP, 'g'),
        miniStat('F', avgF, 'g'),
        miniStat('C', avgC, 'g'),
        miniStat('Sugar≤', avg('su'), 'g'),
        miniStat('Fiber≥', avg('fb'), 'g'),
      ], columnGap: 6, margin: [0, 0, 0, 10] },
      { text: 'QUALITY FLAGS', color: C.muted, fontSize: 8, characterSpacing: 1, bold: true, margin: [0, 0, 0, 4] },
      { ul: [
        `Sugar above WHO 10% kcal: ${sugarOver} day${sugarOver === 1 ? '' : 's'}`,
        `Fiber below IOM floor (${fiberMin} g): ${fiberUnder} day${fiberUnder === 1 ? '' : 's'}`,
        `Protein below 1.6 g/kg muscle (${proteinThresh} g target): ${proteinUnder} day${proteinUnder === 1 ? '' : 's'}`,
      ], color: C.ink, fontSize: 10, margin: [10, 0, 0, 8] },
      interpretation(nutritionInterpretation(avgKcal, kcalTarget, macroPct)),
    ];

    const movement = [
      sectionHead('Movement', `MOVE = weight reps + cardio minutes`),
      { svg: svgBarChart({ values: moves, color: C.accent, target: null }), margin: [0, 0, 0, 8] },
      { columns: [
        miniStat('Active days', countWhere(series, (s) => s.move > 0), 'd'),
        miniStat('MOVE total', series.reduce((s, d) => s + d.move, 0), ''),
        miniStat('Longest streak', longestStreak(series), 'd'),
        miniStat('Avg/day', meanNonNull(series.map((s,i)=>({ x:i, y:s.move })), 'y'), ''),
      ], columnGap: 6, margin: [0, 0, 0, 10] },
      { text: 'TOP EXERCISES', color: C.muted, fontSize: 8, characterSpacing: 1, bold: true, margin: [0, 0, 0, 4] },
      topExercises.length ? exerciseTable(topExercises) : { text: 'No exercises logged this month.', color: C.muted, fontSize: 10 },
      interpretation(movementInterpretation(series)),
    ];

    const methodology = [
      sectionHead('Methodology & Disclaimers', ''),
      { text: 'Data sources', bold: true, fontSize: 10, color: C.ink, margin: [0, 6, 0, 2] },
      { text: 'All values are derived from your own FitLog-Koala entries (Food, Gym, Body Log). No external data is mixed in.', fontSize: 9.5, color: C.muted, margin: [0, 0, 0, 8] },
      { text: 'Reference ranges', bold: true, fontSize: 10, color: C.ink, margin: [0, 0, 0, 2] },
      { ul: [
        'BMI: WHO classification (Under <18.5 · Normal 18.5–25 · Over 25–30 · Obese 30+).',
        'Body Fat %: ACSM bands by sex (Female 20/24/31, Male 13/17/24).',
        'Sugar cap: WHO ≤ 10% of daily kcal.',
        'Fiber floor: IOM 25 g (Female) / 38 g (Male).',
        'Protein target: 1.6 g per kg skeletal muscle (ISSN 1.4–2.2 g/kg lean-mass range).',
        'TDEE: Mifflin–St Jeor BMR × activity factor (sedentary 1.2 … extra 1.9).',
      ], fontSize: 9.5, color: C.muted, margin: [10, 0, 0, 10] },
      { text: 'Disclaimer', bold: true, fontSize: 10, color: C.ink, margin: [0, 0, 0, 2] },
      { text: 'This report is generated from self-logged data for personal awareness only. It is not medical advice. Consult a registered clinician for diagnostic, nutritional or training prescriptions.', fontSize: 9.5, color: C.muted, italics: true },
    ];

    return {
      pageSize: 'A4',
      pageMargins: [40, 36, 40, 40],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: C.ink, lineHeight: 1.3 },
      info: { title: `Fitlog-Koala Health Report ${ym}`, author: 'Fitlog-Koala' },
      background: { canvas: [{ type: 'rect', x: 0, y: 0, w: 595, h: 842, color: C.paper }] },
      footer: function (currentPage, pageCount) {
        return { columns: [
          { text: 'Fitlog-Koala · be the koala you like to be.', color: C.muted, fontSize: 8, margin: [40, 0, 0, 0] },
          { text: `Page ${currentPage} / ${pageCount}`, color: C.muted, fontSize: 8, alignment: 'right', margin: [0, 0, 40, 0] },
        ]};
      },
      content: [
        ...cover, { text: '', pageBreak: 'after' },
        ...body, { text: '', pageBreak: 'after' },
        ...nutrition, { text: '', pageBreak: 'after' },
        ...movement, { text: '', pageBreak: 'after' },
        ...methodology,
      ],
    };
  }

  // ---- Section helpers ------------------------------------------------------
  function sectionHead(title, sub) {
    return { stack: [
      { text: title, bold: true, fontSize: 18, color: C.ink },
      sub ? { text: sub, color: C.muted, fontSize: 9.5, margin: [0, 1, 0, 12] } : { text: '', margin: [0, 0, 0, 12] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, lineColor: C.line }] },
    ], margin: [0, 0, 0, 10] };
  }
  function chartBlock(title, svg, statsLine) {
    return { stack: [
      { text: title, color: C.ink, fontSize: 11, bold: true, margin: [0, 8, 0, 2] },
      { svg, margin: [0, 0, 0, 2] },
      { text: statsLine, color: C.muted, fontSize: 9 },
    ]};
  }
  function bodyStats(series, key, unit) {
    const min = minOf(series, key), max = maxOf(series, key);
    const start = firstNonNull(series, key), end = lastNonNull(series, key);
    const mean = meanNonNull(series, key);
    const days = countWhere(series, (s) => s[key] != null);
    const d = delta(end, start);
    return `Days logged ${days} · min ${fmt(min)} · mean ${fmt(mean)} · max ${fmt(max)} · Δ ${sign(d)}${fmt(d)} ${unit}`;
  }
  function interpretation(text) {
    return { table: { widths: ['*'], body: [[
      { text, fillColor: C.card, fontSize: 10, color: C.ink, italics: true, lineHeight: 1.4, border: [false, true, false, false], borderColor: [null, C.warm, null, null], margin: [10, 8, 10, 8] }
    ]] }, layout: { hLineColor: () => C.warm, vLineColor: () => 'transparent', hLineWidth: (i) => i === 0 ? 2 : 0, vLineWidth: () => 0 }, margin: [0, 10, 0, 0] };
  }
  function bodyInterpretation(g, series) {
    const dW = g.kpi.weight.delta;
    const dM = g.kpi.muscle.delta;
    const dF = g.kpi.fatKg.delta;
    if (dW == null) return 'Not enough body-log entries to interpret a trend. Aim to weigh in at least 3×/week for next month.';
    if (dW < 0 && dM != null && dM >= 0) return `Weight down ${fmt(Math.abs(dW))} kg with muscle up ${fmt(dM)} kg — genuine recomposition. Caloric deficit working without lean-mass loss.`;
    if (dW < 0 && dM != null && dM < -0.3) return `Weight down ${fmt(Math.abs(dW))} kg but muscle also ↓ ${fmt(Math.abs(dM))} kg. Reduce the deficit and add a 3rd resistance day to spare lean mass.`;
    if (dW > 1 && dF != null && dF > 0.8) return `Weight up ${fmt(dW)} kg, ~${fmt(dF)} kg of it as fat mass. Surplus exceeds anabolic uptake; tighten kcal target by 10–15%.`;
    if (Math.abs(dW) <= 0.5) return `Steady month — ${fmt(dW)} kg net change is within normal hydration/glycogen swings. Use next month to shift one variable deliberately.`;
    return `Net change ${sign(dW)}${fmt(dW)} kg over the month. Layer one new habit next month (protein floor or one extra active day) and reassess.`;
  }
  function nutritionInterpretation(avgKcal, target, macros) {
    if (avgKcal == null) return 'Not enough food log entries to interpret intake.';
    const diff = avgKcal - target;
    const pct = Math.round((diff / target) * 100);
    const dir = diff < 0 ? 'deficit' : 'surplus';
    let msg = `Mean intake ${Math.round(avgKcal)} kcal vs. ${target} kcal target — ~${Math.abs(pct)}% ${dir}.`;
    if (macros.p < 20) msg += ' Protein share is low (<20%); aim for 25–35% to support muscle retention.';
    return msg;
  }
  function movementInterpretation(series) {
    const active = countWhere(series, (s) => s.move > 0);
    const total = series.length;
    const ratio = active / total;
    if (ratio >= 0.6) return `${active}/${total} active days — strong consistency. Progressive overload on top exercises will compound this discipline.`;
    if (ratio >= 0.4) return `${active}/${total} active days — moderate cadence. Aim for one extra session/week to cross the 60% threshold linked to recomposition outcomes.`;
    if (active === 0) return 'No movement logged this month. Even two 30-minute sessions/week begin to bend the body-comp trajectory.';
    return `${active}/${total} active days — sporadic. Schedule sessions like calendar items; spontaneity rarely beats friction.`;
  }
  function longestStreak(series) {
    let best = 0, cur = 0;
    series.forEach((s) => {
      if (s.move >= 50) { cur++; best = Math.max(best, cur); }
      else cur = 0;
    });
    return best;
  }
  function miniStat(label, value, unit) {
    return { stack: [
      { text: label.toUpperCase(), color: C.muted, fontSize: 7, characterSpacing: 0.8 },
      { text: value != null ? `${typeof value === 'number' ? fmt(value, 0) : value}${unit ? ' ' + unit : ''}` : '—', color: C.ink, fontSize: 13, bold: true, margin: [0, 2, 0, 0] },
    ], alignment: 'center' };
  }
  function stackedMacro(m) {
    const W = 515, H = 18;
    const pPct = m.p / 100, fPct = m.f / 100, cPct = m.c / 100;
    const pW = pPct * W, fW = fPct * W, cW = cPct * W;
    const fxt = (n) => `${Math.round(n)}%`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 14}">
      <rect x="0" y="0" width="${pW}" height="${H}" fill="${C.accent}"/>
      <rect x="${pW}" y="0" width="${fW}" height="${H}" fill="${C.warm}"/>
      <rect x="${pW + fW}" y="0" width="${cW}" height="${H}" fill="${C.good}"/>
      <text x="${pW / 2}" y="${H/2 + 4}" text-anchor="middle" font-family="Helvetica" font-size="9" fill="white" font-weight="700">P ${fxt(m.p)}</text>
      <text x="${pW + fW/2}" y="${H/2 + 4}" text-anchor="middle" font-family="Helvetica" font-size="9" fill="white" font-weight="700">F ${fxt(m.f)}</text>
      <text x="${pW + fW + cW/2}" y="${H/2 + 4}" text-anchor="middle" font-family="Helvetica" font-size="9" fill="white" font-weight="700">C ${fxt(m.c)}</text>
    </svg>`;
  }
  function exerciseTable(exs) {
    return {
      table: {
        widths: ['*', 50, 50, 50],
        body: [
          [
            { text: 'Exercise', color: C.muted, fontSize: 8, bold: true, border: [false, false, false, true], borderColor: [null, null, null, C.line] },
            { text: 'Sets/Rows', color: C.muted, fontSize: 8, bold: true, alignment: 'right', border: [false, false, false, true], borderColor: [null, null, null, C.line] },
            { text: 'Reps', color: C.muted, fontSize: 8, bold: true, alignment: 'right', border: [false, false, false, true], borderColor: [null, null, null, C.line] },
            { text: 'Kg / Min', color: C.muted, fontSize: 8, bold: true, alignment: 'right', border: [false, false, false, true], borderColor: [null, null, null, C.line] },
          ],
          ...exs.map((e) => [
            { text: e.name, color: C.ink, fontSize: 10, border: [false, false, false, false] },
            { text: String(e.count), alignment: 'right', fontSize: 10, color: C.ink, border: [false, false, false, false] },
            { text: e.kind === 'cardio' ? '—' : String(e.reps), alignment: 'right', fontSize: 10, color: C.ink, border: [false, false, false, false] },
            { text: e.kind === 'cardio' ? `${e.min} min` : `${e.kg.toFixed(0)} kg`, alignment: 'right', fontSize: 10, color: C.ink, border: [false, false, false, false] },
          ]),
        ]
      },
      layout: 'noBorders',
    };
  }

  // ---- Public API -----------------------------------------------------------
  function whoLabel() {
    try {
      const u = window.firebase && firebase.auth().currentUser;
      if (u) return `${u.displayName || u.email || 'User'} · ${u.email || ''}`.trim();
    } catch (_) {}
    return 'cyy.add@gmail.com';
  }

  function currentReportMonth() {
    const el = document.getElementById('fl-report-month');
    if (el && el.value) return el.value;
    // Default = last completed month if past day 7, else current month.
    const now = new Date();
    const ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    return ym;
  }

  function setStatus(msg, tone) {
    const el = document.getElementById('fl-report-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = tone === 'bad' ? C.bad : tone === 'good' ? C.good : C.muted;
  }

  async function generatePdfBlob(ym) {
    if (typeof pdfMake === 'undefined') throw new Error('pdfmake not loaded');
    const doc = buildDocDef(ym, whoLabel());
    return await new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(doc).getBlob((blob) => resolve(blob));
      } catch (e) { reject(e); }
    });
  }

  async function downloadReport() {
    const ym = currentReportMonth();
    setStatus(`Generating ${monthLabel(ym)} report…`);
    try {
      const blob = await generatePdfBlob(ym);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fitlog-Koala_Health-Report_${ym}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Downloaded · ${monthLabel(ym)}`, 'good');
    } catch (e) {
      console.error('[report] download error', e);
      setStatus(`Error: ${e.message || e}`, 'bad');
    }
  }

  async function emailReport() {
    const ym = currentReportMonth();
    setStatus(`Generating ${monthLabel(ym)} report…`);
    try {
      const user = window.firebase && firebase.auth().currentUser;
      if (!user) throw new Error('Sign in first to email reports');
      const blob = await generatePdfBlob(ym);
      const pdfBase64 = await blobToBase64NoPrefix(blob);
      const idToken = await user.getIdToken();
      setStatus(`Sending to your inbox…`);
      const r = await fetch('/api/health-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          yearMonth: ym,
          pdfBase64,
          filename: `Fitlog-Koala_Health-Report_${ym}.pdf`,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (j && j.error && j.error.message) || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setStatus(`Sent to ${j.to} · message id ${j.messageId || '—'}`, 'good');
    } catch (e) {
      console.error('[report] email error', e);
      setStatus(`Error: ${e.message || e}`, 'bad');
    }
  }
  function blobToBase64NoPrefix(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => {
        try { resolve(String(r.result).split(',')[1]); }
        catch (e) { reject(e); }
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // Site launch month — first month the report can cover. Update only if the
  // launch date ever changes (it shouldn't).
  const LAUNCH_YEAR = 2026;
  const LAUNCH_MONTH = 5; // May 2026

  function populateMonthOptions(selectEl) {
    if (!selectEl) return;
    if (selectEl.tagName !== 'SELECT') return; // safety if HTML reverts to input
    selectEl.innerHTML = '';
    const now = new Date();
    // Walk from the current month back to the launch month inclusive. As real
    // time advances, more options appear automatically.
    let y = now.getFullYear();
    let m = now.getMonth() + 1; // 1..12
    while (y > LAUNCH_YEAR || (y === LAUNCH_YEAR && m >= LAUNCH_MONTH)) {
      const ym = `${y}-${pad2(m)}`;
      const opt = document.createElement('option');
      opt.value = ym;
      opt.textContent = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      selectEl.appendChild(opt);
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    // Default = current month (first option in the list).
    selectEl.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  }

  // ---- Wire up on DOM ready --------------------------------------------------
  function init() {
    const monthEl = document.getElementById('fl-report-month');
    const dl = document.getElementById('fl-report-download');
    const em = document.getElementById('fl-report-email');
    populateMonthOptions(monthEl);
    if (dl) dl.addEventListener('click', downloadReport);
    if (em) em.addEventListener('click', emailReport);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // expose for headless verification
  window.FitlogReport = { generatePdfBlob, buildDocDef, gatherMonth, gradeMonth };
})();
