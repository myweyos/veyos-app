# Weyos mobile (Expo)

## Expo Go will not work. Ever.

This app loads HealthKit, Health Connect, BLE and background-task native modules. Expo Go
ships a fixed native runtime and cannot load them. Everything here runs on **EAS development
builds** (or a local `expo run:ios` / `expo run:android`). If someone on the team is
debugging "why doesn't it work in Expo Go", that is the answer — stop and make them a dev build.

## Start the long-lead items on day one

These are calendar risk, not engineering risk, and they do not care how fast you code:

1. **Apple Developer Program** enrolment (org, not individual) — D-U-N-S number required,
   allow 1–3 weeks. Blocks any physical-device iOS build.
2. **Google Play Console** account + Health Connect data-types declaration.
3. **HealthKit entitlement** and the App Store health-data privacy answers.
4. **Health Connect** permissions declaration for Android 14+.

Nothing in the codebase unblocks these. Start them before you write a screen.

## First proof, before any product code

The first thing worth building is not a screen. It is a dev build on a physical device that
reads one real HealthKit value and prints it. That single path — native module → config
plugin → EAS build → real device → real value — is where the risk lives. Once it works, the
rest of the client is ordinary React Native.

```bash
npm run prebuild            # CNG: generates ios/ and android/ from config plugins
npm run build:dev:ios       # EAS development build
npm run start               # dev client
```

## What a real build needs

The app runs on real accounts and real data only. There are no fixtures and no demo mode
(CLAUDE.md non-negotiable 9). A build needs three things outside the repo:

1. **A Supabase project** for sign-in (SCRUM-76).
   - Auth → Email: enable it, and edit the "Magic Link" email template so it includes
     `{{ .Token }}`. The app signs in with a 6-digit code, not a link.
   - The API needs `SUPABASE_URL`, and either `SUPABASE_JWT_SECRET` (legacy HS256 projects) or
     nothing more (projects with asymmetric signing keys use the JWKS). Account deletion also
     needs `SUPABASE_SERVICE_ROLE_KEY`, on the **server only**.
2. **The API reachable over HTTPS** from a phone. `localhost` isn't reachable from a device,
   and Android blocks plain HTTP. The API, the engine sidecar, Postgres/TimescaleDB and Redis
   must be hosted, or tunnelled for testing.
3. **EAS environment variables** for the build profile, set with `eas env:create` (not
   committed):
   - `EXPO_PUBLIC_API_BASE_URL`: the HTTPS API
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public by design; never the service-role key)

   A build missing any of them opens on a "This build isn't configured" screen.

```bash
npm run build:dev:android   # EAS development build; install it on an Android phone
npm run start               # then connect it to the dev server
```

Android first: Health Connect works on any Android 9+ phone with the Health Connect app. iOS
needs Apple Developer enrolment and a HealthKit module, neither of which exists yet.

## Structure

```
app/            expo-router routes: A-section onboarding, today, takeover, trace, settings
src/lib/        api client, Supabase auth, Health Connect reader, sync, cycle, app-state model
src/state/      session (account, consents) and today (the stored decision)
src/screens/    Today, Takeover, Trace: the design-pack screens, fed a TodayModel
plugins/        config plugins (the Health Connect permission delegate in MainActivity)
```

## Rules for this app

- Baselines are computed **server-side** from stored history (SCRUM-71). The app sends each
  day's readings; the first sync backfills 30 days (Health Connect's limit) so a new account
  doesn't wait a month to leave Calibrating.
- The client does **not** implement any rule from the rulebook. Ever. If you find yourself
  writing `if (hrv < baseline * 0.8)` in a component, that logic belongs in the engine.
- All payloads are built to `@weyos/shared-schema`. No vendor-shaped objects past the
  normalisation layer.
