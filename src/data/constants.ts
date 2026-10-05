/**
 * Literal UI strings, verified against the rendered DOM 2026-10-05.
 *
 * The add-to-cart label is the sharp edge here. The served HTML ships
 * `value="Add To Cart"` (capital T), but the theme's `selectCallback` runs on
 * load and rewrites it to `Add to Cart` (lowercase t). Assertions against a
 * normal browser must use ADD_TO_CART; only a no-JavaScript render shows
 * ADD_TO_CART_SERVER_HTML.
 */
export const BUTTON_LABELS = {
  /** What a JS-enabled browser shows for an available variant. */
  ADD_TO_CART: 'Add to Cart',
  /** What the raw Liquid output contains before JS touches it. */
  ADD_TO_CART_SERVER_HTML: 'Add To Cart',
  /** selectCallback's label for an unavailable variant. */
  SOLD_OUT: 'Sold Out',
  /** selectCallback's label when the option combination maps to no variant. */
  UNAVAILABLE: 'Unavailable',
} as const;

export const CART_COPY = {
  HEADING: 'My Cart',
  EMPTY: /cart is currently empty/i,
  UPDATE: 'Update',
  CHECK_OUT: 'Check Out',
} as const;

export const CATALOG_COPY = {
  HEADING: 'Products',
  SOLD_OUT_BADGE: 'Sold Out',
} as const;
