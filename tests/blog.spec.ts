import { test, expect } from '@fixtures/uiFixtures';

/**
 * SDEMO-5 — Blog page and its breadcrumb.
 *
 * AC1: header "Blog" link navigates to /blogs/news and renders blog content.
 * AC2/AC3/AC4: the breadcrumb is visible, reads "Home" + "News" (the
 * breadcrumb labels this page "News", not "Blog" — see BlogPage.ts), and its
 * own Home link (not the header's) routes back to "/".
 *
 * Deliberately not asserted: the ticket's AC2 originally described the
 * breadcrumb's current-page segment as non-link text. The live DOM renders
 * it as a real `<a class="active">`, same as SDEMO-4's About Us breadcrumb —
 * the ticket was corrected to match before this was authored. Asserting
 * non-interactivity here would bake in something false.
 *
 * Also deliberately not asserted: BasePage.heading (#main h1). Unlike About
 * Us, the blog index has no page-level <h1> inside #main — only the shared
 * h1#logo — so that locator resolves to nothing here. See BlogPage.ts.
 */
test.describe('Blog', () => {
  test('@smoke navigates to Blog from the header and renders the page', async ({
    homePage,
    blogPage,
  }) => {
    await homePage.open();
    await homePage.header.goToBlog();

    expect(blogPage.currentPath()).toBe('/blogs/news');
    await expect(blogPage.posts.first()).toBeVisible();
  });

  test('@regression breadcrumb Home link navigates back to the storefront home page', async ({
    blogPage,
  }) => {
    await blogPage.open();

    await expect(blogPage.breadcrumb).toBeVisible();
    const breadcrumbText = await blogPage.breadcrumb.textContent();
    expect(breadcrumbText).toContain('Home');
    expect(breadcrumbText).toContain('News');

    // The breadcrumb's own Home link, not the header's — proves the
    // breadcrumb itself performs the navigation (SDEMO-5 AC4).
    await blogPage.breadcrumbHomeLink.click();

    expect(blogPage.currentPath()).toBe('/');
  });
});
