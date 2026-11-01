/* Training structure: day focus (Push / Pull / Legs / Cardio …) and movement patterns.
   Each pattern lists exercises that train the same muscles, ranked best → last:
   heavier-loadable, stable compound options first, then machines/cables, then bodyweight.
   When a machine is busy, take the next one down the list. */

window.FOCUS = {
  push:   { label: 'Push',      emoji: '💪', color: '#f472b6', muscles: 'Chest · Shoulders · Triceps', group: 'push' },
  pull:   { label: 'Pull',      emoji: '🧗', color: '#60a5fa', muscles: 'Back · Rear delts · Biceps', group: 'pull' },
  legs:   { label: 'Legs',      emoji: '🦵', color: '#22d3a6', muscles: 'Quads · Hamstrings · Glutes · Calves', group: 'legs' },
  upper:  { label: 'Upper',     emoji: '🏋', color: '#a78bfa', muscles: 'Push + Pull', group: 'push' },
  full:   { label: 'Full body', emoji: '⚡', color: '#fbbf24', muscles: 'Push + Pull + Legs', group: 'legs' },
  cardio: { label: 'Cardio',    emoji: '🏃', color: '#fb923c', muscles: 'Heart · Fat burn', group: 'cardio' },
  rest:   { label: 'Rest',      emoji: '🛌', color: '#8b97ad', muscles: 'Recover · 8–10k steps', group: 'push' },
};

