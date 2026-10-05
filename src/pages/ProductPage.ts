import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CartPage } from './CartPage';
import { BUTTON_LABELS } from '@data/constants';
import { parsePrice } from '@utils/money';
import { logger } from '@utils/logger';

/**
 * /products/{handle} — the PDP.
 *
 * Everything below was verified against the rendered DOM (not just the served
 * HTML) on 2026-10-05. The distinction matters more here than anywhere else on
 * this store, because the theme rewrites the buy controls on load:
 *
 *   Liquid ships:  <input id="add" value="Add To Cart">            (capital T)
 *   selectCallback then sets:
 *     available   -> value "Add to Cart", enabled                  (lowercase t)
 *     unavailable -> value "Sold Out",    disabled, class .disabled
 *     no variant  -> value "Unavailable", disabled, class .disabled
 *
 * So a sold-out PDP IS correctly blocked in a normal browser. Reading the raw
 * HTML alone gives the opposite — and wrong — conclusion.
 *
 * Other structural facts:
 *  - Title is `#buy h1[itemprop="name"]`; a bare `h1` also matches `h1#logo`.
 *  - Price is `#product-price > span.product-price`, re-rendered by jQuery on
 *    every variant change.
 *  - `select#product-select[name="id"]` holds the variant ids but has class
 *    `hidden`. option_selection.js builds the visible pickers at runtime as
 *    `select.single-option-selector`, with stable ids
 *    `#product-select-option-0`, `-1`, ... — prefer those over nth().
 *  - EVERY product gets at least one generated picker, including products with
 *    no real options: theirs holds the single value "Default Title" and the
 *    theme keeps its wrapper hidden. So "picker count" is not "option count";
 *    use `visiblePickers` when you mean what the shopper can actually touch.
 *  - There is no quantity input. Every add submits quantity 1.
 *  - Adding to cart IS AJAX, despite the plain `form[action="/cart/add"]`.
 *    The theme's `quickAdd` handler intercepts the submit, POSTs to
 *    `/cart/add.js`, then GETs `/cart.js` and updates the header counter in
 *    place. The page does NOT navigate. The only success signal is the
 *    counter — there is no toast, and `#drawer` stays empty on a PDP.
 *    With JavaScript disabled the form degrades to a real POST to /cart/add
 *    which 302s to /cart, so the two paths behave differently.
 */
export class ProductPage extends BasePage {
  readonly title: Locator;
  readonly priceContainer: Locator;
  readonly price: Locator;
  readonly comparePrice: Locator;
  readonly variantContainer: Locator;
  readonly variantSelect: Locator;
  /** Every generated picker, including the hidden "Default Title" one. */
  readonly optionPickers: Locator;
  /** Only the pickers a shopper can actually see and use. */
  readonly visiblePickers: Locator;
  readonly form: Locator;
  readonly addToCartButton: Locator;
  readonly featureImage: Locator;

  constructor(page: Page, readonly handle: string) {
    super(page, `/products/${handle}`);
    this.title            = page.locator('#buy h1[itemprop="name"]');
    this.priceContainer   = page.locator('#product-price');
    this.price            = page.locator('#product-price span.product-price');
    this.comparePrice     = page.locator('#product-price del.product-compare-price');
    this.variantContainer = page.locator('#product-variants');
    this.variantSelect    = page.locator('select#product-select');
    this.optionPickers    = page.locator('select.single-option-selector');
    this.visiblePickers   = page.locator('select.single-option-selector:visible');
    this.form             = page.locator('form#product-form');
    this.addToCartButton  = page.locator('input#add');
    this.featureImage     = page.locator('img#feature-image');
  }

  override async open(): Promise<void> {
    await super.open();
    await this.waitForReady();
  }

  /**
   * Waits until the theme's JS has taken over the buy controls.
   *
   * The button's value is the readiness signal: Liquid ships "Add To Cart" and
   * selectCallback replaces it with one of three known labels. Waiting on that
   * is more reliable than waiting on the pickers, because a single-variant
   * product's picker never becomes visible.
   */
  async waitForReady(): Promise<void> {
    await this.addToCartButton.waitFor({ state: 'attached' });
    await this.page.waitForFunction(
      (labels: string[]) => {
        const add = document.querySelector<HTMLInputElement>('#add');
        return !!add && labels.includes(add.value);
      },
      [
        BUTTON_LABELS.ADD_TO_CART,
        BUTTON_LABELS.SOLD_OUT,
        BUTTON_LABELS.UNAVAILABLE,
      ] as string[],
      { timeout: 15_000 },
    );
  }

