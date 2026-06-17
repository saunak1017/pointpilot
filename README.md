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

## Accounts and data storage

The dashboard supports admin-created email/password accounts backed by Cloudflare D1. Each user gets their own private booking set through the Pages Function API, so your friends can track their own redemptions separately. The app still keeps a per-user `localStorage` cache as a fallback when the D1 binding is not available, such as during a plain Vite dev session. Use the Import / Export tab to back up your data as JSON or import your existing Excel tracker.

Account security notes:
- Passwords are salted and hashed with PBKDF2 SHA-256 in the Cloudflare Pages Function before being stored in D1.
- Sessions are stored in D1 and sent to the browser as `HttpOnly` cookies.
- Public self-signup is not used. Visit `/admin` to create the one admin login, then create user accounts from the admin screen.
- Users sign in at `/login` with credentials created by the admin.

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
5. For local testing with the Pages Function, D1 binding, and account cookies, build and run Wrangler Pages instead of plain Vite:
   ```sh
   npm run build
   npx wrangler pages dev dist
   ```
6. Open `/admin` on the deployed app and create the admin login. This setup form only works while no admin exists.
7. Stay on `/admin` to create user accounts for friends. Give each friend their email/password and send them to `/login`.
8. Users can then sign in at `/login` and use the main dashboard at `/`.

## Excel import

The importer reads Sheet 1 and maps your current columns:
Airline, Origin, Layover, Destination, Cabin, Aircraft/Product, Total Points Used, Redemption Program, Type, Transfer Partner 1, Transfer Partner 2, Airline Account, Points Bought, Total Cash, and Days before Departure.

Aircraft/product entries like `777-300ER (QSuite)` are split into:
- Aircraft: `777-300ER`
- Product: `QSuite`

Purchased points are separated into points amount and cash cost, while total cash still includes purchased-points cost.
