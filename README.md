# Sauce Demo Storefront — Playwright UI Automation

Automates **SDEMO-1** — *Catalog → Product Detail → Add to Cart* — against
`https://sauce-demo.myshopify.com`.

TypeScript + Playwright, page object model, custom fixtures, tagged specs.

---

## Layout

```
automation/
├─ playwright.config.ts        # projects, timeouts, reporters, worker limits
├─ tsconfig.json               # strict, with @pages/@data/@utils path aliases
├─ .env.example                # BASE_URL and run knobs
└─ src/
   ├─ pages/                   # page object model
   │  ├─ BasePage.ts           #   open/reload/currentPath + header, #main h1
   │  ├─ components/Header.ts  #   minicart, counters, nav
   │  ├─ HomePage.ts
   │  ├─ CatalogPage.ts        #   /collections/all grid
   │  ├─ ProductPage.ts        #   PDP: pickers, price, add to cart
   │  └─ CartPage.ts           #   /cart lines, quantities, totals
   ├─ fixtures/uiFixtures.ts   # injects page objects + storefront API client
   ├─ data/
   │  ├─ products.ts           #   static catalogue snapshot
   │  └─ constants.ts          #   literal UI strings
   ├─ models/Product.ts        # Product, Variant, CartLine types
   └─ utils/
      ├─ logger.ts             #   timestamped INFO/STEP/WARN/ERROR
      ├─ money.ts              #   GBP parsing, pence conversion
      ├─ cartLabel.ts          #   how the theme labels a cart line
      └─ storefrontApi.ts      #   read-only Shopify JSON client
└─ tests/
   ├─ catalog.spec.ts          # AC1–AC3
   ├─ addToCart.spec.ts        # AC4–AC9 happy path
   ├─ variantSelection.spec.ts # AC5–AC6 pickers
   ├─ cart.spec.ts             # AC10–AC13 cart behaviour
   ├─ soldOut.spec.ts          # AC14 + the sold-out defects
   └─ dataIntegrity.spec.ts    # drift guard for data/products.ts
```

## Running

```bash
npm install
npm run install:browsers
cp .env.example .env

npm test                 # whole suite
npm run test:smoke       # @smoke       — the critical path
npm run test:regression  # @regression  — full functional coverage
npm run test:anomaly     # @anomaly     — known defects, see below
npm run test:data        # @data-check  — static data vs the live store
npm run test:headed
npm run report
npm run typecheck
```

### Tags

| Tag | Meaning |
|---|---|
| `@smoke` | Must pass before anything else is worth running. |
| `@regression` | Functional coverage of the acceptance criteria. |
| `@anomaly` | Asserts the **correct** behaviour for a known defect, marked `test.fail()`. Green while the bug stands, red the moment it is fixed. |
| `@data-check` | Diffs `src/data/products.ts` against live `/products.json`. |

## Test isolation

Every test gets its own browser context, so every test gets its own Shopify
cart cookie, so tests are parallel-safe and order-independent. Nothing is
shared and nothing needs teardown. The `cleanCart` fixture exists for the
cases that break that assumption — `--repeat-each`, `describe.serial`, or a
reused storage state.

**Worker count is deliberately low (2).** The store rate-limits
`/cart/add.js` and starts answering `429 too_many_requests` under load.
`ProductPage.addToCart()` detects a 429 and throws a message saying so,
because otherwise it surfaces as a mystifying "the counter never
incremented" timeout. Raise `WORKERS` only if you are happy to lean on
retries.

## Test data

`src/data/products.ts` is a snapshot of the 7 products captured from
`/products.json?limit=250`. Specs assert against the snapshot so they are
deterministic; `tests/dataIntegrity.spec.ts` diffs it against the live store
on every run so drift fails loudly in one obvious place rather than rotting
silently. If `@data-check` fails, refresh the snapshot:

```bash
curl -s "https://sauce-demo.myshopify.com/products.json?limit=250"
```

---

## What the store actually does

Verified against the **rendered DOM** on 2026-10-05. Several of these
contradict what the served HTML suggests, and each one cost a test.

### Add to cart is AJAX

The PDP has a plain `form[action="/cart/add"][method="post"]`, which reads
like a full-page POST. It is not. The theme's `quickAdd` handler intercepts
the submit, POSTs to **`/cart/add.js`**, then GETs `/cart.js` and repaints
the header counter. **The page does not navigate.** With JavaScript disabled
the form degrades to a real POST that 302s to `/cart`, so the two paths
genuinely differ.

Consequence: `addToCart()` stays on the PDP and settles on the counter.
`addToCartAndViewCart()` is the helper for flow tests. Waiting on the
`/cart/add.js` response alone races the follow-up `/cart.js` repaint.

### The button label changes after load

| | value |
|---|---|
| Liquid ships | `Add To Cart` (capital T) |
| `selectCallback`, available | `Add to Cart` (lowercase t) |
| `selectCallback`, unavailable | `Sold Out`, `disabled`, `.disabled` |
| `selectCallback`, no such variant | `Unavailable`, `disabled` |

