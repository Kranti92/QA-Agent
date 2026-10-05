import type { Product } from '@models/Product';

/**
 * Static snapshot of the Sauce Demo catalogue, captured 2026-10-05 from
 * /products.json?limit=250.
 *
 * Tests assert against these values so they are deterministic. The
 * @data-check spec (tests/dataIntegrity.spec.ts) diffs this file against the
 * live store on every run, so drift fails loudly instead of rotting silently.
 */
export const PRODUCTS = {
  blackHeels: {
    title: 'Black heels',
    handle: 'flower-print-jeans', // anomaly A2 — title and handle disagree
    price: 45.0,
    optionNames: ['Size', 'Color'],
    availability: 'in-stock',
    variants: [
      { id: '611942549',  title: 'S / Red', options: ['S', 'Red'], available: true },
      { id: '7176066113', title: 'M / Red', options: ['M', 'Red'], available: true },
      { id: '7176066241', title: 'L / Red', options: ['L', 'Red'], available: true },
    ],
  },

  bronzeSandals: {
    title: 'Bronze sandals',
    handle: 'bronze-sandals',
    price: 39.99,
    optionNames: [],
    availability: 'in-stock',
    variants: [
      { id: '611931337', title: 'Default Title', options: ['Default Title'], available: true },
    ],
  },

  brownShades: {
    title: 'Brown Shades',
    handle: 'brown-shades',
    price: 20.0,
    optionNames: [],
    availability: 'sold-out',
    variants: [
      { id: '1063105029', title: 'Default Title', options: ['Default Title'], available: false },
    ],
  },

  greyJacket: {
    title: 'Grey jacket',
    handle: 'grey-jacket',
    price: 55.0,
    optionNames: [],
    availability: 'in-stock',
    variants: [
      // Single variant, titled after the product rather than "Default Title".
      { id: '611945025', title: 'Grey jacket', options: ['Grey jacket'], available: true },
    ],
  },

  noirJacket: {
    title: 'Noir jacket',
    handle: 'noir-jacket',
    price: 60.0,
    optionNames: ['Size', 'Color'],
    availability: 'in-stock',
    variants: [
      { id: '611952521',  title: 'S / Blue', options: ['S', 'Blue'], available: true },
      { id: '7295557889', title: 'M / Blue', options: ['M', 'Blue'], available: true },
      { id: '7295558017', title: 'L / Blue', options: ['L', 'Blue'], available: true },
      { id: '7805229441', title: 'S / Red',  options: ['S', 'Red'],  available: true },
      { id: '7805236929', title: 'M / Red',  options: ['M', 'Red'],  available: true },
      { id: '7805238401', title: 'L / Red',  options: ['L', 'Red'],  available: true },
    ],
  },

  stripedTop: {
    title: 'Striped top',
    handle: 'striped-top',
    price: 50.0,
    optionNames: [],
    availability: 'in-stock',
    variants: [
      { id: '611951029', title: 'Default Title', options: ['Default Title'], available: true },
    ],
  },

  whiteSandals: {
    title: 'White sandals',
    handle: 'white-sandals',
    price: 25.0,
    optionNames: [],
    availability: 'sold-out',
    variants: [
      { id: '611940609', title: 'Default Title', options: ['Default Title'], available: false },
    ],
  },
} satisfies Record<string, Product>;

export const ALL_PRODUCTS: Product[] = Object.values(PRODUCTS);

export const SOLD_OUT_PRODUCTS: Product[] =
  ALL_PRODUCTS.filter((p) => p.availability === 'sold-out');

export const IN_STOCK_PRODUCTS: Product[] =
  ALL_PRODUCTS.filter((p) => p.availability === 'in-stock');

/**
 * Catalogue order as the grid renders it (/collections/all).
 * Not alphabetical and not the /products.json order.
 */
export const CATALOG_ORDER = [
  'Black heels',
  'Bronze sandals',
  'Brown Shades',
  'Grey jacket',
  'Noir jacket',
  'Striped top',
  'White sandals',
] as const;

export const EXPECTED_PRODUCT_COUNT = CATALOG_ORDER.length;

/**
 * Multi-option product used by the variant-selection specs. Noir jacket has
 * two real pickers (Size x Color) and untracked inventory (anomaly A3), so it
 * is always purchasable — which makes it stable, and makes it useless for
 * out-of-stock testing. Use brownShades / whiteSandals for that.
 */
export const VARIANT_PRODUCT = PRODUCTS.noirJacket;

/** Simple single-variant product, for tests that only need "a buyable thing". */
export const SIMPLE_PRODUCT = PRODUCTS.stripedTop;

/** Second distinct product, for multi-line cart tests. */
export const SECOND_PRODUCT = PRODUCTS.bronzeSandals;

/** Sold-out product used to probe AC14 / anomaly A1. */
export const SOLD_OUT_PRODUCT = PRODUCTS.whiteSandals;
