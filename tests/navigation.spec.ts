import { test, expect } from '@fixtures/uiFixtures';

/**
 * SDEMO-10 — the shared header logo as a global "go home" control.
 *
 * Starts from the About Us page, but the actual subject is the site logo —
 * a global header element (Header.ts's `logo`, h1#logo a), present on every
 * page — same shape as SDEMO-6's equivalent test from the Blog page.
 *
 * Filename collision, accepted deliberately: SDEMO-6 (separate, unmerged
 * branch) already owns a navigation.spec.ts of its own for the identical
 * assertion starting from Blog. There is no pre-existing file on main for
 * About Us to append to (unlike Catalog's case), and the other candidate
 * name, aboutUs.spec.ts, is itself claimed by SDEMO-4's unmerged breadcrumb
 * test. navigation.spec.ts is the thematically correct choice regardless —
 * this test is about the logo, not About-Us content — so whoever merges
 * SDEMO-6 and SDEMO-10 will need to manually combine two files of this name
 * into one. Expected, not a surprise; see the SDEMO-10 plan notes.
 *
 * AC1: header "About Us" link reaches /pages/about-us (precondition only —
 * SDEMO-4 covers that flow, and the page's breadcrumb, in its own right).
 * AC2/AC3/AC4: the logo is visible there, and clicking it (not the
 * breadcrumb, not the header's other Home link) routes back to "/".
 */
test.describe('Global navigation', () => {
  test('@regression site logo navigates back to Home from the About Us page', async ({
    homePage,
    aboutUsPage,
  }) => {
    await homePage.open();
    await homePage.header.goToAboutUs();

    expect(aboutUsPage.currentPath()).toBe('/pages/about-us');
    await expect(aboutUsPage.header.logo).toBeVisible();

    await aboutUsPage.header.logo.click();

    expect(aboutUsPage.currentPath()).toBe('/');
  });
});
