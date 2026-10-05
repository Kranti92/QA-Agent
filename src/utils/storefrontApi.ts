import type { APIRequestContext } from '@playwright/test';
import type { Availability, Product, Variant } from '@models/Product';

/**
 * Thin read-only client over Shopify's public JSON endpoints.
 *
 * Used for two things only:
 *  1. the @data-check drift guard, and
 *  2. probing /cart/add directly, to tell a real add apart from Shopify's
 *     "302 -> /cart" which it also returns on failure paths (anomaly A1).
 *
 * UI assertions stay in the page objects. This is not a back door for them.
 */

interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  available: boolean;
  price: string;
}

interface ShopifyProduct {
  title: string;
  handle: string;
  options: { name: string }[];
  variants: ShopifyVariant[];
}

export interface CartLineJson {
  id: number;
  title: string;
  variant_title: string | null;
  quantity: number;
  price: number;      // pence
  line_price: number; // pence
}

export interface CartJson {
  item_count: number;
  total_price: number; // pence
  items: CartLineJson[];
}

export class StorefrontApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Live catalogue, normalised into the same shape as src/data/products.ts. */
  async getProducts(): Promise<Product[]> {
    const res = await this.request.get('/products.json?limit=250');
    if (!res.ok()) {
      throw new Error(`GET /products.json failed: ${res.status()} ${res.statusText()}`);
    }
    const body = (await res.json()) as { products: ShopifyProduct[] };

    return body.products.map((p) => {
      const variants: Variant[] = p.variants.map((v) => ({
        id: String(v.id),
        title: v.title,
        options: [v.option1, v.option2, v.option3].filter(
          (o): o is string => o !== null,
        ),
        available: v.available,
      }));

      const availability: Availability = variants.some((v) => v.available)
        ? 'in-stock'
        : 'sold-out';

      // Shopify reports a synthetic "Title" option for products with no real
      // options; treat that as "no options" to match the static data.
      const optionNames = p.options
        .map((o) => o.name)
        .filter((name) => name !== 'Title');

      return {
        title: p.title,
        handle: p.handle,
        price: Number(p.variants[0]?.price ?? 0),
        optionNames,
        availability,
        variants,
      };
    });
  }

  /** Authoritative cart contents for the current cookie jar. */
  async getCart(): Promise<CartJson> {
    const res = await this.request.get('/cart.js');
    if (!res.ok()) {
      throw new Error(`GET /cart.js failed: ${res.status()} ${res.statusText()}`);
    }
    return (await res.json()) as CartJson;
  }

  /**
   * Posts straight to /cart/add, bypassing the UI. Returns the raw status and
   * redirect target so a spec can show what the endpoint really did, rather
   * than inferring success from the 302.
   */
  async addToCartDirect(variantId: string, quantity = 1) {
    const res = await this.request.post('/cart/add', {
      form: { id: variantId, quantity: String(quantity) },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    return {
      status: res.status(),
      location: res.headers()['location'] ?? null,
    };
  }

  /**
   * The endpoint the theme's own `quickAdd` handler uses. Shopify answers 200
   * with the line-item JSON on success, and 422 with a `description` when it
   * rejects the add.
   */
  async addToCartAjax(variantId: string, quantity = 1) {
    const res = await this.request.post('/cart/add.js', {
      form: { id: variantId, quantity: String(quantity) },
      failOnStatusCode: false,
    });
    return {
      status: res.status(),
      body: await res.text(),
    };
  }

  async clearCart(): Promise<void> {
    await this.request.post('/cart/clear.js', { failOnStatusCode: false });
  }
}
