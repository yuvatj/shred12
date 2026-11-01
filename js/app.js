/* Shred12 — mobile-style single-page app. Views render into #view; all data lives in Store.state. */
const S = Store.load();
const EX = Object.fromEntries(window.EXERCISE_DB.map(e => [e.id, e]));
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const charts = [];

/* ---------- utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n || 0);
const r1 = n => (Math.round((n || 0) * 10) / 10).toFixed(1);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const today = () => iso(new Date());
const fmtDate = s => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let day = today();
let currentView = 'home';
const ui = { metric: 'weight', range: '2W', foodTab: 'log', trainTab: 'today', planTab: 'roadmap', mealDay: 0 };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2000);
}
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalBody').innerHTML = ''; }
function save() { Store.save(); }
function seg(name, options, active) {
  return `<div class="seg" data-seg="${name}">${options.map(([k, l]) => `<button data-segv="${k}" class="${k === active ? 'active' : ''}">${l}</button>`).join('')}</div>`;
}
function bindSeg(el, name, fn) { $$(`[data-seg="${name}"] [data-segv]`, el).forEach(b => b.onclick = () => fn(b.dataset.segv)); }

/* ---------- derived data ---------- */
const P = () => S.profile;
const sortedWeights = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
const weightOn = date => S.weights.find(w => w.date === date);
function weightAt(date) {
  const w = sortedWeights().filter(x => x.date <= date);
  return w.length ? w[w.length - 1] : sortedWeights()[0];
}
function bfAt(date) {
  const w = sortedWeights().filter(x => x.date <= date && x.bf);
  return w.length ? w[w.length - 1].bf : P().startBf;
}
function targetsFor(date) {
  const w = weightAt(date);
  const t = Sci.targets(P(), w.kg, bfAt(date));
  if (S.calorieAdj) { t.kcal += S.calorieAdj; t.carbs = Math.max(0, t.carbs + Math.round(S.calorieAdj / 4)); }
  return t;
}
function programWeek(date) { return Math.floor(daysBetween(P().startDate, date) / 7) + 1; }
const planWeek = date => clamp(programWeek(date), 1, 12);
function split() { return PROGRAM.splits[P().split] || PROGRAM.splits.upper_lower; }
function scheduledDay(date) { const dow = parse(date).getDay(); return split().days.find(d => d.dow === dow); }
function foodTotals(date) {
  return (S.food[date] || []).reduce((t, x) => ({ kcal: t.kcal + x.kcal, p: t.p + x.p, c: t.c + x.c, f: t.f + x.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}
function isTrainingDay(date) { const d = scheduledDay(date); return d && !d.rest; }
function waterTarget(date) { return Sci.waterTarget(weightAt(date).kg, isTrainingDay(date)); }
function lastDays(n, end = day) { return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1)); }
let _proj = null;
function projection() {
  const p = P(), key = [p.startWeight, p.startBf, p.rate].join();
  if (!_proj || _proj.key !== key) _proj = { key, data: Sci.projection(p, p.startWeight, p.startBf) };
  return _proj.data;
}
/* Ideal weight on any date: the 12-week plan curve, interpolated per day. */
function idealWeight(date) {
  const proj = projection(), w = clamp(daysBetween(P().startDate, date) / 7, 0, 12);
  const i = Math.floor(w), f = w - i, a = proj[i], b = proj[Math.min(12, i + 1)];
  return a.kg + (b.kg - a.kg) * f;
}
const bmiOf = kg => Sci.bmi(kg, P().height);

/* ---------- charts ---------- */
function destroyCharts() { while (charts.length) charts.pop().destroy(); }
function chart(canvasId, config) {
  const el = document.getElementById(canvasId); if (!el || !window.Chart) return;
  const grid = css('--line');
  Chart.defaults.color = css('--muted'); Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.font.size = 11;
  const base = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 450 },
    plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true } } },
    scales: config.type === 'doughnut' ? {} : { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { grid: { color: grid }, ticks: { maxTicksLimit: 5 } } },
  };
  config.options = deepMerge(base, config.options || {});
  charts.push(new Chart(el, config));
}
function deepMerge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k];
  return o;
}
function gradient(hex) {
  return ctx => {
    const { chart: c } = ctx, a = c.chartArea; if (!a) return 'transparent';
    const g = c.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, hex + '55'); g.addColorStop(1, hex + '00'); return g;
  };
}

/* ---------- small components ---------- */
function ring(value, max, color, label, sub, size = 120) {
  const pct = Math.min(1, max ? value / max : 0), R = size / 2 - 10, C = 2 * Math.PI * R;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${R}" stroke="var(--card2)" stroke-width="11" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${R}" stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .6s"/></svg>
    <div class="center"><b>${label}</b><small>${sub}</small></div></div>`;
}
function macroBar(name, val, target, color) {
  const pct = Math.min(100, target ? (val / target) * 100 : 0);
  return `<div class="macro-row"><span>${name}</span><div class="bar"><div style="width:${pct}%;background:${color}"></div></div><span>${r0(val)}/${target} g</span></div>`;
}
function refLink(key) { const r = REFS[key]; return r ? `<a class="cite" href="${r.u}" target="_blank" rel="noopener">[${esc(r.t.split(' — ')[0])}]</a>` : ''; }
function exImg(e, i = 0) { return e?.images?.[i] ? IMG_BASE + e.images[i] : ''; }

/* ---------- router ---------- */
const VIEWS = {
  home: { t: () => `Hi${P().name ? ', ' + esc(P().name) : ''} 👋`, r: renderHome },
  food: { t: () => 'Food', r: renderFood },
  train: { t: () => 'Train', r: renderTrain },
  plan: { t: () => 'My Plan', r: renderPlan },
  me: { t: () => 'Me', r: renderMe },
};
function dayLabel() {
  const diff = daysBetween(today(), day);
  return diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : fmtDate(day);
}
function render() {
  destroyCharts();
  $('#dayPicker').value = day; $('#dayLabel').textContent = dayLabel();
  const onboarding = !P();
  $('#nav').style.display = onboarding ? 'none' : '';
  $('.date-chip').style.display = onboarding ? 'none' : '';
  if (onboarding) { $('#viewTitle').textContent = 'Welcome'; $('#viewSub').textContent = 'Let’s build your 12-week plan'; renderOnboarding($('#view')); return; }
  const v = VIEWS[currentView], wk = programWeek(day);
  $('#viewTitle').innerHTML = v.t();
  $('#viewSub').textContent = wk >= 1 && wk <= 12 ? `Week ${wk} of 12 · ${PROGRAM.phaseFor(wk).name}` : wk < 1 ? 'Plan starts soon' : 'Plan complete 🎉';
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === currentView));
  v.r($('#view'));
}
function go(view) { currentView = view; render(); $('#view').scrollTop = 0; }

/* ---------- onboarding wizard ---------- */
const wiz = { step: 0, d: { sex: 'male', age: 30, height: 175, weight: 80, neck: 38, waist: 90, hip: '', knownBf: '', goalBf: 15, rate: 0.7, activity: 1.55, split: 'ppl', diet: 'any', name: '' } };
function renderOnboarding(el) {
  const d = wiz.d, steps = [
    { title: 'About you', body: `<div class="fields">
      <label class="full">Your name<input name="name" value="${esc(d.name)}" placeholder="Optional"></label>
      <div class="full choice" style="grid-template-columns:1fr 1fr">${[['male', '♂ Male'], ['female', '♀ Female']].map(([v, l]) => `<label><input type="radio" name="sex" value="${v}" ${d.sex === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <label>Age<input name="age" type="number" inputmode="numeric" value="${d.age}"></label>
      <label>Height (cm)<input name="height" type="number" inputmode="decimal" value="${d.height}"></label></div>` },
    { title: 'Your body today', body: `<div class="fields">
      <label class="full">Weight (kg)<input name="weight" type="number" inputmode="decimal" step="0.1" value="${d.weight}"></label>
      <label>Waist (cm)<input name="waist" type="number" inputmode="decimal" step="0.1" value="${d.waist}"></label>
      <label>Neck (cm)<input name="neck" type="number" inputmode="decimal" step="0.1" value="${d.neck}"></label>
      ${d.sex === 'female' ? `<label class="full">Hips (cm)<input name="hip" type="number" inputmode="decimal" step="0.1" value="${d.hip}"></label>` : ''}
      <label class="full">Know your body fat %? (optional)<input name="knownBf" type="number" inputmode="decimal" step="0.1" value="${d.knownBf}" placeholder="Leave blank — we'll estimate it"></label></div>
      <p class="callout" style="margin-top:14px">Measure your waist at the belly button${d.sex === 'female' ? ' (narrowest point for women)' : ''} and your neck just below the Adam's apple. We use these to estimate body fat with the U.S. Navy method.</p>` },
    { title: 'Your goal', body: `<label>Goal body fat %<input name="goalBf" type="number" inputmode="decimal" step="0.5" value="${d.goalBf}"></label>
      <p class="section-title" style="margin:16px 0 8px">How fast?</p><div class="choice">
      ${[[0.5, 'Steady', '0.5% of bodyweight / week — easiest to stick with'], [0.7, 'Recommended', '0.7% / week — best balance of speed and keeping muscle'], [1.0, 'Fast', '1% / week — harder, more hunger']].map(([v, l, s]) => `<label><input type="radio" name="rate" value="${v}" ${+d.rate === v ? 'checked' : ''}><div><b>${l}</b><small>${s}</small></div></label>`).join('')}</div>` },
    { title: 'Your routine', body: `<label>Daily activity<select name="activity">${Sci.ACTIVITY.map(a => `<option value="${a.v}" ${+d.activity === a.v ? 'selected' : ''}>${a.l}</option>`).join('')}</select></label>
      <p class="section-title" style="margin:16px 0 8px">Workout plan</p><div class="choice">
      ${Object.entries(PROGRAM.splits).map(([k, s]) => `<label><input type="radio" name="split" value="${k}" ${d.split === k ? 'checked' : ''}><b>${s.name}</b></label>`).join('')}</div>
      <p class="section-title" style="margin:16px 0 8px">Diet</p><div class="choice" style="grid-template-columns:1fr 1fr">
      ${[['any', '🍗 Everything'], ['veg', '🥦 Vegetarian']].map(([v, l]) => `<label><input type="radio" name="diet" value="${v}" ${d.diet === v ? 'checked' : ''}>${l}</label>`).join('')}</div>` },
  ];
  const s = steps[wiz.step], last = wiz.step === steps.length - 1;
  el.innerHTML = `<div class="stack">
    <div class="wizard-dots">${steps.map((_, i) => `<span class="${i <= wiz.step ? 'on' : ''}"></span>`).join('')}</div>
    <div class="card"><h3>${s.title}</h3><form id="wizForm">${s.body}</form></div>
    <div class="row">${wiz.step ? '<button id="wBack">Back</button>' : ''}<button class="primary block" id="wNext">${last ? 'Create my plan 🚀' : 'Continue'}</button></div>
    ${wiz.step === 0 ? '<p class="muted" style="text-align:center;font-size:13px">Your data stays private on this device.</p>' : ''}</div>`;
  const collect = () => {
    const f = new FormData($('#wizForm'));
    for (const [k, v] of f) d[k] = v;
  };
  $$('#wizForm input[name="sex"]').forEach(r => r.onchange = () => { collect(); });
  if ($('#wBack')) $('#wBack').onclick = () => { collect(); wiz.step--; render(); };
  $('#wNext').onclick = () => {
    collect();
    if (!last) { wiz.step++; render(); return; }
    finishOnboarding();
  };
}
function finishOnboarding() {
  const d = wiz.d, height = +d.height, kg = +d.weight;
  const navy = Sci.navyBodyFat(d.sex, height, +d.neck, +d.waist, +d.hip);
  const bf = d.knownBf ? +d.knownBf : navy ? +navy.toFixed(1) : null;
  S.profile = {
    name: d.name.trim(), sex: d.sex, age: +d.age, height, goalBf: +d.goalBf, activity: +d.activity, rate: +d.rate,
    split: d.split, diet: d.diet, startDate: today(), asianBmi: false, knownBf: d.knownBf ? +d.knownBf : null,
    startWeight: kg, startBf: bf || (d.sex === 'male' ? 25 : 32),
  };
  S.weights.push({ date: today(), kg, neck: +d.neck || null, waist: +d.waist || null, hip: +d.hip || null, bf });
  save(); toast('Your plan is ready!'); go('home');
}

