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

The dashboard now supports Cloudflare D1-backed saving through the Pages Function at `/api/bookings`. The app still keeps a `localStorage` copy as a fallback when the D1 binding is not available, such as during a plain Vite dev session. Use the Import / Export tab to back up your data as JSON or import your existing Excel tracker.

### Create and migrate the D1 database

1. Create the database:
   ```sh
   npx wrangler d1 create points-redemption-dashboard
   ```
2. Copy the returned database ID into `wrangler.toml` by replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
3. Apply the migration locally for development:
   ```sh
   npx wrangler d1 migrations apply points-redemption-dashboard --local
   ```
4. Apply the migration remotely before production use:
   ```sh
   npx wrangler d1 migrations apply points-redemption-dashboard --remote
   ```
5. For local testing with the Pages Function and D1 binding, build and run Wrangler Pages instead of plain Vite:
   ```sh
   npm run build
   npx wrangler pages dev dist
   ```

## Excel import

The importer reads Sheet 1 and maps your current columns:
Airline, Origin, Layover, Destination, Cabin, Aircraft/Product, Total Points Used, Redemption Program, Type, Transfer Partner 1, Transfer Partner 2, Airline Account, Points Bought, Total Cash, and Days before Departure.

Aircraft/product entries like `777-300ER (QSuite)` are split into:
- Aircraft: `777-300ER`
- Product: `QSuite`

Purchased points are separated into points amount and cash cost, while total cash still includes purchased-points cost.
