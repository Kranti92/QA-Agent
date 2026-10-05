import { test, expect } from '@fixtures/uiFixtures';
import { SIMPLE_PRODUCT, VARIANT_PRODUCT } from '@data/products';
import { BUTTON_LABELS, CART_COPY } from '@data/constants';
import { cartLabel, variantByOptions } from '@utils/cartLabel';
import { formatPrice, toPence } from '@utils/money';

/**
 * SDEMO-1 AC4-AC9 — the happy path. Catalog -> PDP -> Add To Cart -> cart.
 *
 * Adding is AJAX (POST /cart/add.js) and the page does not navigate, so the
 * only in-page success signal is the header counter — no toast, no drawer
 * (anomaly A4, confirmed). Flow tests therefore add, then navigate to /cart
 * themselves via `addToCartAndViewCart()`.
 */
test.describe('Add to cart — happy path', () => {
  test('@smoke adds a single-variant product from the catalog to the cart', async ({
    catalogPage,
    cartPage,
  }) => {
    const product = SIMPLE_PRODUCT; // Striped top, £50.00, no visible pickers

    await catalogPage.open();
    expect(await catalogPage.header.cartCount()).toBe(0);

    const pdp = await catalogPage.openProduct(product.title);
    await pdp.waitForReady();

    expect(pdp.currentPath()).toBe(`/products/${product.handle}`);
    await expect(pdp.title).toHaveText(product.title);
    expect(await pdp.displayedPrice()).toBe(product.price);

    // It is an <input type=submit>, so the label lives in the value attribute
    // — and the theme's JS rewrites "Add To Cart" to "Add to Cart" on load.
    await expect(pdp.addToCartButton).toBeVisible();
    await expect(pdp.addToCartButton).toHaveValue(BUTTON_LABELS.ADD_TO_CART);
    await expect(pdp.addToCartButton).toBeEnabled();

    await pdp.addToCartAndViewCart();

    expect(cartPage.currentPath()).toBe('/cart');
    await expect(cartPage.heading).toHaveText(CART_COPY.HEADING);
    await expect(cartPage.rows).toHaveCount(1);

    const label = cartLabel(product);
    await expect(cartPage.line(label)).toBeVisible();
    expect(await cartPage.quantityOf(label)).toBe(1);
    expect(await cartPage.unitPriceOf(label)).toBe(product.price);
    expect(await cartPage.lineTotalOf(label)).toBe(product.price);
    expect(await cartPage.totalAmount()).toBe(product.price);
  });

  test('@smoke updates the header counter in place, without leaving the PDP', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(SIMPLE_PRODUCT);
    expect(await pdp.header.cartCount()).toBe(0);

    const status = await pdp.addToCart();

    // The add is AJAX: /cart/add.js answers 200 and the shopper stays put.
    expect(status).toBe(200);
    expect(pdp.currentPath()).toBe(`/products/${SIMPLE_PRODUCT.handle}`);

    expect(await pdp.header.cartCount()).toBe(1);
    // The theme emits the counter twice (#cart-target-desktop and
    // #cart-target-mobile). They must agree, or one viewport lies.
    expect(await pdp.header.cartCountMobileValue()).toBe(1);
  });

  test('@regression gives no confirmation beyond the counter (anomaly A4)', async ({
    openProduct,
    page,
  }) => {
    const pdp = await openProduct(SIMPLE_PRODUCT);
    await pdp.addToCart();

    // Documenting the UX gap, and pinning the constraint it puts on
    // automation: there is nothing else to wait for. #drawer exists in the
    // markup but is only populated server-side on /cart.
    await expect(page.locator('#drawer div.row')).toHaveCount(0);
    expect(await pdp.header.cartCount()).toBe(1);
  });

  test('@regression posts the selected variant id, and the cart agrees with /cart.js', async ({
    openProduct,
    cartPage,
    storefront,
  }) => {
    const product = VARIANT_PRODUCT; // Noir jacket, Size x Color
    const pdp = await openProduct(product);

    const variantId = await pdp.selectedVariantId();
    await pdp.addToCartAndViewCart();

    const variant = product.variants.find((v) => v.id === variantId);
    await expect(cartPage.lineByVariant(variantId)).toBeVisible();
    await expect(cartPage.line(cartLabel(product, variant))).toBeVisible();

    // Cross-check the UI against the authoritative cart, using the browser's
    // own cookie jar.
    const cart = await storefront.getCart();
    expect(cart.item_count).toBe(1);
    expect(cart.items[0]?.id).toBe(Number(variantId));
    expect(cart.total_price).toBe(toPence(product.price));
  });

  test('@regression binds the cart line price to the variant that was chosen', async ({
    openProduct,
    cartPage,
  }) => {
    const product = VARIANT_PRODUCT;
    const variant = variantByOptions(product, ['M', 'Red']);

    const pdp = await openProduct(product);
    await pdp.selectOptions(variant.options);

    expect(await pdp.selectedVariantId()).toBe(variant.id);
    expect(await pdp.displayedPrice()).toBe(product.price);

    await pdp.addToCartAndViewCart();

    const label = cartLabel(product, variant);
    expect(await cartPage.unitPriceOf(label)).toBe(product.price);
    expect(await cartPage.lineTotalOf(label)).toBe(product.price);
    expect(formatPrice(await cartPage.totalAmount())).toBe(
      formatPrice(product.price),
    );
  });

  test('@regression submits quantity 1 — the PDP exposes no quantity control', async ({
    openProduct,
    cartPage,
  }) => {
    const pdp = await openProduct(SIMPLE_PRODUCT);

    // AC7: quantity is only editable on /cart. If a quantity input ever
    // appears on the PDP this must be revisited, not silently tolerated.
    await expect(pdp.form.locator('input[name="quantity"]')).toHaveCount(0);

    await pdp.addToCartAndViewCart();
    expect(await cartPage.quantityOf(cartLabel(SIMPLE_PRODUCT))).toBe(1);
  });
});
