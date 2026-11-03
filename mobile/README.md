# NUSUK Booking: Android and iOS app (Capacitor)

A thin native shell around the **DIY Booking** page of https://www.hausaly.com/nusuk (hotels, HHR train, transfers, Umrah visa, offers).
The app opens the live site in app mode (`?app=1`): no marketing menu, no footer, only the booking pages and the booking slip.
Because it loads the live site, every website release reaches the app immediately, with no store update.

## What is native
- App icon, splash screen and status bar in the NUSUK CONSULT colours
- **Booking slip**: the PDF is saved and the system **Share / Save** sheet opens (WhatsApp, Files, email)
- **Offline screen**: if there is no connection, a branded "Try again" page appears instead of a browser error
- Paystack checkout stays inside the app (allowed hosts are in `capacitor.config.json`)

## Build the Android app
1. Install Node 22, JDK 21 and Android Studio.
2. `cd mobile && npm install`
3. `npm run android` (syncs and opens Android Studio). Press Run for a test build.
4. Play Store: in Android Studio choose Build > Generate Signed Bundle (AAB). Keep the keystore safe.
Or without Android Studio: GitHub > Actions > "Android APK (NUSUK Booking)" > Run workflow, then download the debug APK artifact.

## Build the iOS app (needs a Mac with Xcode)
1. `cd mobile && npm install && npx cap add ios`
2. `npm run ios`, set your Apple team in Xcode, then Product > Archive.

## Accounts and fees
Google Play developer account (one-time US$25); Apple Developer Program (US$99 a year).

## Store review notes
- Apple can reject apps that are only a website. The native slip sharing, offline screen and booking-only design help; add push notifications (needs a Firebase project and a backend sender) if review asks for more.
- Hotels, transport and tours are real-world services paid through Paystack, so store in-app-purchase rules do not apply.

## Change the app
- Icons / splash: replace the files in `resources/`, then `npm run assets`.
- Web address: `server.url` in `capacitor.config.json`.
- Name / ID: `appName` and `appId` (set before the first store upload; the ID cannot change later).