window.MOVES = {
  push: [
    { key: 'chest_press', name: 'Chest press', muscles: 'Chest · front delts · triceps',
      ids: ['Barbell_Bench_Press_-_Medium_Grip', 'Dumbbell_Bench_Press', 'Smith_Machine_Bench_Press', 'Leverage_Chest_Press', 'Machine_Bench_Press', 'Dips_-_Chest_Version', 'Push-Ups_With_Feet_Elevated', 'Pushups'] },
    { key: 'incline_press', name: 'Incline press', muscles: 'Upper chest · front delts',
      ids: ['Incline_Dumbbell_Press', 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'Smith_Machine_Incline_Bench_Press', 'Leverage_Incline_Chest_Press', 'Decline_Push-Up', 'Incline_Push-Up'] },
    { key: 'chest_fly', name: 'Chest fly', muscles: 'Chest (isolation)',
      ids: ['Cable_Crossover', 'Butterfly', 'Dumbbell_Flyes', 'Incline_Dumbbell_Flyes', 'Low_Cable_Crossover', 'Flat_Bench_Cable_Flyes'] },
    { key: 'ohp', name: 'Overhead press', muscles: 'Front & side delts · triceps',
      ids: ['Dumbbell_Shoulder_Press', 'Standing_Military_Press', 'Seated_Barbell_Military_Press', 'Machine_Shoulder_Military_Press', 'Smith_Machine_Overhead_Shoulder_Press', 'Arnold_Dumbbell_Press', 'Barbell_Shoulder_Press', 'Handstand_Push-Ups'] },
    { key: 'lateral', name: 'Lateral raise', muscles: 'Side delts (shoulder width)',
      ids: ['Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise', 'One-Arm_Side_Laterals', 'Seated_Side_Lateral_Raise', 'Upright_Cable_Row', 'Upright_Barbell_Row', 'Lateral_Raise_-_With_Bands'] },
    { key: 'triceps', name: 'Triceps', muscles: 'Triceps',
      ids: ['Triceps_Pushdown_-_Rope_Attachment', 'Triceps_Pushdown', 'Cable_Rope_Overhead_Triceps_Extension', 'EZ-Bar_Skullcrusher', 'Close-Grip_Barbell_Bench_Press', 'Dips_-_Triceps_Version', 'Standing_Dumbbell_Triceps_Extension', 'Tricep_Dumbbell_Kickback', 'Bench_Dips'] },
  ],
  pull: [
    { key: 'vpull', name: 'Vertical pull', muscles: 'Lats · biceps',
      ids: ['Pullups', 'Wide-Grip_Lat_Pulldown', 'Chin-Up', 'Close-Grip_Front_Lat_Pulldown', 'V-Bar_Pulldown', 'Underhand_Cable_Pulldowns', 'Full_Range-Of-Motion_Lat_Pulldown', 'Band_Assisted_Pull-Up', 'Straight-Arm_Pulldown'] },
    { key: 'row', name: 'Row', muscles: 'Mid back · lats · rear delts',
      ids: ['Bent_Over_Barbell_Row', 'Seated_Cable_Rows', 'One-Arm_Dumbbell_Row', 'T-Bar_Row_with_Handle', 'Leverage_High_Row', 'Dumbbell_Incline_Row', 'Bent_Over_Two-Dumbbell_Row', 'Seated_One-arm_Cable_Pulley_Rows', 'Lying_T-Bar_Row', 'Inverted_Row'] },
    { key: 'rear_delt', name: 'Rear delts', muscles: 'Rear delts · upper back (posture)',
      ids: ['Face_Pull', 'Reverse_Machine_Flyes', 'Cable_Rear_Delt_Fly', 'Reverse_Flyes', 'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench'] },
    { key: 'biceps', name: 'Biceps curl', muscles: 'Biceps · forearms',
      ids: ['Barbell_Curl', 'Dumbbell_Bicep_Curl', 'Incline_Dumbbell_Curl', 'EZ-Bar_Curl', 'Preacher_Curl', 'Standing_Biceps_Cable_Curl', 'Hammer_Curls', 'Machine_Bicep_Curl', 'Concentration_Curls'] },
    { key: 'traps', name: 'Shrugs', muscles: 'Upper traps',
      ids: ['Barbell_Shrug', 'Dumbbell_Shrug'] },
  ],
  legs: [
    { key: 'squat', name: 'Squat pattern', muscles: 'Quads · glutes',
      ids: ['Barbell_Squat', 'Leg_Press', 'Hack_Squat', 'Front_Barbell_Squat', 'Smith_Machine_Squat', 'Goblet_Squat', 'Bodyweight_Squat'] },
    { key: 'single_leg', name: 'Lunge / split squat', muscles: 'Quads · glutes (one leg at a time)',
      ids: ['Split_Squat_with_Dumbbells', 'Dumbbell_Lunges', 'Barbell_Walking_Lunge', 'Barbell_Lunge', 'Dumbbell_Step_Ups', 'Bodyweight_Walking_Lunge'] },
    { key: 'hinge', name: 'Hip hinge', muscles: 'Hamstrings · glutes · lower back',
      ids: ['Romanian_Deadlift', 'Barbell_Deadlift', 'Trap_Bar_Deadlift', 'Stiff-Legged_Dumbbell_Deadlift', 'Sumo_Deadlift', 'Good_Morning', 'Kettlebell_One-Legged_Deadlift', 'Hyperextensions_Back_Extensions'] },
    { key: 'leg_curl', name: 'Leg curl', muscles: 'Hamstrings (isolation)',
      ids: ['Seated_Leg_Curl', 'Lying_Leg_Curls', 'Standing_Leg_Curl', 'Natural_Glute_Ham_Raise', 'Ball_Leg_Curl'] },
    { key: 'leg_ext', name: 'Leg extension', muscles: 'Quads (isolation)',
      ids: ['Leg_Extensions', 'Single-Leg_Leg_Extension'] },
    { key: 'glutes', name: 'Glutes', muscles: 'Glutes',
      ids: ['Barbell_Hip_Thrust', 'Barbell_Glute_Bridge', 'One-Legged_Cable_Kickback', 'Glute_Kickback', 'Thigh_Abductor', 'Single_Leg_Glute_Bridge', 'Butt_Lift_Bridge'] },
    { key: 'calves', name: 'Calves', muscles: 'Calves',
      ids: ['Standing_Calf_Raises', 'Calf_Press_On_The_Leg_Press_Machine', 'Smith_Machine_Calf_Raise', 'Seated_Calf_Raise', 'Standing_Dumbbell_Calf_Raise', 'Calf_Raise_On_A_Dumbbell'] },
  ],
  core: [
    { key: 'core_flex', name: 'Abs (flexion)', muscles: 'Rectus abdominis',
      ids: ['Hanging_Leg_Raise', 'Cable_Crunch', 'Ab_Roller', 'Knee_Hip_Raise_On_Parallel_Bars', 'Air_Bike', 'Crunches'] },
    { key: 'core_stab', name: 'Core stability', muscles: 'Deep core · obliques',
      ids: ['Plank', 'Pallof_Press', 'Dead_Bug', 'Side_Bridge', 'Russian_Twist', 'Mountain_Climbers'] },
  ],
  cardio: [
    { key: 'cardio_low', name: 'Low impact (Zone 2)', muscles: 'Fat burn · recovery friendly',
      ids: ['Walking_Treadmill', 'Bicycling_Stationary', 'Elliptical_Trainer', 'Recumbent_Bike', 'Stairmaster', 'Step_Mill'] },
    { key: 'cardio_high', name: 'Higher intensity (intervals)', muscles: 'Conditioning · VO₂max',
      ids: ['Rowing_Stationary', 'Running_Treadmill', 'Jogging_Treadmill', 'Rope_Jumping', 'Bicycling_Stationary', 'Stairmaster'] },
  ],
};

