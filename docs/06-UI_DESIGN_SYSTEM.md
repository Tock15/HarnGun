# HarnGun (หารกัน) - UI Design System: The Tactile Thermal Receipt

## 1. Design Concept: "The Tactile Thermal Receipt"
Instead of generic SaaS templates with neon glowing blobs and dark crypto gradients, HarnGun uses an authentic **physical metaphor**: the **Paper Restaurant Slip & Highlighter Pens**.

* **The Canvas:** Warm ambient dining darkness (`#141416`), making the paper slip pop naturally without eye strain.
* **The Slip:** Crisp warm thermal paper (`#FAF8F5`) with authentic sawtooth tear edges, dashed divider lines, and thermal POS typography.
* **The Claiming Interaction (Highlighter Pens):** When friends claim dishes, it simulates marking a physical receipt with pastel Stabilo-style highlighter pens. Each person gets a pen color plus an initial badge (§2.1).
* **The Settlement Stub:** A perforated tear-off section at the bottom (`✂ TEAR HERE ✂`) that holds the POS-style PromptPay QR and the exact amount to transfer.

---

## 2. Core Color Tokens (CSS Variables)

```css
:root {
  /* Ambient Canvas (Restaurant Tabletop) */
  --canvas-bg: #141416;
  --canvas-subtle: #1E1E22;
  --canvas-text: #E4E4E7;
  --canvas-muted: #71717A;

  /* The Thermal Paper Receipt */
  --paper-bg: #FAF8F5;
  --paper-ink: #1C1917;
  --paper-ink-secondary: #57534E;
  --paper-ink-muted: #A8A29E;
  --paper-line: #E7E5E4;
  --paper-tear: #D6D3D1;

  /* Highlighter Pen Colors — Person Pens (assigned in order, by colorIndex 0–7) */
  --highlighter-0: #BBF7D0;  --highlighter-0-ink: #14532D;  /* green */
  --highlighter-1: #BAE6FD;  --highlighter-1-ink: #0C4A6E;  /* blue */
  --highlighter-2: #DDD6FE;  --highlighter-2-ink: #4C1D95;  /* purple */
  --highlighter-3: #FED7AA;  --highlighter-3-ink: #7C2D12;  /* orange */
  --highlighter-4: #FBCFE8;  --highlighter-4-ink: #831843;  /* pink */
  --highlighter-5: #D9F99D;  --highlighter-5-ink: #365314;  /* lime */
  --highlighter-6: #99F6E4;  --highlighter-6-ink: #134E4A;  /* teal */
  --highlighter-7: #FECACA;  --highlighter-7-ink: #7F1D1D;  /* red */

  /* Reserved Pen — Shared Table Dishes */
  --highlighter-shared: #FEF08A;
  --highlighter-shared-ink: #713F12;

  /* Brand & Payment */
  --brand-promptpay: #007A64; /* Official PromptPay Deep Teal/Green */
  --brand-promptpay-hover: #005F4E;

  /* Typography */
  --font-receipt: 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace;
  --font-thai: 'IBM Plex Sans Thai', sans-serif;
  --font-sans: 'Inter', 'IBM Plex Sans Thai', sans-serif;
}
```

### 2.1. Person Identification Rules
* Participants get pen colors in join order (`colorIndex = order % 8`). Groups larger than 8 reuse colors.
* **Every claim also shows the person's initial badge** (e.g., a small `A` chip in that person's ink color). Color is never the only way to tell people apart, so repeated colors and color-blind users are both covered.
* Yellow (`--highlighter-shared`) is reserved for dishes claimed by more than one person.

### 2.2. Typography Note
IBM Plex Mono has no Thai glyphs, so Thai dish names fall through to IBM Plex Sans Thai. Both come from the same IBM Plex family, so mixed Thai/English receipt lines stay visually consistent.

---

## 3. Physical UI Details & Component Techniques

### 3.1. Sawtooth Perforated Paper Edge (CSS Gradient)
```css
.sawtooth-top {
  height: 12px;
  background: linear-gradient(45deg, var(--paper-bg) 8px, transparent 0),
              linear-gradient(-45deg, var(--paper-bg) 8px, transparent 0);
  background-position: left bottom;
  background-repeat: repeat-x;
  background-size: 16px 12px;
}
```

### 3.2. Perforated Tear Line
```css
.tear-dashed-line {
  border-top: 2px dashed var(--paper-tear);
}
```

### 3.3. Math Guard Stamp
A rotated physical rubber-stamp aesthetic (`transform: rotate(-2deg)`) that validates the receipt when the line items match the scanned total:
```css
.receipt-stamp {
  border: 1.5px solid var(--brand-promptpay);
  color: var(--brand-promptpay);
  font-family: var(--font-receipt);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}
```
