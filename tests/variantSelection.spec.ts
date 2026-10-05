import { test, expect } from '@fixtures/uiFixtures';
import { PRODUCTS, VARIANT_PRODUCT } from '@data/products';
import { BUTTON_LABELS } from '@data/constants';
import { cartLabel, variantByOptions } from '@utils/cartLabel';

/**
 * SDEMO-1 AC5-AC6 — the variant pickers.
 *
 * The visible pickers do not exist in the served HTML. Shopify's
 * option_selection.js builds `select.single-option-selector` at runtime from
 * the hidden `select#product-select`. If jQuery or that script fails, the
 * product is unbuyable — so "the pickers rendered" is itself a test.
 */
test.describe('Variant selection', () => {
  const product = VARIANT_PRODUCT; // Noir jacket: Size S/M/L x Color Blue/Red

  test('@smoke renders a labelled picker per option, with the hidden select behind it', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(product);

    await expect(pdp.visiblePickers).toHaveCount(product.optionNames.length);

    // The id-bearing select stays hidden; only the generated ones are usable.
    await expect(pdp.variantSelect).toHaveClass(/hidden/);
    await expect(pdp.variantSelect).toBeHidden();

    await expect(pdp.picker(0)).toBeVisible();
    await expect(pdp.picker(1)).toBeVisible();
    await expect(pdp.pickerLabel(0)).toHaveText('Size');
    await expect(pdp.pickerLabel(1)).toHaveText('Color');

    expect(await pdp.pickerOptions(0)).toEqual(['S', 'M', 'L']);
    expect(await pdp.pickerOptions(1)).toEqual(['Blue', 'Red']);
  });

  test('@regression offers every variant id the catalogue reports', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(product);
    expect(await pdp.offeredVariantIds()).toEqual(
      product.variants.map((v) => v.id),
    );
  });

  test('@regression preselects the first variant', async ({ openProduct }) => {
    const pdp = await openProduct(product);
    expect(await pdp.selectedVariantId()).toBe(product.variants[0]?.id);
  });

  for (const options of [
    ['S', 'Blue'],
    ['M', 'Red'],
    ['L', 'Blue'],
  ]) {
    test(`@regression maps picker selection ${options.join(' / ')} to its variant id`, async ({
      openProduct,
      cartPage,
    }) => {
      const variant = variantByOptions(product, options);

      const pdp = await openProduct(product);
      await pdp.selectOptions(options);

      expect(await pdp.selectedVariantId()).toBe(variant.id);
      // All Noir jacket variants are £60.00, so the price must not move.
      expect(await pdp.displayedPrice()).toBe(product.price);
      await expect(pdp.addToCartButton).toHaveValue(BUTTON_LABELS.ADD_TO_CART);

      await pdp.addToCartAndViewCart();

      await expect(cartPage.lineByVariant(variant.id)).toBeVisible();
      await expect(cartPage.line(cartLabel(product, variant))).toBeVisible();
    });
  }

  test('@regression hides the synthetic picker for a product with no real options', async ({
    openProduct,
  }) => {
    const pdp = await openProduct(PRODUCTS.stripedTop);

    await expect(pdp.addToCartButton).toBeVisible();

    // option_selection.js builds a picker for EVERY product, including ones
    // whose only option is Shopify's synthetic "Default Title". The theme
    // hides that wrapper, so the shopper sees nothing — but the element is in
    // the DOM. Asserting both halves keeps a future selector honest.
    await expect(pdp.optionPickers).toHaveCount(1);
    await expect(pdp.visiblePickers).toHaveCount(0);
    expect(await pdp.pickerOptions(0)).toEqual(['Default Title']);

    // Its single variant id is still posted from the hidden select.
    expect(await pdp.selectedVariantId()).toBe(
      PRODUCTS.stripedTop.variants[0]?.id,
    );
  });

  test('@regression shows an unlabelled picker for a single named variant', async ({
    openProduct,
  }) => {
    // Grey jacket's one variant is titled "Grey jacket" rather than
    // "Default Title", so Shopify treats it as a real option: the picker is
    // visible, holds one useless choice, and gets no label.
    const pdp = await openProduct(PRODUCTS.greyJacket);

    await expect(pdp.visiblePickers).toHaveCount(1);
    expect(await pdp.pickerOptions(0)).toEqual(['Grey jacket']);
    await expect(pdp.pickerLabel(0)).toHaveCount(0);
  });
});
