export type Availability = 'in-stock' | 'sold-out';

export interface Variant {
  /** Shopify variant id — the value of an <option> in select#product-select. */
  id: string;
  /** Variant label as Shopify renders it, e.g. "S / Blue" or "Default Title". */
  title: string;
  /** Visible option picker values, in picker order (Size, then Color). */
  options: string[];
  available: boolean;
}

export interface Product {
  title: string;
  /**
   * URL handle. Never derive this from the title — see anomaly A2,
   * "Black heels" lives at /products/flower-print-jeans.
   */
  handle: string;
  /** Price in GBP major units. */
  price: number;
  /** Option names in picker order. Empty when the product has no real options. */
  optionNames: string[];
  availability: Availability;
  variants: Variant[];
}

export interface CartLine {
  /** Rendered as "<product title> - <variant title>" by this theme. */
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  variantId: string;
}
