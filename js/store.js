/* Local persistence (browser localStorage). Export/import lives on the Profile page. */
const STORE_KEY = 'shred12.v1';

const DEFAULT_STATE = {
  profile: null, // set by onboarding
  weights: [],   // { date, kg, waist, neck, hip, bf }
  food: {},      // date -> [{ uid, name, g, kcal, p, c, f, meal }]
  water: {},     // date -> ml
  workouts: {},  // date -> { dayKey, name, exercises: [{ id, sets: [{ kg, reps, done }] }], cardioMin, done }
  supps: {},     // date -> { suppId: true }
  steps: {},     // date -> number
  customFoods: [],
  mealPlan: null, // { generated, days: [{ meals: [{ recipeId, scale }] }] }
  calorieAdj: 0,
  theme: 'dark',
};

const Store = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      this.state = raw ? { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) } : structuredClone(DEFAULT_STATE);
    } catch {
      this.state = structuredClone(DEFAULT_STATE);
    }
    return this.state;
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { console.warn('Save failed', e); }
  },
  reset() { localStorage.removeItem(STORE_KEY); this.load(); },
  export() { return JSON.stringify(this.state, null, 2); },
  import(json) { this.state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(json) }; this.save(); },
};
