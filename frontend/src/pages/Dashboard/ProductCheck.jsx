// src/pages/Dashboard/ProductCheck.jsx
//
// The office's price check under one product of a booking (shown by
// OrderList on the Bookings page): open the product link, look at the price
// on the webshop, and write down what was found -
//
//   Verified webshop price   what the webshop says now
//   Status                   Not checked / Verified / Price changed /
//                            Product unavailable
//   Internal notes           for the office only; never sent to the customer
//
// The customer's own price stays as they gave it, shown beside the check,
// never replaced. Checked by hand: webshops do not all allow prices to be
// read automatically.

import { useState } from 'react';
import { PRODUCT_VERIFICATION, updateBookingProduct } from '../../api/staff';
import { formatDateTime } from './format';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

const TONES = {
  not_checked: 'none',
  verified: 'good',
  price_changed: 'warn',
  unavailable: 'bad',
};

/** The form's text of a stored price: '24.99', or ''. */
function asText(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * @param {{ product: object, onSaved: (product: object) => void }} props
 *   onSaved  called with the product as the server now has it
 */
export default function ProductCheck({ product, onSaved }) {
  const d = usePageText('bookings');
  const [price, setPrice] = useState(asText(product.verified_price_eur));
  const [status, setStatus] = useState(product.verification_status || 'not_checked');
  const [notes, setNotes] = useState(product.staff_notes || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const priceText = price.trim().replace(',', '.');
  const priceBad = priceText !== '' && !/^\d+(\.\d{1,2})?$/.test(priceText);
  const changed =
    priceText !== asText(product.verified_price_eur) ||
    status !== product.verification_status ||
    notes !== (product.staff_notes || '');

  // How the checked price compares with the customer's, said in a word.
  const customer = product.customer_price_eur === null ? null : Number(product.customer_price_eur);
  const difference =
    customer !== null && priceText !== '' && !priceBad ? Number(priceText) - customer : null;

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const saved = await updateBookingProduct(product.id, {
        verified_price_eur: priceText === '' ? null : priceText,
        verification_status: status,
        staff_notes: notes,
      });
      onSaved(saved);
      setMessage(d('productSaved'));
    } catch {
      setMessage(d('productSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.productCheck} data-tone={TONES[product.verification_status] ?? 'none'}>
      <div className={styles.productCheckGrid}>
        <label className={styles.productCheckField}>
          <span className={styles.productCheckLabel}>{d('verifiedPrice')}</span>
          <input
            className={styles.productCheckInput}
            inputMode="decimal"
            value={price}
            placeholder={asText(product.customer_price_eur) || '0.00'}
            aria-invalid={priceBad || undefined}
            onChange={(event) => setPrice(event.target.value)}
          />
          {priceBad && <span className={styles.productCheckBad}>{d('verifiedPriceBad')}</span>}
          {difference !== null && difference !== 0 && (
            <span className={styles.productCheckHint}>
              {d('priceDifference', { amount: `${difference > 0 ? '+' : ''}${difference.toFixed(2)}` })}
            </span>
          )}
        </label>
        <label className={styles.productCheckField}>
          <span className={styles.productCheckLabel}>{d('verificationStatus')}</span>
          <select
            className={styles.productCheckInput}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {PRODUCT_VERIFICATION.map((option) => (
              <option key={option.value} value={option.value}>
                {d(`verification.${option.value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.productCheckField} ${styles.productCheckWide}`}>
          <span className={styles.productCheckLabel}>{d('staffNotes')}</span>
          <textarea
            className={styles.productCheckInput}
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
      <div className={styles.productCheckActions}>
        <button
          type="button"
          className={styles.rowButton}
          disabled={busy || !changed || priceBad}
          onClick={save}
        >
          {busy ? d('productSaving') : d('productSave')}
        </button>
        {product.verified_at && (
          <span className={styles.productCheckHint}>
            {d('checkedBy', {
              name: product.verified_by_name || '—',
              when: formatDateTime(product.verified_at),
            })}
          </span>
        )}
        {message && <span className={styles.productCheckHint}>{message}</span>}
      </div>
    </div>
  );
}
