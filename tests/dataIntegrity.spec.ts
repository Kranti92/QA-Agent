import { test, expect } from '@fixtures/uiFixtures';
import { ALL_PRODUCTS, EXPECTED_PRODUCT_COUNT } from '@data/products';

/**
 * Drift guard for src/data/products.ts.
 *
 * Every other spec asserts against the static snapshot, which keeps them
 * deterministic. The cost of that is silent rot if the demo store changes.
 * This spec pays that cost down: it diffs the snapshot against the live
 * /products.json on every run, so a catalogue change fails HERE with a clear
 * message instead of surfacing as a confusing failure somewhere else.
 *
 * If this fails, update src/data/products.ts and re-run.
 */
test.describe('@data-check static product data matches the live store', () => {
  test('the catalogue still has the expected products', async ({ storefront }) => {
    const live = await storefront.getProducts();

    expect(live).toHaveLength(EXPECTED_PRODUCT_COUNT);
    expect(live.map((p) => p.title).sort()).toEqual(
      ALL_PRODUCTS.map((p) => p.title).sort(),
    );
  });

  test('handles, prices, options and availability are unchanged', async ({
    storefront,
  }) => {
    const live = await storefront.getProducts();
    const byTitle = new Map(live.map((p) => [p.title, p]));

    for (const expected of ALL_PRODUCTS) {
      const actual = byTitle.get(expected.title);
      expect(actual, `"${expected.title}" is missing from the live store`).toBeTruthy();
      if (!actual) continue;

      expect.soft(actual.handle, `${expected.title} handle`).toBe(expected.handle);
      expect.soft(actual.price, `${expected.title} price`).toBe(expected.price);
      expect
        .soft(actual.optionNames, `${expected.title} option names`)
        .toEqual(expected.optionNames);
      expect
        .soft(actual.availability, `${expected.title} availability`)
        .toBe(expected.availability);
    }
  });

  test('variant ids are unchanged', async ({ storefront }) => {
    const live = await storefront.getProducts();
    const byTitle = new Map(live.map((p) => [p.title, p]));

    for (const expected of ALL_PRODUCTS) {
      const actual = byTitle.get(expected.title);
      if (!actual) continue;

      expect
        .soft(
          actual.variants.map((v) => `${v.id}:${v.title}`),
          `${expected.title} variants`,
        )
        .toEqual(expected.variants.map((v) => `${v.id}:${v.title}`));
    }
  });
});
