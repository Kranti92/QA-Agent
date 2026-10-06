import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * /pages/about-us.
 *
 * Markup, verified live 2026-10-06 (SDEMO-4):
 *
 *   <div id="main" class="twelve columns offset-by-one">
 *     <div id="breadcrumb" class="desktop">
 *       <span itemscope itemtype="http://data-vocabulary.org/Breadcrumb">
 *         <a href="/" itemprop="url"><span itemprop="title">Home</span></a>
 *       </span>
 *       &mdash;
 *       <a href="/pages/about-us" class="active">About Us</a>
 *     </div>
 *     <h1>About Us</h1>
 *
 * `#breadcrumb` carries class "desktop" — its behaviour at a mobile viewport
 * is unverified (SDEMO-4 defers that to manual testing; see the ticket's
 * acceptance criteria).
 *
 * Note: despite the ticket's AC2 describing "About Us" as non-link current-
 * page text, it is actually rendered as a real `<a>` with class `active` —
 * don't assert it as non-interactive; assert only on the Home link's href
 * and the breadcrumb's visible text.
 */
export class AboutUsPage extends BasePage {
  readonly breadcrumb: Locator;
  readonly breadcrumbHomeLink: Locator;

  constructor(page: Page) {
    super(page, '/pages/about-us');
    this.breadcrumb = page.locator('#breadcrumb');
    this.breadcrumbHomeLink = this.breadcrumb.locator('a[href="/"]');
  }
}
