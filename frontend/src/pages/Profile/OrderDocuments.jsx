// src/pages/Profile/OrderDocuments.jsx
//
// "+ Add document" under one store on the customer's booking pop-up: what the
// customer adds after the booking was sent, whenever they have it. The server
// checks every file the same way as the booking form's screenshot, and closes
// the booking to changes once it is shipped or cancelled.
//
// WHAT THE PANEL SHOWS
//   Two numbered rows, one per document the office needs, each with its own
//   "Add file" button:
//
//       1  Invoice                 Not added yet               [ Add file ]
//       2  Order confirmation      Added: bestelling.pdf       [ Replace file ]
//
//   Choosing a file uploads it straight away. When a file of that kind is
//   already there, the button says "Replace file": the new file is saved FIRST,
//   and only then is the old one removed - a failed upload never loses the old
//   file.
//
//   Under the rows, "Track & trace, order number or other file" opens the form
//   for everything else:
//     - the track-and-trace and the webshop's order number are the exceptions to
//       "a file": a code, a link or a number is something you copy, not a file
//       you have, so they are typed and saved on the store itself
//       (tracking_code, order_number). Both are optional.
//     - next to the track-and-trace box is the "Courier company" list (PostNL,
//       DHL, ...). With a courier chosen, the server also follows the parcel
//       automatically on its way to our warehouse (backend/tracking/); without
//       one, the code is only kept as text for the office.
//     - "Other" uploads any other file (a photo, a receipt, ...).

import { useEffect, useId, useState } from 'react';
import {
  addOrderDocument,
  removeBookingDocument,
  setOrderNumber as saveOrderNumber,
  setOrderTracking,
} from '../../api/booking';
import { getCarriers } from '../../api/tracking';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// The two documents the office needs, in the order they are shown. The titles
// come from profile.bookings.documents.kinds.<kind>.
const DOCUMENT_ROWS = ['invoice', 'order_confirmation'];

// What the "more" form can add: typed things, plus any other file.
const MORE_KINDS = ['order_number', 'tracking', 'other'];

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

/** The server's own reason for a refusal when it gave one, else `fallback`. */
function reasonFrom(caught, fallback) {
  const fields = caught?.fields ?? {};
  const reason =
    fields.file ?? fields.kind ?? fields.tracking_code ?? fields.order_number ?? fields.carrier ?? fields.detail;
  return reason ? String(Array.isArray(reason) ? reason[0] : reason) : fallback;
}

/**
 * One numbered row: the document's name, whether it is there, and the button
 * that picks a file. The button is a <label> around a visually hidden file
 * input, so it works with a mouse, a finger and the keyboard, and is announced
 * as "Add file: Invoice".
 */
function DocumentRow({ number, title, files, busy, error, labels, onPick }) {
  const hasFile = files.length > 0;
  const action = hasFile ? labels.replaceFile : labels.addFile;
  const inputId = useId();

  return (
    <li className={styles.docRow} data-done={hasFile}>
      <span className={styles.docRowNumber} aria-hidden="true">
        {number}
      </span>

      <div className={styles.docRowMain}>
        <p className={styles.docRowTitle}>{title}</p>
        {/* The file name once added; otherwise what may be added. */}
        <p className={styles.docRowMeta}>{hasFile ? files.map((file) => file.name).join(', ') : labels.hint}</p>
        {error && (
          <p className={styles.docRowError} role="alert">
            {error}
          </p>
        )}
      </div>

      <span className={styles.docRowStatus} data-done={hasFile}>
        {hasFile ? labels.added : labels.missing}
      </span>

      <label className={styles.docFileButton} data-secondary={hasFile} data-busy={busy} htmlFor={inputId}>
        {busy ? labels.uploading : action}
        <input
          id={inputId}
          className={styles.docFileInput}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          aria-label={`${action}: ${title}`}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            // Cleared, so choosing the same file again still counts as a change.
            event.target.value = '';
            if (chosen) onPick(chosen);
          }}
        />
      </label>
    </li>
  );
}

/**
 * @param {{ bookingId: number, order: object, onUpdated: (order: object) => void }} props
 *   onUpdated gets the store row as it reads after saving
 */
