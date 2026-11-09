// src/pages/Profile/OrderDocuments.jsx
//
// "Add document" under one store on the customer's booking pop-up: the
// order confirmation, the invoice, the track-and-trace - added after the
// booking was sent, whenever the customer has them. The server checks the
// file the same way as the booking form's screenshot, and closes the booking
// to changes once it is shipped or cancelled.
//
// Track-and-trace is the exception: a code or a link is something you copy,
// not a file you have, so choosing it swaps the file picker for a text box
// and saves it on the store itself (tracking_code).
//
// Next to that box is the "Courier company" list (PostNL, DHL, ...). With a
// courier chosen, the server also follows the parcel automatically on its way
// to our warehouse (backend/tracking/); without one, the code is only kept as
// text for the office, as before.

import { useEffect, useRef, useState } from 'react';
import { addOrderDocument, setOrderTracking } from '../../api/booking';
import { getCarriers } from '../../api/tracking';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// What a customer can add; the server accepts the same four.
const DOCUMENT_KINDS = ['order_confirmation', 'invoice', 'tracking', 'other'];
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/**
 * @param {{ bookingId: number, order: object, onUpdated: (order: object) => void }} props
 *   onUpdated gets the store row as it reads after saving
 */
export default function AddOrderDocument({ bookingId, order, onUpdated }) {
  const { t } = useLanguage();
  const d = (key) => t(`profile.bookings.documents.${key}`);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('');
  const [file, setFile] = useState(null);
  const [tracking, setTracking] = useState('');
  // The courier's code ("postnl"), or '' for none.
  const [carrier, setCarrier] = useState('');
  // The courier list from the server; null until it has loaded.
  const [carriers, setCarriers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const isTracking = kind === 'tracking';

  // Load the courier list the first time the tracking box is shown. If it
  // fails, the box still works: the code is then saved as text only.
  useEffect(() => {
    if (!isTracking || carriers !== null) return undefined;
    let cancelled = false;
    getCarriers().then(
      (list) => !cancelled && setCarriers(list),
      () => !cancelled && setCarriers([]),
    );
    return () => {
      cancelled = true;
    };
  }, [isTracking, carriers]);

  function reset() {
    setKind('');
    setFile(null);
    setTracking('');
    setCarrier('');
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event) {
    event.preventDefault();
    if (!kind) return setError(d('errors.kind'));
    if (isTracking && !tracking.trim()) return setError(d('errors.tracking'));
    if (!isTracking && !file) return setError(d('errors.file'));

    setBusy(true);
    setError('');
    try {
      const updated = isTracking
        ? await setOrderTracking(bookingId, order.id, tracking.trim(), carrier)
        : await addOrderDocument(bookingId, order.id, { kind, file });
      onUpdated(updated);
      reset();
      setOpen(false);
    } catch (caught) {
      // The server's own reason when it gave one (a refused file type, too
      // big, too many, too long) - it is written for the person filling it in.
      const fields = caught?.fields ?? {};
      const reason =
        fields.file ?? fields.kind ?? fields.tracking_code ?? fields.carrier ?? fields.detail;
      setError(reason ? String(Array.isArray(reason) ? reason[0] : reason) : d('errors.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.docAdd} onClick={() => setOpen(true)}>
        + {d('add')}
      </button>
    );
  }

  const kindId = `doc-kind-${order.id}`;
  const fileId = `doc-file-${order.id}`;
  const trackingId = `doc-tracking-${order.id}`;
  const carrierId = `doc-carrier-${order.id}`;

  return (
    <form className={styles.docForm} onSubmit={submit} noValidate>
      <div className={styles.docFields}>
        <label className={styles.docField} htmlFor={kindId}>
          <span className={styles.label}>{d('kind')}</span>
          <select
            id={kindId}
            className={styles.input}
            value={kind}
            onChange={(event) => {
              const next = event.target.value;
              setKind(next);
              setError('');
              // Start from what is saved, so a code can be corrected.
              if (next === 'tracking') {
                setTracking(order.tracking_code ?? '');
                setCarrier(order.carrier_tracking?.carrier?.code ?? '');
              }
            }}
          >
            <option value="">{d('chooseKind')}</option>
            {DOCUMENT_KINDS.map((key) => (
              <option key={key} value={key}>
                {d(`kinds.${key}`)}
              </option>
            ))}
          </select>
        </label>

        {isTracking && (
          // Which courier brings it: lets the server follow the parcel.
          <div className={styles.docField}>
            <label className={styles.label} htmlFor={carrierId}>
              {t('courier.carrierLabel')}
            </label>
            <select
              id={carrierId}
              className={styles.input}
              value={carrier}
              aria-describedby={`${carrierId}-hint`}
              onChange={(event) => {
                setCarrier(event.target.value);
                setError('');
              }}
            >
              <option value="">{t('courier.carrierPlaceholder')}</option>
              {(carriers ?? []).map((option) => (
                <option key={option.code} value={option.code}>
                  {/* "Other" in the customer's own language. */}
                  {option.code === 'other' ? t('courier.otherCarrier') : option.name}
                </option>
              ))}
            </select>
            <span className={styles.docHint} id={`${carrierId}-hint`}>
              {t('courier.carrierHint')}
            </span>
          </div>
        )}

        {isTracking ? (
          // A code or a link, typed or pasted - not a file.
          <div className={styles.docField}>
            <label className={styles.label} htmlFor={trackingId}>
              {d('trackingLabel')}
            </label>
            <input
              id={trackingId}
              className={styles.input}
              type="text"
              value={tracking}
              maxLength={255}
              autoComplete="off"
              autoFocus
              placeholder={d('trackingPlaceholder')}
              aria-describedby={`${trackingId}-hint`}
              onChange={(event) => {
                setTracking(event.target.value);
                setError('');
              }}
            />
            <span className={styles.docHint} id={`${trackingId}-hint`}>
              {d('trackingHint')}
            </span>
          </div>
        ) : (
          // A div with a label for the name only: inside the label, the hint
          // would be read out as part of the field's name.
          <div className={styles.docField}>
            <label className={styles.label} htmlFor={fileId}>
              {d('file')}
            </label>
            <input
              id={fileId}
              ref={fileInput}
              className={styles.docFile}
              type="file"
              accept={ACCEPT}
              aria-describedby={`${fileId}-hint`}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError('');
              }}
            />
            <span className={styles.docHint} id={`${fileId}-hint`}>
              {d('hint')}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className={styles.failure} role="alert">
          {error}
        </p>
      )}

      <div className={styles.docActions}>
        <button type="submit" className={styles.submit} disabled={busy}>
          {isTracking
            ? busy
              ? d('saving')
              : d('save')
            : busy
              ? d('uploading')
              : d('upload')}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          {d('cancel')}
        </button>
      </div>
    </form>
  );
}
