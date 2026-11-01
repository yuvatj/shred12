/* Guided workout coach: talks through your headset (speech synthesis routes to Bluetooth audio),
   counts reps, encourages you on the last reps, runs rest timers, coaches cardio by heart-rate zone,
   and reads live heart rate from Bluetooth watches/straps (standard Heart Rate Service, Android Chrome).
   Rule-based for now — the cue functions are the place to plug an AI coach in later. */
(() => {
  const DEFAULTS = { voice: true, tempo: 3, autoCount: true, rest: 'auto', encourage: true };
  const cfg = () => (S.coach = { ...DEFAULTS, ...(S.coach || {}) });

  /* ---------- voice & sound ---------- */
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /en[-_](US|GB|IN|AU)/i.test(v.lang) && /natural|google|samantha|daniel/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, interrupt = false) {
    if (!cfg().voice || !('speechSynthesis' in window)) return;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.05; u.pitch = 1;
    speechSynthesis.speak(u);
  }
  let actx = null;
  function beep(freq = 880, dur = 0.12, vol = 0.25) {
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(actx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
    } catch { /* audio unavailable */ }
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- keep the screen on ---------- */
  let wakeLock = null;
  async function lockScreen() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } }
  function unlockScreen() { try { wakeLock?.release(); } catch { } wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (state && document.visibilityState === 'visible') lockScreen(); });

  /* ---------- heart rate over Bluetooth ---------- */
  const hr = { value: null, device: null, samples: [], listeners: new Set() };
  const hrSupported = () => !!navigator.bluetooth;
  const hrMax = () => Math.round(208 - 0.7 * (P()?.age || 30)); // Tanaka et al. 2001
  async function connectHR() {
    if (!hrSupported()) { toast('Bluetooth not supported here — use Chrome on Android'); return; }
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      const server = await device.gatt.connect();
      const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', e => {
        const v = e.target.value, flags = v.getUint8(0);
        hr.value = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
        if (state) hr.samples.push(hr.value);
        hr.listeners.forEach(fn => fn(hr.value));
      });
      device.addEventListener('gattserverdisconnected', () => { hr.value = null; hr.device = null; toast('Heart-rate device disconnected'); hr.listeners.forEach(fn => fn(null)); });
      hr.device = device;
      toast(`Connected to ${device.name || 'heart-rate device'} ❤️`);
      hr.listeners.forEach(fn => fn(hr.value));
    } catch (e) {
      if (e?.name !== 'NotFoundError') toast('Could not connect: ' + (e?.message || e));
    }
  }
  function disconnectHR() { try { hr.device?.gatt.disconnect(); } catch { } hr.device = null; hr.value = null; }
  const hrZone = v => { const pct = v / hrMax(); return pct < .6 ? 'Easy' : pct < .7 ? 'Zone 2' : pct < .8 ? 'Tempo' : pct < .9 ? 'Hard' : 'Max'; };

  /* ---------- coach state ---------- */
  let state = null, timer = null;
  const el = () => document.getElementById('coach');
  const repRange = s => { const m = String(s).match(/(\d+)\D+(\d+)/); return m ? [+m[1], +m[2]] : [8, 12]; };

  function open(html) {
    let c = el();
    if (!c) { c = document.createElement('div'); c.id = 'coach'; c.className = 'coach'; document.querySelector('.app').appendChild(c); }
    c.innerHTML = html;
    c.querySelector('[data-c="exit"]')?.addEventListener('click', exit);
    c.querySelector('[data-c="hr"]')?.addEventListener('click', () => hr.device ? null : connectHR());
  }
  function header(title, sub) {
    return `<div class="coach-top"><button class="sm ghost" data-c="exit">✕ End</button><div class="coach-title"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      <button class="sm hr-chip ${hr.value ? 'on' : ''}" data-c="hr" id="hrChip">${hr.device ? `❤️ <span id="hrVal">${hr.value ?? '--'}</span>` : '⌚ Connect'}</button></div>`;
  }
  function paintHR() {
    const v = document.getElementById('hrVal'), chip = document.getElementById('hrChip');
    if (chip && hr.device && !v) chip.innerHTML = `❤️ <span id="hrVal">${hr.value ?? '--'}</span>`;
    if (v) v.textContent = hr.value ?? '--';
    chip?.classList.toggle('on', !!hr.value);
    const z = document.getElementById('hrZone'); if (z) z.textContent = hr.value ? `${hrZone(hr.value)} · ${Math.round((hr.value / hrMax()) * 100)}% of max` : '';
  }
  hr.listeners.add(paintHR);
  function stopTimer() { clearInterval(timer); timer = null; }
  function exit() {
    if (state?.kind === 'cardio' && state.startedAt) finishCardio(true);
    stopTimer(); speechSynthesis?.cancel(); unlockScreen();
    state = null; el()?.remove(); render();
  }

  /* ---------- strength coaching ---------- */
  /* only = index of one exercise to coach (from the workout sheet); null = whole workout. */
  function startStrength(only = null) {
    const s = ensureSession(); S.workouts[day] = s; save();
    const ph = PROGRAM.phaseFor(planWeek(day));
    state = { kind: 'strength', s, ph, range: repRange(ph.reps), only };
    Object.assign(state, nextSet(s, only ?? 0, -1));
    hr.samples = [];
    if (state.exi == null) { toast(only != null ? 'All sets of this exercise are done ✓' : 'All sets are already done 💪'); state = null; return; }
    lockScreen(); beep(660, .08);
    say(only != null ? `Let's go.` : `Let's go. ${s.name}. ${s.exercises.length} exercises today.`, true);
    ready();
  }
  function nextSet(s, exi, seti) {
    if (state?.only != null) { // single-exercise mode: stay on this exercise
      const sets = s.exercises[state.only].sets;
      for (let k = exi === state.only ? seti + 1 : 0; k < sets.length; k++) if (!sets[k].done) return { exi: state.only, seti: k };
      for (let k = 0; k < sets.length; k++) if (!sets[k].done) return { exi: state.only, seti: k };
      return { exi: null, seti: null };
    }
    for (let e = exi; e < s.exercises.length; e++) {
      for (let k = e === exi ? seti + 1 : 0; k < s.exercises[e].sets.length; k++) if (!s.exercises[e].sets[k].done) return { exi: e, seti: k };
    }
    for (let e = 0; e < s.exercises.length; e++) for (let k = 0; k < s.exercises[e].sets.length; k++) if (!s.exercises[e].sets[k].done) return { exi: e, seti: k };
    return { exi: null, seti: null };
  }
  const curEx = () => state.s.exercises[state.exi];
  const curSet = () => curEx().sets[state.seti];
  function setLabel() { return `Set ${state.seti + 1} of ${curEx().sets.length}`; }
  function weightText(kg) { return kg ? `${kg} kilos` : 'body weight'; }

  function ready() {
    stopTimer(); state.phase = 'ready'; state.reps = 0;
    const ex = EX[curEx().id], set = curSet(), [lo, hi] = state.range;
    if (set.kg === '' && state.seti > 0) set.kg = curEx().sets[state.seti - 1].kg; // carry weight to the next set
    const first = state.seti === 0 || curEx().sets.slice(0, state.seti).every(x => !x.done);
    open(`${header(ex?.name || curEx().id, setLabel())}
      <div class="coach-body">
        ${ex?.images?.[0] ? `<img class="coach-img" src="${exImg(ex)}" alt="">` : ''}
        <div class="coach-big">${lo}–${hi}<small> reps</small></div>
        <div class="coach-sub">${set.kg ? set.kg + ' kg' : 'Choose your weight'} · RPE ${state.ph.rpe}</div>
        <div class="coach-kg"><button data-kg="-2.5">−2.5</button><input id="cKg" type="number" inputmode="decimal" step="0.5" value="${set.kg}"><button data-kg="2.5">+2.5</button></div>
        <small class="muted">kg for this set</small>
      </div>
      <div class="coach-actions"><button class="primary block coach-go" data-c="go">▶ Start set</button>
      <button class="ghost block" data-c="skipex">${state.only != null ? 'Back to workout' : 'Skip exercise'}</button></div>`);
    say(first ? `${ex?.name || 'Next exercise'}. ${setLabel()}. ${weightText(set.kg)}, ${lo} to ${hi} reps. Tap start when you're ready.`
      : `${setLabel()}. ${weightText(set.kg)}. Tap start when ready.`);
    el().querySelectorAll('[data-kg]').forEach(b => b.onclick = () => { const i = document.getElementById('cKg'); i.value = Math.max(0, (+i.value || 0) + +b.dataset.kg); });
    el().querySelector('[data-c="go"]').onclick = () => { curSet().kg = +document.getElementById('cKg').value || ''; save(); countdown(); };
    el().querySelector('[data-c="skipex"]').onclick = () => {
      if (state.only != null) return exit();
      const n = nextSet(state.s, state.exi + 1, -1);
      if (n.exi == null || n.exi === state.exi) return finishStrength();
      Object.assign(state, n); ready();
    };
  }
  function countdown() {
    state.phase = 'countdown';
    let n = 3;
    open(`${header(EX[curEx().id]?.name || '', setLabel())}<div class="coach-body"><div class="coach-big huge" id="cBig">3</div><div class="coach-sub">Get set…</div></div>`);
    say('Three', true); beep(660);
    timer = setInterval(() => {
      n--;
      if (n > 0) { document.getElementById('cBig').textContent = n; say(String(n === 2 ? 'Two' : 'One')); beep(660); }
      else { stopTimer(); beep(1100, .25); say('Go!', true); setPhase(); }
    }, 1000);
  }
  function setPhase() {
    state.phase = 'set'; state.reps = 0; state.paused = false;
    const [lo, hi] = state.range, c = cfg();
    open(`${header(EX[curEx().id]?.name || '', `${setLabel()} · ${weightText(curSet().kg)}`)}
      <div class="coach-body tap" data-c="tap">
        <div class="coach-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="track"/><circle cx="100" cy="100" r="88" class="prog" id="cRing" style="stroke-dasharray:553;stroke-dashoffset:553"/></svg>
          <div class="coach-ring-in"><div class="coach-big huge" id="cBig">0</div><small>of ${lo}–${hi} reps</small></div></div>
        <div class="coach-sub" id="cSub">${c.autoCount ? `Counting every ${c.tempo}s — move with the voice` : 'Tap anywhere to count each rep'}</div>
        <div class="coach-sub" id="hrZone"></div>
      </div>
      <div class="coach-actions">
        <div class="row">${c.autoCount ? '<button style="flex:1" data-c="pause">⏸ Pause</button>' : '<button style="flex:1" data-c="minus">− Rep</button>'}<button style="flex:1" data-c="plus">＋ Rep</button></div>
        <button class="primary block" data-c="done">✓ Finish set</button></div>`);
    paintHR();
    const tap = () => addRep();
    el().querySelector('[data-c="tap"]').onclick = () => { if (!c.autoCount) tap(); };
    el().querySelector('[data-c="plus"]').onclick = e => { e.stopPropagation(); tap(); };
    el().querySelector('[data-c="minus"]')?.addEventListener('click', () => { state.reps = Math.max(0, state.reps - 1); paintReps(); });
    el().querySelector('[data-c="pause"]')?.addEventListener('click', e => { state.paused = !state.paused; e.target.textContent = state.paused ? '▶ Resume' : '⏸ Pause'; say(state.paused ? 'Paused' : 'Go', true); });
    el().querySelector('[data-c="done"]').onclick = () => logSet();
    if (c.autoCount) {
      let next = Date.now() + c.tempo * 1000;
      timer = setInterval(() => { if (state.paused) { next = Date.now() + c.tempo * 1000; return; } if (Date.now() >= next) { next += c.tempo * 1000; addRep(); } }, 100);
    }
  }
  function paintReps() {
    const [, hi] = state.range, b = document.getElementById('cBig'), r = document.getElementById('cRing');
    if (b) b.textContent = state.reps;
    if (r) r.style.strokeDashoffset = 553 * (1 - Math.min(1, state.reps / hi));
  }
  /* Rep cues: this is where an AI coach would generate personalised encouragement later. */
  function repCue(rep) {
    const [lo, hi] = state.range, prev = lastBest();
    if (rep >= hi) return `${rep}! Great set!`;
    if (rep === hi - 1) return `${rep}. Last one! Push, squeeze it!`;
    if (rep === hi - 2 && hi - 2 >= lo) return `${rep}. Two more. Dig in!`;
    if (prev && rep === prev + 1 && rep < hi) return `${rep}. That beats last time. Keep going!`;
    if (rep === lo) return `${rep}. Target reached. Keep going if you can!`;
    if (cfg().encourage && rep === Math.ceil(lo / 2)) return `${rep}. ${pick(['Good pace.', 'Strong.', 'Control the weight.', 'Breathe.', 'Nice and smooth.'])}`;
    return String(rep);
  }
  function lastBest() {
    const prev = lastSetsFor(curEx().id, day);
    return prev ? Math.max(0, ...prev.filter(x => x.done).map(x => +x.reps || 0)) : 0;
  }
  function addRep() {
    if (state.phase !== 'set') return;
    state.reps++; paintReps(); beep(880, .05, .12);
    say(repCue(state.reps), true);
    if (cfg().autoCount && state.reps >= state.range[1]) { stopTimer(); setTimeout(() => state?.phase === 'set' && logSet(), 1600); }
  }
  function logSet() {
    stopTimer(); state.phase = 'log';
    const set = curSet();
    say(state.reps >= state.range[1] ? 'Top of the range — add weight next time. Rack it.' : state.reps >= state.range[0] ? 'Good set. Rack it.' : 'Set done. Rack it and breathe.');
    open(`${header(EX[curEx().id]?.name || '', setLabel())}
      <div class="coach-body"><div class="coach-sub">Log this set</div>
        <small class="muted">Reps</small>
        <div class="stepper" style="width:100%;max-width:300px"><button data-r="-1">−</button><input id="cReps" type="number" inputmode="numeric" value="${state.reps || state.range[0]}"><button data-r="1">+</button></div>
        <small class="muted">Weight (kg)</small>
        <div class="stepper" style="width:100%;max-width:300px"><button data-w="-2.5">−</button><input id="cKgLog" type="number" inputmode="decimal" step="0.5" value="${set.kg}"><button data-w="2.5">+</button></div></div>
      <div class="coach-actions"><button class="primary block" data-c="save">✓ Save set</button></div>`);
    el().querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const i = document.getElementById('cReps'); i.value = Math.max(0, +i.value + +b.dataset.r); });
    el().querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const i = document.getElementById('cKgLog'); i.value = Math.max(0, (+i.value || 0) + +b.dataset.w); });
    el().querySelector('[data-c="save"]').onclick = () => {
      const kg = document.getElementById('cKgLog').value;
      Object.assign(set, { reps: +document.getElementById('cReps').value || 0, kg: kg === '' ? '' : +kg, done: true }); save();
      toast(`Saved: ${set.kg ? set.kg + ' kg × ' : ''}${set.reps} reps`);
      const n = nextSet(state.s, state.exi, state.seti);
      if (n.exi == null) return state.only != null ? finishExercise() : finishStrength();
      rest(n);
    };
  }
  function restSeconds(nextEx) {
    const r = cfg().rest; if (r !== 'auto') return +r;
    const compound = EX[nextEx.id]?.mechanic === 'compound';
    return state.ph.name === 'Intensify' ? (compound ? 150 : 90) : compound ? 120 : 75;
  }
  function rest(n) {
    const sameEx = n.exi === state.exi, nextEx = state.s.exercises[n.exi];
    let total = restSeconds(nextEx), end = Date.now() + total * 1000;
    const spoken = new Set(), recover = Math.round(hrMax() * 0.65);
    let extended = false;
    state.phase = 'rest';
    const nextName = EX[nextEx.id]?.name || nextEx.id, nextKg = nextEx.sets[n.seti].kg;
    open(`${header('Rest', `Next: ${sameEx ? 'set ' + (n.seti + 1) : nextName}`)}
      <div class="coach-body">
        <div class="coach-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="track"/><circle cx="100" cy="100" r="88" class="prog rest" id="cRing" style="stroke-dasharray:553;stroke-dashoffset:0"/></svg>
          <div class="coach-ring-in"><div class="coach-big huge" id="cBig">${fmt(total)}</div><small>rest</small></div></div>
        <div class="coach-sub">Next: <b>${esc(sameEx ? `Set ${n.seti + 1} of ${nextEx.sets.length}` : nextName)}</b>${nextKg ? ` · ${nextKg} kg` : ''}</div>
        <div class="coach-sub" id="hrZone"></div>
      </div>
      <div class="coach-actions"><div class="row"><button style="flex:1" data-c="add">＋30 s</button><button class="primary" style="flex:2" data-c="skip">Skip rest ⏭</button></div></div>`);
    paintHR();
    say(`Rest ${total >= 60 ? +(total / 60).toFixed(1) + ' minutes' : total + ' seconds'}.`);
    el().querySelector('[data-c="add"]').onclick = () => { end += 30000; total += 30; say('Thirty more seconds.', true); };
    const go = () => { stopTimer(); Object.assign(state, n); ready(); };
    el().querySelector('[data-c="skip"]').onclick = go;
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const b = document.getElementById('cBig'), r = document.getElementById('cRing');
      if (b) b.textContent = fmt(left);
      if (r) r.style.strokeDashoffset = 553 * (1 - left / total);
      const once = (k, fn) => { if (!spoken.has(k)) { spoken.add(k); fn(); } };
      if (left === 30 && total > 45) once(30, () => say('Thirty seconds.'));
      if (left === 10) once(10, () => {
        if (hr.value && hr.value > recover && !extended) { extended = true; end += 15000; total += 15; say(`Heart rate still ${hr.value}. Take fifteen more seconds.`); spoken.delete(10); return; }
        say(`Ten seconds. Next, ${sameEx ? 'set ' + (n.seti + 1) : nextName}${nextKg ? ', ' + nextKg + ' kilos' : ''}.`);
      });
      if (left <= 3 && left > 0) once('b' + left, () => beep(660));
      if (left === 0) { beep(1100, .25); go(); }
    }, 200);
  }
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  /* Single-exercise mode finished: summary, then next exercise or back to the list. */
  function finishExercise() {
    stopTimer();
    const s = state.s, e = s.exercises[state.only], done = e.sets.filter(x => x.done);
    const best = done.reduce((b, x) => (+x.kg || 0) * 100 + (+x.reps || 0) > (+b.kg || 0) * 100 + (+b.reps || 0) ? x : b, done[0] || {});
    const nextIdx = s.exercises.findIndex(x => x.sets.some(k => !k.done));
    if (nextIdx < 0) { s.done = true; save(); }
    say(nextIdx < 0 ? 'Workout complete! Great work.' : `${EX[e.id]?.name || 'Exercise'} done. Nice work.`, true);
    open(`${header(EX[e.id]?.name || '', 'Exercise complete')}
      <div class="coach-body"><div class="coach-big huge">${nextIdx < 0 ? '🏆' : '✅'}</div>
        <div class="coach-big">${done.length}<small> sets saved</small></div>
        <div class="coach-sub">Best set: ${best.kg ? best.kg + ' kg × ' : ''}${best.reps || 0} reps</div>
        ${nextIdx < 0 ? '<div class="coach-sub">All exercises done — workout complete!</div>' : `<div class="coach-sub">Next: <b>${esc(EX[s.exercises[nextIdx].id]?.name || '')}</b></div>`}</div>
      <div class="coach-actions">${nextIdx < 0 ? '' : '<button class="primary block" data-c="nextex">▶ Next exercise</button>'}<button class="block" data-c="exit2">Back to workout</button></div>`);
    const nx = el().querySelector('[data-c="nextex"]');
    if (nx) nx.onclick = () => { state.only = nextIdx; Object.assign(state, nextSet(s, nextIdx, -1)); ready(); };
    el().querySelector('[data-c="exit2"]').onclick = exit;
    state.phase = 'finished';
  }
  function finishStrength() {
    stopTimer();
    const s = state.s, sets = s.exercises.reduce((t, e) => t + e.sets.filter(x => x.done).length, 0);
    const vol = s.exercises.reduce((t, e) => t + e.sets.filter(x => x.done).reduce((a, x) => a + (+x.kg || 0) * (+x.reps || 0), 0), 0);
    s.done = true;
    if (hr.samples.length) s.hr = { avg: Math.round(hr.samples.reduce((a, b) => a + b, 0) / hr.samples.length), max: Math.max(...hr.samples) };
    save();
    say(`Workout complete! ${sets} sets, ${Math.round(vol).toLocaleString()} kilos total volume. Great work — log your protein and water.`, true);
    open(`${header('Workout complete', s.name)}
      <div class="coach-body"><div class="coach-big huge">🏆</div><div class="coach-big">${sets}<small> sets</small></div>
        <div class="coach-sub">${Math.round(vol).toLocaleString()} kg total volume${s.hr ? ` · HR avg ${s.hr.avg} / max ${s.hr.max}` : ''}</div></div>
      <div class="coach-actions"><button class="primary block" data-c="exit2">Done</button></div>`);
    el().querySelector('[data-c="exit2"]').onclick = exit;
    state.phase = 'finished';
  }

  /* ---------- cardio coaching ---------- */
  function startCardio() {
    const sd = scheduledDay(day), intervals = /interval/i.test(sd.name);
    const mins = +(sd.name.match(/(\d+)\s*min/) || [])[1] || 30;
    const segs = intervals
      ? [{ t: 300, n: 'Warm up', cue: 'Warm up. Easy pace for five minutes.' },
        ...Array.from({ length: 8 }, (_, i) => [{ t: 30, n: `Sprint ${i + 1} of 8`, hard: true, cue: pick(['Go hard! Thirty seconds!', 'Push! All out!', 'Go go go!']) }, { t: 90, n: 'Recover', cue: 'Easy now. Recover.' }]).flat(),
        { t: 300, n: 'Cool down', cue: 'Great work. Cool down, easy pace.' }]
      : [{ t: mins * 60, n: 'Zone 2', cue: `Zone 2 cardio, ${mins} minutes. Keep a pace where you can still talk.` }];
    state = { kind: 'cardio', intervals, segs, total: segs.reduce((a, s) => a + s.t, 0), startedAt: Date.now(), pausedMs: 0, pausedAt: null, seg: -1, lastHrCue: 0, spoken: new Set() };
    hr.samples = [];
    lockScreen(); beep(1100, .2);
    open(`${header(sd.name, intervals ? '8 × 30 s hard / 90 s easy' : `Target ${Math.round(hrMax() * .6)}–${Math.round(hrMax() * .7)} bpm`)}
      <div class="coach-body">
        <div class="coach-sub" id="cSeg" style="font-size:20px;font-weight:800;color:var(--text)"></div>
        <div class="coach-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="track"/><circle cx="100" cy="100" r="88" class="prog" id="cRing" style="stroke-dasharray:553;stroke-dashoffset:553"/></svg>
          <div class="coach-ring-in"><div class="coach-big huge" id="cBig">0:00</div><small id="cLeft"></small></div></div>
        <div class="coach-sub" id="hrZone"></div>
      </div>
      <div class="coach-actions"><div class="row"><button style="flex:1" data-c="pause">⏸ Pause</button><button class="primary" style="flex:1" data-c="stop">✓ Finish</button></div></div>`);
    paintHR();
    el().querySelector('[data-c="pause"]').onclick = e => {
      if (state.pausedAt) { state.pausedMs += Date.now() - state.pausedAt; state.pausedAt = null; e.target.textContent = '⏸ Pause'; say('Resume.', true); }
      else { state.pausedAt = Date.now(); e.target.textContent = '▶ Resume'; say('Paused.', true); }
    };
    el().querySelector('[data-c="stop"]').onclick = () => finishCardio(false);
    timer = setInterval(cardioTick, 250);
  }
  function cardioTick() {
    if (state.pausedAt) return;
    const el2 = (Date.now() - state.startedAt - state.pausedMs) / 1000;
    if (el2 >= state.total) return finishCardio(false);
    let acc = 0, i = 0; for (; i < state.segs.length; i++) { if (el2 < acc + state.segs[i].t) break; acc += state.segs[i].t; }
    const seg = state.segs[i], segLeft = Math.ceil(acc + seg.t - el2);
    if (i !== state.seg) { state.seg = i; beep(seg.hard ? 1200 : 700, .25); say(seg.cue, true); }
    const nxt = state.segs[i + 1];
    if (nxt?.hard && segLeft <= 3 && segLeft > 0 && !state.spoken.has(i + ':' + segLeft)) { state.spoken.add(i + ':' + segLeft); beep(660); if (segLeft === 3) say('Get ready'); }
    if (seg.hard && segLeft === 10 && !state.spoken.has(i + ':10')) { state.spoken.add(i + ':10'); say('Ten seconds! Push!'); }
    if (!state.intervals) {
      const m = Math.floor(el2 / 60);
      if (m > 0 && m % 5 === 0 && !state.spoken.has('m' + m)) { state.spoken.add('m' + m); say(`${m} minutes done. ${Math.round((state.total - el2) / 60)} to go.${m * 60 >= state.total / 2 && m * 60 - 300 < state.total / 2 ? ' Halfway!' : ''}`); }
      if (hr.value && Date.now() - state.lastHrCue > 60000) {
        const pct = hr.value / hrMax();
        if (pct > .72) { state.lastHrCue = Date.now(); say(`Heart rate ${hr.value}. Ease off a little.`); }
        else if (pct < .58 && el2 > 300) { state.lastHrCue = Date.now(); say(`Heart rate ${hr.value}. Pick up the pace a bit.`); }
      }
    }
    const b = document.getElementById('cBig'), r = document.getElementById('cRing'), l = document.getElementById('cLeft'), sEl = document.getElementById('cSeg');
    if (b) b.textContent = fmt(state.intervals ? segLeft : Math.floor(el2));
    if (l) l.textContent = `${fmt(Math.ceil(state.total - el2))} left in workout`;
    if (sEl) { sEl.textContent = seg.n; sEl.style.color = seg.hard ? 'var(--bad)' : 'var(--text)'; }
    if (r) r.style.strokeDashoffset = 553 * (1 - (state.intervals ? 1 - segLeft / seg.t : el2 / state.total));
  }
  function finishCardio(silent) {
    stopTimer();
    const mins = Math.round((Date.now() - state.startedAt - state.pausedMs - (state.pausedAt ? Date.now() - state.pausedAt : 0)) / 60000);
    const s = ensureSession(); s.cardioMin = (s.cardioMin || 0) + mins; s.done = true;
    if (hr.samples.length) s.hr = { avg: Math.round(hr.samples.reduce((a, b) => a + b, 0) / hr.samples.length), max: Math.max(...hr.samples) };
    S.workouts[day] = s; save();
    state.startedAt = null;
    if (silent) return;
    say(`Cardio complete. ${mins} minutes. Nice work!`, true);
    open(`${header('Cardio complete', s.name)}<div class="coach-body"><div class="coach-big huge">🔥</div><div class="coach-big">${mins}<small> min</small></div>
      <div class="coach-sub">${s.hr ? `HR avg ${s.hr.avg} · max ${s.hr.max}` : 'Logged to today'}</div></div>
      <div class="coach-actions"><button class="primary block" data-c="exit2">Done</button></div>`);
    el().querySelector('[data-c="exit2"]').onclick = exit;
  }

  /* ---------- settings sheet ---------- */
  function settings() {
    const c = cfg();
    openModal(`<h3>🎧 Coach settings</h3><div class="stack">
      <label class="check"><input type="checkbox" id="csVoice" ${c.voice ? 'checked' : ''}>Voice through headset / speaker</label>
      <label class="check"><input type="checkbox" id="csAuto" ${c.autoCount ? 'checked' : ''}>Count reps for me (tempo)</label>
      <label>Seconds per rep<select id="csTempo">${[2, 3, 4, 5].map(t => `<option ${c.tempo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Rest between sets<select id="csRest">${[['auto', 'Auto (by exercise & phase)'], ['60', '60 s'], ['90', '90 s'], ['120', '2 min'], ['180', '3 min']].map(([v, l]) => `<option value="${v}" ${String(c.rest) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="csEnc" ${c.encourage ? 'checked' : ''}>Extra encouragement</label>
      <button id="csTest">🔊 Test voice</button>
      <div class="card" style="background:var(--card2)"><b>⌚ Heart rate</b><p class="muted" style="font-size:13px;margin:6px 0">${hrSupported()
        ? `Works with watches & straps that broadcast heart rate over Bluetooth (Polar, Garmin "Broadcast HR", Coros, Wahoo, many Amazfit). Your max HR ≈ ${hrMax()} bpm.`
        : 'Bluetooth heart rate needs Chrome on Android (not available on iPhone or this browser). The voice coach still works.'}</p>
        ${hrSupported() ? `<button class="block" id="csHr">${hr.device ? `Disconnect ${esc(hr.device.name || 'device')}` : 'Connect heart-rate device'}</button>` : ''}</div>
      <button class="primary block" id="csSave">Save</button></div>`);
    $('#csTest').onclick = () => { const v = cfg().voice; S.coach.voice = true; say('Two more. Push! Last one, squeeze it!', true); S.coach.voice = v; };
    const hb = $('#csHr'); if (hb) hb.onclick = async () => { if (hr.device) disconnectHR(); else await connectHR(); settings(); };
    $('#csSave').onclick = () => {
      Object.assign(S.coach, { voice: $('#csVoice').checked, autoCount: $('#csAuto').checked, tempo: +$('#csTempo').value, rest: $('#csRest').value, encourage: $('#csEnc').checked });
      save(); closeModal(); toast('Coach settings saved');
    };
  }

  window.Coach = {
    start() { const sd = scheduledDay(day); if (sd.cardio) startCardio(); else startStrength(); },
    startExercise: i => startStrength(i),
    startCardio, settings, connectHR, hr, hrSupported, hrMax, active: () => !!state,
  };
})();
