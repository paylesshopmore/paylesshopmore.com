// src/pages/Dashboard/IntakeProducts.jsx
//
// "Ontvangen producten" on an intake sheet: the warehouse counts how many of
// each ordered product were in THIS delivery, and confirms the count.
//
// WHY THIS EXISTS: the rest of the sheet records the delivery as boxes -
// how many colli, how big, how heavy. A box does not say which products are
// inside it. The customer's "Ontvangst in ons magazijn" overview needs to
// know "3 of the 5 chairs are here", and only somebody who opened the box can
// say that. A package scan alone never counts as a product being received.
//
// HOW IT WORKS:
//   1. Load the sheet's order lines: GET /api/staff/intake/<id>/products/.
//      Each line has `ordered`, `counted_here` (this delivery, or null when
//      not counted yet) and `counted_elsewhere` (the order's other deliveries).
//   2. The worker types a number per product and presses "Telling bevestigen".
//   3. PUT the counts. The server checks every product belongs to THIS
//      sheet's order, saves them, keeps a history of every change, and sends
//      back the new totals, which replace what is on screen.
//   4. A wrong count is corrected the same way: change the number, confirm.
//
// The totals and statuses come from the server (backend warehouse/receipts.py)
// so this box and the customer's page always say the same thing.
//
// Outside the sheet's main <fieldset>: counts can still be confirmed or
// corrected after the sheet was released to the office, because boxes are
// often opened later. Only an archived sheet is closed.
//
// Who can use it: everybody who can open intake sheets (warehouse workers,
// warehouse managers, the office). The server refuses anybody else.

import { useEffect, useState } from 'react';
import { getIntakeProducts, saveIntakeProducts } from '../../api/staff';
import { formatDateTime } from './format';
import { Banner, StatusBadge } from './ui';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

// The badge colour per status (the same four codes the customer sees).
const TONES = {
  received: 'done',
  partial: 'attention',
  not_received: 'neutral',
  unknown: 'off',
};

/** The inputs start as the saved counts, as text ('' when not counted). */
function toInputs(lines) {
  const inputs = {};
  for (const line of lines) {
    inputs[line.product] = line.counted_here == null ? '' : String(line.counted_here);
  }
  return inputs;
}

/**
 * @param {{ sheetId: number, archived: boolean, linked: boolean }} props
 *   linked    the sheet has a booking or shipment - otherwise nothing to count
 *   archived  a manager archived the sheet: show, do not change
 */
export default function IntakeProducts({ sheetId, archived, linked }) {
  const d = usePageText('productReceipts');
  const [data, setData] = useState(null);
  // What is typed in each box, by order line id: { 12: '3', 13: '' }.
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // 1. Load the order lines of this sheet's booking.
  useEffect(() => {
    if (!linked) return undefined;
    let live = true;
    getIntakeProducts(sheetId)
      .then((result) => {
        if (!live) return;
        setData(result);
        setInputs(toInputs(result.lines));
      })
      .catch(() => {
        if (live) setError(d('loadFailed'));
      });
    return () => {
      live = false;
    };
  }, [sheetId, linked, d]);

  if (!linked) {
    return (
      <div className={styles.intakeSection}>
        <p className={styles.intakeSectionHead}>{d('title')}</p>
        <p className={styles.intakeHint}>{d('noBooking')}</p>
      </div>
    );
  }

  // 3. Send every box that has a number in it. An empty box is "not
  //    counted yet" and is left out, so it is not saved as 0 by accident.
  async function confirm() {
    const counts = [];
    for (const [product, value] of Object.entries(inputs)) {
      if (value === '') continue;
      counts.push({ product: Number(product), quantity: Number(value) });
    }
    if (counts.length === 0) {
      setError(d('nothingToSave'));
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const result = await saveIntakeProducts(sheetId, counts);
      setData(result);
      setInputs(toInputs(result.lines));
      setNote(d('saved'));
    } catch (problem) {
      // The server's own sentence when it refused a count, else a general one.
      setError(problem?.fields?.counts?.[0] ?? d('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const lines = data?.lines ?? [];

  return (
    <div className={styles.intakeSection}>
      <p className={styles.intakeSectionHead}>{d('title')}</p>
      <p className={styles.intakeHint}>{d('intro')}</p>
      {archived && <Banner tone="info">{d('archived')}</Banner>}
      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{note}</Banner>

      {/* Linked to a shipment that was not made from a booking: no order
          lines exist. Linked to an older booking: no product lines. */}
      {data && data.booking == null && <p className={styles.intakeHint}>{d('noBooking')}</p>}
      {data && data.booking != null && lines.length === 0 && (
        <p className={styles.intakeHint}>{d('noProducts')}</p>
      )}

      {lines.length > 0 && (
        <ul className={styles.receiptLines}>
          {lines.map((line) => (
            <li key={line.product} className={styles.receiptLine}>
              <div className={styles.receiptLineMain}>
                <strong>{line.name}</strong>
                {line.store && <span className={styles.intakeHint}> · {line.store}</span>}
                <div className={styles.receiptLineNumbers}>
                  <span>
                    {d('ordered')}: <b>{line.ordered}</b>
                  </span>
                  <span>
                    {d('otherDeliveries')}: <b>{line.counted_elsewhere}</b>
                  </span>
                  <span>
                    {d('total')}: <b>{line.received}</b>
                  </span>
                </div>
                {line.confirmed_by && (
                  <span className={styles.intakeHint}>
                    {d('confirmedBy', { name: line.confirmed_by, when: formatDateTime(line.confirmed_at) })}
                  </span>
                )}
              </div>
              <label className={styles.receiptLineCount}>
                <span className={styles.intakeLabel}>{d('thisDelivery')}</span>
                <input
                  className={styles.intakeInput}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="9999"
                  step="1"
                  placeholder={d('notCounted')}
                  aria-label={d('countFor', { name: line.name })}
                  value={inputs[line.product] ?? ''}
                  disabled={archived || busy}
                  onChange={(event) => {
                    // Whole numbers only: "3", not "3.5" or "-1".
                    const value = event.target.value.replace(/[^0-9]/g, '');
                    setInputs((current) => ({ ...current, [line.product]: value }));
                    setNote('');
                  }}
                />
              </label>
              <StatusBadge tone={TONES[line.status] ?? 'neutral'}>
                {d(`status.${line.status}`)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && !archived && (
        <div className={styles.intakeActions}>
          <button type="button" className={styles.intakeRelease} disabled={busy} onClick={confirm}>
            {busy ? d('saving') : d('confirm')}
          </button>
        </div>
      )}
    </div>
  );
}
