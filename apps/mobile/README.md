# Veyos mobile (Expo)

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

## Structure

```
app/          expo-router screens
modules/      Expo Modules API native bridges (HealthKit, Health Connect, BLE)
plugins/      config plugins — entitlements, Info.plist keys, Android manifest entries
```

## Rules for this app

- The client computes **on-device baselines** and cheap local variance detection. It opens
  the high-frequency stream only when a variance trip fires. This is a battery and cost
  decision, and it is also a privacy posture: less raw data leaves the device.
- The client does **not** implement any rule from the rulebook. Ever. If you find yourself
  writing `if (hrv < baseline * 0.8)` in a component, that logic belongs in the engine.
- All payloads are built to `@weyos/shared-schema`. No vendor-shaped objects past the
  normalisation layer.