/* ---------- HOME: metric tiles + You vs Ideal line graph + quick entry ---------- */
const METRICS = {
  weight: {
    label: 'Weight', color: '--weight', unit: 'kg', icon: '⚖',
    actual: d => weightOn(d)?.kg ?? null, ideal: d => +idealWeight(d).toFixed(1), fmt: v => r1(v),
  },
  water: {
    label: 'Water', color: '--water', unit: 'L', icon: '💧',
    actual: d => S.water[d] ? +(S.water[d] / 1000).toFixed(2) : null, ideal: d => waterTarget(d) / 1000, fmt: v => (+v).toFixed(1),
  },
  calories: {
    label: 'Calories', color: '--kcal', unit: 'kcal', icon: '🔥',
    actual: d => (S.food[d] || []).length ? r0(foodTotals(d).kcal) : null, ideal: d => targetsFor(d).kcal, fmt: v => r0(v).toLocaleString(),
  },
  bmi: {
    label: 'BMI', color: '--bmi', unit: '', icon: '📏',
    actual: d => weightOn(d) ? +bmiOf(weightOn(d).kg).toFixed(1) : null, ideal: d => +bmiOf(idealWeight(d)).toFixed(1), fmt: v => r1(v),
  },
};
function tileValues(key) {
  const m = METRICS[key];
  if (key === 'weight') return { v: r1(weightAt(day).kg), sub: `Ideal today ${r1(idealWeight(day))}` };
  if (key === 'bmi') return { v: r1(bmiOf(weightAt(day).kg)), sub: `Ideal today ${r1(bmiOf(idealWeight(day)))}` };
  if (key === 'water') return { v: ((S.water[day] || 0) / 1000).toFixed(1), sub: `Goal ${m.fmt(m.ideal(day))} L` };
  return { v: r0(foodTotals(day).kcal).toLocaleString(), sub: `Goal ${m.fmt(m.ideal(day))}` };
}
function renderHome(el) {
  const p = P(), bf = bfAt(day), wk = planWeek(day);
  const bfProgress = clamp(((p.startBf - bf) / (p.startBf - p.goalBf)) * 100, 0, 100);
  const m = METRICS[ui.metric], color = css(m.color);
  const sd = scheduledDay(day), ws = S.workouts[day];
  el.innerHTML = `<div class="stack">
    <div class="card hero">
      <div class="row"><div><small>Body fat</small><div class="big">${r1(bf)}<small>% → ${p.goalBf}%</small></div></div><span class="spacer"></span>
      <span class="pill ${Sci.bfCategory(p.sex, bf).c}">${Sci.bfCategory(p.sex, bf).l}</span></div>
      <div class="bar" style="margin:12px 0 6px"><div style="width:${bfProgress}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></div></div>
      <small>${r0(bfProgress)}% to goal · ${Math.max(0, 84 - daysBetween(p.startDate, day))} days left · ${PROGRAM.phaseFor(wk).name} phase</small>
    </div>

    <div class="tiles">${Object.entries(METRICS).map(([k, x]) => { const t = tileValues(k); return `<button class="tile ${ui.metric === k ? 'active' : ''}" data-metric="${k}" style="--c:var(${x.color})">
      <span class="t-head"><span class="t-dot" style="background:var(${x.color})"></span>${x.label}</span>
      <span class="t-val">${t.v}<small> ${x.unit}</small></span><span class="t-goal">${t.sub}</span></button>`; }).join('')}</div>

    <div class="card chart-card">
      <h3>${m.icon} ${m.label}: you vs ideal<span class="spacer"></span></h3>
      ${seg('range', [['2W', '2 weeks'], ['12W', '12-week plan']], ui.range)}
      <div class="legend" style="margin-top:12px"><span><i style="background:${color}"></i>You</span><span><i class="dash"></i>Ideal${ui.metric === 'weight' || ui.metric === 'bmi' ? ' path' : ' goal'}</span></div>
      <div class="chart-box"><canvas id="cMetric"></canvas></div>
      <div class="status-line" id="statusLine">${metricStatus(ui.metric)}</div>
    </div>

    <div class="card">${entryCard(ui.metric)}</div>

    <div class="card"><div class="row" style="margin-bottom:8px">${focusBadge(sd)}<span class="spacer"></span>${ws?.done ? '<span class="pill good">✓ Done</span>' : ''}</div><h3>${esc(sd.name)}</h3>
      <p class="muted" style="margin:0 0 12px;font-size:14px">${sd.rest ? 'Recovery day — walk, stretch, sleep well.' : sd.cardio ? 'Cardio day — easy pace you can talk at.' : `${sd.ex.length} exercises · ${PROGRAM.phaseFor(wk).sets} sets × ${PROGRAM.phaseFor(wk).reps}`}</p>
      <div class="row"><button class="primary" style="flex:1" data-go="train">${sd.rest ? 'View plan' : ws?.done ? 'View workout' : 'Start workout'}</button>
      <input type="number" inputmode="numeric" id="stepsInput" value="${S.steps[day] || ''}" placeholder="Steps" style="width:110px"></div>
    </div>

    <div class="card"><h3>💊 Today's supplements</h3>${suppChecklist()}</div>
  </div>`;
  metricChart();
  bindHome(el);
}
function metricRange() {
  if (ui.range === '12W') { const s = P().startDate; return Array.from({ length: 85 }, (_, i) => addDays(s, i)); }
  return lastDays(14);
}
function metricChart() {
  const m = METRICS[ui.metric], color = css(m.color), dates = metricRange();
  const actual = dates.map(d => d > today() ? null : m.actual(d));
  const ideal = dates.map(d => m.ideal(d));
  const datasets = [
    { label: 'You', data: actual, borderColor: color, backgroundColor: gradient(color), fill: ui.metric === 'water' || ui.metric === 'calories' ? 'origin' : false, spanGaps: true, tension: .35, borderWidth: 3, pointRadius: ui.range === '12W' ? 0 : 3.5, pointBackgroundColor: color },
    { label: 'Ideal', data: ideal, borderColor: css('--muted'), borderDash: [6, 5], borderWidth: 2, pointRadius: 0, tension: .2 },
  ];
  const opts = { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw == null ? '—' : m.fmt(c.raw)} ${m.unit}` } } } };
  if (ui.metric === 'bmi') {
    datasets.push({ label: 'Healthy limit', data: dates.map(() => P().asianBmi ? 23 : 25), borderColor: css('--accent') + '88', borderWidth: 1, pointRadius: 0, borderDash: [2, 4] });
  }
  if (ui.metric === 'water' || ui.metric === 'calories') opts.scales = { y: { beginAtZero: true } };
  chart('cMetric', { type: 'line', data: { labels: dates.map(fmtDate), datasets }, options: opts });
}
function metricStatus(key) {
  const m = METRICS[key];
  if (key === 'weight' || key === 'bmi') {
    const cur = weightAt(day).kg, ideal = idealWeight(day), diff = cur - ideal;
    const txt = Math.abs(diff) < 0.3 ? '<span class="pill good">On track</span> Right on your ideal path.'
      : diff > 0 ? `<span class="pill warn">${r1(diff)} kg above</span> ideal path — tighten calories & steps.`
      : `<span class="pill good">${r1(-diff)} kg ahead</span> of plan — great work, don't cut further.`;
    if (key === 'bmi') { const c = Sci.bmiCategory(bmiOf(cur), P().asianBmi); return `<span class="pill ${c.c}">${c.l}</span> Healthy weight for your height: ${r1(18.5 * (P().height / 100) ** 2)}–${r1((P().asianBmi ? 23 : 25) * (P().height / 100) ** 2)} kg`; }
    return txt;
  }
  if (key === 'water') {
    const left = waterTarget(day) - (S.water[day] || 0);
    return left > 0 ? `<span class="pill warn">${(left / 1000).toFixed(2)} L to go</span> ${isTrainingDay(day) ? 'Includes +0.5 L for training.' : ''}` : '<span class="pill good">Goal reached 💧</span>';
  }
  const left = m.ideal(day) - foodTotals(day).kcal;
  return left >= 0 ? `<span class="pill good">${r0(left)} kcal left</span> Protein ${r0(foodTotals(day).p)}/${targetsFor(day).protein} g` : `<span class="pill bad">${r0(-left)} kcal over</span> Balance it out with a walk.`;
}
function entryCard(key) {
  if (key === 'weight' || key === 'bmi') {
    const w = weightOn(day)?.kg ?? weightAt(day).kg;
    const bmiScale = key === 'bmi' ? (() => {
      const b = bmiOf(weightAt(day).kg), pos = clamp(((b - 15) / 25) * 100, 0, 100);
      return `<div style="margin:4px 0 16px"><div class="bar" style="height:12px;background:linear-gradient(90deg,#60a5fa 0 14%,#22d3a6 14% 40%,#f59e0b 40% 60%,#f87171 60%)"></div>
        <div style="position:relative;height:16px"><span style="position:absolute;left:calc(${pos}% - 6px);top:-2px;font-size:12px">▲</span></div>
        <div class="row" style="font-size:11px;color:var(--muted)"><span>15</span><span class="spacer"></span><span>18.5</span><span class="spacer"></span><span>25</span><span class="spacer"></span><span>30</span><span class="spacer"></span><span>40</span></div></div>`;
    })() : '';
    return `<h3>${key === 'bmi' ? 'Update BMI' : 'Log weight'} <small>· ${dayLabel()}</small></h3>${bmiScale}
      <div class="stepper"><button data-step="-0.1">−</button><input id="wInput" type="number" inputmode="decimal" step="0.1" value="${r1(w)}"><button data-step="0.1">+</button></div>
      <div class="unit">kilograms${key === 'bmi' ? ' — BMI updates automatically from your weight' : ''}</div>
      <button class="primary block" id="saveWeight" style="margin-top:14px">${weightOn(day) ? 'Update' : 'Save'} weight</button>
      <button class="ghost block" id="openMeasure" style="margin-top:4px;font-size:14px">＋ Add waist/neck for body-fat %</button>`;
  }
  if (key === 'water') {
    const ml = S.water[day] || 0, t = waterTarget(day);
    return `<h3>Add water <small>· ${(ml / 1000).toFixed(2)} / ${(t / 1000).toFixed(1)} L</small></h3>
      <div class="bar" style="height:12px;margin-bottom:14px"><div style="width:${Math.min(100, (ml / t) * 100)}%;background:var(--water)"></div></div>
      <div class="quick">${[250, 500, 750].map(v => `<button data-water="${v}">+${v} ml</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="danger" data-water="-250" style="flex:1">− 250</button><button class="primary" id="fillGoal" style="flex:2" ${ml >= t ? 'disabled' : ''}>✓ Reached my goal</button></div>`;
  }
  const t = targetsFor(day), ft = foodTotals(day);
  return `<h3>Add calories <small>· ${r0(ft.kcal)} / ${t.kcal}</small></h3>
    <div class="stepper"><button data-kstep="-50">−</button><input id="kInput" type="number" inputmode="numeric" step="10" value="400"><button data-kstep="50">+</button></div>
    <div class="unit">kcal — quick add</div>
    <div class="chips" style="margin:12px 0">${MEALS.map((m, i) => `<button data-kmeal="${m}" class="${i === suggestedMeal() ? 'active' : ''}" style="text-transform:capitalize">${m}</button>`).join('')}</div>
    <button class="primary block" id="addKcal">Add calories</button>
    <div class="row" style="margin-top:8px"><button style="flex:1" id="searchFood">🔍 Search food</button><button style="flex:1" id="logPlan">🥗 Log meal plan</button></div>`;
}
function suggestedMeal() { const h = new Date().getHours(); return h < 11 ? 0 : h < 15 ? 1 : h < 18 ? 3 : 2; }
function bindHome(el) {
  bindCommon(el);
  $$('[data-metric]', el).forEach(b => b.onclick = () => { ui.metric = b.dataset.metric; render(); });
  bindSeg(el, 'range', v => { ui.range = v; render(); });
  $('#stepsInput').onchange = e => { S.steps[day] = +e.target.value || 0; save(); toast('Steps saved'); };
  // weight / bmi
  $$('[data-step]', el).forEach(b => b.onclick = () => { const i = $('#wInput'); i.value = r1(+i.value + +b.dataset.step); });
  if ($('#saveWeight')) $('#saveWeight').onclick = () => {
    const kg = +$('#wInput').value; if (!kg || kg < 25 || kg > 350) return toast('Enter a valid weight');
    const prev = weightOn(day) || {};
    S.weights = S.weights.filter(x => x.date !== day).concat({ ...prev, date: day, kg, bf: prev.bf ?? null });
    save(); toast('Weight saved ✓'); render();
  };
  if ($('#openMeasure')) $('#openMeasure').onclick = openMeasureSheet;
  // water
  const fg = $('#fillGoal'); if (fg) fg.onclick = () => { S.water[day] = Math.max(S.water[day] || 0, waterTarget(day)); save(); toast('Water goal reached 💧'); render(); };
  // calories
  let meal = MEALS[suggestedMeal()];
  $$('[data-kmeal]', el).forEach(b => b.onclick = () => { meal = b.dataset.kmeal; $$('[data-kmeal]', el).forEach(x => x.classList.toggle('active', x === b)); });
  $$('[data-kstep]', el).forEach(b => b.onclick = () => { const i = $('#kInput'); i.value = Math.max(0, +i.value + +b.dataset.kstep); });
  if ($('#addKcal')) $('#addKcal').onclick = () => {
    const kcal = +$('#kInput').value; if (!kcal) return;
    (S.food[day] ||= []).push({ uid: uid(), meal, name: 'Quick add', g: 0, kcal, p: 0, c: 0, f: 0 });
    save(); toast(`+${kcal} kcal`); render();
  };
  if ($('#searchFood')) $('#searchFood').onclick = () => openFoodPicker(meal);
  if ($('#logPlan')) $('#logPlan').onclick = openPlanLogger;
}
function openMeasureSheet() {
  const p = P(), e = weightOn(day) || {}, last = weightAt(day);
  openModal(`<h3>Body measurements · ${dayLabel()}</h3><form id="mForm" class="stack"><div class="fields">
    <label class="full">Weight (kg)<input name="kg" type="number" inputmode="decimal" step="0.1" required value="${r1(e.kg ?? last.kg)}"></label>
    <label>Waist (cm)<input name="waist" type="number" inputmode="decimal" step="0.1" value="${e.waist || ''}" placeholder="${last.waist || ''}"></label>
    <label>Neck (cm)<input name="neck" type="number" inputmode="decimal" step="0.1" value="${e.neck || ''}" placeholder="${last.neck || ''}"></label>
    ${p.sex === 'female' ? `<label class="full">Hips (cm)<input name="hip" type="number" inputmode="decimal" step="0.1" value="${e.hip || ''}" placeholder="${last.hip || ''}"></label>` : ''}
    <label class="full">Body fat % from a scan (optional)<input name="bf" type="number" inputmode="decimal" step="0.1" placeholder="Auto-calculated"></label></div>
    <button class="primary block">Save measurements</button></form>
    <p class="cite">Measure once a week, same time of day. Body fat uses the U.S. Navy formula.</p>`);
  $('#mForm').onsubmit = ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const entry = { date: day, kg: +f.kg, waist: +f.waist || null, neck: +f.neck || null, hip: +f.hip || null };
    const navy = Sci.navyBodyFat(p.sex, p.height, entry.neck || last.neck, entry.waist, entry.hip || last.hip);
    entry.bf = f.bf ? +f.bf : entry.waist && navy ? +navy.toFixed(1) : e.bf ?? null;
    S.weights = S.weights.filter(x => x.date !== day).concat(entry);
    save(); closeModal(); toast('Measurements saved'); render();
  };
}
function suppChecklist() {
  const chosen = P().supps || ['creatine', 'protein', 'vitd'];
  const list = SUPPS.filter(s => s.tier !== 'C' && chosen.includes(s.id)), done = S.supps[day] || {};
  return list.map(s => `<label class="check" style="margin:8px 0"><input type="checkbox" data-supp="${s.id}" ${done[s.id] ? 'checked' : ''}>${esc(s.name)}</label>`).join('') +
    `<small><a href="#" data-go="plan" data-plantab="supps">Choose supplements →</a></small>`;
}
function bindCommon(el) {
  $$('[data-go]', el).forEach(b => b.onclick = e => { e.preventDefault(); if (b.dataset.plantab) ui.planTab = b.dataset.plantab; if (b.dataset.traintab) ui.trainTab = b.dataset.traintab; go(b.dataset.go); });
  $$('[data-water]', el).forEach(b => b.onclick = () => { S.water[day] = Math.max(0, (S.water[day] || 0) + +b.dataset.water); save(); render(); });
  $$('[data-supp]', el).forEach(c => c.onchange = () => { S.supps[day] = { ...(S.supps[day] || {}), [c.dataset.supp]: c.checked }; save(); });
}

/* ---------- FOOD ---------- */
function renderFood(el) {
  el.innerHTML = `<div class="stack">${seg('food', [['log', 'Food log'], ['prep', 'Meal prep']], ui.foodTab)}<div id="fBody" class="stack"></div></div>`;
  bindSeg(el, 'food', v => { ui.foodTab = v; render(); });
  (ui.foodTab === 'log' ? foodLog : mealPrep)($('#fBody'));
}
function foodLog(el) {
  const t = targetsFor(day), ft = foodTotals(day), items = S.food[day] || [], left = t.kcal - ft.kcal;
  el.innerHTML = `
  <div class="card"><div class="ring-wrap">${ring(ft.kcal, t.kcal, left >= 0 ? 'var(--kcal)' : 'var(--bad)', r0(Math.abs(left)), left >= 0 ? 'kcal left' : 'over')}
    <div style="flex:1;min-width:0">${macroBar('Protein', ft.p, t.protein, 'var(--protein)')}${macroBar('Carbs', ft.c, t.carbs, 'var(--carbs)')}${macroBar('Fat', ft.f, t.fat, 'var(--fat)')}
    <small>Goal ${t.kcal} kcal · ~${t.perMealProtein} g protein per meal</small></div></div></div>
  ${MEALS.map(m => {
    const mi = items.filter(x => x.meal === m), mk = mi.reduce((s, x) => s + x.kcal, 0);
    return `<div class="card"><h3 style="text-transform:capitalize;margin-bottom:${mi.length ? 4 : 0}px">${m}<small>${mk ? r0(mk) + ' kcal' : ''}</small><span class="spacer"></span><button class="sm primary" data-add="${m}">＋ Add</button></h3>
    ${mi.map(x => `<div class="list-item"><div class="grow"><b>${esc(x.name)}</b><small>${x.g ? r0(x.g) + ' g · ' : ''}P ${r0(x.p)} · C ${r0(x.c)} · F ${r0(x.f)}</small></div><b>${r0(x.kcal)}</b><button class="sm ghost danger" data-rm="${x.uid}">✕</button></div>`).join('')}</div>`;
  }).join('')}
  <div class="row"><button style="flex:1" id="copyYest">⧉ Copy yesterday</button><button style="flex:1" id="customBtn">＋ Custom food</button></div>`;
  $$('[data-add]', el).forEach(b => b.onclick = () => openFoodPicker(b.dataset.add));
  $$('[data-rm]', el).forEach(b => b.onclick = () => { S.food[day] = items.filter(x => x.uid !== b.dataset.rm); save(); render(); });
  $('#copyYest').onclick = () => {
    const y = S.food[addDays(day, -1)] || [];
    if (!y.length) return toast('Nothing logged yesterday');
    S.food[day] = [...items, ...y.map(x => ({ ...x, uid: uid() }))]; save(); toast(`Copied ${y.length} items`); render();
  };
  $('#customBtn').onclick = openCustomFood;
}
function addFood(meal, food, grams) {
  const k = grams / 100;
  (S.food[day] ||= []).push({ uid: uid(), meal, name: food.name, g: grams, kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k });
  save();
}
function openFoodPicker(meal) {
  const all = [...S.customFoods, ...FOODS];
  openModal(`<h3 style="text-transform:capitalize">Add to ${meal}</h3>
    <input id="fq" placeholder="Search chicken, oats, paneer…" autocomplete="off">
    <button id="offBtn" class="block" style="margin-top:8px;font-size:14px">🌍 Search packaged foods (Open Food Facts)</button>
    <div id="fres" style="margin-top:8px"></div>`);
  const showList = list => {
    $('#fres').innerHTML = list.length ? list.slice(0, 40).map((f, i) => `<div class="list-item"><div class="grow"><b>${esc(f.name)}</b><small>${r0(f.kcal)} kcal · P ${r1(f.p)} C ${r1(f.c)} F ${r1(f.f)} /100 g</small></div>
      <input type="number" inputmode="numeric" value="${f.serving || 100}" style="width:68px;padding:8px" data-g="${i}" aria-label="grams"><button class="sm primary" data-pick="${i}">Add</button></div>`).join('') : '<div class="empty">No matches — try packaged foods search.</div>';
    $$('[data-pick]').forEach(b => b.onclick = () => {
      const i = +b.dataset.pick, g = +$(`[data-g="${i}"]`).value || 100;
      addFood(meal, list[i], g); toast(`Added ${list[i].name.slice(0, 24)}`); closeModal(); render();
    });
  };
  const filter = () => { const q = $('#fq').value.toLowerCase().trim(); showList(q ? all.filter(f => f.name.toLowerCase().includes(q)) : all); };
  $('#fq').oninput = filter; filter();
  $('#offBtn').onclick = async () => {
    const q = $('#fq').value.trim(); if (!q) return toast('Type a food first');
    $('#fres').innerHTML = '<div class="empty">Searching…</div>';
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=30&fields=product_name,brands,nutriments,serving_quantity`;
      const data = await (await fetch(url)).json();
      showList((data.products || []).filter(x => x.product_name && x.nutriments?.['energy-kcal_100g'] != null).map(x => ({
        name: `${x.product_name}${x.brands ? ' (' + x.brands.split(',')[0] + ')' : ''}`,
        kcal: +x.nutriments['energy-kcal_100g'] || 0, p: +x.nutriments.proteins_100g || 0, c: +x.nutriments.carbohydrates_100g || 0, f: +x.nutriments.fat_100g || 0,
        serving: Math.round(+x.serving_quantity) || 100,
      })));
    } catch { $('#fres').innerHTML = '<div class="empty">Could not reach Open Food Facts (offline?).</div>'; }
  };
}
function openCustomFood() {
  openModal(`<h3>Custom food (per 100 g)</h3><form id="cf" class="stack"><div class="fields">
    <label class="full">Name<input name="name" required></label><label>kcal<input name="kcal" type="number" inputmode="decimal" required></label>
    <label>Serving (g)<input name="serving" type="number" inputmode="decimal" value="100"></label>
    <label>Protein g<input name="p" type="number" inputmode="decimal" step="0.1" required></label><label>Carbs g<input name="c" type="number" inputmode="decimal" step="0.1" required></label>
    <label>Fat g<input name="f" type="number" inputmode="decimal" step="0.1" required></label></div>
    <button class="primary block">Save food</button></form>`);
  $('#cf').onsubmit = e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    S.customFoods.unshift({ id: 'c_' + uid(), name: f.name, kcal: +f.kcal, p: +f.p, c: +f.c, f: +f.f, serving: +f.serving || 100 });
    save(); closeModal(); toast('Custom food saved');
  };
}

