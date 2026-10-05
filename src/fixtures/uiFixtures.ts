import { test as base } from '@playwright/test';
import { CatalogPage } from '@pages/CatalogPage';
import { CartPage } from '@pages/CartPage';
import { HomePage } from '@pages/HomePage';
import { ProductPage } from '@pages/ProductPage';
import { StorefrontApi } from '@utils/storefrontApi';
import { logger } from '@utils/logger';
import type { Product } from '@models/Product';

type UiFixtures = {
  homePage: HomePage;
  catalogPage: CatalogPage;
  cartPage: CartPage;

  /** Builds a PDP page object without navigating. */
  productPage: (product: Product | string) => ProductPage;

  /** Builds a PDP page object and navigates to it. */
  openProduct: (product: Product | string) => Promise<ProductPage>;

  /**
   * Read-only storefront JSON client bound to the BROWSER's cookie jar via
   * `page.request`, so /cart.js reflects what the UI just did. Swapping this
   * for the standalone `request` fixture would silently read a different cart.
   */
  storefront: StorefrontApi;

  /**
   * Opt-in belt-and-braces cart reset. Each test already gets a fresh browser
   * context, hence a fresh Shopify cart cookie — so this is only needed when
   * running with --repeat-each, in test.describe.serial, or against a reused
   * storage state.
   */
  cleanCart: void;
};

const handleOf = (product: Product | string): string =>
  typeof product === 'string' ? product : product.handle;

export const test = base.extend<UiFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  catalogPage: async ({ page }, use) => {
    await use(new CatalogPage(page));
  },

  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },

  productPage: async ({ page }, use) => {
    await use((product) => new ProductPage(page, handleOf(product)));
  },

  openProduct: async ({ page }, use) => {
    await use(async (product) => {
      const pdp = new ProductPage(page, handleOf(product));
      await pdp.open();
      return pdp;
    });
  },

  storefront: async ({ page }, use) => {
    await use(new StorefrontApi(page.request));
  },

  cleanCart: async ({ page }, use) => {
    await new StorefrontApi(page.request).clearCart();
    await use();
  },

  // Narrates each test into the HTML report's stdout section. Overrides the
  // built-in `page`, so every spec gets it without opting in.
  page: async ({ page }, use, testInfo) => {
    logger.info(`START ${testInfo.titlePath.join(' > ')}`);
    await use(page);
    logger.info(`END   ${testInfo.title} [${testInfo.status}]`);
  },
});

export { expect } from '@playwright/test';