window.GROUPS = [
  ['push', '💪 Push'], ['pull', '🧗 Pull'], ['legs', '🦵 Legs'], ['core', '🎯 Core'], ['cardio', '🏃 Cardio'],
];

/* Equipment buckets for the "what's free?" filter. */
window.EQUIP = {
  barbell: { l: 'Barbell', m: ['barbell', 'e-z curl bar'] },
  dumbbell: { l: 'Dumbbell', m: ['dumbbell', 'kettlebells'] },
  machine: { l: 'Machine', m: ['machine', 'other'] },
  cable: { l: 'Cable', m: ['cable'] },
  body: { l: 'Bodyweight', m: ['body only', 'bands', 'exercise ball', 'medicine ball', null, ''] },
};

window.Training = (() => {
  const all = Object.entries(MOVES).flatMap(([group, pats]) => pats.map(p => ({ ...p, group })));
  const byId = {};
  all.forEach(p => p.ids.forEach(id => { if (!byId[id]) byId[id] = p; }));
  const MUSCLE_PATTERN = {
    chest: 'chest_press', shoulders: 'ohp', triceps: 'triceps', lats: 'vpull', 'middle back': 'row', biceps: 'biceps', forearms: 'biceps',
    traps: 'traps', neck: 'traps', quadriceps: 'squat', hamstrings: 'hinge', 'lower back': 'hinge', glutes: 'glutes',
    abductors: 'glutes', adductors: 'glutes', calves: 'calves', abdominals: 'core_flex',
  };
  const patternByKey = Object.fromEntries(all.map(p => [p.key, p]));
  /* Pattern an exercise belongs to: curated list first, then by its main muscle. */
  function patternOf(id) {
    if (byId[id]) return byId[id];
    const e = EX[id]; if (!e) return null;
    if (e.category === 'cardio') return patternByKey.cardio_low;
    return patternByKey[MUSCLE_PATTERN[e.primaryMuscles[0]]] || null;
  }
  const equipKey = e => Object.keys(EQUIP).find(k => EQUIP[k].m.includes(e?.equipment ?? null)) || 'body';
  /* Same-movement alternatives ranked best → last, excluding the current one. */
  function alternatives(id, limit = 12) {
    const p = patternOf(id); if (!p) return [];
    const ranked = p.ids.filter(x => x !== id && EX[x]);
    if (ranked.length >= limit) return ranked.slice(0, limit);
    const m = EX[id]?.primaryMuscles?.[0];
    const extra = EXERCISE_DB.filter(e => e.id !== id && !ranked.includes(e.id) && e.primaryMuscles[0] === m && ['strength', 'powerlifting'].includes(e.category))
      .sort((a, b) => (a.mechanic === 'compound' ? 0 : 1) - (b.mechanic === 'compound' ? 0 : 1) || (a.level === 'expert') - (b.level === 'expert'))
      .map(e => e.id);
    return [...ranked, ...extra].slice(0, limit);
  }
  function rankOf(id) { const p = patternOf(id); const i = p ? p.ids.indexOf(id) : -1; return i < 0 ? null : i + 1; }
  return { all, patternOf, alternatives, rankOf, equipKey };
})();
