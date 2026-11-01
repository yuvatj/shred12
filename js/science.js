/* Evidence-based calculations, the 12-week program and the supplement guide.
   Every number here traces back to a reference in REFS. */

window.REFS = {
  mifflin: { t: 'Mifflin et al. 1990 — A new predictive equation for resting energy expenditure. Am J Clin Nutr', u: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
  helms: { t: 'Helms et al. 2014 — Protein for lean tissue retention during caloric restriction (2.3–3.1 g/kg FFM). IJSNEM', u: 'https://pubmed.ncbi.nlm.nih.gov/24092765/' },
  issnProtein: { t: 'Jäger et al. 2017 — ISSN Position Stand: Protein and exercise', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5477153/' },
  issnTiming: { t: 'Kerksick et al. 2017 — ISSN Position Stand: Nutrient timing (0.25–0.4 g/kg protein every 3–4 h)', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5596471/' },
  garthe: { t: 'Garthe et al. 2011 — Slow (~0.7%/wk) vs fast weight loss: slow rate increased lean mass. IJSNEM', u: 'https://pubmed.ncbi.nlm.nih.gov/21558571/' },
  issnCreatine: { t: 'Kreider et al. 2017 — ISSN Position Stand: Safety and efficacy of creatine', u: 'https://pubmed.ncbi.nlm.nih.gov/28615996/' },
  issnCaffeine: { t: 'Guest et al. 2021 — ISSN Position Stand: Caffeine and exercise performance (3–6 mg/kg)', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7777221/' },
  betaAlanine: { t: 'Trexler et al. 2015 — ISSN Position Stand: Beta-alanine', u: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4501114/' },
  volume: { t: 'Schoenfeld et al. 2017 — Dose-response of weekly sets and muscle growth (≥10 sets/muscle/week)', u: 'https://pubmed.ncbi.nlm.nih.gov/27433992/' },
  sleep: { t: 'Nedeltcheva et al. 2010 — Insufficient sleep undermines dietary efforts to reduce adiposity', u: 'https://pubmed.ncbi.nlm.nih.gov/20921542/' },
  vitD: { t: 'NIH Office of Dietary Supplements — Vitamin D fact sheet', u: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
  omega3: { t: 'NIH Office of Dietary Supplements — Omega-3 fatty acids fact sheet', u: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/' },
  fdaCaffeine: { t: 'U.S. FDA — How much caffeine is too much? (≤400 mg/day for healthy adults)', u: 'https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much' },
  efsaWater: { t: 'EFSA 2010 — Dietary reference values for water (2.0 L/day women, 2.5 L/day men, total)', u: 'https://www.efsa.europa.eu/en/efsajournal/pub/1459' },
  exdb: { t: 'free-exercise-db (yuhonas) — 870+ exercises, public domain (Unlicense)', u: 'https://github.com/yuhonas/free-exercise-db' },
  off: { t: 'Open Food Facts — open food products database (ODbL)', u: 'https://world.openfoodfacts.org/' },
};

window.Sci = {
  ACTIVITY: [
    { v: 1.2, l: 'Sedentary (desk job, little exercise)' },
    { v: 1.375, l: 'Light (1–3 workouts/week)' },
    { v: 1.55, l: 'Moderate (3–5 workouts/week)' },
    { v: 1.725, l: 'Very active (6–7 workouts/week)' },
    { v: 1.9, l: 'Athlete / physical job + training' },
  ],

  bmi(kg, cm) { const m = cm / 100; return kg / (m * m); },
  bmiCategory(b, asian) {
    const cuts = asian ? [18.5, 23, 27.5] : [18.5, 25, 30];
    if (b < cuts[0]) return { l: 'Underweight', c: 'warn' };
    if (b < cuts[1]) return { l: 'Healthy', c: 'good' };
    if (b < cuts[2]) return { l: 'Overweight', c: 'warn' };
    return { l: 'Obese', c: 'bad' };
  },

  // U.S. Navy circumference method (Hodgdon & Beckett 1984), all values in cm.
  navyBodyFat(sex, cm, neck, waist, hip) {
    if (!cm || !neck || !waist) return null;
    if (sex === 'male') {
      if (waist - neck <= 0) return null;
      return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(cm)) - 450;
    }
    if (!hip || waist + hip - neck <= 0) return null;
    return 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(cm)) - 450;
  },
  bfCategory(sex, bf) {
    const t = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
    if (bf < t[0]) return { l: 'Essential', c: 'warn' };
    if (bf < t[1]) return { l: 'Athletic', c: 'good' };
    if (bf < t[2]) return { l: 'Fit', c: 'good' };
    if (bf < t[3]) return { l: 'Average', c: 'warn' };
    return { l: 'High', c: 'bad' };
  },

  bmr(p, kg, bf) {
    // Katch-McArdle when body fat is known (uses lean mass), otherwise Mifflin-St Jeor.
    if (bf) return 370 + 21.6 * kg * (1 - bf / 100);
    return 10 * kg + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  },

  /* Builds the full nutrition target set for the current weight & body fat. */
  targets(p, kg, bf) {
    const bmr = this.bmr(p, kg, bf);
    const tdee = bmr * p.activity;
    const lbm = bf ? kg * (1 - bf / 100) : kg * (p.sex === 'male' ? 0.8 : 0.7);
    // Weekly loss rate as % body weight; ~7700 kcal per kg of tissue lost.
    let deficit = (kg * (p.rate / 100) * 7700) / 7;
    deficit = Math.min(deficit, tdee * 0.25); // cap at 25% below maintenance
    const floor = Math.max(bmr * 1.0, p.sex === 'male' ? 1500 : 1200);
    const kcal = Math.round(Math.max(tdee - deficit, floor) / 10) * 10;
    // Protein: 2.6 g/kg lean mass (mid of Helms 2.3–3.1), never below 1.6 g/kg body weight.
    const protein = Math.round(Math.max(2.6 * lbm, 1.6 * kg));
    // Fat: 25% of calories, minimum 0.6 g/kg for hormonal health.
    const fat = Math.round(Math.max((kcal * 0.25) / 9, 0.6 * kg));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const fiber = Math.round((kcal / 1000) * 14);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, deficit: Math.round(tdee - kcal), protein, fat, carbs, fiber, lbm, perMealProtein: Math.round(0.4 * kg) };
  },

  waterTarget(kg, trainingDay) {
    return Math.round((kg * 35 + (trainingDay ? 500 : 0)) / 50) * 50;
  },

  /* 12-week projection. Assumes ~85% of loss comes from fat with resistance training and high protein. */
  projection(p, startKg, startBf, weeks = 12) {
    const out = [];
    let kg = startKg, fatKg = startKg * (startBf || 25) / 100;
    for (let w = 0; w <= weeks; w++) {
      out.push({ week: w, kg: +kg.toFixed(1), bf: +((fatKg / kg) * 100).toFixed(1) });
      // Week 12 is a deload/maintenance-ish week; slower loss.
      const rate = (w === 11 ? p.rate * 0.5 : p.rate) / 100;
      const loss = kg * rate;
      kg -= loss;
      fatKg -= loss * 0.85;
    }
    return out;
  },

  e1rm(kg, reps) { return reps > 0 ? kg * (1 + reps / 30) : 0; }, // Epley

  /* Weekly check-in rule: compare average weight of the last 7 days with the 7 before. */
  checkIn(weights, p) {
    if (weights.length < 8) return { msg: 'Log your weight daily for 2 weeks to unlock automatic calorie adjustments.', adj: 0 };
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted.slice(-7), prev = sorted.slice(-14, -7);
    if (prev.length < 3) return { msg: 'Need one more week of weigh-ins for a trend comparison.', adj: 0 };
    const avg = a => a.reduce((s, x) => s + x.kg, 0) / a.length;
    const a1 = avg(last), a0 = avg(prev);
    const pct = ((a0 - a1) / a0) * 100;
    let adj = 0, msg;
    if (pct < p.rate * 0.5) { adj = -150; msg = `Weekly loss ${pct.toFixed(2)}% is below target ${p.rate}%. Cut ~150 kcal (from carbs/fat) or add 2,000 daily steps.`; }
    else if (pct > p.rate * 1.6) { adj = 150; msg = `Losing ${pct.toFixed(2)}%/week — faster than ${p.rate}%. Add ~150 kcal (carbs) to protect lean mass and training.`; }
    else msg = `On track: ${pct.toFixed(2)}% loss this week (target ${p.rate}%). Keep calories the same.`;
    return { msg, adj, pct, a0, a1 };
  },
};

/* 12-week program. Phases follow a linear-to-undulating progression; volume ≥10 hard sets/muscle/week. */
window.PROGRAM = {
  phases: [
    { name: 'Foundation', weeks: [1, 2, 3, 4], sets: 3, reps: '10–15', rpe: '7', note: 'Learn technique, build work capacity. Leave 3 reps in reserve. Steps: 8,000/day.' },
    { name: 'Build', weeks: [5, 6, 7, 8], sets: 4, reps: '8–12', rpe: '8', note: 'Add load when you hit the top of the rep range on every set. Steps: 9,000/day.' },
    { name: 'Intensify', weeks: [9, 10, 11], sets: 4, reps: '6–10', rpe: '8–9', note: 'Heavier compounds keep the strength signal high so muscle is retained while lean. Steps: 10,000/day.' },
    { name: 'Deload & Test', weeks: [12], sets: 2, reps: '8–10', rpe: '6', note: 'Halve the volume, re-measure and photograph. Plan the next block.' },
  ],
  splits: {
    ppl: {
      name: 'Push · Pull · Legs + Cardio (5 days)',
      days: [
        { key: 'P1', focus: 'push', name: 'Push — Chest, Shoulders, Triceps', dow: 1, ex: ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Dumbbell_Shoulder_Press', 'Cable_Crossover', 'Side_Lateral_Raise', 'Triceps_Pushdown_-_Rope_Attachment'] },
        { key: 'PL1', focus: 'pull', name: 'Pull — Back, Rear Delts, Biceps', dow: 2, ex: ['Pullups', 'Bent_Over_Barbell_Row', 'Seated_Cable_Rows', 'Face_Pull', 'Barbell_Curl', 'Hammer_Curls'] },
        { key: 'LG1', focus: 'legs', name: 'Legs — Quads, Hamstrings, Calves', dow: 3, ex: ['Barbell_Squat', 'Romanian_Deadlift', 'Leg_Press', 'Seated_Leg_Curl', 'Standing_Calf_Raises', 'Hanging_Leg_Raise'] },
        { key: 'C1', focus: 'cardio', name: 'Zone-2 Cardio 40 min', dow: 4, cardio: true, ex: ['Walking_Treadmill', 'Bicycling_Stationary', 'Elliptical_Trainer'] },
        { key: 'UP', focus: 'upper', name: 'Upper — Push + Pull', dow: 5, ex: ['Dumbbell_Bench_Press', 'One-Arm_Dumbbell_Row', 'Machine_Shoulder_Military_Press', 'Wide-Grip_Lat_Pulldown', 'Cable_Seated_Lateral_Raise', 'Reverse_Machine_Flyes'] },
        { key: 'LG2', focus: 'legs', name: 'Legs — Glutes & Core', dow: 6, ex: ['Barbell_Hip_Thrust', 'Hack_Squat', 'Split_Squat_with_Dumbbells', 'Lying_Leg_Curls', 'Seated_Calf_Raise', 'Cable_Crunch'] },
        { key: 'R', focus: 'rest', name: 'Rest + 10k steps', dow: 0, rest: true, ex: [] },
      ],
    },
    upper_lower: {
      name: '4-Day Upper / Lower + 2 Cardio',
      days: [
        { key: 'U1', focus: 'upper', name: 'Upper A (Strength)', dow: 1, ex: ['Barbell_Bench_Press_-_Medium_Grip', 'Bent_Over_Barbell_Row', 'Dumbbell_Shoulder_Press', 'Wide-Grip_Lat_Pulldown', 'Dumbbell_Bicep_Curl', 'Triceps_Pushdown'] },
        { key: 'L1', focus: 'legs', name: 'Lower A (Squat)', dow: 2, ex: ['Barbell_Squat', 'Romanian_Deadlift', 'Leg_Press', 'Lying_Leg_Curls', 'Standing_Calf_Raises', 'Plank'] },
        { key: 'C1', focus: 'cardio', name: 'Zone-2 Cardio 40 min', dow: 3, cardio: true, ex: ['Walking_Treadmill', 'Bicycling_Stationary'] },
        { key: 'U2', focus: 'upper', name: 'Upper B (Hypertrophy)', dow: 4, ex: ['Incline_Dumbbell_Press', 'Seated_Cable_Rows', 'Pullups', 'Side_Lateral_Raise', 'Face_Pull', 'Hammer_Curls', 'Dips_-_Triceps_Version'] },
        { key: 'L2', focus: 'legs', name: 'Lower B (Hinge)', dow: 5, ex: ['Barbell_Deadlift', 'Barbell_Hip_Thrust', 'Dumbbell_Lunges', 'Leg_Extensions', 'Seated_Calf_Raise', 'Hanging_Leg_Raise'] },
        { key: 'C2', focus: 'cardio', name: 'Intervals / Conditioning 25 min', dow: 6, cardio: true, ex: ['Rowing_Stationary', 'Mountain_Climbers', 'Rope_Jumping'] },
        { key: 'R', focus: 'rest', name: 'Rest + 10k steps', dow: 0, rest: true, ex: [] },
      ],
    },
    full_body: {
      name: '3-Day Full Body + 2 Cardio (beginner)',
      days: [
        { key: 'F1', focus: 'full', name: 'Full Body A', dow: 1, ex: ['Goblet_Squat', 'Dumbbell_Bench_Press', 'One-Arm_Dumbbell_Row', 'Romanian_Deadlift', 'Plank'] },
        { key: 'C1', focus: 'cardio', name: 'Zone-2 Cardio 35 min', dow: 2, cardio: true, ex: ['Walking_Treadmill', 'Elliptical_Trainer'] },
        { key: 'F2', focus: 'full', name: 'Full Body B', dow: 3, ex: ['Leg_Press', 'Pushups', 'Wide-Grip_Lat_Pulldown', 'Barbell_Glute_Bridge', 'Side_Lateral_Raise', 'Cable_Crunch'] },
        { key: 'C2', focus: 'cardio', name: 'Zone-2 Cardio 35 min', dow: 4, cardio: true, ex: ['Bicycling_Stationary', 'Stairmaster'] },
        { key: 'F3', focus: 'full', name: 'Full Body C', dow: 5, ex: ['Dumbbell_Lunges', 'Incline_Dumbbell_Press', 'Seated_Cable_Rows', 'Lying_Leg_Curls', 'Dumbbell_Bicep_Curl', 'Triceps_Pushdown'] },
        { key: 'R1', focus: 'rest', name: 'Active rest — long walk', dow: 6, rest: true, ex: [] },
        { key: 'R2', focus: 'rest', name: 'Rest + 8k steps', dow: 0, rest: true, ex: [] },
      ],
    },
  },
  phaseFor(week) { return this.phases.find(ph => ph.weeks.includes(week)) || this.phases[0]; },
};

/* Supplements, ranked by strength of evidence. Tier A = strong, B = situational, C = skip. */
window.SUPPS = [
  { id: 'creatine', tier: 'A', name: 'Creatine monohydrate', dose: '3–5 g/day, any time, every day (no loading needed)',
    why: 'Most researched sports supplement. Increases muscle creatine stores in ~3–4 weeks, improves strength and repeat-effort performance, helps keep training quality high in a deficit. Expect +0.5–1.5 kg water weight in muscle — this is not fat; judge progress by waist & body fat.',
    ref: 'issnCreatine' },
  { id: 'protein', tier: 'A', name: 'Whey / plant protein powder', dose: '20–40 g as needed to reach your daily protein target',
    why: 'Not magic — it is food. Its value is convenience: hitting 2.3–3.1 g/kg lean mass is the #1 nutritional lever for keeping muscle while cutting.',
    ref: 'issnProtein' },
  { id: 'caffeine', tier: 'A', name: 'Caffeine', dose: '3–6 mg/kg ~45 min pre-workout; total ≤400 mg/day; none within 8 h of bed',
    why: 'Improves endurance, power output and perceived effort; mildly blunts appetite. Protect sleep — short sleep shifts weight loss away from fat toward lean mass.',
    ref: 'issnCaffeine' },
  { id: 'vitd', tier: 'B', name: 'Vitamin D3', dose: '1,000–2,000 IU/day with a meal (test blood 25(OH)D first if possible)',
    why: 'Deficiency is very common with indoor lifestyles and darker skin; correcting it supports bone, muscle and immune function. No fat-loss effect if you are already sufficient.',
    ref: 'vitD' },
  { id: 'omega3', tier: 'B', name: 'Omega-3 (fish oil / algae)', dose: '1–2 g EPA+DHA/day if you eat <2 portions oily fish per week',
    why: 'Cardiovascular and general health. Effects on body composition are small/inconsistent — take it for health, not fat loss.',
    ref: 'omega3' },
  { id: 'fiber', tier: 'B', name: 'Psyllium husk (fiber)', dose: '5–10 g/day with a large glass of water',
    why: 'Helps reach the 14 g fiber / 1,000 kcal target, improves fullness and digestion while dieting.',
    ref: null },
  { id: 'betaalanine', tier: 'B', name: 'Beta-alanine', dose: '3.2–6.4 g/day split into doses (tingling is harmless)',
    why: 'Improves performance in 1–4 min high-intensity efforts (intervals, high-rep sets). Optional — useful for conditioning days.',
    ref: 'betaAlanine' },
  { id: 'fatburners', tier: 'C', name: 'Skip: "fat burners", CLA, garcinia, raspberry ketones, L-carnitine, apple-cider-vinegar pills',
    dose: '—', why: 'No meaningful fat loss in controlled trials beyond caffeine content; some (green tea extract at high doses) are linked to liver injury. Spend the money on food quality.', ref: null },
  { id: 'bcaa', tier: 'C', name: 'Skip: BCAAs / EAAs', dose: '—',
    why: 'Redundant when total protein intake is adequate — whole protein already contains them.', ref: 'issnProtein' },
];

window.HABITS = [
  { t: 'Sleep 7–9 h', d: 'In a trial, sleeping 5.5 h vs 8.5 h on the same diet cut the share of weight lost as fat by ~55%.', ref: 'sleep' },
  { t: 'Lose 0.5–1% bodyweight per week', d: 'Slower cuts (~0.7%/week) preserved and even increased lean mass vs faster cuts.', ref: 'garthe' },
  { t: 'Protein every 3–4 h', d: '0.25–0.4 g/kg per meal across 4 meals maximizes muscle protein synthesis.', ref: 'issnTiming' },
  { t: '≥10 hard sets / muscle / week', d: 'Higher weekly volume is associated with more muscle; keep it in a deficit to signal "keep this muscle".', ref: 'volume' },
  { t: 'Daily steps 8–10k', d: 'Non-exercise activity is the largest adjustable part of energy expenditure and tends to drop when dieting — track it.', ref: null },
];