  async productTitle(): Promise<string> {
    return (await this.title.textContent())?.trim() ?? '';
  }

  async displayedPrice(): Promise<number> {
    return parsePrice(await this.price.textContent());
  }

  /** The post-JS button label: "Add to Cart", "Sold Out" or "Unavailable". */
  async addButtonLabel(): Promise<string> {
    return this.addToCartButton.inputValue();
  }

  async isAddEnabled(): Promise<boolean> {
    return this.addToCartButton.isEnabled();
  }

  async isSoldOut(): Promise<boolean> {
    return (await this.addButtonLabel()) === BUTTON_LABELS.SOLD_OUT;
  }

  /** A picker by its stable generated id, not by DOM order. */
  picker(index: number): Locator {
    return this.page.locator(`select#product-select-option-${index}`);
  }

  /** The picker's label, e.g. "Size". Only emitted for multi-option products. */
  pickerLabel(index: number): Locator {
    return this.page.locator(`label[for="product-select-option-${index}"]`);
  }

  /** Option labels offered by one picker, e.g. ["S", "M", "L"]. */
  async pickerOptions(index: number): Promise<string[]> {
    const raw = await this.picker(index).locator('option').allTextContents();
    return raw.map((o) => o.trim());
  }

  /** Variant id currently held by the hidden select — i.e. what will be POSTed. */
  async selectedVariantId(): Promise<string> {
    return this.variantSelect.inputValue();
  }

  /** Every variant id the PDP offers, in render order. */
  async offeredVariantIds(): Promise<string[]> {
    return this.variantSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  }

  /**
   * Drives the visible pickers in order, e.g. selectOptions(['M', 'Red']).
   *
   * Each selection fires the theme's jQuery change handler, which rewrites the
   * hidden select, the price and the button label. We settle on the pickers'
   * values rather than on a fixed delay.
   */
  async selectOptions(values: string[]): Promise<void> {
    for (const [index, value] of values.entries()) {
      logger.step(`Selecting picker ${index} = "${value}"`);
      await this.picker(index).selectOption({ label: value });
    }

    await this.page.waitForFunction(
      (expected: string[]) => {
        const pickers = Array.from(
          document.querySelectorAll<HTMLSelectElement>(
            'select.single-option-selector',
          ),
        );
        return expected.every((v, i) => pickers[i]?.value === v);
      },
      values,
      { timeout: 5_000 },
    );
  }

  /**
   * Clicks Add To Cart and waits for the AJAX add to settle. Stays on the PDP,
   * because the theme does not navigate.
   *
   * Settling is defined as "the header counter went up". Waiting on the
   * /cart/add.js response alone is not enough: the handler then re-reads
   * /cart.js before repainting the counter, so a spec that asserted
   * immediately would race it.
   *
   * @returns the POST /cart/add.js status, for specs that care.
   */
  async addToCart(): Promise<number> {
    await this.waitForReady();
    const variantId = await this.selectedVariantId();
    const before = await this.header.cartCount();

    logger.step(`Adding variant ${variantId} to the cart`);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/cart/add'),
      ),
      this.addToCartButton.click(),
    ]);

    // The demo store rate-limits /cart/add.js and answers 429 with
    // {"status":"too_many_requests"}. Left unhandled that surfaces as a
    // baffling "counter never incremented" timeout, so name it here.
    if (response.status() === 429) {
      throw new Error(
        'Sauce Demo rate-limited POST /cart/add.js (429 too_many_requests). ' +
          'Lower WORKERS or wait a few minutes — this is throttling, not a defect.',
      );
    }

    await this.page.waitForFunction(
      (prev: number) => {
        const el = document.querySelector('#cart-target-desktop');
        const match = /\((\d+)\)/.exec(el?.textContent ?? '');
        return !!match && Number(match[1]) > prev;
      },
      before,
      { timeout: 15_000 },
    );

    return response.status();
  }

  /** Adds to cart, then navigates to /cart — the common shape of a flow test. */
  async addToCartAndViewCart(): Promise<CartPage> {
    await this.addToCart();
    return this.openCart();
  }

  async openCart(): Promise<CartPage> {
    const cart = new CartPage(this.page);
    await cart.open();
    return cart;
  }

  /**
   * Clicks without the enabled-state guard and without waiting for the
   * counter. Used by tests whose point is to observe what the control does
   * rather than to assume it works.
   */
  async forceClickAddToCart(): Promise<void> {
    await this.addToCartButton.click({ force: true });
  }
}
