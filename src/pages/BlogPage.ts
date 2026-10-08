import { BasePage } from './BasePage';
import type { Page } from '@playwright/test';

/**
 * /blogs/news — the blog index.
 *
 * Deliberately minimal for SDEMO-6: this ticket is about the shared header
 * logo (see Header.ts's `logo`), not blog-specific markup, so no breadcrumb
 * or post-listing locators are defined here. SDEMO-5 (separate, unmerged
 * branch) authors a fuller BlogPage.ts with those — once both merge, this
 * file should be deleted in favour of that one rather than kept as a second
 * definition. See the SDEMO-6 plan notes for why both branches ended up
 * defining BlogPage.ts independently.
 */
export class BlogPage extends BasePage {
  constructor(page: Page) {
    super(page, '/blogs/news');
  }
}
