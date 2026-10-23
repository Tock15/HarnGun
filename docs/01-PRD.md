# HarnGun (หารกัน) - Product Requirements Document (PRD)

## 1. Executive Summary & Vision
**HarnGun (หารกัน)** is a mobile-first web application designed to solve the awkward, time-consuming friction of splitting restaurant and shopping bills in Thailand. Using a smartphone camera and AI vision, HarnGun extracts line items, applies Thailand-specific tax and service charge calculations, enables fair sharing of split items, and generates exact PromptPay QR codes for instant settlement.

---

## 2. Target Market & Regional Context
* **Primary Geography:** Thailand (Bangkok & nationwide urban areas).
* **Language Support:** Bilingual receipts (Thai script + English).
* **Currency:** Thai Baht (THB, ฿), calculated down to 2 decimal places (Satang).
* **Settlement Standard:** PromptPay QR (EMVCo QR standard for Thai National ID / Mobile numbers).

---

## 3. User Personas & Collaboration Models

### 3.1. Personas
1. **The Host:**
   * Pays the upfront bill at the restaurant.
   * Provides a Display Name and PromptPay Mobile/ID (Phase 1: entered per session; Phase 2: saved in a Cognito account profile).
   * Snaps the receipt, reviews the AI-scanned items, and manages the bill session.
   * Keeps a history of previous splits and frequent dining friends (Phase 2).
2. **The Participants / Guests:**
   * Dining companions who need to pay their portion to the Host.
   * **Key UX Requirement:** *Zero-friction access.* Guests should **not** be forced to sign up or download an app at the dining table.

### 3.2. Collaboration Modes
* **Mode A: Host-Assigned (Fastest / Single Device) — Phase 1:**
  * The Host adds friend names/badges (e.g., Alice, Bob, Charlie).
  * Host taps dishes to assign them to individuals or split among groups.
  * Host generates an itemized summary image or text message to paste into LINE group chats.
  * Guests do not need their own devices.
* **Mode B: Interactive Room (Live Claiming) — Phase 2:**
  * Host opens a session and presents a Room QR / shareable link.
  * Friends join on their mobile browsers as **Guests** (bill-scoped guest token).
  * Guests tap dishes they ordered to claim them.
  * Real-time breakdown updates with host's PromptPay QR code.

---

## 4. Financial & Calculation Engine Rules

### 4.1. Money Representation
* All money is stored and calculated as **integer satang** (฿364.87 → `36487`). No floating-point Baht arithmetic anywhere in the engine.
* Conversion happens only at the boundaries: when parsing AI output (decimal Baht → satang) and when rendering to the UI / PromptPay payload (satang → decimal Baht).
* Rates are stored as integer **basis points** (1% = `100`, so 7% = `700`, 10% = `1000`), keeping percentage math integer-only too.
* Percentage calculations round to the nearest satang (half-up) at each printed step (SC amount, VAT amount), mirroring how POS systems print receipts.

### 4.2. Bill Calculation Config
Thai receipts differ in how they order discounts, service charge, and VAT. Each bill carries a calculation config, pre-filled from the AI scan and editable by the Host on the Review screen:

| Setting | Values | Default |
|---|---|---|
| `serviceChargeRate` | 0% / 10% / custom | 10% if a service charge line is detected, else 0 |
| `vatRate` | 0% / 7% / custom | 7% if a VAT line is detected, else 0 |
| `vatMode` | `EXCLUSIVE` / `INCLUSIVE` | `EXCLUSIVE` unless the receipt says VAT is included |
| `discountTiming` | `BEFORE_SC` / `AFTER_SC` | `BEFORE_SC` |

If the default is wrong for a given receipt, the Math Guard (§5.4) shows a mismatch and the Host flips the toggle.

### 4.3. The Thai "SC + VAT" Compound Formula
Let `Subtotal` be the sum of item prices (after item-level discounts) and `Discount` the bill-level discount.

**Step 1 — Service charge, by `discountTiming`:**
* `BEFORE_SC` (default): `Base = Subtotal − Discount`, `SC = Base × SC%`, `Taxable = Base + SC`
* `AFTER_SC`: `SC = Subtotal × SC%`, `Taxable = Subtotal + SC − Discount`

**Step 2 — VAT, by `vatMode`:**
* `EXCLUSIVE`: `VAT = Taxable × VAT%`, `Grand Total = Taxable + VAT`
* `INCLUSIVE`: `Grand Total = Taxable`. VAT is already inside the prices; it is extracted for display only (`VAT = Grand Total × VAT / (100 + VAT)`) and **never added again**.