export default function AddOrderDocument({ bookingId, order, onUpdated }) {
  const { t } = useLanguage();
  const d = (key) => t(`profile.bookings.documents.${key}`);
  const [open, setOpen] = useState(false);

  // ---- the two rows ---------------------------------------------------------
  // Which row is uploading right now ('' for none), and each row's own error.
  const [rowBusy, setRowBusy] = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const documents = order.documents ?? [];

  /**
   * Upload `chosen` as `rowKind`, then (if there was one) remove the old file of
   * that kind. Step by step:
   *   1. save the new file - if this fails, nothing else happens;
   *   2. remove the old file(s) of the same kind (a failure here is ignored: the
   *      customer simply keeps both, nothing is lost);
   *   3. hand the updated store back, without the removed files.
   */
  async function uploadRow(rowKind, chosen) {
    setRowBusy(rowKind);
    setRowErrors((current) => ({ ...current, [rowKind]: '' }));
    try {
      let updated = await addOrderDocument(bookingId, order.id, { kind: rowKind, file: chosen });
      const oldIds = documents.filter((document) => document.kind === rowKind).map((document) => document.id);
      if (oldIds.length > 0) {
        await Promise.all(oldIds.map((id) => removeBookingDocument(bookingId, id).catch(() => null)));
        updated = {
          ...updated,
          documents: (updated.documents ?? []).filter((document) => !oldIds.includes(document.id)),
        };
      }
      onUpdated(updated);
    } catch (caught) {
      // The server's own reason (a refused file type, too big, too many).
      setRowErrors((current) => ({ ...current, [rowKind]: reasonFrom(caught, d('errors.failed')) }));
    } finally {
      setRowBusy('');
    }
  }

  // ---- the "more" form: track-and-trace, order number, other file -----------
  const [more, setMore] = useState(false);
  const [kind, setKind] = useState('');
  const [file, setFile] = useState(null);
  const [tracking, setTracking] = useState('');
  // The webshop's own order number (optional).
  const [orderNumber, setOrderNumber] = useState('');
  // The courier's code ("postnl"), or '' for none.
  const [carrier, setCarrier] = useState('');
  // The courier list from the server; null until it has loaded.
  const [carriers, setCarriers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isTracking = kind === 'tracking';
  const isOrderNumber = kind === 'order_number';

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

  function resetMore() {
    setMore(false);
    setKind('');
    setFile(null);
    setTracking('');
    setOrderNumber('');
    setCarrier('');
    setError('');
  }

  function closePanel() {
    resetMore();
    setRowErrors({});
    setOpen(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (!kind) return setError(d('errors.kind'));
    if (isTracking && !tracking.trim()) return setError(d('errors.tracking'));
    if (isOrderNumber && !orderNumber.trim()) return setError(d('errors.orderNumber'));
    if (!isTracking && !isOrderNumber && !file) return setError(d('errors.file'));

    setBusy(true);
    setError('');
    try {
      const updated = isTracking
        ? await setOrderTracking(bookingId, order.id, tracking.trim(), carrier)
        : isOrderNumber
          ? await saveOrderNumber(bookingId, order.id, orderNumber.trim())
          : await addOrderDocument(bookingId, order.id, { kind, file });
      onUpdated(updated);
      resetMore();
    } catch (caught) {
      setError(reasonFrom(caught, d('errors.failed')));
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

  const rowLabels = {
    addFile: d('addFile'),
    replaceFile: d('replaceFile'),
    uploading: d('uploading'),
    added: d('rowAdded'),
    missing: d('rowMissing'),
    hint: d('hint'),
  };
  const kindId = `doc-kind-${order.id}`;
  const fileId = `doc-file-${order.id}`;
  const trackingId = `doc-tracking-${order.id}`;
  const orderNumberId = `doc-order-number-${order.id}`;
  const carrierId = `doc-carrier-${order.id}`;

  return (
    <div className={styles.docPanel}>
      <div className={styles.docPanelHead}>
        <p className={styles.docPanelTitle}>{d('add')}</p>
        <button type="button" className={styles.linkButton} onClick={closePanel}>
          {d('done')}
        </button>
      </div>

      {/* The two documents, each with its own "Add file". */}
      <ol className={styles.docRows}>
        {DOCUMENT_ROWS.map((rowKind, index) => (
          <DocumentRow
            key={rowKind}
            number={index + 1}
            title={d(`kinds.${rowKind}`)}
            files={documents.filter((document) => document.kind === rowKind)}
            busy={rowBusy === rowKind}
            error={rowErrors[rowKind]}
            labels={rowLabels}
            onPick={(chosen) => uploadRow(rowKind, chosen)}
          />
        ))}
      </ol>

      {/* Everything that is not one of the two documents above. */}
      {!more ? (
        <button type="button" className={styles.docMore} onClick={() => setMore(true)}>
          {d('moreOptions')}
        </button>
      ) : (
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
                  if (next === 'order_number') setOrderNumber(order.order_number ?? '');
                }}
              >
                <option value="">{d('chooseKind')}</option>
                {MORE_KINDS.map((key) => (
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

            {isOrderNumber ? (
              // The webshop's own order number, typed or pasted - optional.
              <div className={styles.docField}>
                <label className={styles.label} htmlFor={orderNumberId}>
                  {d('orderNumberLabel')}
                </label>
                <input
                  id={orderNumberId}
                  className={styles.input}
                  type="text"
                  value={orderNumber}
                  maxLength={100}
                  autoComplete="off"
                  autoFocus
                  placeholder={d('orderNumberPlaceholder')}
                  aria-describedby={`${orderNumberId}-hint`}
                  onChange={(event) => {
                    setOrderNumber(event.target.value);
                    setError('');
                  }}
                />
                <span className={styles.docHint} id={`${orderNumberId}-hint`}>
                  {d('orderNumberHint')}
                </span>
              </div>
            ) : isTracking ? (
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
              {isTracking || isOrderNumber
                ? busy
                  ? d('saving')
                  : d('save')
                : busy
                  ? d('uploading')
                  : d('upload')}
            </button>
            <button type="button" className={styles.linkButton} onClick={resetMore}>
              {d('cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
