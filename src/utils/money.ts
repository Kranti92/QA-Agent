/**
 * This store renders GBP as `&pound;45.00`, sometimes with trailing
 * whitespace inside the element, and the cart renders `1 x £60.00` in its
 * mobile paragraph. Every price assertion goes through here so no spec ends
 * up string-comparing currency.
 */

const PRICE_PATTERN = /£\s*([\d,]+(?:\.\d{1,2})?)/;

/** Pulls the first GBP amount out of arbitrary text. Throws if there is none. */
export function parsePrice(text: string | null): number {
  const match = PRICE_PATTERN.exec(text ?? '');
  if (!match?.[1]) {
    throw new Error(`No GBP amount found in ${JSON.stringify(text)}`);
  }
  return Number(match[1].replace(/,/g, ''));
}

/** Pulls every GBP amount out of arbitrary text, in order. */
export function parsePrices(text: string | null): number[] {
  return [...(text ?? '').matchAll(/£\s*([\d,]+(?:\.\d{1,2})?)/g)]
    .map((m) => Number((m[1] ?? '0').replace(/,/g, '')));
}

/** Formats a number the way the storefront does, for readable failure messages. */
export function formatPrice(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/** Guards against float drift when asserting unit x qty === line total. */
export function toPence(amount: number): number {
  return Math.round(amount * 100);
}
