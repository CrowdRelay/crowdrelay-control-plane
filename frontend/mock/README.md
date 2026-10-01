# demo.admin — fake data for the console

Every page of the console, filled in, without touching a database. Only for the dev server: none of this is built or shipped.

## Use it

On the ordinary dev server (`npm run dev`, http://localhost:4173):

- **Sign in** as `demo.admin` with any password, or open **http://localhost:4173/demo**.
- **Leave** by signing out, or open **/demo/exit**. The next request goes to the real API again.

While the `cp_demo` cookie is set, the dev server answers every `/api` request from that browser itself. Writes return a plausible success and are thrown away. Nothing is forwarded to the backend.

`npm run dev:mock` answers every request this way, signed in or not, so it needs no Docker and no token. A dev server started without `CONTROL_PLANE_ADMIN_TOKEN` does the same rather than refusing to start.

## How the data is made

`api-mock-plugin.ts` reads `src/` with the TypeScript compiler. It finds every `request<T>(path)` call and every capability-backed `surface.read<T>`, then generates a value of type `T`. The field names pick the content: `startsAt` gets a future date, `venueName` a venue, `fanCount` a count, and `degraded` / `errors` an empty list.

So a new endpoint or field shows up with data as soon as its type exists. There's nothing to keep in sync, and saving a file under `src/` regenerates the data.

`overrides.ts` fixes the few answers that have to agree with the URL or with each other: the profile, the tenant list and each tenant's slug. If a page looks wrong in demo mode, correct it there. Don't special-case the page.