**Step 3 — Rounding adjustment:** `Grand Total += roundingAdjustment` (ปัดเศษสตางค์ line, if printed).

*Note: In Thailand, standard SC is 10% and standard VAT is 7%. If both apply exclusively, the effective markup is $1.10 \times 1.07 = 17.7\%$.*

### 4.4. Splitting Shared Items
* If a dish (e.g., Tom Yum pot at ฿300) is claimed by 3 people, the item price is split **evenly** between claimants:
  $$\text{Individual Share} = \frac{\text{Item Price}}{\text{Number of Claimants}}$$
  Leftover satang from the division are distributed using the penny-balancing rule (§4.6).
* **Unpacking:** An item with quantity > 1 (e.g., 4 × Singha) can be unpacked on the Review screen into individual single-quantity items, so each person claims their own unit with one tap. Unpacking can be reversed while none of the units are claimed.
* Weighted claims ("I ate 2 of 3 portions") are out of scope; unpacking covers the common case.

### 4.5. Discount Allocations
* **Item-level discounts:** Applied directly to specific items before they enter the Subtotal.
* **Bill-level discounts (e.g., ฿100 voucher or 10% member discount):** Distributed proportionally across all participants based on their subtotal share.

### 4.6. Per-Person Allocation & Penny Balancing
* Because discounts, service charge, VAT, and rounding are all proportional to each person's item subtotal, each person's total is their proportional share of the confirmed Grand Total:
  $$\text{Person Total} = \text{Grand Total} \times \frac{\text{Person Subtotal}}{\text{Subtotal}}$$
* **Largest-remainder method (integer-only):** compute each share as `floor(Grand Total × personSubtotal / Subtotal)`, then give the leftover satang one at a time to the participants with the largest remainders. Ties are broken by participant order (deterministic, so client and server always agree).
* The same method is used for splitting a single item among claimants, and for the per-person SC / VAT / discount breakdown lines shown on settlement cards.
* Result: the sum of individual shares **strictly equals** the receipt Grand Total, to the satang.
* **The amount split is the printed receipt total**, so the shares add up to exactly what the Host paid. This applies only when the Math Guard reports a match or a difference of at most 1 satang (a POS rounding difference); any extra satang appears on a person's "rounding" line.
* Settlement requires every item to be claimed and the Math Guard to pass. The Host can use "Split remaining among everyone" to assign unclaimed items evenly.

---

## 5. Core Features by Phase

### Phase 1 — OS Course Submission (Docker)
1. **Host Session (no accounts):** Host enters Display Name and PromptPay Phone/National ID; the backend issues a signed dev session token (`DevAuth`).
2. **Receipt Capture Pipeline:** Mobile camera trigger + in-browser canvas downscaling (longest edge 2000px, JPEG 0.80) and direct presigned upload to S3-compatible storage (MinIO locally).
3. **AI Vision Extraction:** Amazon Bedrock when AWS credentials are present; otherwise `MOCK_AI=true` returns fixture JSON recorded from real receipts.
4. **Interactive "Review & Reconcile" Screen:**
   * Collapsible view of the original receipt photo.
   * Inline editing (edit dish name, price, quantity, add/remove items, unpack quantities).
   * Calculation config toggles: SC (0% / 10% / custom), VAT (0% / 7% / custom), VAT inclusive/exclusive, discount before/after SC.
   * **Math Guard Validator:** Real-time indicator comparing the computed Grand Total against the scanned Grand Total. Exact match → validated stamp; difference of ±1 satang → "within rounding"; anything larger → warning with the difference shown.
5. **Bill Splitting Interface (Mode A):**
   * Host-assigned tagging (tap friends to assign).
   * Multi-claimant support for shared dishes (even split).
6. **Settlement & Payment Screen:**
   * Per-person itemized bill cards.
   * Client-side PromptPay QR generation (EMVCo format) with exact calculated Baht amount.
   * One-tap "Copy Summary to Clipboard" formatted for LINE group chats.

### Phase 2 — AWS Serverless
1. **Authentication:** Host registration & login (AWS Cognito) with saved PromptPay ID/Phone profile.
2. **Serverless Deployment:** Same core handlers on API Gateway + Lambda, real S3 and DynamoDB, frontend on S3 + CloudFront.
3. **Mode B Interactive Room:** Room link/QR for frictionless guest claiming (Smart Polling every 3s).
4. **History:** Host's past bills and frequent dining friends.
