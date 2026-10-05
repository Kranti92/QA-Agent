import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { ProductPage } from './ProductPage';
import { parsePrice } from '@utils/money';
import { logger } from '@utils/logger';

/**
 * /collections/all — the Catalog.
 *
 * Grid markup, verified live 2026-10-05:
 *
 *   <section class="product-grid twelve columns alpha omega">
 *     <div class="four columns alpha">
 *       <a href="/collections/all/products/{handle}" id="product-1">
 *         <div class="sold-out">Sold Out</div>   <!-- sold-out cards only -->
 *         <img class="product" alt="{title}" />
 *         <h3>{title}</h3>
 *         <h4>&pound;45.00 </h4>
 *
 * Note the card href is /collections/all/products/{handle}, not
 * /products/{handle}. Both resolve, but the grid emits the collection form.
 * There are no sort or filter controls on this page — their absence is the
 * expected state, don't assert for them.
 */
export class CatalogPage extends BasePage {
  readonly grid: Locator;
  readonly cards: Locator;

  constructor(page: Page) {
    super(page, '/collections/all');
    this.grid = page.locator('section.product-grid');
    this.cards = this.grid.locator('a[id^="product-"]');
  }

  /** A single card, addressed by the visible product title. */
  card(title: string): Locator {
    return this.cards.filter({ has: this.page.locator('h3', { hasText: title }) });
  }

  cardByHandle(handle: string): Locator {
    return this.grid.locator(`a[href$="/products/${handle}"]`);
  }

  async productCount(): Promise<number> {
    return this.cards.count();
  }

  async titles(): Promise<string[]> {
    const raw = await this.cards.locator('h3').allTextContents();
    return raw.map((t) => t.trim());
  }

  async priceOf(title: string): Promise<number> {
    return parsePrice(await this.card(title).locator('h4').textContent());
  }

  /** The `div.sold-out` badge, only rendered on unavailable products. */
  soldOutBadge(title: string): Locator {
    return this.card(title).locator('div.sold-out');
  }

  async isMarkedSoldOut(title: string): Promise<boolean> {
    return (await this.soldOutBadge(title).count()) > 0;
  }

  async handleOf(title: string): Promise<string> {
    const href = await this.card(title).getAttribute('href');
    const match = /\/products\/([^/?#]+)/.exec(href ?? '');
    if (!match?.[1]) {
      throw new Error(`Card "${title}" has no product href (got ${href})`);
    }
    return match[1];
  }

  /** Clicks into a PDP and hands back the page object for it. */
  async openProduct(title: string): Promise<ProductPage> {
    logger.step(`Opening PDP for "${title}" from the catalog grid`);
    const handle = await this.handleOf(title);
    await this.card(title).click();
    await this.page.waitForLoadState('domcontentloaded');
    return new ProductPage(this.page, handle);
  }
}
