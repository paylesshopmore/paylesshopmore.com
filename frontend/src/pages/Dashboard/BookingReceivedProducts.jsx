// src/pages/Dashboard/BookingReceivedProducts.jsx
//
// "PRODUCTS RECEIVED" on a booking in the office dashboard: per ordered
// product, how many the warehouse has counted in, e.g.
//
//   Stoel (Ikea)   5 besteld · 3 ontvangen · 2 nog verwacht   [Gedeeltelijk ontvangen]
//
// WHERE IT COMES FROM: `booking.received_products`, built on the server by
// warehouse/receipts.py booking_lines() - the very same rows the customer
// sees behind "Factuur bekijken", so the office and the customer never see
// different numbers. The warehouse fills the counts in on the intake sheet
// ("Ontvangen producten", IntakeProducts.jsx).
//
// Read-only here: counting is the warehouse's job.

import { Field, Group } from './sheet';
import { StatusBadge } from './ui';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

// The badge colour per status (the same four codes as the intake sheet).
const TONES = {
  received: 'done',
  partial: 'attention',
  not_received: 'neutral',
  unknown: 'off',
};

/** @param {{ products: object[] | undefined }} props */
export default function BookingReceivedProducts({ products }) {
  const d = usePageText('productReceipts');
  // An older server that does not send the field: show nothing.
  if (!products) return null;

  return (
    <Group title={d('title')}>
      <Field wide label={d('bookingIntro')}>
        {products.length === 0 ? (
          <span className={styles.mutedCell}>{d('noLines')}</span>
        ) : (
          <ul className={styles.receiptLines}>
            {products.map((product) => {
              const status = TONES[product.status] ? product.status : 'unknown';
              // Unknown: only the ordered number (when there is one), never
              // a made-up 0 received.
              let numbers = null;
              if (status !== 'unknown') {
                numbers = d('numbers', {
                  ordered: product.ordered,
                  received: product.received,
                  expected: product.expected,
                });
              } else if (product.ordered != null) {
                numbers = d('orderedOnly', { ordered: product.ordered });
              }
              return (
                <li key={product.id} className={styles.receiptLineSimple}>
                  <div className={styles.receiptLineMain}>
                    <strong>{product.name}</strong>
                    {product.store && <span className={styles.mutedCell}> · {product.store}</span>}
                    {numbers && <div className={styles.receiptLineNumbers}>{numbers}</div>}
                  </div>
                  <StatusBadge tone={TONES[status]}>{d(`status.${status}`)}</StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </Field>
    </Group>
  );
}
