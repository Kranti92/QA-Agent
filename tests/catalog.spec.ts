import { test, expect } from '@fixtures/uiFixtures';
import {
  ALL_PRODUCTS,
  CATALOG_ORDER,
  EXPECTED_PRODUCT_COUNT,
  PRODUCTS,
  SOLD_OUT_PRODUCTS,
} from '@data/products';
import { CATALOG_COPY } from '@data/constants';

/**
 * SDEMO-1 AC1-AC3 — reaching the catalog and rendering the grid.
 */
test.describe('Catalog', () => {
  test('@smoke reaches the catalog from the header and renders the grid', async ({
    homePage,
    catalogPage,
  }) => {
    await homePage.open();
    await homePage.header.goToCatalog();

    expect(catalogPage.currentPath()).toBe('/collections/all');
    await expect(catalogPage.heading).toHaveText(CATALOG_COPY.HEADING);
    await expect(catalogPage.cards).toHaveCount(EXPECTED_PRODUCT_COUNT);
  });

  test('@regression lists every product in grid order', async ({ catalogPage }) => {
    await catalogPage.open();
    expect(await catalogPage.titles()).toEqual([...CATALOG_ORDER]);
  });

  test('@regression shows the catalogue price for each product', async ({
    catalogPage,
  }) => {
    await catalogPage.open();

    for (const product of ALL_PRODUCTS) {
      expect
        .soft(await catalogPage.priceOf(product.title), `price of ${product.title}`)
        .toBe(product.price);
    }
  });

  test('@regression badges only the unavailable products as Sold Out', async ({
    catalogPage,
  }) => {
    await catalogPage.open();

    for (const product of ALL_PRODUCTS) {
      const expected = product.availability === 'sold-out';
      expect
        .soft(
          await catalogPage.isMarkedSoldOut(product.title),
          `${product.title} sold-out badge`,
        )
        .toBe(expected);
    }

    expect(SOLD_OUT_PRODUCTS.map((p) => p.title)).toEqual([
      'Brown Shades',
      'White sandals',
    ]);
  });

  test('@regression links each card to its real handle, not a slug of its title', async ({
    catalogPage,
  }) => {
    await catalogPage.open();

    // Anomaly A2: "Black heels" is served from /products/flower-print-jeans.
    // This test exists to make that break loudly if it is ever "fixed".
    for (const product of ALL_PRODUCTS) {
      expect
        .soft(await catalogPage.handleOf(product.title), `handle of ${product.title}`)
        .toBe(product.handle);
    }

    expect(PRODUCTS.blackHeels.handle).not.toBe('black-heels');
  });

  test('@regression catalog card click navigates to the correct PDP', async ({
    catalogPage,
  }) => {
    // SDEMO-1 AC3 — clicking the card must navigate, not just read the href.
    // Uses Black heels (anomaly A2) to verify the URL resolves to the real
    // handle (/products/flower-print-jeans), not a slug derived from the title.
    const product = PRODUCTS.blackHeels;

    await catalogPage.open();
    const pdp = await catalogPage.openProduct(product.title);

    expect(pdp.currentPath()).toBe(`/products/${product.handle}`);
    await expect(pdp.title).toHaveText(product.title);
  });
});
