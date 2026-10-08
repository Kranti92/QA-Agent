import type { Locator, Page } from '@playwright/test';

/**
 * Global header / minicart, present on every page.
 *
 * Two things here bite the unwary:
 *  - The desktop cart link is `a.toggle-drawer.cart.desktop[href="#"]`. It
 *    opens the slide-out drawer; it does NOT navigate. The link that actually
 *    goes to /cart on a desktop viewport is "Check Out".
 *  - The counter renders as "(0)", not "0".
 */
export class Header {
  readonly logo: Locator;
  readonly catalogLink: Locator;
  readonly homeLink: Locator;
  readonly drawerToggle: Locator;
  readonly cartCountDesktop: Locator;
  readonly cartCountMobile: Locator;
  readonly mobileCartLink: Locator;
  readonly checkoutLink: Locator;
  readonly searchField: Locator;
  readonly searchSubmit: Locator;
  readonly aboutUsLink: Locator;

  constructor(private readonly page: Page) {
    this.logo             = page.locator('h1#logo a');
    this.catalogLink      = page.locator('#main-menu a[href="/collections/all"]');
    this.homeLink         = page.locator('#main-menu a[href="/"]').first();
    this.drawerToggle     = page.locator('#minicart a.toggle-drawer.cart.desktop');
    this.cartCountDesktop = page.locator('#cart-target-desktop');
    this.cartCountMobile  = page.locator('#cart-target-mobile');
    this.mobileCartLink   = page.locator('#minicart a.cart.mobile');
    this.checkoutLink     = page.locator('#minicart a.checkout');
    this.searchField      = page.locator('input#search-field');
    this.searchSubmit     = page.locator('input#search-submit');
    this.aboutUsLink      = page.locator('#main-menu a[href="/pages/about-us"]');
  }

  /** Parses the "(n)" counter into a number. */
  async cartCount(): Promise<number> {
    const raw = (await this.cartCountDesktop.textContent()) ?? '';
    const match = /\((\d+)\)/.exec(raw);
    if (!match?.[1]) {
      throw new Error(`Cart counter did not render as "(n)": ${JSON.stringify(raw)}`);
    }
    return Number(match[1]);
  }

  /** Same value from the mobile markup, for cross-checking the two render paths. */
  async cartCountMobileValue(): Promise<number> {
    const raw = (await this.cartCountMobile.textContent()) ?? '';
    const match = /\((\d+)\)/.exec(raw);
    if (!match?.[1]) {
      throw new Error(`Mobile cart counter did not render as "(n)": ${JSON.stringify(raw)}`);
    }
    return Number(match[1]);
  }

  async goToCatalog(): Promise<void> {
    await this.catalogLink.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Navigates to /cart using the only header link that actually routes there. */
  async goToCart(): Promise<void> {
    await this.checkoutLink.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async goToAboutUs(): Promise<void> {
    await this.aboutUsLink.click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
