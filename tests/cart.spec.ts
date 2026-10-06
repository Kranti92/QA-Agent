import { test, expect } from '@fixtures/uiFixtures';
import { PRODUCTS, SECOND_PRODUCT, SIMPLE_PRODUCT } from '@data/products';
import { cartLabel } from '@utils/cartLabel';
import { toPence } from '@utils/money';

/**
 * SDEMO-1 AC10-AC13 — cart behaviour once something is in it.
 *
 * Each test starts from a fresh browser context, so it starts from an empty
 * Shopify cart. Nothing here depends on another test having run.
 */
test.describe('Cart', () => {
  test('@smoke shows the empty state before anything is added', async ({
    cartPage,
  }) => {
    await cartPage.open();

    await expect(cartPage.heading).toHaveText('My Cart');
    await expect(cartPage.emptyMessage).toBeVisible();
    await expect(cartPage.rows).toHaveCount(0);
    expect(await cartPage.header.cartCount()).toBe(0);
  });

  test('@regression merges a re-add of the same variant into one line and bumps the quantity', async ({
    openProduct,
    cartPage,
  }) => {
    const product = SIMPLE_PRODUCT;
    const label = cartLabel(product);

    const pdp = await openProduct(product);
    await pdp.addToCartAndViewCart();
    expect(await cartPage.quantityOf(label)).toBe(1);

    await pdp.open();
    await pdp.addToCartAndViewCart();

    await expect(cartPage.rows).toHaveCount(1);
    expect(await cartPage.quantityOf(label)).toBe(2);
    expect(await cartPage.unitPriceOf(label)).toBe(product.price);
    expect(await cartPage.lineTotalOf(label)).toBe(product.price * 2);
    expect(await cartPage.header.cartCount()).toBe(2);
  });

  test('@regression holds two distinct products as two lines', async ({
    openProduct,
    cartPage,
  }) => {
    const first = SIMPLE_PRODUCT;    // Striped top  £50.00
    const second = SECOND_PRODUCT;   // Bronze sandals £39.99

    await (await openProduct(first)).addToCartAndViewCart();
    await (await openProduct(second)).addToCartAndViewCart();

    await expect(cartPage.rows).toHaveCount(2);

    // The theme renders the most recently added line FIRST, so assert by
    // label rather than by row index.
    const lines = await cartPage.lines();
    const byLabel = new Map(lines.map((l) => [l.description, l]));

    expect(byLabel.get(cartLabel(second))?.unitPrice).toBe(second.price);
    expect(byLabel.get(cartLabel(first))?.unitPrice).toBe(first.price);
    // Compare in pence: £50.00 + £39.99 is 89.99000000000001 in float.
    expect(toPence(await cartPage.totalAmount())).toBe(
      toPence(first.price) + toPence(second.price),
    );
    expect(await cartPage.header.cartCount()).toBe(2);
  });

  test('@regression edits the quantity on the cart page and recomputes the totals', async ({
    openProduct,
    cartPage,
    storefront,
  }) => {
    const product = SECOND_PRODUCT; // £39.99 — catches rounding, unlike £50.00
    const label = cartLabel(product);

    await (await openProduct(product)).addToCartAndViewCart();
    await cartPage.setQuantity(label, 3);

    expect(await cartPage.quantityOf(label)).toBe(3);
    expect(toPence(await cartPage.lineTotalOf(label))).toBe(
      toPence(product.price) * 3,
    );
    expect(toPence(await cartPage.totalAmount())).toBe(toPence(product.price) * 3);
    expect(await cartPage.header.cartCount()).toBe(3);

    const cart = await storefront.getCart();
    expect(cart.item_count).toBe(3);
    expect(cart.total_price).toBe(toPence(product.price) * 3);
  });

  test('@regression removes a line and falls back to the empty state', async ({
    openProduct,
    cartPage,
  }) => {
    const product = SIMPLE_PRODUCT;

    await (await openProduct(product)).addToCartAndViewCart();
    await expect(cartPage.rows).toHaveCount(1);

    await cartPage.removeLine(cartLabel(product));

    await expect(cartPage.rows).toHaveCount(0);
    await expect(cartPage.emptyMessage).toBeVisible();
    expect(await cartPage.header.cartCount()).toBe(0);
  });

  test('@regression survives a page reload', async ({ openProduct, cartPage }) => {
    const product = SIMPLE_PRODUCT;

    await (await openProduct(product)).addToCartAndViewCart();
    await cartPage.reload();

    await expect(cartPage.rows).toHaveCount(1);
    expect(await cartPage.quantityOf(cartLabel(product))).toBe(1);
    expect(await cartPage.header.cartCount()).toBe(1);
  });

  test('@regression counts each cart line once, despite the hidden drawer copy', async ({
    openProduct,
    cartPage,
    page,
  }) => {
    await (await openProduct(SIMPLE_PRODUCT)).addToCartAndViewCart();

    // The theme renders the whole cart a second time inside #drawer. Our
    // locators are scoped to section#cart; this test pins that down so a
    // future unscoped selector cannot quietly double every count.
    const drawerRows = page.locator('#drawer div.row');
    expect(await drawerRows.count()).toBeGreaterThan(0);
    await expect(cartPage.rows).toHaveCount(1);
  });

  test('@regression labels a single named variant with the theme’s duplicated form', async ({
    openProduct,
    cartPage,
  }) => {
    // Grey jacket's one variant is titled "Grey jacket", and Shopify only
    // suppresses the synthetic "Default Title" — so the line reads
    // "Grey jacket - Grey jacket". Cosmetic, but it is what ships.
    const product = PRODUCTS.greyJacket;

    await (await openProduct(product)).addToCartAndViewCart();

    await expect(cartPage.line('Grey jacket - Grey jacket')).toBeVisible();
    expect(cartLabel(product)).toBe('Grey jacket - Grey jacket');
  });

  test('@regression desktop cart icon opens drawer without navigating away', async ({
    openProduct,
    page,
  }) => {
    // SDEMO-1 AC9 — the desktop cart toggle (href="#") must not navigate.
    // Pins the quirk documented in Header.ts so it is not accidentally treated
    // as a /cart navigation by future automation or theme changes.
    const pdp = await openProduct(SIMPLE_PRODUCT);
    await pdp.addToCart();

    const pathBefore = pdp.currentPath();
    await pdp.header.drawerToggle.click();

    expect(pdp.currentPath()).toBe(pathBefore);
    // Guard: the drawer toggle must not have navigated to /cart.
    expect(pdp.currentPath()).not.toBe('/cart');
  });

  test('@regression empty cart shows continue-shopping link that returns to catalog', async ({
    openProduct,
    cartPage,
  }) => {
    // SDEMO-1 AC10 — after the last line is removed, the empty-cart state must
    // offer a continue-shopping link that routes back to the catalog. Extends
    // the remove-and-empty test, which stops at the empty-state copy.
    const product = SIMPLE_PRODUCT;

    await (await openProduct(product)).addToCartAndViewCart();
    await cartPage.removeLine(cartLabel(product));

    await expect(cartPage.emptyMessage).toBeVisible();
    await expect(cartPage.continueShoppingLink).toBeVisible();
    const href = await cartPage.continueShoppingLink.getAttribute('href');
    expect(href).toContain('/collections/all');
  });
});
