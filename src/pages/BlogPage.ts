import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * /blogs/news — the blog index.
 *
 * Markup, verified live 2026-10-08 (SDEMO-5):
 *
 *   <div id="main" class="twelve columns offset-by-one">
 *     <div id="breadcrumb" class="desktop">
 *       <span itemscope itemtype="http://data-vocabulary.org/Breadcrumb">
 *         <a href="/" itemprop="url"><span itemprop="title">Home</span></a>
 *       </span>
 *       &mdash;
 *       <a href="/blogs/news" class="active">News</a>
 *     </div>
 *     <article class="post first last clearfix">...</article>
 *
 * Two things that break naive automation here:
 *
 *  - The breadcrumb's second segment reads "News", not "Blog" — the header
 *    nav link and the ticket both call this page "Blog", but the breadcrumb
 *    itself uses a different label. Assert on "News", not "Blog".
 *  - Unlike AboutUsPage, there is **no page-level `<h1>` inside `#main`** —
 *    only the shared `h1#logo`. `BasePage.heading` (`#main h1`) resolves to
 *    nothing on this page; don't use it here. Use the presence of a blog
 *    post article instead to confirm the page rendered.
 *
 * `#breadcrumb` carries class "desktop" — its behaviour at a mobile viewport
 * is unverified (SDEMO-5 defers that to manual testing, same as SDEMO-4).
 *
 * Despite the breadcrumb label "News" reading like current-page text, it is
 * actually a real `<a class="active">` on the live DOM — don't assert it as
 * non-interactive; assert only on the Home link's href and the breadcrumb's
 * visible text.
 */
export class BlogPage extends BasePage {
  readonly breadcrumb: Locator;
  readonly breadcrumbHomeLink: Locator;
  readonly posts: Locator;

  constructor(page: Page) {
    super(page, '/blogs/news');
    this.breadcrumb = page.locator('#breadcrumb');
    this.breadcrumbHomeLink = this.breadcrumb.locator('a[href="/"]');
    this.posts = page.locator('#main article.post');
  }
}
