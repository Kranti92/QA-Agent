import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import type { CartLine } from '@models/Product';
import { parsePrice } from '@utils/money';
import { logger } from '@utils/logger';

/**
 * /cart.
 *
 * The trap on this page: the theme renders the cart TWICE. There is a hidden
 * slide-out `#drawer` containing a second copy of every line, with the same
 * `input[name="updates[]"]` ids. Every locator here is scoped to
 * `section#cart` so counts and prices are never doubled.
 *
 * Second trap: the totals block is also `div.row` (`div.twelve.columns.row`),
 * so line rows are identified by the presence of a quantity input rather than
 * by class alone.
 *
 * Markup, verified live 2026-10-05:
 *
 *   <section id="cart">
 *     <form action="/cart" method="post">
 *       <div class="headers clearfix">...</div>
 *       <div class="row">
 *         <div class="six columns alpha description">
 *           <h3><a href="...">Noir jacket - S / Blue</a></h3>
 *         <div class="two columns price desktop">&pound;60.00</div>
 *         <div class="one columns quantity tr">
 *           <input type="text" name="updates[]" id="updates_611952521" value="1" />
 *         <div class="two columns total desktop"><span>&pound;60.00</span></div>
 *         <div class="one column remove omega desktop"><a href="/cart/change?line=1&quantity=0">x</a></div>
 *       <div class="... row">
 *         <div class="six columns omega cart total"><h2>Total &pound;60.00</h2></div>
 *       <input type="submit" id="update" name="update" value="Update" />
 *       <input type="submit" id="checkout" name="checkout" value="Check Out" />
 *
 * Note the label is "Total", not "Subtotal" — this theme shows no shipping or
 * tax line, so the total equals the sum of the line totals.
 */
export class CartPage extends BasePage {
  readonly section: Locator;
  readonly form: Locator;
  readonly rows: Locator;
  readonly emptyMessage: Locator;
  readonly total: Locator;
  readonly updateButton: Locator;
  readonly checkoutButton: Locator;
  readonly noteField: Locator;
  readonly continueShoppingLink: Locator;

  constructor(page: Page) {
    super(page, '/cart');
    this.section = page.locator('section#cart');
    this.form = this.section.locator('form[action="/cart"]');
    // Scoped to real line rows: the totals block also carries class "row".
    this.rows = this.section
      .locator('div.row')
      .filter({ has: page.locator('input[name="updates[]"]') });
    this.emptyMessage = this.section.getByText(/cart is currently empty/i);
    this.total = this.section.locator('div.cart.total h2');
    this.updateButton = this.section.locator('input#update');
    this.checkoutButton = this.section.locator('input#checkout');
    this.noteField = this.section.locator('textarea#note');
    // Empty-cart state: link is inside a <p>, not div.continue-shopping (which only
    // exists in the non-empty totals row). Role-based match works in both states.
    this.continueShoppingLink = this.section.getByRole('link', { name: /continue shopping/i });
  }

  async isEmpty(): Promise<boolean> {
    return (await this.emptyMessage.count()) > 0;
  }

  async lineCount(): Promise<number> {
    return this.rows.count();
  }

  /**
   * A line, addressed by its rendered description. The theme renders
   * "<product title> - <variant title>", so passing just the product title
   * works as a substring match.
   */
  line(description: string): Locator {
    return this.rows.filter({ hasText: description });
  }

  /** A line, addressed by variant id — unambiguous when titles collide. */
  lineByVariant(variantId: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`input#updates_${variantId}`),
    });
  }

  quantityInput(description: string): Locator {
    return this.line(description).locator('input[name="updates[]"]');
  }

  removeLink(description: string): Locator {
    return this.line(description).locator('div.remove a');
  }

  async quantityOf(description: string): Promise<number> {
    return Number(await this.quantityInput(description).inputValue());
  }

  async unitPriceOf(description: string): Promise<number> {
    return parsePrice(
      await this.line(description).locator('div.price').first().textContent(),
    );
  }

  async lineTotalOf(description: string): Promise<number> {
    return parsePrice(
      await this.line(description).locator('div.total').first().textContent(),
    );
  }

  async totalAmount(): Promise<number> {
    return parsePrice(await this.total.textContent());
  }

  /** Every line, parsed — handy for whole-cart assertions in one expect. */
  async lines(): Promise<CartLine[]> {
    const count = await this.rows.count();
    const out: CartLine[] = [];

    for (let i = 0; i < count; i += 1) {
      const row = this.rows.nth(i);
      const qtyInput = row.locator('input[name="updates[]"]');
      const inputId = (await qtyInput.getAttribute('id')) ?? '';

      out.push({
        description:
          (await row.locator('div.description h3 a').textContent())?.trim() ?? '',
        unitPrice: parsePrice(await row.locator('div.price').first().textContent()),
        quantity: Number(await qtyInput.inputValue()),
        lineTotal: parsePrice(await row.locator('div.total').first().textContent()),
        variantId: inputId.replace('updates_', ''),
      });
    }

    return out;
  }

  /**
   * Sets a line quantity and submits the form. This is a full POST to /cart
   * followed by a redirect back to /cart — the quantity input is not live.
   */
  async setQuantity(description: string, quantity: number): Promise<void> {
    logger.step(`Setting quantity of "${description}" to ${quantity}`);
    await this.quantityInput(description).fill(String(quantity));
    await Promise.all([
      this.page.waitForURL(/\/cart(\?|$)/, { waitUntil: 'domcontentloaded' }),
      this.updateButton.click(),
    ]);
  }

  async removeLine(description: string): Promise<void> {
    logger.step(`Removing "${description}" from the cart`);
    await Promise.all([
      this.page.waitForURL(/\/cart(\?|$)/, { waitUntil: 'domcontentloaded' }),
      this.removeLink(description).click(),
    ]);
  }
}
