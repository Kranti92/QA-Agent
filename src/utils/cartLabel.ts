import type { Product, Variant } from '@models/Product';

/**
 * Reproduces how this theme labels a cart line, verified live 2026-10-05:
 *
 *   Noir jacket   + "S / Blue"      -> "Noir jacket - S / Blue"
 *   Bronze sandals+ "Default Title" -> "Bronze sandals"
 *   Grey jacket   + "Grey jacket"   -> "Grey jacket - Grey jacket"   (quirk)
 *
 * Shopify suppresses the synthetic "Default Title" but not a single variant
 * that happens to be named after its product — hence the duplicated label on
 * Grey jacket. Specs go through this so that quirk lives in one place.
 */
export function cartLabel(product: Product, variant?: Variant): string {
  const v = variant ?? product.variants[0];
  if (!v || v.title === 'Default Title') return product.title;
  return `${product.title} - ${v.title}`;
}

/** Finds a variant by its rendered title, e.g. "M / Red". */
export function variantByTitle(product: Product, title: string): Variant {
  const found = product.variants.find((v) => v.title === title);
  if (!found) {
    throw new Error(
      `${product.title} has no variant "${title}" (has: ${product.variants
        .map((v) => v.title)
        .join(', ')})`,
    );
  }
  return found;
}

/** Finds a variant by its visible picker values, e.g. ['M', 'Red']. */
export function variantByOptions(product: Product, options: string[]): Variant {
  const found = product.variants.find(
    (v) =>
      v.options.length === options.length &&
      v.options.every((o, i) => o === options[i]),
  );
  if (!found) {
    throw new Error(
      `${product.title} has no variant for options [${options.join(', ')}]`,
    );
  }
  return found;
}
