import type { Locator, Page } from '@playwright/test';
import { Header } from './components/Header';
import { logger } from '@utils/logger';

export abstract class BasePage {
  readonly header: Header;
  /** Page-level heading. Scoped to #main so it never matches h1#logo. */
  readonly heading: Locator;

  protected constructor(
    readonly page: Page,
    /** Path this page lives at, relative to baseURL. */
    protected readonly path: string,
  ) {
    this.header = new Header(page);
    this.heading = page.locator('#main h1');
  }

  async open(): Promise<void> {
    logger.step(`Navigating to ${this.path}`);
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }

  currentPath(): string {
    return new URL(this.page.url()).pathname;
  }
}
