import { test, expect } from '@fixtures/uiFixtures';
import { PRODUCTS, SOLD_OUT_PRODUCT } from '@data/products';
import { BUTTON_LABELS, CATALOG_COPY } from '@data/constants';
import { cartLabel } from '@utils/cartLabel';

/**
 * SDEMO-1 AC14 — a sold-out product must not be addable.
 *
 * Investigating this corrected the anomaly as originally recorded. Verified
 * 2026-10-05:
 *
 *   JS-enabled UI     -> correctly blocked. selectCallback sets the button to
 *                        "Sold Out", adds .disabled and sets the disabled
 *                        attribute. A forced click does nothing. AC14 holds.
 *   POST /cart/add    -> NOT blocked. Returns 302 -> /cart and the cart ends
 *                        up with item_count 1.
 *   POST /cart/add.js -> NOT blocked either. Returns 200 with the line item
 *                        JSON. So the sold-out guard is purely client-side.
 *   JS disabled       -> NOT blocked. Liquid ships an enabled "Add To Cart"
 *                        and no pickers, so a no-JS shopper can submit it.
 *
 * The two violations are written as `test.fail()`: they report green while the
 * defect stands and turn red the moment it is fixed, so the suite tracks the
 * bug instead of merely tolerating it. Each needs a linked Jira Bug.
 */
test.describe('Sold-out products', () => {
  test('@regression marks both sold-out products on the catalog', async ({
    catalogPage,
  }) => {
    await catalogPage.open();

    await expect(catalogPage.soldOutBadge('Brown Shades')).toBeVisible();
    await expect(catalogPage.soldOutBadge('Brown Shades')).toHaveText(
      CATALOG_COPY.SOLD_OUT_BADGE,
    );
    await expect(catalogPage.soldOutBadge('White sandals')).toBeVisible();

    expect(await catalogPage.isMarkedSoldOut('Noir jacket')).toBe(false);
  });

  test('@smoke AC14: a sold-out PDP disables the add control in a real browser', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(SOLD_OUT_PRODUCT); // White sandals

    await expect(pdp.title).toHaveText(SOLD_OUT_PRODUCT.title);
    await expect(pdp.addToCartButton).toHaveValue(BUTTON_LABELS.SOLD_OUT);
    await expect(pdp.addToCartButton).toBeDisabled();
    await expect(pdp.addToCartButton).toHaveClass(/disabled/);
    expect(await pdp.isSoldOut()).toBe(true);
  });

  test('@regression AC14 holds for the other sold-out product too', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(PRODUCTS.brownShades);

    await expect(pdp.addToCartButton).toHaveValue(BUTTON_LABELS.SOLD_OUT);
    await expect(pdp.addToCartButton).toBeDisabled();
  });

  test('@anomaly BUG: POST /cart/add accepts a sold-out variant', async ({
    page,
    storefront,
  }) => {
    // Expected to fail until the server rejects unavailable variants.
    test.fail();

    const variantId = SOLD_OUT_PRODUCT.variants[0]?.id;
    expect(variantId).toBeTruthy();

    // Establish the storefront cookies first, so the cart we read back is the
    // same one the POST targeted.
    await page.goto('/');

    const result = await storefront.addToCartDirect(variantId!);

    // A 302 to /cart is Shopify's answer on several paths, success and failure
    // alike — so the redirect alone proves nothing. The cart is the evidence.
    expect(result.status).toBe(302);
    expect(result.location).toContain('/cart');

    const cart = await storefront.getCart();
    expect(
      cart.item_count,
      'a sold-out variant must not reach the cart (inventory_policy is "deny")',
    ).toBe(0);
  });

  test('@anomaly BUG: POST /cart/add.js accepts a sold-out variant', async ({
    page,
    storefront,
  }) => {
    // Expected to fail until the server rejects unavailable variants.
    test.fail();

    const variantId = SOLD_OUT_PRODUCT.variants[0]?.id;
    await page.goto('/');

    // This is the endpoint the theme itself uses, so the gap is reachable
    // from the real client, not only from a crafted form POST.
    const result = await storefront.addToCartAjax(variantId!);

    expect(
      result.status,
      `expected 422 for an unavailable variant, got ${result.status}: ${result.body.slice(0, 200)}`,
    ).toBe(422);

    const cart = await storefront.getCart();
    expect(cart.item_count).toBe(0);
  });

  test('@regression a forced click on the disabled control does nothing', async ({
    openProduct,
    storefront,
  }) => {
    // The counterpart to the two bugs above: the client-side guard that does
    // exist genuinely holds, so the defect is server-side only.
    const pdp = await openProduct(SOLD_OUT_PRODUCT);
    await expect(pdp.addToCartButton).toBeDisabled();

    await pdp.forceClickAddToCart();

    expect(await pdp.header.cartCount()).toBe(0);
    expect((await storefront.getCart()).item_count).toBe(0);
  });

  test('@anomaly BUG: with JavaScript disabled, the sold-out guard disappears', async ({
    browser,
  }) => {
    // Expected to fail until the sold-out state is rendered server-side.
    test.fail();

    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`/products/${SOLD_OUT_PRODUCT.handle}`, {
        waitUntil: 'domcontentloaded',
      });

      const add = page.locator('input#add');

      // Liquid ships the enabled control; only selectCallback disables it.
      await expect(add).toHaveValue(BUTTON_LABELS.ADD_TO_CART_SERVER_HTML);
      await expect(
        add,
        'the add control must be disabled without relying on JavaScript',
      ).toBeDisabled();
    } finally {
      await context.close();
    }
  });

  test('@regression untracked inventory is always purchasable (A3) — so use it for nothing else', async ({
    openProduct,
    cartPage,
  }) => {
    // Noir jacket reports inventory_management: null, so it can never go out
    // of stock. Asserting that here stops anyone reaching for it to cover
    // out-of-stock scenarios.
    const product = PRODUCTS.noirJacket;
    const pdp = await openProduct(product);

    expect(await pdp.isSoldOut()).toBe(false);
    await pdp.addToCartAndViewCart();

    await expect(cartPage.rows).toHaveCount(1);
    await expect(
      cartPage.line(cartLabel(product, product.variants[0])),
    ).toBeVisible();
  });
});
