// src/pages/Dashboard/ReceivedButton.jsx
//
// "Bestelling ontvangen" under a store order, and "Product ontvangen" under
// each product, on a booking in Dashboard -> Bookings.
//
// WHAT IT IS FOR: a customer often orders several things from one shop
// (bol.com) and they arrive separately. The admin presses
//   - "Bestelling ontvangen" when EVERYTHING from that shop is here, or
//   - "Product ontvangen" on one product when only that item is here.
// The customer then sees "Ontvangen in ons magazijn" on it (My bookings,
// and "Factuur bekijken" under My shipments).
//
// Once pressed it shows who did it and when, with "Ongedaan maken" to undo
// a mistake (after an "are you sure?").
//
// ONLY AN ADMIN sees the button. The server checks the same (staff/views.py
// BookingViewSet._mark_received) - hiding the button is only tidiness.
// Other office accounts see who confirmed it, nothing to press.

import { useContext, useState } from 'react';
import { markOrderReceived, markProductReceived } from '../../api/staff';
import { AuthContext } from '../../auth/context';
import { formatDateTime } from './format';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

/**
 * @param {object} props
 * @param {'order' | 'product'} props.kind  a whole store order, or one product
 * @param {number} props.bookingId
 * @param {object} props.row        the store order or product from the API
 * @param {(booking: object) => void} props.onChanged  gets the whole booking back
 */
export default function ReceivedButton({ kind, bookingId, row, onChanged }) {
  const d = usePageText('productReceipts');
  // Read directly (not useAuth, which throws without a signed-in session):
  // no account known means no button.
  const user = useContext(AuthContext)?.user;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const received = Boolean(row.received_at);
  const isAdmin = Boolean(user?.isAdmin);

  async function press(value) {
    // Undoing changes what the customer sees: ask first.
    if (!value && !window.confirm(d('confirmUndo'))) return;
    setBusy(true);
    setError('');
    try {
      const mark = kind === 'order' ? markOrderReceived : markProductReceived;
      onChanged(await mark(bookingId, row.id, value));
    } catch (problem) {
      // Say what the server really answered. A 403 is not always "not an
      // admin": it can also be an expired sign-in or a stale security token,
      // and then the server's own sentence (`detail`) tells which.
      const reason = problem?.fields?.detail;
      setError(typeof reason === 'string' && reason ? reason : d('markFailed'));
    } finally {
      setBusy(false);
    }
  }

  // Not received, and not an admin: nothing to show or press.
  if (!received && !isAdmin) return null;

  return (
    <div className={styles.receivedAction}>
      {received ? (
        <span className={styles.intakeHint}>
          {d(kind === 'order' ? 'orderReceivedBy' : 'productReceivedBy', {
            name: row.received_by_name || '—',
            when: formatDateTime(row.received_at),
          })}
        </span>
      ) : null}

      {isAdmin &&
        (received ? (
          <button type="button" className={styles.rowButton} disabled={busy} onClick={() => press(false)}>
            {d('undo')}
          </button>
        ) : (
          <button type="button" className={styles.intakeRelease} disabled={busy} onClick={() => press(true)}>
            {d(kind === 'order' ? 'markOrder' : 'markProduct')}
          </button>
        ))}

      {error && (
        <span className={styles.receivedError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
