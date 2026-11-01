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
2. Bump `VERSION` in `sw.js` so installed phones pick up the change.
3. Run:

```bash
git commit -am "Describe the change" && git push
```

GitHub Pages redeploys in about a minute.

## Features

The app uses a mobile layout with five tabs: **Home · Food · Train · Plan · Me**. On a desktop screen it appears as a centered phone frame.

| Tab | What it does |
|---|---|
| Home | Four tiles: **Weight, Water, Calories and BMI**. Tap one to see its **"You vs Ideal" line graph**, either over the last 2 weeks or the whole 12-week plan. Quick entry sits directly below the graph: a weight stepper, water buttons (+250/+500/+750 ml or "Reached my goal"), quick-add calories or log your meal plan, and a BMI scale. The graph updates as soon as you save. |
| Food | Food log with ring and macro bars. ~70 built-in foods (USDA-based), live **Open Food Facts** search and custom foods. **Meal prep** gives a 7-day high-protein plan scaled to your target, with recipes and a grocery list. |
| Train | A 12-week periodized program (4-day Upper/Lower or 3-day Full Body, plus cardio). The session logger pre-fills last week's weights, and you can swap exercises. Includes an **876-exercise library** with images, plus strength and volume charts. |
| Plan | Roadmap (projected body composition, week-by-week targets, an automatic weekly calorie check-in), Insights, and evidence-ranked Supplements. |
| Me | Profile and goals, body measurements (waist/neck/hip → body fat %), dark/light mode, Asian BMI cut-offs, and backup export/import. |

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

*This app gives general information, not medical advice. Check with a doctor before starting a diet or supplements, especially if you have a medical condition.*
