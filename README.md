# The Button

A full-stack multiplayer daily ritual game. Polish interface, persistent shared Cloudflare D1 database, username/password accounts, leaderboards, friendships, streak duels and a cosmetic shop.

## Rules

- One click per account per calendar day, enforced by a database primary key.
- Every player shares the **Europe/Warsaw** day boundary. Midnight resets the opportunity to click, including 23- and 25-hour days at daylight-saving transitions.
- Each click awards **100 points**. Consecutive calendar days extend a streak; missing a day resets the current streak. Historical bests remain.
- Leaderboards rank by current streak, longest streak or lifetime points. Purchases do not reduce lifetime ranking points.
- Accepted friends can challenge each other. A duel starts on the calendar day after acceptance. The first completed day missed by a player ends the duel; if both miss that day, the result is a draw. Duels track their own new streak independently of each player's main streak. Results are resolved on participant refresh; no scheduler is necessary.
- Cosmetics are visual only: button skins, avatars, and avatar frames with profile backgrounds. Buy, then equip. Owned items cannot be charged twice.
- Rankings and shared statistics refresh every 30 seconds and when the page becomes visible. This is a persistent multiplayer application, not a device-local demo. No fake players or seeded scores.

## Stack

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1 (SQLite), Drizzle schema migrations, Lucide icons. No external API key or paid service is required for core gameplay. Sites provisions the D1 binding declared in `.openai/hosting.json`.

## Development

Use Node >=22.13 and pnpm (the exact version is pinned in package.json).

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

For a local database, build first and apply the initial migration **once**:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_handy_jazinda.sql
pnpm dev
```

Local preview is at the address printed by Vinext. When using the Sites managed runtime, follow its preview supervisor workflow instead. `.sites-runtime`, `.wrangler` and `.test-runtime` are transient and ignored.

## Data integrity and authentication

`lib/server.ts` is the server-authoritative JSON API. All mutations require a session and same-origin JSON requests. Clients never supply a date, reward, balance or streak.

- Passwords use salted PBKDF2-SHA256 (100,000 iterations); session tokens are cryptographically random and stored only as SHA256 hashes.
- Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, valid for 30 days. Logout revokes the session; password changes revoke every session.
- Login and registration are throttled with persisted per-IP and per-username windows.
- The `click_reward` SQLite trigger awards points and updates streaks atomically only after a unique daily click is inserted.
- The `purchase_charge` trigger charges a purchase in the same atomic operation as adding ownership. A nonnegative balance constraint and conditional insert prevent overspending.
- All SQL values use bound parameters. Dynamic SQL fields and ranking sorts are selected from fixed server allowlists.
- Public profiles exclude passwords and salts. Bio rendering uses React text escaping.
- There is no email recovery flow. The registration screen tells users to remember their password.

## Files

- `app/page.tsx`, `app/globals.css`: responsive interface, daily button, rankings, friends, challenges, shop, profile and account settings.
- `lib/game.ts`: time boundaries, catalog, effective streaks and duel resolution.
- `lib/server.ts`: auth, game writes and shared reads.
- `db/schema.ts`, `drizzle/`: database schema and initial migration. The migration includes two integrity triggers; keep those when creating another deployment target. Future schema changes require new migrations rather than editing an applied migration.
- `tests/game.test.mjs`: date/DST tests and integration tests using an actual Miniflare D1 database. Covers concurrent requests, account/session security, friendships, challenges, purchases and missed days. No test data is inserted into the production database.
- `.github/workflows/ci.yml`: typecheck, integration tests and build on pushes and pull requests.

## Hosting

The source is ready for Sites hosting. The Sites project ID is configuration, not a secret. Deployments apply the checked-in D1 migrations. Hosting audience is separate from game accounts: a private Site permits only its owner at the hosting layer; public access must be enabled before players elsewhere can register. The game itself supports independent username/password accounts for all visitors.

A GitHub repository alone does not host the dynamic API or database. GitHub Pages cannot run this backend. For standalone Cloudflare deployment, supply your own Worker build configuration and D1 database, apply the same migrations, and serve the frontend and API from the same origin.
