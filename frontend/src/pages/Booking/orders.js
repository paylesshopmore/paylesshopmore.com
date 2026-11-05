// src/pages/Booking/orders.js
//
// The rules for "Uw bestellingen" on the booking form (OrdersField.jsx):
// one row per store the customer bought from, and under each store the
// products bought there. Kept out of the component file because a file
// exporting a component may only export components (React Fast Refresh).
//
// A row (one store), while the form is being filled in:
//   key          stable id for React's list, never sent
//   shop         '' (not chosen yet), 'other', or a store id from the list
//   shopName     the store's name when 'other' was chosen
//   products     the products bought there (at least one), see newProduct
//
// A product:
//   key          stable id, never sent
//   description  what it is ("White T-shirt, size L") - required
//   url          the link to it on the webshop - optional, http(s) only
//   file         a screenshot of this product (a File), or null
//
// The limits match the server (backend bookings/models.py): at most
// MAX_ORDERS stores, MAX_PRODUCTS products per store, SCREENSHOT.maxBytes
// per file.

export const MAX_ORDERS = 10;
export const MAX_PRODUCTS = 20;

export const SCREENSHOT = {
  maxBytes: 10 * 1024 * 1024,
  extensions: ['.png', '.jpg', '.jpeg', '.webp', '.pdf'],
};

let nextKey = 1;

/** An empty product. */
export function newProduct() {
  nextKey += 1;
  return { key: `product-${nextKey}`, description: '', url: '', file: null };
}

/** An empty row: one store with one empty product. */
export function newRow() {
  nextKey += 1;
  return { key: `order-${nextKey}`, shop: '', shopName: '', products: [newProduct()] };
}

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Why a screenshot cannot be used, as a translation key, or null when it is
 * fine. The key's text takes {name}.
 */
export function screenshotProblem(file) {
  if (!SCREENSHOT.extensions.includes(extensionOf(file.name))) return 'booking.orders.wrongType';
  if (file.size > SCREENSHOT.maxBytes) return 'booking.orders.tooBig';
  return null;
}

/**
 * Whether a product link may be used: a full, secure https:// address with
 * a host. Plain http://, "javascript:", "data:" and the like never pass - the
 * server checks the same (validate_product_url), this only says so sooner.
 */
export function isProductUrl(value) {
  const text = String(value ?? '');
  if (/\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** What the store's products are, as one line ("T-shirt; Shoes"). */
export function descriptionOf(row) {
  const line = row.products
    .map((product) => product.description.trim())
    .filter(Boolean)
    .join('; ');
  return line.length > 255 ? `${line.slice(0, 254)}…` : line;
}

/**
 * The problems with each row, as
 *   { [row.key]: { shop?, shopName?, products?: { [product.key]: { description?, url? } } } }
 * holding translation keys. Empty object when every row is fine.
 */
export function validateOrders(rows) {
  const errors = {};
  for (const row of rows) {
    const rowErrors = {};
    if (!row.shop) rowErrors.shop = 'booking.orders.errors.shop';
    if (row.shop === 'other' && !row.shopName.trim())
      rowErrors.shopName = 'booking.orders.errors.shopName';

    const products = {};
    for (const product of row.products) {
      const found = {};
      if (!product.description.trim()) found.description = 'booking.orders.errors.description';
      if (product.url.trim() && !isProductUrl(product.url.trim()))
        found.url = 'booking.orders.errors.url';
      if (Object.keys(found).length) products[product.key] = found;
    }
    if (Object.keys(products).length) rowErrors.products = products;

    if (Object.keys(rowErrors).length) errors[row.key] = rowErrors;
  }
  return errors;
}

/** The rows as the server takes them (without the screenshots). */
export function toPayload(rows) {
  return rows.map((row) => {
    const products = row.products.map((product) => ({
      description: product.description.trim(),
      url: product.url.trim(),
    }));
    const store =
      row.shop === 'other' ? { shop: null, shop_name: row.shopName.trim() } : { shop: Number(row.shop) };
    return { ...store, description: descriptionOf(row), products };
  });
}
