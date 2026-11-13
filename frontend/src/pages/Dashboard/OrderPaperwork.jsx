// src/pages/Dashboard/OrderPaperwork.jsx
//
// The paperwork of ONE store order on a booking (Dashboard -> Bookings), shown
// under the store's name. It replaces the old per-product price check.
//
//   Factuur         the invoice the customer added for this order - a link to
//                   open it - or "Ontbreekt" (missing) with a button
//                   "Factuur opvragen" that asks the customer to add it
//   Ordernummer     the webshop's own order number (optional)
//   Track & trace   the code or link of the webshop's parcel (optional)
//
// WHERE IT COMES FROM
//   All three are typed or uploaded by the CUSTOMER, on "My bookings" (the
//   "+ Add document" button under each store). Nothing here is edited by the
//   office; the page only shows what is there.
//
// THE BUTTON
//   "Factuur opvragen" sends the customer a notification and an e-mail (in
//   their language) saying the invoice of this store order is missing, with a
//   link to their booking. The server decides whether it may go out: not when
//   the invoice is already there, not when the customer was asked in the last
//   24 hours, not for a booking without an account or one that is shipped or
//   cancelled. Whatever it refuses with is shown as it is written. Any office
//   account may press it.

import { useState } from 'react';
import { attachmentUrl } from '../../api/booking';
import { requestOrderInvoice } from '../../api/staff';
import { formatDateTime } from './format';
import { Chip } from './sheet';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

// A booking in these statuses is a record: the customer can no longer add
// documents, so asking for one would be pointless.
const CLOSED = ['shipped', 'cancelled'];

/** Only https:// and http:// text becomes a link. "javascript:" never does. */
function isWebLink(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * @param {object} props
 * @param {object} props.booking   the booking, as the staff API sends it
 * @param {object} props.order     one store order of that booking
 * @param {(booking: object) => void} props.onChanged  gets the whole booking back
 */
export default function OrderPaperwork({ booking, order, onChanged }) {
  const d = usePageText('bookings');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invoices = (order.documents ?? []).filter((document) => document.kind === 'invoice');
  const hasInvoice = invoices.length > 0;
  const hasAccount = Boolean(booking.account);
  const closed = CLOSED.includes(booking.status);

  async function ask() {
    setBusy(true);
    setError('');
    try {
      onChanged(await requestOrderInvoice(booking.id, order.id));
    } catch (problem) {
      // The server's own sentence when it refused (already asked today, ...).
      const reason = problem?.fields?.detail;
      setError(Array.isArray(reason) ? reason[0] : typeof reason === 'string' ? reason : d('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.paperwork}>
      <dl className={styles.paperworkList}>
        {/* The invoice: the customer's file, or a way to ask for it. */}
        <div>
          <dt>{d('paperInvoice')}</dt>
          <dd>
            {hasInvoice ? (
              <ul className={styles.paperworkFiles}>
                {invoices.map((document) => (
                  <li key={document.id}>
                    <a
                      className={styles.link}
                      href={attachmentUrl(document.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {document.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Chip tone="bad">{d('invoiceMissing')}</Chip>
            )}
          </dd>
        </div>

        <div>
          <dt>
            {d('paperOrderNumber')} <span className={styles.mutedCell}>{d('optional')}</span>
          </dt>
          {/* Plain text: the customer typed it. */}
          <dd>{order.order_number || <span className={styles.mutedCell}>{d('paperNotGiven')}</span>}</dd>
        </div>

        <div>
          <dt>
            {d('paperTracking')} <span className={styles.mutedCell}>{d('optional')}</span>
          </dt>
          <dd>
            {order.tracking_code ? (
              isWebLink(order.tracking_code) ? (
                <a className={styles.link} href={order.tracking_code} target="_blank" rel="noopener noreferrer">
                  {order.tracking_code}
                </a>
              ) : (
                order.tracking_code
              )
            ) : (
              <span className={styles.mutedCell}>{d('paperNotGiven')}</span>
            )}
          </dd>
        </div>
      </dl>

      {/* No invoice yet: ask for it. */}
      {!hasInvoice && (
        <div className={styles.paperworkAction}>
          {hasAccount && !closed ? (
            <>
              <button type="button" className={styles.intakeRelease} disabled={busy} onClick={ask}>
                {busy ? d('requestSending') : d('requestInvoice')}
              </button>
              <span className={styles.mutedCell}>{d('requestHint')}</span>
            </>
          ) : (
            <span className={styles.mutedCell}>{hasAccount ? d('closedNoRequest') : d('paperNoAccount')}</span>
          )}
          {order.invoice_requested_at && (
            <span className={styles.mutedCell}>
              {d('invoiceRequested', {
                when: formatDateTime(order.invoice_requested_at),
                name: order.invoice_requested_by_name || '—',
              })}
            </span>
          )}
          {error && (
            <span className={styles.receivedError} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
