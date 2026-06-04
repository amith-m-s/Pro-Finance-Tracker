# Pro Finance Tracker

**Zero-backend personal finance dashboard. Client-side only. No server. No cost. No data leaves your browser.**

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://github.com/amith-m-s/Pro-Finance-Tracker)
[![No Backend](https://img.shields.io/badge/backend-none-475569?style=flat-square)](https://github.com/amith-m-s/Pro-Finance-Tracker)

---

## What This Is

A personal finance tracker built entirely in Vanilla JS with no framework, no server, and no external dependencies beyond Chart.js. All data persists in browser LocalStorage. The architectural decision — no backend — is intentional: finance data is sensitive, and the simplest way to guarantee it doesn't leave your device is to never send it anywhere.

---

## Features

- **10+ expense categories** — Housing, Food, Transport, Health, Entertainment, and more
- **Real-time Chart.js visualizations** — Doughnut and bar charts update on every entry
- **Overspend alerts** — Configurable budget thresholds with visual warnings when crossed
- **Monthly trend analytics** — Rolling multi-month comparison from LocalStorage history
- **Export to CSV** — One-click data export for spreadsheet analysis

---

## Architecture Decision: Why No Framework

React or Vue would add ~100KB of JavaScript for a feature set this focused. Vanilla JS + Chart.js keeps the bundle under 15KB (excluding Chart.js itself). The DOM manipulation surface is small enough that a framework buys nothing except build complexity.

**Why LocalStorage and not IndexedDB?**

The data set is small (thousands of transactions, not millions). LocalStorage operations are synchronous and simpler to reason about. IndexedDB would add async complexity for no real benefit at this scale.

**The tradeoff acknowledged:** LocalStorage has a 5–10MB cap per origin. For years of transaction data this could eventually hit limits. IndexedDB would be the right migration path at that point.

---

## Project Structure

```
Pro-Finance-Tracker/
├── index.html           # Single-page app entry point
├── style.css            # UI styles
├── app.js               # Core application logic
├── charts.js            # Chart.js initialization and update logic
├── storage.js           # LocalStorage read/write layer
└── categories.js        # Category definitions and budget thresholds
```

---

## Running

No build step. Open `index.html` in any browser.

```bash
git clone https://github.com/amith-m-s/Pro-Finance-Tracker
cd Pro-Finance-Tracker
open index.html   # macOS
# or
start index.html  # Windows
```

Or serve locally:
```bash
npx serve .
```

---

## Honest Limitations

- **No sync across devices** — LocalStorage is browser-local. Data on your laptop stays on your laptop.
- **No authentication** — Anyone with access to the browser can read the data.
- **No recurring transaction support** — Every transaction is manual.
- **No currency conversion** — Single currency only.

This is a personal-use tool, not a multi-device or collaborative finance platform. For those use cases you need a backend, auth, and a database — which would contradict the core design constraint.
