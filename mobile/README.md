# KijaniMart Mobile App (Flutter)

**KijaniMart | Fresh Highland Groceries in 20 Mins** — Official Flutter mobile application for the KijaniMart platform, featuring:
- **Customer Storefront**: 20-Min Express Delivery homepage, live synced Flash Sale countdowns (`getSoonestFlashSaleEndMs`), Personalized Picks (`collaborative` / `popular_fallback`), Shop Aisles catalog with pagination, 0ms instant Product Detail transitions, Verified Buyer Ratings & Reviews, User-Scoped Sanitized Wishlist, Real-Time Stock-Checked Cart, 3-Step Checkout (Doorstep / Pickup Station + Stripe Hosted Checkout), POS PDF Receipt download & share, Shipment Timeline Tracker, Profile & Security, Notifications Hub, and Cookie & Privacy Preference Center.
- **Role-Gated Admin Console (14 Operational Modules)**: Executive Overview KPIs, Top Selling Products, 6-Month Revenue Trend, Low Stock Alert Scanner, Product Approval Queue, Seller Edit Diff Review, Full Inventory Manager (Quick Edit, Full Edit, Soft Delete, Add Product with Cloudinary Upload), Pickup Station Manager (GPS geolocation + Google Maps validation), Order & Fulfillment Status Pipeline, Shipment Tracking Manager, Marketplace Seller Applications & Commission Settlement, User Role & Suspension Manager, 30-Day GDPR Trash & Retention Vault, and System Audit Logs.
- **Standalone KijaniMart Seller Center**: Isolated `seller_profile` JWT session (`15m` access + `7d` rotating SHA-256 refresh token) so logging into a Seller account never overwrites the Customer/Admin session; Seller Registration & Application Wizard, Pending/Rejected Banner, Storefront Overview, Seller Catalog CRUD, Order Fulfillment Proposal (`seller_proposed_status`), Verified Customer Reviews, Store Profile Editor, and Seller Notifications.

---

## Pre-Configured Local Android Build Setup (Matching `RundaConnectApp\Mobile`)

The `mobile/android/` runner is pre-configured with your local SDK paths and cached Gradle toolchain so it builds immediately without downloading a 250 MB Gradle wrapper or new NDK:
- **Flutter SDK**: `C:\Users\HomePC\flutter` (`C:\Users\HomePC\flutter\bin\flutter.bat`)
- **Android SDK**: `C:\Users\HomePC\AppData\Local\Android\sdk`
- **Fast Android Build Configuration**: Pre-configured with cached **Gradle 8.10**, **AGP 8.7.3**, **Kotlin 2.0.21**, **NDK 27.2.12479018**, `skipDependencyChecks=true`, parallel Gradle caching in `android/gradle.properties`, and `android:usesCleartextTraffic="true"` in `android/app/src/main/AndroidManifest.xml`.
- **Default Production Backend URL**: Connects directly to your deployed Render API (`https://online-grocery-store-api.onrender.com`) out of the box. You can also override it with `--dart-define=API_BASE_URL=http://10.0.2.2:5000` when testing against a local backend on the Android Emulator.

---

## Quick Start — Running on Your Local Android Emulator (`emulator-5554`)

### 1. Navigate to the `mobile` directory & install packages

If `flutter` is in your terminal `PATH`:
```powershell
cd mobile
flutter pub get
```
Or using your local Flutter binary directly (`C:\Users\HomePC\flutter\bin\flutter.bat`):
```powershell
cd c:\Users\HomePC\Desktop\OnlineGroceryStore\mobile
& "C:\Users\HomePC\flutter\bin\flutter.bat" pub get
```

### 2. Run on Android Emulator (`emulator-5554`)

```powershell
# Using flutter in PATH:
flutter run -d emulator-5554

# Or using the full Flutter SDK path on your machine:
& "C:\Users\HomePC\flutter\bin\flutter.bat" run -d emulator-5554
```

> **Tip — If `emulator-5554` shows as `offline` in `flutter devices`:**
> Reconnect ADB before running:
> ```powershell
> & "C:\Users\HomePC\AppData\Local\Android\sdk\platform-tools\adb.exe" reconnect offline
> ```

### 3. Run Against Specific Backend URLs (Optional)

By default, the app connects directly to the deployed Render API (`https://online-grocery-store-api.onrender.com`). You can also explicitly override the backend URL:

- **Force Local Backend on Android Emulator (`http://10.0.2.2:5000`):**
  ```powershell
  & "C:\Users\HomePC\flutter\bin\flutter.bat" run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:5000
  ```
- **Force Deployed Production Backend (`https://online-grocery-store-api.onrender.com`):**
  ```powershell
  & "C:\Users\HomePC\flutter\bin\flutter.bat" run -d emulator-5554 --dart-define=API_BASE_URL=https://online-grocery-store-api.onrender.com
  ```
- **Run on Chrome / Edge / Windows Desktop:**
  ```powershell
  & "C:\Users\HomePC\flutter\bin\flutter.bat" run -d chrome
  & "C:\Users\HomePC\flutter\bin\flutter.bat" run -d edge
  & "C:\Users\HomePC\flutter\bin\flutter.bat" run -d windows
  ```

---

## Automated Layout Overflow & Quality Checks

To prevent `RenderFlex overflowed by X pixels` errors on narrow mobile screens, run the automated layout auditor and narrow-viewport (`360x800`) widget test suite:

```powershell
cd c:\Users\HomePC\Desktop\OnlineGroceryStore\mobile

# 1. Static Row / Flex / ParentDataWidget Overflow Audit across all 15 Dart files:
node scripts/check_layout_overflows.mjs --strict

# 2. Narrow-Screen (360x800) Widget Smoke & Overflow Test:
& "C:\Users\HomePC\flutter\bin\flutter.bat" test
```

---

## Building a Release APK

```powershell
cd c:\Users\HomePC\Desktop\OnlineGroceryStore\mobile
& "C:\Users\HomePC\flutter\bin\flutter.bat" build apk --release
```
The compiled APK will be generated at:
`mobile/build/app/outputs/flutter-apk/app-release.apk`
