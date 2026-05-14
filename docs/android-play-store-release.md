# Android Play Store Release Setup

Switch from debug-signed sideload AAB → release-signed Play Store AAB.

Triggered now that Google Play developer identity verification cleared.

## One-time setup (do this once)

### 1. Generate upload keystore locally

> **CRITICAL:** Back up this keystore + passwords immediately. Losing it = cannot ship app updates ever (Play rejects any AAB signed by a different upload key).

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Prompts (record answers, store with keystore):
- Keystore password
- Re-enter password
- First/last name, OU, organization, city, state, country code
- Key password (press Enter to reuse keystore password — recommended)

Output: `upload-keystore.jks` in current directory.

### 2. Base64-encode for Codemagic

```bash
openssl base64 -A -in upload-keystore.jks -out upload-keystore.jks.b64
```

Single-line base64 in `upload-keystore.jks.b64`. Copy contents.

### 3. Set Codemagic env vars

Codemagic UI → construction-app → Environment groups → **New group** → name `android_play_store_credentials` → mark **Secure**.

Add 4 vars (all secure):
| Variable | Value |
|---|---|
| `CM_KEYSTORE` | paste contents of `upload-keystore.jks.b64` |
| `CM_KEYSTORE_PASSWORD` | keystore password from step 1 |
| `CM_KEY_ALIAS` | `upload` |
| `CM_KEY_PASSWORD` | key password from step 1 |

Plus:
| Variable | Value |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` | paste full service-account JSON content |

### 4. Get Google Play service-account JSON

Play Console → Setup → API access → Create new service account → follow Google Cloud Console prompt.

Once created, grant the SA role **"Release manager"** on construction-app in Play Console.

In Google Cloud Console → IAM → service account → Keys → Add key → JSON. Download the JSON.

Paste full JSON content (single line OK) as `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS`.

### 5. Codemagic android_signing reference

In Codemagic UI: Code signing identities → Android → **Add keystore** → name `upload_keystore` → upload the `upload-keystore.jks` directly (Codemagic stores it) → enter passwords + alias.

The `android-play-store` workflow in `codemagic.yaml` references this by name (`upload_keystore`), so Codemagic injects the keystore at build time.

(You can do either env-var-based OR Codemagic-managed signing — the yaml currently uses Codemagic-managed via `android_signing: [upload_keystore]`. If you prefer env-vars only, remove the `android_signing` block and the gradle file will pick up `CM_KEYSTORE_PATH` directly.)

### 6. Initial Play Console setup

Play Console → All apps → **Create app** OR open existing CK Construction app:
- Make sure App signing is **enabled** with "Use Play App Signing"
- On first upload, Play asks you to either:
  - Let Play generate a new app-signing key (recommended for new apps), OR
  - Import an existing app-signing key (only if you have one already)

For first-time setup: let Play generate the app signing key. Your upload-keystore.jks becomes the **upload key** (signs the AAB), and Play re-signs with its own app-signing key before distributing to users.

## Trigger the build

After all env vars set:

Codemagic UI → construction-app → Start new build → Workflow: **Android Play Store Release** → Branch: `main` → Start.

Build takes ~5-7 min. On success:
- AAB published automatically to Play Console **Internal Testing** track.
- Internal testers (added via Play Console → Testing → Internal testing → Testers tab) receive the build.

## Verify upload landed

Play Console → Testing → Internal testing → Releases tab → look for new release with versionCode = Codemagic `$BUILD_NUMBER` of the build that just ran.

## Roll back if needed

Play Console → Testing → Internal testing → Releases → previous release → **Promote** back to internal track.

## What changed in this repo

| File | Change |
|---|---|
| `android/app/build.gradle` | Added `signingConfigs.release` driven by env vars; release `buildType` conditionally attaches release signing only when `CM_KEYSTORE_PATH` is set |
| `codemagic.yaml` | New `android-play-store` workflow with `android_signing` + `publishing.google_play` |
| `docs/android-play-store-release.md` | This file |

Old `android-internal-test` workflow kept for ad-hoc sideload AAB builds. Coexists; no removal.
