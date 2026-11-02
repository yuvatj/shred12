/* Guided workout coach: talks through your headset (speech synthesis routes to Bluetooth audio),
   counts reps, encourages you on the last reps, runs rest timers, coaches cardio by heart-rate zone,
   and reads live heart rate from Bluetooth watches/straps (standard Heart Rate Service, Android Chrome).
   Rule-based for now — the cue functions are the place to plug an AI coach in later. */
(() => {
  const DEFAULTS = { voice: true, tempo: 3, autoCount: true, rest: 'auto', encourage: true, breath: 'soft' };
  const cfg = () => (S.coach = { ...DEFAULTS, ...(S.coach || {}) });

  /* ---------- voice & sound ---------- */
  /* Rank the device's voices so the most human one wins: neural/"Natural" voices (Edge, Windows, Android),
     then iOS Premium/Enhanced/Siri, then Google's; novelty and robotic voices are pushed to the bottom. */
  const failed = new Set(); // voices that errored (e.g. online voices with no signal) are skipped
  function voiceScore(v) {
    if (!/^en/i.test(v.lang) || failed.has(v.name)) return -1;
    let s = 1;
    if (/natural|neural/i.test(v.name)) s += 40;
    if (/premium|enhanced|siri/i.test(v.name)) s += 30;
    if (/google/i.test(v.name)) s += 20;
    if (/samantha|daniel|karen|moira|ava|zoe|evan|nathan|serena|aria|jenny|guy|sonia|libby|ryan/i.test(v.name)) s += 10;
    if (/compact|espeak|eloquence|zarvox|trinoids|whisper|bells|boing|bubbles|cellos|jester|organ|superstar|wobble|bahh|albert|fred|junior|ralph|kathy|news/i.test(v.name)) s -= 60;
    if (v.lang.replace('_', '-').toLowerCase() === (navigator.language || '').toLowerCase()) s += 5; // the user's own accent
    return s;
  }
  const rankedVoices = () => ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => voiceScore(v) > 0).sort((a, b) => voiceScore(b) - voiceScore(a));
  const shortName = v => v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*[-–]\s*English.*$|\s*\(.*\)$/, '');
  let voice = null;
  function pickVoice() {
    const vs = rankedVoices();
    voice = vs.find(v => v.name === cfg().voiceName) || vs[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  /* Tone shapes delivery like a real coach: quick counts, energetic pushes, slower and lower while you rest.
     A little random variation keeps repeated lines from sounding identical. */
  const TONES = { normal: [1, 1], count: [1.12, 1], hype: [1.1, 1.12], calm: [0.92, 0.94] };
  const jitter = () => 1 + (Math.random() - 0.5) * 0.06;
  function say(text, interrupt = false, tone = 'normal') {
    if (!cfg().voice || !('speechSynthesis' in window) || !text) return;
    if (interrupt) speechSynthesis.cancel();
    const [rate, pitch] = TONES[tone] || TONES.normal;
    // One utterance per sentence gives natural breaths between them (and avoids Chrome cutting long speech off).
    for (const part of String(text).match(/(?:[^.!?—]|\.(?=\d))+[.!?—]*/g) || [text]) { // "62.5" stays whole
      if (!part.trim()) continue;
      const u = new SpeechSynthesisUtterance(part.replace(/—$/, ',').trim());
      if (voice) u.voice = voice;
      u.rate = rate * jitter(); u.pitch = pitch * jitter(); u.volume = 1;
      u.onerror = e => { if (voice && e.error === 'network') { failed.add(voice.name); pickVoice(); } };
      speechSynthesis.speak(u);
    }
  }
  /* Use the first name now and then, like a coach would — not every line. */
  const nameTag = (p = 0.35) => { const n = (P()?.name || '').split(' ')[0]; return n && Math.random() < p ? `, ${n}` : ''; };
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

  /* ---------- breathing guide: quiet, airy "in" and "out" sounds synthesised on the fly (no audio files) ---------- */
  const BREATH_VOL = { soft: 0.05, medium: 0.1 };
  let noise = null, breathNodes = [];
  function breath(kind, dur, at = 0) {
    const vol = BREATH_VOL[cfg().breath]; if (!vol) return;
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const a = actx, t0 = a.currentTime + at, t1 = t0 + dur, inh = kind === 'in';
      if (!noise) { noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      // Air: an inhale brightens and swells, an exhale starts full and softens away — like hearing someone breathe.
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(inh ? 500 : 1400, t0); f.frequency.exponentialRampToValueAtTime(inh ? 1600 : 350, t1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, inh ? t0 + dur * 0.8 : t0 + Math.min(0.25, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t1);
      // A faint tone underneath rises on "in" and falls on "out", so the direction is clear in earbuds.
      const tone = a.createOscillator(), tg = a.createGain();
      tone.type = 'sine'; tone.frequency.setValueAtTime(inh ? 330 : 440, t0); tone.frequency.exponentialRampToValueAtTime(inh ? 440 : 294, t1);
      tg.gain.setValueAtTime(0.0001, t0); tg.gain.exponentialRampToValueAtTime(vol * 0.35, t0 + dur * 0.5); tg.gain.exponentialRampToValueAtTime(0.0001, t1);
      src.connect(f); f.connect(g); g.connect(a.destination); tone.connect(tg); tg.connect(a.destination);
      src.start(t0); src.stop(t1 + 0.05); tone.start(t0); tone.stop(t1 + 0.05);
      breathNodes = breathNodes.slice(-6).concat(src, tone);
    } catch { /* audio unavailable */ }
  }
  function hush() { breathNodes.forEach(n => { try { n.stop(); } catch { } }); breathNodes = []; }
  /* One rep at the coach's tempo: breathe in while lowering, out on the effort.
     Pull movements (rows, curls, pulldowns) start with the effort, so the order flips. */
  const isPull = () => EX[curEx().id]?.force === 'pull';
  function repBreath() {
    const half = cfg().tempo / 2, pull = isPull();
    breath(pull ? 'out' : 'in', half * 0.9); breath(pull ? 'in' : 'out', half * 0.9, half);
  }

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
  function stopTimer() { clearInterval(timer); timer = null; hush(); }
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
    say(only != null ? pick([`Let's go${nameTag()}.`, `Alright${nameTag()}, let's do this.`])
      : `${pick(['Alright', "Let's go", 'Welcome back'])}${nameTag(0.6)}. ${s.name.split(' — ')[0]} day. ${s.exercises.length} exercises today.`, true);
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
        <small class="coach-plates" id="cPlates">${platesText(set.kg, ex)}</small>
      </div>
      <div class="coach-actions"><button class="primary block coach-go" data-c="go">▶ Start set</button>
      <button class="ghost block" data-c="skipex">${state.only != null ? 'Back to workout' : 'Skip exercise'}</button></div>`);
    say(first ? `${pick(['Up first', 'Up next', 'Next up'])}, ${ex?.name || 'the next exercise'}. ${setLabel()}. ${weightText(set.kg)}, ${lo} to ${hi} reps. ${pick(["Tap start when you're ready.", 'Ready when you are.'])}`
      : pick([`${setLabel()}. ${weightText(set.kg)}. Tap start when ready.`, `Okay, ${setLabel().toLowerCase()}. ${weightText(set.kg)}. Ready when you are.`]));
    const paintPlates = () => { document.getElementById('cPlates').textContent = platesText(document.getElementById('cKg').value, ex); };
    el().querySelectorAll('[data-kg]').forEach(b => b.onclick = () => { const i = document.getElementById('cKg'); i.value = Math.max(0, (+i.value || 0) + +b.dataset.kg); paintPlates(); });
    document.getElementById('cKg').oninput = paintPlates;
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
    say('Three', true, 'count'); beep(660);
    timer = setInterval(() => {
      n--;
      if (n > 0) { document.getElementById('cBig').textContent = n; say(n === 2 ? 'Two' : 'One', false, 'count'); beep(660); }
      else { stopTimer(); beep(1100, .25); say(pick(['Go!', 'Go!', "Let's go!", 'Lift!']), true, 'hype'); setPhase(); }
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
        ${c.breath !== 'off' ? `<div class="coach-sub coach-breath">${isPull() ? '🌬 Breathe out as you pull · in as you return' : '🌬 Breathe in as you lower · out as you push'}</div>` : ''}
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
    el().querySelector('[data-c="pause"]')?.addEventListener('click', e => { state.paused = !state.paused; e.target.textContent = state.paused ? '▶ Resume' : '⏸ Pause'; say(state.paused ? 'Paused' : 'Go', true); if (state.paused) hush(); else repBreath(); });
    el().querySelector('[data-c="done"]').onclick = () => logSet();
    if (c.autoCount) {
      let next = Date.now() + c.tempo * 1000;
      repBreath(); // breaths follow the same tempo as the count, one in/out pair per rep
      timer = setInterval(() => {
        if (state.paused) { next = Date.now() + c.tempo * 1000; return; }
        if (Date.now() >= next) { next += c.tempo * 1000; addRep(); if (state?.phase === 'set' && timer && state.reps < hi) repBreath(); }
      }, 100);
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
    if (rep >= hi) return `${rep}! ${pick(['Great set!', 'Yes! Great set!', 'Beautiful. Great set!', "That's how it's done!"])}`;
    if (rep === hi - 1) return `${rep}. ${pick(['Last one! Push, squeeze it!', 'Last one! Make it count!', 'One more! Drive it up!'])}`;
    if (rep === hi - 2 && hi - 2 >= lo) return `${rep}. ${pick(['Two more. Dig in!', "Two more. You've got this!", 'Two left. Stay tight!'])}`;
    if (prev && rep === prev + 1 && rep < hi) return `${rep}. ${pick(['That beats last time. Keep going!', 'New best for this set. Keep going!'])}`;
    if (rep === lo) return `${rep}. ${pick(['Target reached. Keep going if you can!', "That's your target. Anything more is a bonus!"])}`;
    if (cfg().encourage && rep === Math.ceil(lo / 2)) return `${rep}. ${pick(['Good pace.', 'Strong.', 'Control the weight.', 'Breathe.', 'Nice and smooth.', 'Looking good.'])}`;
    return String(rep);
  }
  function lastBest() {
    const prev = lastSetsFor(curEx().id, day);
    return prev ? Math.max(0, ...prev.filter(x => x.done).map(x => +x.reps || 0)) : 0;
  }
  function addRep() {
    if (state.phase !== 'set') return;
    state.reps++; paintReps(); beep(880, .05, .12);
    const cue = repCue(state.reps);
    say(cue, true, cue === String(state.reps) ? 'count' : state.reps >= state.range[1] - 2 ? 'hype' : 'normal');
    if (cfg().autoCount && state.reps >= state.range[1]) { stopTimer(); setTimeout(() => state?.phase === 'set' && logSet(), 1600); }
  }
  function logSet() {
    stopTimer(); state.phase = 'log';
    const set = curSet();
    say(state.reps >= state.range[1] ? pick(['Top of the range. Add weight next time. Rack it.', 'All the reps! Time to go heavier next session.', 'Every rep. Bump the weight next time.'])
      : state.reps >= state.range[0] ? pick([`Good set${nameTag()}. Rack it.`, 'Solid set. Rack it.', 'Nice and controlled. Rack it.'])
      : pick(['Set done. Rack it and breathe.', 'Good effort. Shake it out and breathe.', "That's okay. Take a breath, you've got the next one."]), false, 'calm');
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
      const pr = prMessage(curEx().id, set);
      toast(pr || `Saved: ${set.kg ? set.kg + ' kg × ' : ''}${set.reps} reps`);
      if (pr) { beep(1320, .18); say(pick(['New personal record! Great lift.', `That's a P R${nameTag(0.6)}! Huge lift.`, "New personal best! You're getting stronger."]), true, 'hype'); }
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
    // Paced recovery breathing: 4 s in, 6 s out (a longer exhale settles the heart rate). Starts after the
    // spoken "Rest…" line and stops before the ten-second warning so it never talks over the voice.
    const IN = 4000, CYCLE = 10000;
    let nextBreath = Date.now() + 3000, lastBreath = 0;
    state.phase = 'rest';
    const nextName = EX[nextEx.id]?.name || nextEx.id, nextKg = nextEx.sets[n.seti].kg;
    open(`${header('Rest', `Next: ${sameEx ? 'set ' + (n.seti + 1) : nextName}`)}
      <div class="coach-body">
        <div class="coach-ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="track"/><circle cx="100" cy="100" r="88" class="prog rest" id="cRing" style="stroke-dasharray:553;stroke-dashoffset:0"/></svg>
          <div class="coach-ring-in"><div class="coach-big huge" id="cBig">${fmt(total)}</div><small>rest</small></div></div>
        <div class="coach-sub coach-breath" id="cBreath"></div>
        <div class="coach-sub">Next: <b>${esc(sameEx ? `Set ${n.seti + 1} of ${nextEx.sets.length}` : nextName)}</b>${nextKg ? ` · ${nextKg} kg` : ''}</div>
        <div class="coach-sub" id="hrZone"></div>
      </div>
      <div class="coach-actions"><div class="row"><button style="flex:1" data-c="add">＋30 s</button><button class="primary" style="flex:2" data-c="skip">Skip rest ⏭</button></div></div>`);
    paintHR();
    say(`Rest ${total < 60 ? total + ' seconds' : total === 60 ? 'one minute' : +(total / 60).toFixed(1) + ' minutes'}. ${pick(['Breathe.', 'Slow, deep breaths.', 'Shake it out.', 'Grab a sip of water.', ''])}`, false, 'calm');
    el().querySelector('[data-c="add"]').onclick = () => { end += 30000; total += 30; say(pick(['Thirty more seconds.', 'Sure, thirty more.', 'Okay, take thirty more.']), true, 'calm'); };
    const go = () => { stopTimer(); Object.assign(state, n); ready(); };
    el().querySelector('[data-c="skip"]').onclick = go;
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const b = document.getElementById('cBig'), r = document.getElementById('cRing');
      if (b) b.textContent = fmt(left);
      if (r) r.style.strokeDashoffset = 553 * (1 - left / total);
      if (cfg().breath !== 'off') {
        if (Date.now() >= nextBreath && left > 20) { lastBreath = Date.now(); nextBreath = lastBreath + CYCLE; breath('in', IN / 1000 * 0.95); breath('out', (CYCLE - IN) / 1000 * 0.95, IN / 1000); }
        const t = Date.now() - lastBreath, bt = document.getElementById('cBreath');
        if (bt) bt.textContent = !lastBreath || t >= CYCLE ? '' : t < IN ? `🌬 Breathe in… ${Math.ceil((IN - t) / 1000)}` : `Breathe out… ${Math.ceil((CYCLE - t) / 1000)}`;
      }
      const once = (k, fn) => { if (!spoken.has(k)) { spoken.add(k); fn(); } };
      if (left === 30 && total > 45) once(30, () => say(pick(['Thirty seconds.', 'Thirty seconds left.']), false, 'calm'));
      if (left === 10) once(10, () => {
        if (hr.value && hr.value > recover && !extended) { extended = true; end += 15000; total += 15; say(`Heart rate's still ${hr.value}. Take fifteen more seconds.`, false, 'calm'); spoken.delete(10); return; }
        say(`${pick(['Ten seconds.', 'Ten seconds left.', 'Ten seconds. Get set.'])} ${pick(['Next', 'Up next', 'Coming up'])}, ${sameEx ? 'set ' + (n.seti + 1) : nextName}${nextKg ? ', ' + nextKg + ' kilos' : ''}.`);
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
    say(nextIdx < 0 ? `Workout complete! ${pick(['Great work', 'Proud of you', 'Brilliant session'])}${nameTag(0.6)}.` : `${EX[e.id]?.name || 'Exercise'} done. ${pick(['Nice work.', 'Well done.', 'Good job.'])}`, true, 'hype');
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
    say(`Workout complete! ${sets} sets, ${Math.round(vol).toLocaleString()} kilos total volume. ${pick(['Great work', 'Brilliant session', 'Proud of you'])}${nameTag(0.6)}. Now log your protein and water.`, true, 'hype');
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
        ...Array.from({ length: 8 }, (_, i) => [{ t: 30, n: `Sprint ${i + 1} of 8`, hard: true, cue: pick(['Go hard! Thirty seconds!', 'Push! All out!', 'Go go go!']) }, { t: 90, n: 'Recover', cue: pick(['Easy now. Recover.', 'Nice. Slow it right down.', 'Recover. Get your breath back.']) }]).flat(),
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
    if (i !== state.seg) { state.seg = i; beep(seg.hard ? 1200 : 700, .25); say(seg.cue, true, seg.hard ? 'hype' : 'calm'); }
    const nxt = state.segs[i + 1];
    if (nxt?.hard && segLeft <= 3 && segLeft > 0 && !state.spoken.has(i + ':' + segLeft)) { state.spoken.add(i + ':' + segLeft); beep(660); if (segLeft === 3) say(pick(['Get ready.', 'Here it comes.']), false, 'count'); }
    if (seg.hard && segLeft === 10 && !state.spoken.has(i + ':10')) { state.spoken.add(i + ':10'); say(pick(['Ten seconds! Push!', 'Ten more seconds! Empty the tank!']), false, 'hype'); }
    if (!state.intervals) {
      const m = Math.floor(el2 / 60);
      if (m > 0 && m % 5 === 0 && !state.spoken.has('m' + m)) { state.spoken.add('m' + m); say(`${m} minutes done. ${Math.round((state.total - el2) / 60)} to go.${m * 60 >= state.total / 2 && m * 60 - 300 < state.total / 2 ? ' Halfway!' : ''}`); }
      if (hr.value && Date.now() - state.lastHrCue > 60000) {
        const pct = hr.value / hrMax();
        if (pct > .72) { state.lastHrCue = Date.now(); say(`Heart rate ${hr.value}. ${pick(['Ease off a little.', "Let's bring it down a touch.", 'Slow it down slightly.'])}`, false, 'calm'); }
        else if (pct < .58 && el2 > 300) { state.lastHrCue = Date.now(); say(`Heart rate ${hr.value}. ${pick(['Pick up the pace a bit.', 'You can push a little harder.', 'Bit more effort.'])}`); }
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
    say(`Cardio complete. ${mins} minutes. ${pick(['Nice work', 'Well done', 'Great effort'])}${nameTag(0.6)}!`, true, 'hype');
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
      ${(() => { const vs = rankedVoices(); return vs.length ? `<label>Coach voice<select id="csVoiceName"><option value="">Auto — most natural (${esc(shortName(vs[0]))})</option>${vs.map(v => `<option value="${esc(v.name)}" ${c.voiceName === v.name ? 'selected' : ''}>${esc(shortName(v))}${/natural|neural|premium|enhanced|siri/i.test(v.name) ? ' ★' : ''}</option>`).join('')}</select></label>
        <small class="muted" style="margin-top:-6px">★ = natural-sounding voice. On iPhone, add more under Settings → Accessibility → Spoken Content → Voices (pick an "Enhanced" or "Premium" one).</small>` : ''; })()}
      <label class="check"><input type="checkbox" id="csAuto" ${c.autoCount ? 'checked' : ''}>Count reps for me (tempo)</label>
      <label>Seconds per rep<select id="csTempo">${[2, 3, 4, 5].map(t => `<option ${c.tempo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Rest between sets<select id="csRest">${[['auto', 'Auto (by exercise & phase)'], ['60', '60 s'], ['90', '90 s'], ['120', '2 min'], ['180', '3 min']].map(([v, l]) => `<option value="${v}" ${String(c.rest) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Breathing guide<div class="row"><select id="csBreath" style="flex:1">${[['soft', 'Soft (quiet whoosh)'], ['medium', 'Medium'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${c.breath === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button id="csBreathTest" style="flex:none">▶ Hear</button></div></label>
      <small class="muted" style="margin-top:-6px">A gentle rising sound = breathe in, falling = breathe out. Synced to each rep, and slow 4 s in / 6 s out breathing while you rest.</small>
      <label class="check"><input type="checkbox" id="csEnc" ${c.encourage ? 'checked' : ''}>Extra encouragement</label>
      <button id="csTest">🔊 Test voice</button>
      <div class="card" style="background:var(--card2)"><b>⌚ Heart rate</b><p class="muted" style="font-size:13px;margin:6px 0">${hrSupported()
        ? `Works with watches & straps that broadcast heart rate over Bluetooth (Polar, Garmin "Broadcast HR", Coros, Wahoo, many Amazfit). Your max HR ≈ ${hrMax()} bpm.`
        : 'Bluetooth heart rate needs Chrome on Android (not available on iPhone or this browser). The voice coach still works.'}</p>
        ${hrSupported() ? `<button class="block" id="csHr">${hr.device ? `Disconnect ${esc(hr.device.name || 'device')}` : 'Connect heart-rate device'}</button>` : ''}</div>
      <button class="primary block" id="csSave">Save</button></div>`);
    const vn = $('#csVoiceName'), useChosen = () => { if (vn) { S.coach.voiceName = vn.value; pickVoice(); } };
    $('#csTest').onclick = () => {
      const v = cfg().voice; S.coach.voice = true; useChosen();
      say(`Eight. ${pick(['Two more. Dig in!', "Two more. You've got this!"])}`, true, 'hype'); say('Last one! Make it count!', false, 'hype');
      say(`Great set${nameTag(1)}. Rest ninety seconds. Slow, deep breaths.`, false, 'calm');
      S.coach.voice = v;
    };
    if (vn) vn.onchange = () => $('#csTest').click();
    const preview = () => { const b = cfg().breath; S.coach.breath = $('#csBreath').value === 'off' ? 'soft' : $('#csBreath').value; hush(); breath('in', 3.8); breath('out', 5.7, 4); S.coach.breath = b; };
    $('#csBreathTest').onclick = e => { e.preventDefault(); preview(); };
    $('#csBreath').onchange = () => { if ($('#csBreath').value !== 'off') preview(); };
    const hb = $('#csHr'); if (hb) hb.onclick = async () => { if (hr.device) disconnectHR(); else await connectHR(); settings(); };
    $('#csSave').onclick = () => {
      useChosen();
      Object.assign(S.coach, { voice: $('#csVoice').checked, autoCount: $('#csAuto').checked, tempo: +$('#csTempo').value, rest: $('#csRest').value, breath: $('#csBreath').value, encourage: $('#csEnc').checked });
      save(); closeModal(); toast('Coach settings saved');
    };
  }

  window.Coach = {
    start() { const sd = scheduledDay(day); if (sd.cardio) startCardio(); else startStrength(); },
    startExercise: i => startStrength(i),
    startCardio, settings, connectHR, hr, hrSupported, hrMax, active: () => !!state,
  };
})();
