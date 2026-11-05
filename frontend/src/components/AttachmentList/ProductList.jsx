// src/components/AttachmentList/ProductList.jsx
//
// The products under one store on a booking, read back: what it is, the
// link to it on the webshop (opens in a new tab, and a Copy button next to
// it), the price the customer gave, how many, the subtotal, and the
// product's screenshot when there is one. Shown by OrderList, so the
// customer's booking pop-up and the office's booking list read the same.
//
// The office passes `renderExtra` to put its price check under each product
// (src/pages/Dashboard/ProductCheck.jsx). The customer's API answer has no
// checked price or notes in it at all, so there is nothing to hide here.

import { useContext, useState } from 'react';
import { LanguageContext } from '../../i18n/context';
import AttachmentList from './AttachmentList';
import styles from './AttachmentList.module.css';

// The words when no language is around (and the keys under
// profile.bookings.products in the site's translations).
const DEFAULT_LABELS = {
  link: 'Product link',
  open: 'Open',
  copy: 'Copy link',
  copied: 'Copied',
  price: 'Price',
  quantity: 'Qty',
  subtotal: 'Subtotal',
  total: 'Subtotal',
  noLink: 'No link given',
};

/**
 * Only secure https:// addresses become links. The server refuses anything
 * else, and this checks again: a "javascript:" link must never be clickable,
 * and the office is never sent to an unencrypted page.
 */
function isWebLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** "€ 19,99", or '—' without an amount. */
function euros(value, language) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' }).format(Number(value));
}

/** Copies a link, with a fallback for browsers without the clipboard API. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    let done;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    box.remove();
    return done;
  }
}

function ProductLink({ url, labels }) {
  const [copied, setCopied] = useState(false);
  if (!url) return <span className={styles.productMuted}>{labels.noLink}</span>;
  if (!isWebLink(url)) return <span className={styles.docCode}>{url}</span>;

  return (
    <span className={styles.productLink}>
      <a className={styles.docLink} href={url} target="_blank" rel="noopener noreferrer nofollow">
        {url}
      </a>
      <button
        type="button"
        className={styles.productCopy}
        onClick={async () => {
          if (await copyText(url)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }
        }}
      >
        {copied ? labels.copied : labels.copy}
      </button>
    </span>
  );
}

/**
 * @param {object} props
 * @param {object} props.order a store row from the API, with `products`
 * @param {object} [props.labels] the words, see DEFAULT_LABELS
 * @param {string} [props.language] for the euro amounts
 * @param {(name: string) => string} [props.openLabel] see AttachmentList
 * @param {(product: object, order: object) => import('react').ReactNode} [props.renderExtra]
 */
export default function ProductList({ order, labels: given, language: chosen, openLabel, renderExtra }) {
  // The site's language when there is one; the office passes its own words.
  const site = useContext(LanguageContext);
  const products = order.products ?? [];
  if (products.length === 0) return null;
  const translated = {};
  if (site?.t) {
    for (const key of Object.keys(DEFAULT_LABELS)) {
      const path = `profile.bookings.products.${key}`;
      const word = site.t(path);
      if (word && word !== path) translated[key] = word;
    }
  }
  const labels = { ...DEFAULT_LABELS, ...translated, ...given };
  const language = chosen ?? site?.language ?? 'nl';

  return (
    <div className={styles.products}>
      <ul className={styles.productRows}>
        {products.map((product) => (
          <li key={product.id} className={styles.productRow}>
            <div className={styles.productMain}>
              <span className={styles.productName}>{product.description}</span>
              <ProductLink url={product.url} labels={labels} />
              {/* The booking form no longer asks for a price or a
                  quantity; bookings sent while it did still show them. */}
              {product.customer_price_eur != null && (
                <span className={styles.productFigures}>
                  <span>
                    {labels.price}: {euros(product.customer_price_eur, language)}
                  </span>
                  <span>
                    {labels.quantity}: {product.quantity}
                  </span>
                  <strong>
                    {labels.subtotal}: {euros(product.customer_subtotal_eur, language)}
                  </strong>
                </span>
              )}
            </div>
            {product.screenshot && (
              <span className={styles.orderShot}>
                <AttachmentList attachments={[product.screenshot]} openLabel={openLabel} />
              </span>
            )}
            {renderExtra && <div className={styles.productExtra}>{renderExtra(product, order)}</div>}
          </li>
        ))}
      </ul>
      {order.products_subtotal_eur && (
        <p className={styles.productTotal}>
          {labels.total}: {euros(order.products_subtotal_eur, language)}
        </p>
      )}
    </div>
  );
}
