import { test, expect } from '@fixtures/uiFixtures';

/**
 * SDEMO-6 — the shared header logo as a global "go home" control.
 *
 * Deliberately not named blog.spec.ts, despite starting from the Blog page:
 * SDEMO-5 (separate branch) already owns that file for Blog-specific
 * coverage (the page's breadcrumb). This ticket's actual subject is the
 * site logo — a global header element (Header.ts's `logo`, h1#logo a),
 * present on every page — so it belongs in a file named for that, not for
 * whichever page happens to be the starting point. Keeps this test from
 * colliding with SDEMO-5's file at merge time, and reads more accurately
 * besides.
 *
 * AC1: header "Blog" link reaches /blogs/news (precondition only — SDEMO-5
 * covers that flow in its own right). AC2/AC3/AC4: the logo is visible in
 * the header there, and clicking it (not the breadcrumb, not the header's
 * other Home link) routes back to "/".
 */
test.describe('Global navigation', () => {
  test('@regression site logo navigates back to Home from the Blog page', async ({
    homePage,
    blogPage,
  }) => {
    await homePage.open();
    await homePage.header.goToBlog();

    expect(blogPage.currentPath()).toBe('/blogs/news');
    await expect(blogPage.header.logo).toBeVisible();

    await blogPage.header.logo.click();

    expect(blogPage.currentPath()).toBe('/');
  });
});
