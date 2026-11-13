// src/pages/Dashboard/OrderPaperwork.jsx
//
// The paperwork of ONE store order on a booking (Dashboard -> Bookings), shown
// under the store's name.
//
//   Invoice               the invoice the customer added - a link to open it - or
//                         "Missing" with a "Request invoice" button
//   Order confirmation    the webshop's order confirmation. The CUSTOMER has to
//                         send it (on "My bookings"), so there is no request
//                         button here:
//                           Missing    the customer has not sent it yet
//                           Uploaded   "View Order Confirmation" opens it, with
//                                      the upload date
//   Track & trace         the code or link of the webshop's parcel (optional)
//
// WHERE IT COMES FROM
//   Everything is uploaded or typed by the CUSTOMER, on "My bookings" (the
//   "+ Add document" button under each store). The status of the confirmation
//   is never stored as a word: it is worked out from what exists (a document
//   -> Uploaded, else Missing), so it can never disagree with the documents.
//
// THE "REQUEST INVOICE" BUTTON
//   Sends the customer a notification and an e-mail (in their language) with a
//   link to their booking, and records when and by whom. The server decides
//   whether it may go out: not when the invoice is already there, not when the
//   customer was asked in the last 24 hours, not for a booking without an
//   account or one that is shipped or cancelled. Whatever it refuses with is
//   shown as written. Any office account may press it.

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

// The chip colour of each order-confirmation status. Missing is red like the
// invoice's; Uploaded is green.
const STATUS_TONE = { missing: 'bad', uploaded: 'good' };

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
 * The state of one "request" button: is it sending, and what went wrong.
 * Used twice (invoice, order confirmation), so the two behave identically.
 *
 * @param {() => Promise<object>} send  the API call; answers the whole booking
 * @param {(booking: object) => void} onChanged  gets that booking
 * @param {string} failedText  shown when the server gave no reason
 */
function useRequest(send, onChanged, failedText) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    setBusy(true);
    setError('');
    try {
      onChanged(await send());
    } catch (problem) {
      // The server's own sentence when it refused (already asked today, ...).
      const reason = problem?.fields?.detail;
      setError(Array.isArray(reason) ? reason[0] : typeof reason === 'string' ? reason : failedText);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, ask };
}

/** The customer's files, each a link that opens in a new tab. */
function FileLinks({ files }) {
  return (
    <ul className={styles.paperworkFiles}>
      {files.map((document) => (
        <li key={document.id}>
          <a className={styles.link} href={attachmentUrl(document.url)} target="_blank" rel="noopener noreferrer">
            {document.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The "ask the customer" part of one document: the button, a line saying what it
 * does, who asked and when, and any error. The same piece for the invoice and
 * the order confirmation, so the two always look and behave alike.
 *
 * @param {boolean} canAsk       the customer can be asked at all
 * @param {string} unavailable   what to say when they cannot
 * @param {string} label         the button's text
 * @param {string} busyLabel     the button's text while sending
 * @param {string} hint          one line saying what the button does
 * @param {string} [history]     "Asked on ... by ..." once it has been asked
 * @param {{busy: boolean, error: string, ask: () => void}} request  see useRequest
 */
function RequestAction({ canAsk, unavailable, label, busyLabel, hint, history, request }) {
  return (
    <div className={styles.paperworkAction}>
      {canAsk ? (
        <>
          <button type="button" className={styles.paperworkButton} disabled={request.busy} onClick={request.ask}>
            {request.busy ? busyLabel : label}
          </button>
          <p className={styles.paperworkHint}>{hint}</p>
        </>
      ) : (
        <p className={styles.paperworkHint}>{unavailable}</p>
      )}
      {history && <p className={styles.paperworkHistory}>{history}</p>}
      {request.error && (
        <p className={styles.receivedError} role="alert">
          {request.error}
        </p>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.booking   the booking, as the staff API sends it
 * @param {object} props.order     one store order of that booking
 * @param {(booking: object) => void} props.onChanged  gets the whole booking back
 */
export default function OrderPaperwork({ booking, order, onChanged }) {
  const d = usePageText('bookings');
  const failed = d('requestFailed');
  const invoiceRequest = useRequest(() => requestOrderInvoice(booking.id, order.id), onChanged, failed);

  const documents = order.documents ?? [];
  const invoices = documents.filter((document) => document.kind === 'invoice');
  const confirmations = documents.filter((document) => document.kind === 'order_confirmation');
  const hasInvoice = invoices.length > 0;
  const hasAccount = Boolean(booking.account);
  const closed = CLOSED.includes(booking.status);
  // Can the customer be asked at all? (The server checks the rest.)
  const canAsk = hasAccount && !closed;

  // The order confirmation's status, worked out from what exists.
  const confirmationStatus = confirmations.length > 0 ? 'uploaded' : 'missing';
  // The latest upload's date, for "Uploaded on ...".
  const uploadedAt = confirmations.length > 0 ? confirmations[confirmations.length - 1].created_at : null;

  return (
    <div className={styles.paperwork}>
      {/* Three cards side by side (stacked on a phone). Each document keeps its
          status, its button and its history together. */}
      <dl className={styles.paperworkList}>
        {/* 1. The invoice: the customer's file, or a way to ask for it. */}
        <div className={styles.paperworkItem}>
          <dt>{d('paperInvoice')}</dt>
          <dd>
            {hasInvoice ? <FileLinks files={invoices} /> : <Chip tone="bad">{d('invoiceMissing')}</Chip>}
            {!hasInvoice && (
              <RequestAction
                canAsk={canAsk}
                unavailable={hasAccount ? d('closedNoRequest') : d('paperNoAccount')}
                label={d('requestInvoice')}
                busyLabel={d('requestSending')}
                hint={d('requestHint')}
                history={
                  order.invoice_requested_at
                    ? d('invoiceRequested', {
                        when: formatDateTime(order.invoice_requested_at),
                        name: order.invoice_requested_by_name || '—',
                      })
                    : ''
                }
                request={invoiceRequest}
              />
            )}
          </dd>
        </div>

        {/* 2. The webshop's order confirmation, with its status. The customer has
            to send it, so there is nothing to request. */}
        <div className={styles.paperworkItem}>
          <dt>{d('paperConfirmation')}</dt>
          <dd>
            <Chip tone={STATUS_TONE[confirmationStatus]}>{d(`status_${confirmationStatus}`)}</Chip>
            {confirmationStatus === 'uploaded' ? (
              <div className={styles.paperworkUploaded}>
                {confirmations.map((document) => (
                  <a
                    key={document.id}
                    className={styles.bkAction}
                    href={attachmentUrl(document.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={document.name}
                  >
                    {d('viewConfirmation')}
                  </a>
                ))}
                {uploadedAt && (
                  <span className={styles.paperworkHistory}>{d('uploadedOn', { when: formatDateTime(uploadedAt) })}</span>
                )}
              </div>
            ) : (
              <p className={styles.paperworkHint}>{d('confirmationFromCustomer')}</p>
            )}
          </dd>
        </div>

        {/* 3. The track-and-trace (optional). */}
        <div className={styles.paperworkItem}>
          <dt>
            {d('paperTracking')}
            <span className={styles.paperworkOptional}>{d('optional')}</span>
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
    </div>
  );
}
