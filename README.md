# Shred12 — 12-week evidence-based fat-loss tracker

A single-page fitness app with no build step and no backend. It runs in any modern browser and stores your data privately in that browser's `localStorage`.

## Use it

**Live app:** https://yuvatj.github.io/shred12/. Open it on your phone and install it:
- **iPhone (Safari):** Share ⬆ → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Install app*

Once installed, it opens full-screen and works offline. Exercise images are saved as you view them, and food search needs a connection. Your data stays on the device; use **Me → Export / Import** to back it up or move it.

## Run locally

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Publish an update

1. Edit the files.
2. In `sw.js`, bump `VERSION` (e.g. `shred12-v9` → `shred12-v10`) and set `BUILD` to today's date so installed phones pick up the change.
   Add a line for the new version to `WHATS_NEW` in `js/app.js`; phones show it once after updating.
3. Run:

```bash
git commit -am "Describe the change" && git push
```

GitHub Pages redeploys in about a minute. On the phone, the update arrives the next time the app is opened online. You can also force it with **Me → App → Check for updates**, which shows the version you're running.

## Features

The app uses a mobile layout with five tabs: **Home · Food · Train · Plan · Me**. On a desktop screen it appears as a centered phone frame.

| Tab | What it does |
|---|---|
| Home | Four tiles: **Weight, Water, Calories and BMI**. Tap one to see its **"You vs Ideal" line graph**, either over the last 2 weeks or the whole 12-week plan. Quick entry sits directly below the graph: a weight stepper, water buttons (+250/+500/+750 ml or "Reached my goal"), quick-add calories or log your meal plan, and a BMI scale. The graph updates as soon as you save. |
| Food | Food log with ring and macro bars. ~70 built-in foods (USDA-based), live **Open Food Facts** search and custom foods. **Meal prep** gives a 7-day high-protein plan scaled to your target, with recipes and a grocery list. |
| Train | A 12-week periodized program (4-day Upper/Lower or 3-day Full Body, plus cardio). The session logger pre-fills last week's weights, and you can swap exercises. Includes an **876-exercise library** with images, plus strength and volume charts. |
| Plan | Roadmap (projected body composition, week-by-week targets, an automatic weekly calorie check-in), Insights, and evidence-ranked Supplements. |
| Me | Profile and goals, body measurements (waist/neck/hip → body fat %), dark/light mode, Asian BMI cut-offs, and backup export/import. |

### 💪 Training structure
- **Goal for every day:** each day is labeled Push, Pull, Legs, Upper, Cardio or Rest. A week strip at the top of Train → Today lets you jump between days.
- **Push · Pull · Legs + Cardio plan (default):** Mon Push · Tue Pull · Wed Legs · Thu Zone-2 Cardio · Fri Upper · Sat Legs (glutes & core) · Sun Rest. Every muscle is trained twice a week. Existing users can switch from Train → Program.
- **Library by movement, ranked best → last:** grouped into Push / Pull / Legs / Core / Cardio, then by movement (chest press, incline press, row, squat, hinge…). The **"What's free?"** filter (Barbell / Dumbbell / Machine / Cable / Bodyweight) shows only what's available.
- **Machine busy?** Tap **⇄ Busy?** on any exercise in today's workout to swap it for the next-best option that trains the same movement. The rankings live in `js/training.js`.

### 🎧 Guided workout coach (Train → Today → *Start guided workout*)

Speaks through your phone speaker or Bluetooth headset:
- **Strength:** it announces the exercise, set, weight and rep range, then counts down 3-2-1.
  - It counts reps on a tempo (2–5 s per rep), or you tap to count.
  - It pushes you on the last reps ("Two more. Dig in!", "Last one! Push, squeeze it!") and tells you when you beat last session.
  - Between sets it runs a rest timer with 30 s and 10 s warnings and says what's next.
- **Cardio:** Zone 2 sessions get heart-rate zone cues every 5 minutes. Interval days run 8 × 30 s hard / 90 s easy with countdown beeps.
- **Heart rate (Android Chrome):** connect a watch or strap that broadcasts heart rate over Bluetooth (Polar, Garmin "Broadcast HR", Coros, Wahoo, many Amazfit). Rest is extended if your heart rate hasn't recovered below 65% of max, and the workout saves average and max heart rate.
- The screen stays on during a session. Settings (⚙) cover voice, auto-count, tempo, rest length and encouragement.

The coach is rule-based for now. The cue functions in `js/coach.js` (`repCue`, rest and cardio cues) are where an AI coach can plug in later.

**Ideal lines:** weight follows your 12-week plan curve, BMI is that curve converted to BMI, water is 35 ml/kg (+0.5 L on training days), and calories are your daily target.

## Science used

- **BMR:** Mifflin-St Jeor, or Katch-McArdle once body fat is known. TDEE = BMR × activity.
- **Rate of loss:** 0.5–1.0% of bodyweight per week (default 0.7%). The deficit is capped at 25% of TDEE. Garthe et al. 2011.
- **Protein:** 2.6 g/kg of lean mass, the middle of Helms et al. 2014's 2.3–3.1 g/kg FFM range, and never below 1.6 g/kg bodyweight. Spread it as 0.25–0.4 g/kg per meal (ISSN).
- **Fat:** about 25% of kcal and at least 0.6 g/kg. **Carbs:** whatever is left. **Fiber:** 14 g per 1,000 kcal.
- **Training:** at least 10 hard sets per muscle per week (Schoenfeld 2017), in phases: Foundation, Build, Intensify, Deload.
- **Supplements:** creatine 3–5 g/day (ISSN 2017) and caffeine 3–6 mg/kg (ISSN 2021). Vitamin D and omega-3 are situational. "Fat burners" have no good evidence.

All references are linked inside the app on the **Supplements** and **12-Week Plan** pages.

## Open-source data

- Exercises: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense), stored in `data/exercises.js`.
- Packaged foods: [Open Food Facts](https://world.openfoodfacts.org/) API (ODbL), queried live.
- Home photos: [Unsplash](https://unsplash.com/) (Unsplash License: free to use), resized to WebP in `img/` so they work offline.

*This app gives general information, not medical advice. Check with a doctor before starting a diet or supplements, especially if you have a medical condition.*
