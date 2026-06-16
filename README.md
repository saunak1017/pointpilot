# Points Redemption Dashboard

A Cloudflare Pages-ready React/Vite app for tracking award travel redemptions, flight segments, points sources, cash costs, purchased points, and CPP analytics.

## Deploy on Cloudflare Pages

1. Upload this folder to GitHub.
2. In Cloudflare Pages, create a new project from the repo.
3. Use these build settings:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy.

No `package-lock.json` is included. The included `.npmrc` also sets `package-lock=false`.

## Data storage

This version stores data in your browser using `localStorage`. Use the Import / Export tab to back up your data as JSON or import your existing Excel tracker.

## Excel import

The importer reads Sheet 1 and maps your current columns:
Airline, Origin, Layover, Destination, Cabin, Aircraft/Product, Total Points Used, Redemption Program, Type, Transfer Partner 1, Transfer Partner 2, Airline Account, Points Bought, Total Cash, and Days before Departure.

Aircraft/product entries like `777-300ER (QSuite)` are split into:
- Aircraft: `777-300ER`
- Product: `QSuite`

Purchased points are separated into points amount and cash cost, while total cash still includes purchased-points cost.
