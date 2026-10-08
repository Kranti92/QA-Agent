import { BasePage } from './BasePage';
import type { Page } from '@playwright/test';

/**
 * /pages/about-us.
 *
 * Deliberately minimal for SDEMO-10: this ticket is about the shared header
 * logo (see Header.ts's `logo`), not About-Us-specific markup, so no
 * breadcrumb locator is defined here. SDEMO-4 (separate, unmerged branch)
 * authors a fuller AboutUsPage.ts with a breadcrumb/breadcrumbHomeLink —
 * once both merge, this file should be deleted in favour of that one rather
 * than kept as a second definition. Same pattern as BlogPage.ts on SDEMO-6.
 */
export class AboutUsPage extends BasePage {
  constructor(page: Page) {
    super(page, '/pages/about-us');
  }
}