It is an `<input type="submit">`, so the label is the `value` attribute, not
inner text. Assert via `BUTTON_LABELS` in `src/data/constants.ts`.

### Pickers are built at runtime, and there is always at least one

`select#product-select[name="id"]` holds the variant ids but carries class
`hidden`. `option_selection.js` generates the visible
`select.single-option-selector` elements with stable ids
`#product-select-option-0`, `-1`, … (prefer those to `nth()`).

Every product gets at least one generated picker — including products whose
only option is Shopify's synthetic `Default Title`, whose wrapper the theme
hides. So **picker count ≠ option count**; use `visiblePickers` when you mean
what a shopper can touch.

| Product | pickers in DOM | visible | labelled |
|---|---|---|---|
| Noir jacket (Size × Color) | 2 | 2 | Size, Color |
| Striped top (`Default Title`) | 1 | 0 | — |
| Grey jacket (variant named `Grey jacket`) | 1 | 1 | no label |

If jQuery or `option_selection.js` fails, the pickers never appear and the
product is unbuyable — so "the pickers rendered" is itself a test.

### The cart page renders everything twice

`/cart` contains a hidden slide-out `#drawer` holding a second copy of every
line, with the same `input[name="updates[]"]` ids. Unscoped selectors double
every count. Every `CartPage` locator is scoped to `section#cart`, and
`cart.spec.ts` has a test pinning that down.

Also: the totals block is itself a `div.row`, so line rows are identified by
containing a quantity input, not by class.

### Cart line labels

| Variant title | Rendered line |
|---|---|
| `S / Blue` | `Noir jacket - S / Blue` |
| `Default Title` | `Bronze sandals` |
| `Grey jacket` | `Grey jacket - Grey jacket` |

Shopify suppresses the synthetic `Default Title` but not a single variant
named after its product. `utils/cartLabel.ts` owns this.

### Other specifics

- Lines render **newest first**. Assert by label, never by row index.
- The total is labelled `Total`, not `Subtotal`: `div.cart.total h2`.
- No quantity input on the PDP; quantity is editable only on `/cart`, and
  the input is not live — it needs `input#update`.
- Page headings are `#main h1`; a bare `h1` also matches the header's
  `h1#logo`. The PDP title is `#buy h1[itemprop="name"]`.
- Catalog cards link to `/collections/all/products/{handle}`, and the grid is
  `section.product-grid` with cards `a[id^="product-"]`, title `h3`, price
  `h4`, badge `div.sold-out`. There are no sort or filter controls — their
  absence is the expected state.
- Empty cart copy is `It appears that your cart is currently empty!`.
- The desktop header cart link is `a.toggle-drawer.cart.desktop[href="#"]` —
  it opens the drawer and does **not** navigate. `a.checkout` is the link
  that goes to `/cart` on a desktop viewport.
- Prices are GBP, rendered `&pound;60.00`, sometimes with trailing
  whitespace. Parse with `utils/money.ts`; compare money in pence
  (`£50.00 + £39.99` is `89.99000000000001` in float).
- Never slugify a product title into a URL: **Black heels** is served from
  `/products/flower-print-jeans`.

---

## Defects found

Both are `test.fail()` in `tests/soldOut.spec.ts`, so they report green while
the bug stands and turn red when fixed. Each needs a Jira Bug linked to
SDEMO-1.

**1 — The sold-out guard is client-side only.** `White sandals` and
`Brown Shades` report `available: false` with `inventory_policy: "deny"`, yet:

```
POST /cart/add     id=611940609  ->  302 /cart,  cart item_count becomes 1
POST /cart/add.js  id=611940609  ->  200 + line item JSON, added to cart
```

The rendered PDP does block it correctly (`Sold Out`, disabled, and a forced
click does nothing — there is a passing test for that). But the server
accepts both endpoints, so the AC14 guarantee is bypassable by anything that
isn't the theme's own JavaScript.

**2 — With JavaScript disabled there is no guard at all.** A no-JS render of
`/products/white-sandals` ships an enabled `Add To Cart` and no pickers, so
the sold-out state is never communicated or enforced.

### Corrections to the previously recorded anomalies

- **A1 was recorded from the raw HTML and was wrong as stated.** The
  conclusion "a sold-out PDP renders an enabled Add To Cart" holds only
  before JavaScript runs. In a real browser the control is correctly
  disabled. The genuine defect is server-side, as above — and it is worse
  than recorded, because `/cart/add.js` accepts it too.
- **A4 ("no add-to-cart confirmation") is confirmed**, and now pinned by a
  test: the counter is the only signal, and `#drawer` stays empty on a PDP.
- **A2 and A3 are confirmed** and covered by
  `catalog.spec.ts` and `soldOut.spec.ts` respectively.

## Not covered

Deliberately out of scope for this pass, per the agreed scope: the full
AC1–AC14 sweep of direct `/cart/add` abuse beyond the sold-out case,
double-submit, quantity boundaries, 404 handles, responsive and accessibility
groups, and cross-browser. The config has `firefox`, `webkit` and `Pixel 5`
projects commented out and ready; the mobile project is what exercises
`#cart-target-mobile` and the `.mobile` cart markup.
