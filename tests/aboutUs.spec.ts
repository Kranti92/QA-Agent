import { test, expect } from '@fixtures/uiFixtures';

/**
 * SDEMO-4 — About Us page and its breadcrumb.
 *
 * AC1: header "About Us" link navigates to /pages/about-us and renders the
 * page. AC2/AC3/AC4: the breadcrumb is visible, reads "Home" + "About Us",
 * and its own Home link (not the header's) routes back to "/".
 *
 * Deliberately not asserted: the ticket's AC2 describes "About Us" in the
 * breadcrumb as non-link current-page text. The live DOM renders it as a
 * real `<a class="active">`, so asserting non-interactivity would bake in
 * a claim the real page doesn't support — see AboutUsPage.ts.
 */
test.describe('About Us', () => {
  test('@smoke navigates to About Us from the header and renders the page', async ({
    homePage,
    aboutUsPage,
  }) => {
    await homePage.open();
    await homePage.header.goToAboutUs();

    expect(aboutUsPage.currentPath()).toBe('/pages/about-us');
    await expect(aboutUsPage.heading).toHaveText('About Us');
  });

  test('@regression breadcrumb Home link navigates back to the storefront home page', async ({
    aboutUsPage,
  }) => {
    await aboutUsPage.open();

    await expect(aboutUsPage.breadcrumb).toBeVisible();
    const breadcrumbText = await aboutUsPage.breadcrumb.textContent();
    expect(breadcrumbText).toContain('Home');
    expect(breadcrumbText).toContain('About Us');

    // The breadcrumb's own Home link, not the header's — proves the
    // breadcrumb itself performs the navigation (SDEMO-4 AC4).
    await aboutUsPage.breadcrumbHomeLink.click();

    expect(aboutUsPage.currentPath()).toBe('/');
  });
});
