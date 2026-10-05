import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** `/` — only used as the flow's entry point, per the SDEMO-1 happy path. */
export class HomePage extends BasePage {
  readonly featuredProducts: Locator;

  constructor(page: Page) {
    super(page, '/');
    this.featuredProducts = page.locator('section.product-grid a[id^="product-"]');
  }
}