/* meal prep */
const FOOD_BY_ID = () => Object.fromEntries([...FOODS, ...S.customFoods].map(f => [f.id, f]));
const RECIPE = id => RECIPES.find(r => r.id === id);
const SHARE = { breakfast: .25, lunch: .32, dinner: .30, snack: .13 };
function recipeMacros(r, scale = 1) {
  const fb = FOOD_BY_ID();
  return r.items.reduce((t, [id, g]) => { const f = fb[id], k = (g * scale) / 100; return { kcal: t.kcal + f.kcal * k, p: t.p + f.p * k, c: t.c + f.c * k, f: t.f + f.f * k }; }, { kcal: 0, p: 0, c: 0, f: 0 });
}
const fitScale = (r, kcal, slot) => clamp(Math.round(((kcal * SHARE[slot]) / recipeMacros(r).kcal) * 20) / 20, 0.6, 1.8);
function generateMealPlan(random = false) {
  const t = targetsFor(day), veg = P().diet === 'veg';
  const days = Array.from({ length: 7 }, (_, d) => ({
    meals: MEALS.map(slot => {
      const opts = RECIPES.filter(r => r.slot === slot && (!veg || r.veg));
      const r = random ? opts[Math.floor(Math.random() * opts.length)] : opts[(d + MEALS.indexOf(slot)) % opts.length];
      return { recipeId: r.id, scale: fitScale(r, t.kcal, slot) };
    }),
  }));
  S.mealPlan = { generated: day, kcal: t.kcal, days }; save();
}
function planDayIndex(date) { return ((daysBetween(S.mealPlan.generated, date) % 7) + 7) % 7; }
function mealPrep(el) {
  if (!S.mealPlan) generateMealPlan();
  const t = targetsFor(day), plan = S.mealPlan, d = plan.days[ui.mealDay];
  const tot = d.meals.reduce((s, m) => { const x = recipeMacros(RECIPE(m.recipeId), m.scale); return { kcal: s.kcal + x.kcal, p: s.p + x.p }; }, { kcal: 0, p: 0 });
  el.innerHTML = `
  <div class="card hero"><h3>🥗 7-day meal plan</h3><small>Scaled to ${t.kcal} kcal · ${t.protein} g protein · ${P().diet === 'veg' ? 'vegetarian' : 'everything'}</small>
    <div class="row" style="margin-top:12px"><button style="flex:1" id="shuffle">🎲 Shuffle</button><button style="flex:1" id="grocery">🛒 Grocery list</button></div></div>
  <div class="chips">${plan.days.map((_, i) => `<button data-mday="${i}" class="${ui.mealDay === i ? 'active' : ''}">${parse(addDays(plan.generated, i)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</button>`).join('')}</div>
  <div class="card"><h3>Day total<span class="spacer"></span><small>${r0(tot.kcal)} kcal · ${r0(tot.p)} g protein</small></h3>
  ${d.meals.map((m, mi) => { const r = RECIPE(m.recipeId), x = recipeMacros(r, m.scale); return `<div class="list-item">
    <div class="grow" data-recipe="${r.id}" data-scale="${m.scale}" style="cursor:pointer"><small style="text-transform:uppercase;font-weight:700;letter-spacing:.05em">${MEALS[mi]}</small><b>${esc(r.name)}</b><small>${r0(x.kcal)} kcal · P ${r0(x.p)} C ${r0(x.c)} F ${r0(x.f)}</small></div>
    <button class="sm" data-log="${mi}">Log</button></div>`; }).join('')}</div>
  <p class="callout">Batch-cook on Sunday & Wednesday: proteins, a big pot of rice/dal/quinoa and roasted veg. Tap a meal for its recipe.</p>`;
  $$('[data-mday]', el).forEach(b => b.onclick = () => { ui.mealDay = +b.dataset.mday; render(); });
  $('#shuffle').onclick = () => { generateMealPlan(true); toast('New meal plan'); render(); };
  $('#grocery').onclick = openGrocery;
  $$('[data-log]', el).forEach(b => b.onclick = () => { logPlannedMeal(d.meals[+b.dataset.log], MEALS[+b.dataset.log]); toast(`Logged to ${dayLabel()}`); });
  $$('[data-recipe]', el).forEach(a => a.onclick = () => openRecipe(RECIPE(a.dataset.recipe), +a.dataset.scale));
}
function logPlannedMeal(m, slot) {
  const r = RECIPE(m.recipeId), x = recipeMacros(r, m.scale);
  (S.food[day] ||= []).push({ uid: uid(), meal: slot, name: r.name, g: r.items.reduce((s, [, g]) => s + g, 0) * m.scale, ...x });
  save();
}
function openPlanLogger() {
  if (!S.mealPlan) generateMealPlan();
  const d = S.mealPlan.days[planDayIndex(day)];
  openModal(`<h3>Log from your meal plan</h3>${d.meals.map((m, i) => { const r = RECIPE(m.recipeId), x = recipeMacros(r, m.scale); return `<label class="check list-item"><input type="checkbox" data-pm="${i}" checked><div class="grow"><b>${esc(r.name)}</b><small style="text-transform:capitalize">${MEALS[i]} · ${r0(x.kcal)} kcal · P ${r0(x.p)} g</small></div></label>`; }).join('')}
    <button class="primary block" id="pmGo" style="margin-top:12px">Log selected meals</button>`);
  $('#pmGo').onclick = () => {
    const sel = $$('[data-pm]').filter(c => c.checked).map(c => +c.dataset.pm);
    sel.forEach(i => logPlannedMeal(d.meals[i], MEALS[i]));
    closeModal(); toast(`Logged ${sel.length} meals`); render();
  };
}
function openRecipe(r, sc) {
  const fb = FOOD_BY_ID(), x = recipeMacros(r, sc);
  openModal(`<h3>${esc(r.name)}</h3><p class="muted" style="margin-top:-6px">${r.prep} min · ${r0(x.kcal)} kcal · P ${r0(x.p)} g · C ${r0(x.c)} g · F ${r0(x.f)} g</p>
    ${r.items.map(([id, g]) => `<div class="list-item"><div class="grow">${esc(fb[id].name)}</div><b>${r0(g * sc)} g</b></div>`).join('')}
    <p class="callout" style="margin-top:12px">${esc(r.steps)}</p>`);
}
function openGrocery() {
  const fb = FOOD_BY_ID(), g = {};
  S.mealPlan.days.forEach(d => d.meals.forEach(m => RECIPE(m.recipeId).items.forEach(([id, q]) => g[id] = (g[id] || 0) + q * m.scale)));
  openModal(`<h3>🛒 Grocery list — 7 days</h3>${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([id, q]) => `<label class="check list-item"><input type="checkbox"><span class="grow">${esc(fb[id].name.split(' (')[0])}</span><b>${q >= 1000 ? (q / 1000).toFixed(1) + ' kg' : r0(q) + ' g'}</b></label>`).join('')}`);
}

/* ---------- TRAIN ---------- */
let libFilter = { q: '', group: null, equip: '' };
const focusOf = sd => FOCUS[sd.focus || (sd.rest ? 'rest' : sd.cardio ? 'cardio' : 'full')];
function focusBadge(sd, big = false) {
  const f = focusOf(sd);
  return `<span class="focus-badge ${big ? 'big' : ''}" style="--fc:${f.color}">${f.emoji} ${f.label}</span>`;
}
/* One ranked exercise row: rank number, thumbnail, name, equipment. */
function rankRow(id, rank, attrs = '') {
  const e = EX[id]; if (!e) return '';
  return `<div class="rank-row" data-id="${id}" ${attrs}><span class="rank ${rank === 1 ? 'r1' : ''}">${rank ?? '·'}</span>
    <img src="${exImg(e)}" loading="lazy" alt="" onerror="this.style.visibility='hidden'">
    <div class="grow"><b>${esc(e.name)}</b><small>${esc(EQUIP[Training.equipKey(e)].l)} · ${esc(e.level)}</small></div>
    ${rank === 1 ? '<span class="pill good">Best</span>' : ''}</div>`;
}
function weekStrip() {
  const d0 = parse(day), monday = addDays(day, -((d0.getDay() + 6) % 7));
  return `<div class="week-strip">${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i), sd = scheduledDay(d), f = focusOf(sd), done = S.workouts[d]?.done;
    return `<button data-wday="${d}" class="${d === day ? 'active' : ''}" style="--fc:${f.color}"><small>${parse(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</small><span>${done ? '✅' : f.emoji}</span><small>${f.label.split(' ')[0]}</small></button>`;
  }).join('')}</div>`;
}
function renderTrain(el) {
  el.innerHTML = `<div class="stack">${seg('train', [['today', 'Today'], ['program', 'Program'], ['library', 'Library'], ['progress', 'Progress']], ui.trainTab)}<div id="wBody" class="stack"></div></div>`;
  bindSeg(el, 'train', v => { ui.trainTab = v; render(); });
  ({ today: wToday, program: wProgram, library: wLibrary, progress: wProgress })[ui.trainTab]($('#wBody'));
}
function lastSetsFor(exId, before) {
  const dates = Object.keys(S.workouts).filter(d => d < before).sort().reverse();
  for (const d of dates) { const e = S.workouts[d].exercises?.find(x => x.id === exId); if (e?.sets?.some(s => s.done)) return e.sets; }
  return null;
}
function ensureSession() {
  if (S.workouts[day]) return S.workouts[day];
  const sd = scheduledDay(day), ph = PROGRAM.phaseFor(planWeek(day));
  return { dayKey: sd.key, name: sd.name, cardioMin: 0, done: false, exercises: sd.cardio || sd.rest ? [] : sd.ex.map(id => {
    const prev = lastSetsFor(id, day);
    return { id, sets: Array.from({ length: ph.sets }, (_, i) => ({ kg: prev?.[i]?.kg ?? prev?.[0]?.kg ?? '', reps: '', done: false })) };
  }) };
}
function wToday(el) {
  const sd = scheduledDay(day), ph = PROGRAM.phaseFor(planWeek(day)), s = ensureSession();
  const doneSets = s.exercises.reduce((t, e) => t + e.sets.filter(x => x.done).length, 0), allSets = s.exercises.reduce((t, e) => t + e.sets.length, 0);
  const f = focusOf(sd);
  el.innerHTML = `${weekStrip()}
  <div class="card hero" style="background:radial-gradient(circle at 95% 0%, ${f.color}40, transparent 60%), var(--card)">
    <div class="row">${focusBadge(sd, true)}<span class="spacer"></span><small>${dayLabel()}</small></div>
    <h3 style="margin:12px 0 2px">${esc(s.name)}</h3><small style="display:block;margin-bottom:6px"><b style="color:var(--text)">Goal:</b> ${f.muscles}</small>
    <small>${ph.name} phase · ${ph.sets} × ${ph.reps} reps @ RPE ${ph.rpe} · rest 1.5–3 min</small>
    ${allSets ? `<div class="bar" style="margin:12px 0 4px"><div style="width:${(doneSets / allSets) * 100}%;background:var(--accent)"></div></div><small>${doneSets}/${allSets} sets done</small>` : ''}
    <p class="callout" style="margin:12px 0 0">Hit the top of the rep range on every set? Add 2.5 kg (upper) or 5 kg (lower) next time. Weights pre-fill from last session.</p></div>
  ${sd.rest ? '' : `<div class="card coach-cta"><div class="row"><div style="flex:1"><b>🎧 Guided workout</b><br><small>Voice coach in your headset: counts reps, pushes you on the last ones, times your rest${Coach.hr.value ? ` · ❤️ ${Coach.hr.value} bpm` : ''}.</small></div>
    <button class="sm" id="coachSettings" aria-label="Coach settings">⚙</button></div>
    <button class="primary block" id="coachStart" style="margin-top:12px">▶ Start guided ${sd.cardio ? 'cardio' : 'workout'}</button></div>`}
  ${sd.rest ? '<div class="card empty">🛌 Rest day — hit your steps, stretch and sleep 7–9 h.</div>' : ''}
  ${sd.cardio ? `<div class="card"><h3>Cardio</h3><p class="muted" style="margin-top:0">${sd.key === 'C2' ? 'Intervals: 5 min warm-up, 8–10 × (30 s hard / 90 s easy), 5 min cool-down.' : 'Zone 2: a pace where you can still talk in full sentences.'}</p>
    <div class="ex-grid">${sd.ex.map(id => exCard(EX[id])).join('')}</div></div>` : ''}
  ${s.exercises.map((e, ei) => { const ex = EX[e.id]; return `<div class="session-ex"><header>
    ${ex?.images?.[0] ? `<img src="${exImg(ex)}" loading="lazy" alt="">` : ''}
    <div style="flex:1;min-width:0"><b data-exinfo="${e.id}" style="cursor:pointer">${esc(ex?.name || e.id)}</b><br><small>${esc((ex?.primaryMuscles || []).join(', '))}</small></div>
    <button class="sm" data-swap="${ei}" aria-label="Machine busy? Swap">⇄ Busy?</button><button class="sm ghost danger" data-rmex="${ei}" aria-label="Remove">✕</button></header>
    <div class="set-row"><small>Set</small><small style="text-align:center">kg</small><small style="text-align:center">reps</small><small></small></div>
    ${e.sets.map((x, si) => `<div class="set-row"><b style="text-align:center">${si + 1}</b><input type="number" inputmode="decimal" step="0.5" value="${x.kg}" data-ei="${ei}" data-si="${si}" data-k="kg"><input type="number" inputmode="numeric" value="${x.reps}" placeholder="${ph.reps}" data-ei="${ei}" data-si="${si}" data-k="reps"><button class="sm done-btn ${x.done ? 'on' : ''}" data-done="${ei}:${si}">✓</button></div>`).join('')}
    <button class="sm ghost" data-addset="${ei}">＋ Add set</button></div>`; }).join('')}
  <button id="addEx" class="block">＋ Add exercise</button>
  <div class="card"><label>Cardio minutes<input type="number" inputmode="numeric" id="cardioMin" value="${s.cardioMin || ''}" placeholder="0"></label></div>
  <button class="primary block" id="finish">${s.done ? '✓ Completed — tap to undo' : 'Finish workout'}</button>`;
  const persist = () => { S.workouts[day] = s; save(); };
  const cs = $('#coachStart'); if (cs) cs.onclick = () => Coach.start();
  const cst = $('#coachSettings'); if (cst) cst.onclick = () => Coach.settings();
  $$('[data-k]', el).forEach(i => i.onchange = () => { s.exercises[i.dataset.ei].sets[i.dataset.si][i.dataset.k] = i.value === '' ? '' : +i.value; persist(); });
  $$('[data-done]', el).forEach(b => b.onclick = () => { const [ei, si] = b.dataset.done.split(':'); const set = s.exercises[ei].sets[si]; set.done = !set.done; persist(); render(); });
  $$('[data-addset]', el).forEach(b => b.onclick = () => { const sets = s.exercises[b.dataset.addset].sets; sets.push({ ...sets[sets.length - 1], reps: '', done: false }); persist(); render(); });
  $$('[data-rmex]', el).forEach(b => b.onclick = () => { s.exercises.splice(+b.dataset.rmex, 1); persist(); render(); });
  $$('[data-swap]', el).forEach(b => b.onclick = () => {
    const curId = s.exercises[b.dataset.swap].id, cur = EX[curId], pat = Training.patternOf(curId);
    const alts = Training.alternatives(curId);
    openModal(`<h3>Machine busy? Swap ${esc(cur.name)}</h3>
      <p class="muted" style="margin:-6px 0 10px;font-size:13px">Same movement${pat ? ` (<b>${esc(pat.name)}</b> — ${esc(pat.muscles)})` : ''}, ranked best → last. Pick the highest one that's free.</p>
      ${alts.map(id => rankRow(id, Training.rankOf(id), `data-pickswap="${id}"`)).join('')}`);
    $$('[data-pickswap]').forEach(c => c.onclick = () => { s.exercises[b.dataset.swap].id = c.dataset.pickswap; persist(); closeModal(); toast(`Swapped to ${EX[c.dataset.pickswap].name}`); render(); });
  });
  $$('[data-wday]', el).forEach(b => b.onclick = () => { day = b.dataset.wday; render(); });
  $$('[data-exinfo]', el).forEach(a => a.onclick = () => showExercise(a.dataset.exinfo));
  $$('.ex-card[data-id]', el).forEach(c => c.onclick = () => showExercise(c.dataset.id));
  $('#cardioMin').onchange = e => { s.cardioMin = +e.target.value || 0; persist(); };
  $('#finish').onclick = () => { s.done = !s.done; persist(); toast(s.done ? '💪 Workout logged!' : 'Marked as not done'); render(); };
  $('#addEx').onclick = () => { ui.trainTab = 'library'; render(); toast('Tap an exercise to add it'); };
}
function exCard(e, attrs = '') {
  if (!e) return '';
  return `<div class="ex-card" data-id="${e.id}" ${attrs}><img src="${exImg(e)}" loading="lazy" alt="" onerror="this.style.display='none'"><div><b>${esc(e.name)}</b><small>${esc(e.primaryMuscles.join(', '))} · ${esc(e.equipment || 'none')}</small></div></div>`;
}
function showExercise(id) {
  const e = EX[id]; if (!e) return;
  const pat = Training.patternOf(id), rank = Training.rankOf(id), alts = Training.alternatives(id, 3);
  openModal(`<h3>${esc(e.name)}</h3><div class="row wrap">${pat ? `<span class="pill good">${rank ? `#${rank} of ${pat.ids.length} · ` : ''}${esc(pat.name)}</span>` : ''}${[EQUIP[Training.equipKey(e)].l, e.level, e.mechanic].filter(Boolean).map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>
    <div class="ex-imgs">${e.images.slice(0, 2).map((_, i) => `<img src="${exImg(e, i)}" alt="">`).join('')}</div>
    <p style="font-size:14px"><b>Works:</b> ${esc(e.primaryMuscles.join(', '))}${e.secondaryMuscles.length ? ` · <span class="muted">${esc(e.secondaryMuscles.join(', '))}</span>` : ''}</p>
    <ol class="tight">${e.instructions.map(i => `<li>${esc(i)}</li>`).join('')}</ol>
    ${alts.length ? `<p class="section-title" style="margin:14px 0 4px">Busy? Do this instead</p>${alts.map(a => rankRow(a, Training.rankOf(a), 'data-alt="1"')).join('')}` : ''}
    <button class="primary block" id="addToSession" style="margin-top:12px">＋ Add to ${dayLabel().toLowerCase()}'s workout</button>`);
  $$('#modalBody [data-alt]').forEach(r => r.onclick = () => showExercise(r.dataset.id));
  $('#addToSession').onclick = () => {
    const s = ensureSession(), ph = PROGRAM.phaseFor(planWeek(day)), prev = lastSetsFor(id, day);
    s.exercises.push({ id, sets: Array.from({ length: ph.sets }, (_, i) => ({ kg: prev?.[i]?.kg ?? '', reps: '', done: false })) });
    S.workouts[day] = s; save(); closeModal(); toast('Added to workout'); ui.trainTab = 'today'; render();
  };
}
function wProgram(el) {
  const wk = planWeek(day), sp = split(), dow = parse(day).getDay();
  el.innerHTML = `
  <div class="chips">${PROGRAM.phases.map(ph => `<button class="${ph.weeks.includes(wk) ? 'active' : ''}" data-ph="${ph.name}">${ph.name} · W${ph.weeks[0]}${ph.weeks.length > 1 ? '–' + ph.weeks[ph.weeks.length - 1] : ''}</button>`).join('')}</div>
  <div class="card" id="phaseInfo"></div>
  ${P().split !== 'ppl' ? `<div class="card coach-cta"><b>💪 Try Push · Pull · Legs</b><p class="muted" style="margin:6px 0 10px;font-size:13px">Each day has one clear goal: Push, Pull, Legs, Cardio, Upper, Legs, Rest. Every muscle is trained twice a week.</p>
    <button class="primary block" id="usePpl">Switch to Push · Pull · Legs</button></div>` : ''}
  <div class="card"><h3>${sp.name}</h3>
    ${[1, 2, 3, 4, 5, 6, 0].map(i => { const d = sp.days.find(x => x.dow === i); return `<div class="day-row"><div class="day-badge ${i === dow ? 'on' : ''}">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</div>
      <div style="flex:1;min-width:0">${focusBadge(d)} <b style="font-size:14px">${esc(d.name)}</b><br><small>${d.ex.map(id => EX[id]?.name || id).join(' · ') || 'Walk 8–10k steps'}</small></div></div>`; }).join('')}
    <p class="cite" style="margin-top:10px">Change the plan in Me → Edit profile. Why it works: ≥10 hard sets per muscle per week keeps muscle while you diet. ${refLink('volume')}</p></div>`;
  const up = $('#usePpl'); if (up) up.onclick = () => {
    P().split = 'ppl';
    // Drop untouched future sessions so they rebuild from the new plan.
    Object.keys(S.workouts).forEach(d => { const w = S.workouts[d]; if (d >= today() && !w.done && !w.exercises.some(e => e.sets.some(x => x.done))) delete S.workouts[d]; });
    save(); toast('Switched to Push · Pull · Legs'); render();
  };
  const showPh = name => { const ph = PROGRAM.phases.find(p => p.name === name); $('#phaseInfo').innerHTML = `<h3>${ph.name}<span class="spacer"></span><span class="pill">${ph.sets} × ${ph.reps} @ RPE ${ph.rpe}</span></h3><p class="muted" style="margin:0;font-size:14px">${ph.note}</p>`; $$('[data-ph]', el).forEach(b => b.classList.toggle('active', b.dataset.ph === name)); };
  $$('[data-ph]', el).forEach(b => b.onclick = () => showPh(b.dataset.ph));
  showPh(PROGRAM.phaseFor(wk).name);
}
function wLibrary(el) {
  const todayFocus = focusOf(scheduledDay(day));
  libFilter.group ||= todayFocus.group;
  const inSession = new Set((S.workouts[day]?.exercises || scheduledDay(day).ex.map(id => ({ id }))).map(e => e.id));
  el.innerHTML = `<input id="lq" value="${esc(libFilter.q)}" placeholder="🔍 Search all ${EXERCISE_DB.length} exercises">
    <div class="seg" id="lgroups">${GROUPS.map(([k, l]) => `<button data-grp="${k}" class="${libFilter.group === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="chips"><span class="muted" style="font-size:12px;align-self:center;flex-shrink:0">What's free?</span><button data-eq="" class="${!libFilter.equip ? 'active' : ''}">Any</button>${Object.entries(EQUIP).map(([k, v]) => `<button data-eq="${k}" class="${libFilter.equip === k ? 'active' : ''}">${v.l}</button>`).join('')}</div>
    <div id="lres" class="stack"></div><p class="cite">Ranked best → last within each movement: free-weight compounds first, then machines & cables, then bodyweight. Exercise data & images: ${refLink('exdb')}</p>`;
  const apply = () => {
    libFilter.q = $('#lq').value.toLowerCase().trim();
    const eqOk = id => !libFilter.equip || Training.equipKey(EX[id]) === libFilter.equip;
    let html;
    if (libFilter.q) {
      const list = EXERCISE_DB.filter(e => e.name.toLowerCase().includes(libFilter.q) && eqOk(e.id));
      html = list.length ? `<div class="card">${list.slice(0, 40).map(e => rankRow(e.id, Training.rankOf(e.id))).join('')}${list.length > 40 ? `<div class="empty">+${list.length - 40} more — keep typing</div>` : ''}</div>` : '<div class="empty">No exercises match</div>';
    } else {
      html = MOVES[libFilter.group].map(p => {
        const rows = p.ids.map((id, i) => [id, i + 1]).filter(([id]) => EX[id] && eqOk(id));
        return `<div class="card"><h3 style="margin-bottom:2px">${esc(p.name)}</h3><small>${esc(p.muscles)}</small>
          <div style="margin-top:6px">${rows.length ? rows.map(([id, r]) => rankRow(id, r, inSession.has(id) ? 'data-today="1"' : '')).join('') : `<div class="empty" style="padding:12px">No ${EQUIP[libFilter.equip].l.toLowerCase()} option for this movement</div>`}</div></div>`;
      }).join('');
    }
    $('#lres').innerHTML = html;
    $$('#lres .rank-row').forEach(c => c.onclick = () => showExercise(c.dataset.id));
  };
  $$('[data-grp]', el).forEach(b => b.onclick = () => { libFilter.group = b.dataset.grp; $('#lq').value = ''; $$('[data-grp]', el).forEach(x => x.classList.toggle('active', x === b)); apply(); });
  $$('[data-eq]', el).forEach(b => b.onclick = () => { libFilter.equip = b.dataset.eq; $$('[data-eq]', el).forEach(x => x.classList.toggle('active', x === b)); apply(); });
  $('#lq').oninput = apply; apply();
}
function wProgress(el) {
  const sessions = Object.entries(S.workouts).filter(([, s]) => s.exercises?.length || s.cardioMin).sort((a, b) => b[0].localeCompare(a[0]));
  const lifts = [...new Set(sessions.flatMap(([, s]) => s.exercises.map(e => e.id)))];
  el.innerHTML = `
    <div class="card"><h3>Strength progress</h3>${lifts.length ? `<select id="liftSel">${lifts.map(id => `<option value="${id}">${esc(EX[id]?.name || id)}</option>`).join('')}</select><div class="chart-box short" style="margin-top:10px"><canvas id="c1rm"></canvas></div><small>Estimated 1-rep max (Epley)</small>` : '<div class="empty">Log a workout to see progress.</div>'}</div>
    <div class="card"><h3>Weekly volume</h3><div class="chart-box short"><canvas id="cVol"></canvas></div></div>
    <div class="card"><h3>History</h3>${sessions.length ? sessions.slice(0, 20).map(([d, s]) => `<div class="list-item"><div class="grow"><b>${fmtDate(d)} · ${esc(s.name)}</b><small>${s.exercises.length} exercises · ${s.exercises.reduce((t, e) => t + e.sets.filter(x => x.done).length, 0)} sets${s.cardioMin ? ` · ${s.cardioMin} min cardio` : ''}</small></div>${s.done ? '<span class="pill good">Done</span>' : '<span class="pill warn">Partial</span>'}</div>`).join('') : '<div class="empty">No workouts yet.</div>'}</div>`;
  const start = addDays(day, -55), weeks = Array.from({ length: 8 }, (_, i) => addDays(start, i * 7));
  const vol = weeks.map(from => Object.entries(S.workouts).filter(([d]) => d >= from && d <= addDays(from, 6)).reduce((t, [, s]) => t + s.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).reduce((q, x) => q + (+x.kg || 0) * (+x.reps || 0), 0), 0), 0));
  chart('cVol', { type: 'bar', data: { labels: weeks.map(fmtDate), datasets: [{ label: 'kg × reps', data: vol, backgroundColor: css('--accent2'), borderRadius: 6 }] }, options: { plugins: { legend: { display: false } } } });
  const draw1rm = id => {
    const pts = Object.entries(S.workouts).sort().map(([d, s]) => { const e = s.exercises.find(x => x.id === id); if (!e) return null; const best = Math.max(0, ...e.sets.filter(x => x.done).map(x => Sci.e1rm(+x.kg, +x.reps))); return best ? [d, best] : null; }).filter(Boolean);
    const c = charts.find(c => c.canvas.id === 'c1rm'); if (c) { c.destroy(); charts.splice(charts.indexOf(c), 1); }
    chart('c1rm', { type: 'line', data: { labels: pts.map(p => fmtDate(p[0])), datasets: [{ label: 'e1RM kg', data: pts.map(p => +r1(p[1])), borderColor: css('--accent'), backgroundColor: gradient(css('--accent')), fill: 'origin', tension: .35, borderWidth: 3 }] }, options: { plugins: { legend: { display: false } } } });
  };
  if (lifts.length) { draw1rm(lifts[0]); $('#liftSel').onchange = e => draw1rm(e.target.value); }
}

/* ---------- PLAN: roadmap · insights · supplements ---------- */
function renderPlan(el) {
  el.innerHTML = `<div class="stack">${seg('plan', [['roadmap', 'Roadmap'], ['insights', 'Insights'], ['supps', 'Supplements']], ui.planTab)}<div id="pBody" class="stack"></div></div>`;
  bindSeg(el, 'plan', v => { ui.planTab = v; render(); });
  ({ roadmap: planRoadmap, insights: planInsights, supps: planSupps })[ui.planTab]($('#pBody'));
}
function planRoadmap(el) {
  const p = P(), proj = projection(), wk = programWeek(day), t = targetsFor(day), ci = Sci.checkIn(S.weights, p), final = proj[12];
  el.innerHTML = `
  <div class="card hero"><div class="row"><div><small>Start</small><div class="big">${p.startWeight}<small> kg · ${p.startBf}%</small></div></div><span class="spacer"></span><span style="font-size:22px">→</span><span class="spacer"></span>
    <div style="text-align:right"><small>Week 12</small><div class="big">${final.kg}<small> kg · ${final.bf}%</small></div></div></div>
    <small>${final.bf <= p.goalBf ? `🎯 Goal of ${p.goalBf}% reachable in 12 weeks` : `Goal ${p.goalBf}% — keep going after week 12`}</small></div>
  <div class="card"><h3>Projected body composition</h3><div class="chart-box"><canvas id="iProj"></canvas></div></div>
  <div class="card"><h3>🧭 Weekly check-in</h3><p class="callout" style="margin:0">${ci.msg}</p>
    ${ci.adj ? `<button class="primary block" id="applyAdj" style="margin-top:10px">Apply ${ci.adj > 0 ? '+' : ''}${ci.adj} kcal</button>` : ''}
    ${S.calorieAdj ? `<button class="ghost block" id="resetAdj">Reset adjustment (${S.calorieAdj > 0 ? '+' : ''}${S.calorieAdj} kcal)</button>` : ''}</div>
  <div class="card"><h3>Your daily numbers</h3>
    <div class="list-item"><div class="grow"><b>Calories</b><small>Maintenance ${t.tdee} − deficit ${t.deficit} ${refLink('mifflin')}</small></div><b>${t.kcal}</b></div>
    <div class="list-item"><div class="grow"><b>Protein</b><small>2.6 g per kg lean mass ${refLink('helms')}</small></div><b>${t.protein} g</b></div>
    <div class="list-item"><div class="grow"><b>Carbs</b><small>Fuel around workouts</small></div><b>${t.carbs} g</b></div>
    <div class="list-item"><div class="grow"><b>Fat</b><small>~25% of calories</small></div><b>${t.fat} g</b></div>
    <div class="list-item"><div class="grow"><b>Water</b><small>35 ml/kg + 0.5 L on training days</small></div><b>${(waterTarget(day) / 1000).toFixed(1)} L</b></div></div>
  <div class="card"><h3>Week by week</h3>
    ${proj.slice(1).map(x => { const ph = PROGRAM.phaseFor(x.week); return `<div class="day-row"><div class="day-badge ${x.week === wk ? 'on' : ''}">W${x.week}</div>
      <div style="flex:1"><b style="font-size:14px">${x.kg} kg · ${x.bf}%</b><br><small>${ph.name}${[4, 8, 12].includes(x.week) ? ' · 📸 photos & measure' : ''}</small></div></div>`; }).join('')}</div>
  <div class="card"><h3>5 habits that decide the result</h3>${HABITS.map(h => `<div class="list-item"><div class="grow" style="white-space:normal"><b style="white-space:normal">${h.t}</b><small>${h.d} ${h.ref ? refLink(h.ref) : ''}</small></div></div>`).join('')}</div>`;
  chart('iProj', { type: 'bar', data: { labels: proj.map(x => 'W' + x.week), datasets: [
    { label: 'Lean kg', data: proj.map(x => +r1(x.kg * (1 - x.bf / 100))), backgroundColor: css('--accent2'), stack: 's', borderRadius: 4 },
    { label: 'Fat kg', data: proj.map(x => +r1(x.kg * x.bf / 100)), backgroundColor: css('--fat'), stack: 's', borderRadius: 4 },
    { type: 'line', label: 'Body fat %', data: proj.map(x => x.bf), borderColor: css('--accent'), yAxisID: 'y2', tension: .3, pointRadius: 0, borderWidth: 3 },
  ] }, options: { scales: { x: { stacked: true }, y: { stacked: true }, y2: { position: 'right', grid: { display: false } } } } });
  const ab = $('#applyAdj'); if (ab) ab.onclick = () => { S.calorieAdj += ci.adj; save(); toast('Targets adjusted'); render(); };
  const rb = $('#resetAdj'); if (rb) rb.onclick = () => { S.calorieAdj = 0; save(); render(); };
}
function planInsights(el) {
  const ds = lastDays(14), t = targetsFor(day), logged = ds.filter(d => (S.food[d] || []).length);
  const avg = k => logged.length ? logged.reduce((s, d) => s + foodTotals(d)[k], 0) / logged.length : 0;
  const p = P(), w = weightAt(day), fatLost = (p.startWeight * p.startBf / 100) - (w.kg * bfAt(day) / 100);
  const proteinHit = logged.filter(d => foodTotals(d).p >= t.protein * 0.9).length, waterHit = ds.filter(d => (S.water[d] || 0) >= waterTarget(d)).length;
  const mini = (label, v, sub) => `<div class="card" style="padding:14px"><small>${label}</small><div class="big" style="font-size:24px">${v}</div><small>${sub}</small></div>`;
  el.innerHTML = `<div class="tiles">
    ${mini('Fat lost', r1(Math.max(0, fatLost)) + ' kg', 'estimated')}
    ${mini('Workouts', Object.values(S.workouts).filter(s => s.done).length, 'completed')}
    ${mini('Protein goal', `${proteinHit}/${logged.length}`, 'days hit (14 d)')}
    ${mini('Water goal', `${waterHit}/14`, 'days hit')}</div>
  <div class="card"><h3>Average macros (14 days)</h3><div class="chart-box short"><canvas id="iMac"></canvas></div><small>${r0(avg('kcal'))} kcal · P ${r0(avg('p'))} g · C ${r0(avg('c'))} g · F ${r0(avg('f'))} g</small></div>
  <div class="card"><h3>Sets per muscle (7 days)</h3><div class="chart-box short"><canvas id="iMus"></canvas></div><small>Aim for ≥10 hard sets per muscle per week.</small></div>
  <div class="card"><h3>Steps (14 days)</h3><div class="chart-box short"><canvas id="iSteps"></canvas></div></div>
  <div class="card"><h3>Consistency (12 weeks)</h3><div class="heat" id="heat"></div><small style="display:block;text-align:center;margin-top:8px">Green = workout completed</small></div>`;
  chart('iMac', { type: 'doughnut', data: { labels: ['Protein', 'Carbs', 'Fat'], datasets: [{ data: logged.length ? [avg('p') * 4, avg('c') * 4, avg('f') * 9] : [t.protein * 4, t.carbs * 4, t.fat * 9], backgroundColor: [css('--protein'), css('--carbs'), css('--fat')], borderWidth: 0 }] }, options: { cutout: '65%', plugins: { legend: { position: 'right' } } } });
  const mus = {};
  lastDays(7).forEach(d => (S.workouts[d]?.exercises || []).forEach(e => { const n = e.sets.filter(x => x.done).length; (EX[e.id]?.primaryMuscles || []).forEach(m => mus[m] = (mus[m] || 0) + n); }));
  const mk = Object.keys(mus).sort((a, b) => mus[b] - mus[a]);
  chart('iMus', { type: 'bar', data: { labels: mk.length ? mk : ['no data yet'], datasets: [{ data: mk.map(m => mus[m]), backgroundColor: mk.map(m => mus[m] >= 10 ? css('--accent') : css('--warn')), borderRadius: 6 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
  chart('iSteps', { type: 'line', data: { labels: ds.map(fmtDate), datasets: [{ data: ds.map(d => S.steps[d] || null), borderColor: css('--warn'), backgroundColor: gradient(css('--warn')), fill: 'origin', tension: .35, spanGaps: true, borderWidth: 3 }, { data: ds.map(() => 10000), borderColor: css('--muted'), borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } } } });
  $('#heat').innerHTML = lastDays(84).map(d => { const s = S.workouts[d]; const c = s?.done ? 'var(--accent)' : s?.exercises?.some(e => e.sets.some(x => x.done)) ? 'rgba(34,211,166,.35)' : ''; return `<div title="${d}" style="${c ? 'background:' + c : ''}"></div>`; }).join('');
}
function planSupps(el) {
  const kg = weightAt(day).kg, chosen = P().supps || ['creatine', 'protein', 'vitd'];
  el.innerHTML = `
  <div class="card hero"><h3>💊 Your doses</h3>
    <div class="list-item"><div class="grow"><b>Creatine</b><small>daily, any time</small></div><b>5 g</b></div>
    <div class="list-item"><div class="grow"><b>Caffeine</b><small>45 min pre-workout</small></div><b>${Math.round(kg * 3)}–${Math.min(400, Math.round(kg * 6))} mg</b></div>
    <div class="list-item"><div class="grow"><b>Protein per meal</b><small>4 meals a day</small></div><b>${r0(kg * 0.3)}–${r0(kg * 0.4)} g</b></div>
    <p class="callout" style="margin-top:10px">Supplements are the last 5%. Ask your doctor first if you take medication or have kidney, liver or heart conditions.</p></div>
  <p class="section-title">Tick to add to your daily checklist</p>
  ${SUPPS.map(s => `<div class="card tier ${s.tier.toLowerCase()}"><h3>${s.tier !== 'C' ? `<input type="checkbox" data-pick="${s.id}" ${chosen.includes(s.id) ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);flex-shrink:0">` : ''}<span style="flex:1">${esc(s.name)}</span><span class="pill ${s.tier === 'A' ? 'good' : s.tier === 'B' ? 'warn' : 'bad'}">${s.tier === 'A' ? 'Strong' : s.tier === 'B' ? 'Situational' : 'Skip'}</span></h3>
    ${s.tier !== 'C' ? `<p style="margin:0 0 6px;font-size:14px"><b>Dose:</b> ${esc(s.dose)}</p>` : ''}<p class="muted" style="margin:0;font-size:13px">${esc(s.why)}</p>${s.ref ? refLink(s.ref) : ''}</div>`).join('')}
  <div class="card"><h3>References</h3><ul class="tight" style="font-size:12px">${Object.values(REFS).map(r => `<li><a href="${r.u}" target="_blank" rel="noopener">${esc(r.t)}</a></li>`).join('')}</ul></div>`;
  $$('[data-pick]', el).forEach(c => c.onchange = () => {
    const set = new Set(P().supps || ['creatine', 'protein', 'vitd']); c.checked ? set.add(c.dataset.pick) : set.delete(c.dataset.pick);
    P().supps = [...set]; save(); toast('Checklist updated');
  });
}

/* ---------- ME ---------- */
function renderMe(el) {
  const p = P(), w = weightAt(day), bf = bfAt(day), t = targetsFor(day);
  el.innerHTML = `<div class="stack">
  <div class="card hero"><div class="row"><div class="day-badge on" style="width:52px;height:52px;font-size:20px;border-radius:18px">${esc((p.name || 'Me')[0].toUpperCase())}</div>
    <div><b style="font-size:18px">${esc(p.name || 'Athlete')}</b><br><small>${p.sex === 'male' ? 'Male' : 'Female'} · ${p.age} y · ${p.height} cm</small></div></div>
    <div class="tiles" style="margin-top:14px">
      <div><small>Weight</small><div class="big" style="font-size:20px">${r1(w.kg)} kg</div></div>
      <div><small>Body fat · lean mass</small><div class="big" style="font-size:20px">${r1(bf)}% · ${r1(w.kg * (1 - bf / 100))} kg</div></div>
      <div><small>BMR</small><div class="big" style="font-size:20px">${t.bmr} kcal</div></div>
      <div><small>Maintenance</small><div class="big" style="font-size:20px">${t.tdee} kcal</div></div></div></div>
  <button class="block" id="editProfile">✎ Edit profile & goals</button>
  ${isStandalone() ? '' : `<div class="card"><h3>📲 Install on your phone</h3>
    ${installPrompt ? '<button class="primary block" id="installBtn">Install Shred12</button>' : `<ul class="tight" style="margin:0">
      <li><b>iPhone (Safari):</b> tap Share ⬆ → <b>Add to Home Screen</b></li>
      <li><b>Android (Chrome):</b> tap ⋮ → <b>Install app</b> / Add to Home screen</li></ul>`}
    <small style="display:block;margin-top:8px">Opens full-screen and works offline at the gym.</small></div>`}
  <div class="card"><h3>Measurements<span class="spacer"></span><button class="sm primary" id="addMeasure">＋ Add</button></h3>
    ${sortedWeights().reverse().slice(0, 30).map(x => `<div class="list-item"><div class="grow"><b>${fmtDate(x.date)} · ${r1(x.kg)} kg</b><small>BMI ${r1(bmiOf(x.kg))}${x.waist ? ` · waist ${x.waist}` : ''}${x.bf ? ` · ${r1(x.bf)}% fat` : ''}</small></div><button class="sm ghost danger" data-del="${x.date}">✕</button></div>`).join('')}</div>
  <div class="card"><h3>Settings</h3>
    <div class="list-item"><div class="grow"><b>Dark mode</b></div><input type="checkbox" id="themeChk" ${S.theme !== 'light' ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"></div>
    <div class="list-item"><div class="grow"><b>Asian BMI cut-offs</b><small>Overweight from 23 instead of 25</small></div><input type="checkbox" id="asianChk" ${p.asianBmi ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"></div></div>
  <div class="card"><h3>📱 App</h3>
    <div class="list-item"><div class="grow"><b>Version</b><small id="appBuild">Checking…</small></div><span class="pill" id="appVer">—</span></div>
    <button class="block" id="checkUpd" style="margin-top:8px">⟳ Check for updates</button>
    <small id="updStatus" style="display:block;text-align:center;margin-top:6px"></small></div>
  <div class="card"><h3>Your data</h3><p class="muted" style="margin-top:0;font-size:13px">Stored only on this device. Export a backup regularly.</p>
    <div class="row"><button style="flex:1" id="exp">⬇ Export</button><label class="btn" style="flex:1;flex-direction:row;justify-content:center;color:var(--text)">⬆ Import<input type="file" id="imp" accept=".json" hidden></label></div>
    <button class="ghost danger block" id="reset" style="margin-top:6px">Reset everything</button></div>
  <p class="cite" style="text-align:center">Exercises: ${refLink('exdb')} · Foods: ${refLink('off')} + USDA values · Charts: Chart.js</p></div>`;
  $('#editProfile').onclick = openProfileSheet;
  showVersion();
  $('#checkUpd').onclick = checkForUpdates;
  const ib = $('#installBtn'); if (ib) ib.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); };
  $('#addMeasure').onclick = openMeasureSheet;
  $$('[data-del]', el).forEach(b => b.onclick = () => {
    if (S.weights.length <= 1) return toast('Keep at least one entry');
    S.weights = S.weights.filter(x => x.date !== b.dataset.del); save(); render();
  });
  $('#themeChk').onchange = e => { S.theme = e.target.checked ? 'dark' : 'light'; applyTheme(); save(); render(); };
  $('#asianChk').onchange = e => { p.asianBmi = e.target.checked; save(); };
  $('#exp').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([Store.export()], { type: 'application/json' }));
    a.download = `shred12-backup-${today()}.json`; a.click();
  };
  $('#imp').onchange = async e => { try { Store.import(await e.target.files[0].text()); location.reload(); } catch { toast('Invalid file'); } };
  $('#reset').onclick = () => { if (confirm('Delete all Shred12 data on this device?')) { Store.reset(); location.reload(); } };
}
function openProfileSheet() {
  const p = P();
  openModal(`<h3>Edit profile & goals</h3><form id="pf" class="stack"><div class="fields">
    <label class="full">Name<input name="name" value="${esc(p.name)}"></label>
    <label>Age<input name="age" type="number" inputmode="numeric" value="${p.age}"></label>
    <label>Height (cm)<input name="height" type="number" inputmode="decimal" value="${p.height}"></label>
    <label>Goal body fat %<input name="goalBf" type="number" inputmode="decimal" step="0.5" value="${p.goalBf}"></label>
    <label>Pace<select name="rate">${[[0.5, 'Steady 0.5%'], [0.7, 'Recommended 0.7%'], [1, 'Fast 1%']].map(([v, l]) => `<option value="${v}" ${+p.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="full">Activity<select name="activity">${Sci.ACTIVITY.map(a => `<option value="${a.v}" ${+p.activity === a.v ? 'selected' : ''}>${a.l}</option>`).join('')}</select></label>
    <label class="full">Workout plan<select name="split">${Object.entries(PROGRAM.splits).map(([k, s]) => `<option value="${k}" ${p.split === k ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    <label>Diet<select name="diet"><option value="any">Everything</option><option value="veg" ${p.diet === 'veg' ? 'selected' : ''}>Vegetarian</option></select></label>
    <label>Plan start<input name="startDate" type="date" value="${p.startDate}"></label></div>
    <button class="primary block">Save</button></form>`);
  $('#pf').onsubmit = e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    Object.assign(p, { name: f.name.trim(), age: +f.age, height: +f.height, goalBf: +f.goalBf, rate: +f.rate, activity: +f.activity, split: f.split, diet: f.diet, startDate: f.startDate || p.startDate });
    S.mealPlan = null; save(); closeModal(); toast('Profile saved'); render();
  };
}

/* ---------- version & updates ---------- */
const verLabel = v => v ? 'v' + ((String(v).match(/v(\d+)$/) || [])[1] || v) : '—';
const buildLabel = b => b ? parse(b).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
/* Ask the running service worker which version it is. */
async function runningVersion() {
  const sw = navigator.serviceWorker?.controller || (await navigator.serviceWorker?.getRegistration())?.active;
  if (!sw) return null;
  return new Promise(res => {
    const ch = new MessageChannel();
    ch.port1.onmessage = e => res(e.data);
    sw.postMessage('version', [ch.port2]);
    setTimeout(() => res(null), 1500);
  });
}
/* Read the version that is published online right now. */
async function publishedVersion() {
  const txt = await (await fetch('sw.js?check=' + Date.now(), { cache: 'no-store' })).text();
  return { version: (txt.match(/VERSION = '([^']+)'/) || [])[1], build: (txt.match(/BUILD = '([^']+)'/) || [])[1] };
}
async function showVersion() {
  const v = await runningVersion();
  if (!$('#appVer')) return;
  $('#appVer').textContent = v ? verLabel(v.version) : 'web';
  $('#appBuild').textContent = v ? `Updated ${buildLabel(v.build)}${isStandalone() ? ' · installed app' : ''}` : 'Offline support not active in this browser';
}
let updating = false;
async function checkForUpdates() {
  const st = $('#updStatus'), btn = $('#checkUpd');
  if (!navigator.onLine) { st.textContent = "You're offline — connect to the internet and try again."; return; }
  btn.disabled = true; st.textContent = 'Checking…';
  try {
    const [cur, pub] = await Promise.all([runningVersion(), publishedVersion()]);
    if (!pub.version) throw new Error('no version');
    if (cur?.version === pub.version) { st.textContent = `✓ You're on the latest version (${verLabel(pub.version)})`; btn.disabled = false; return; }
    st.textContent = `Updating to ${verLabel(pub.version)}…`;
    updating = true;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { location.reload(); return; }
    const done = new Promise(res => { navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 8000); });
    await reg.update();
    await done;
    location.reload();
  } catch {
    updating = false; btn.disabled = false; st.textContent = 'Could not check right now. Try again in a minute.';
  }
}
// A new version took over in the background (e.g. GitHub just published): let the user know.
const hadController = !!navigator.serviceWorker?.controller; // false on the very first visit
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (updating || !hadController) return;
  toast('✓ App updated to the latest version');
  if (currentView === 'me') showVersion();
});

/* ---------- install (PWA) ---------- */
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (currentView === 'me') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Shred12 installed 🎉'); });

/* ---------- boot ---------- */
function applyTheme() { document.documentElement.dataset.theme = S.theme; $('meta[name="theme-color"]').content = S.theme === 'light' ? '#f4f6fb' : '#0b0f17'; }
$$('#nav a').forEach(a => a.onclick = () => P() && go(a.dataset.view));
$('#prevDay').onclick = () => { day = addDays(day, -1); render(); };
$('#nextDay').onclick = () => { day = addDays(day, 1); render(); };
$('#dayPicker').onchange = e => { if (e.target.value) { day = e.target.value; render(); } };
$('#modalX').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
applyTheme();
render();
