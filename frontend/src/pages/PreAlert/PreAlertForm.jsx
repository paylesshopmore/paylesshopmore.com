// src/pages/PreAlert/PreAlertForm.jsx
//
// "Pre-alert a package": the customer tells us a parcel is on its way to our
// warehouse, so we recognise it when it arrives and can process it quickly.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /prealert
//   Who can open: signed-in customers
//   Links to:     /profile#shipments (after sending), /terms, /faq
//   Linked from:  Profile -> My shipments and My bookings ("Pre-alert a package")
//   Backend:      api/prealerts.js (backend/prealerts/)
//
// HOW IT WORKS
//   - The courier, shop and address lists load when the page opens. If one
//     fails, the form still works: the shop can be typed, the address left out.
//   - The browser checks the obvious (required boxes, the tick, file types and
//     sizes) so mistakes show at once; the server checks everything again and
//     its answer is shown next to the field it is about.
//   - Sending is one request. The page only says "registered" once the server
//     has saved it, and the button is locked while it is sending, so a double
//     click cannot send it twice (the server refuses a second one anyway).
//   - Values typed stay in the form when the server refuses something.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPrealert, readPrealertScreenshot } from '../../api/prealerts';
import { listShops } from '../../api/shops';
import { getCarriers } from '../../api/tracking';
import { useAuth } from '../../auth/useAuth';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import profile from '../Profile/Profile.module.css';
import styles from './PreAlertForm.module.css';

// The same rules as the server (backend/bookings/serializers.py,
// validate_attachment): these types, this size, this many.
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_DESCRIPTION = 500;
const OTHER_SHOP = 'other';

/** The extension of a file name, lower case: "Factuur.PDF" -> "pdf". */
function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The server's message for one field, as text. */
function serverMessage(fields, key) {
  const value = fields?.[key];
  if (!value) return null;
  return Array.isArray(value) ? String(value[0]) : String(value);
}

export default function PreAlertForm() {
  const { t } = useLanguage();
  const p = (key, values) => fill(t(`prealert.${key}`), values);
  const { user } = useAuth();
  const navigate = useNavigate();
  // ?number=3SABC1234567: sent here from the Track & Trace box with a
  // courier number we did not know yet, so it is already filled in.
  const [searchParams] = useSearchParams();

  // The lists the form chooses from.
  const [carriers, setCarriers] = useState([]);
  const [shops, setShops] = useState([]);

  const [form, setForm] = useState({
    trackingNumber: (searchParams.get('number') ?? '').slice(0, 255),
    carrier: '',
    shop: '',
    shopName: '',
    description: '',
    consigneeName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
    restrictedConfirmed: false,
  });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Each list on its own: one failing must not empty the others.
    getCarriers().then((list) => !cancelled && setCarriers(list.filter((c) => c.trackable)), () => {});
    listShops().then((list) => !cancelled && setShops(list), () => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    // Editing a field clears its message.
    setErrors((current) => ({ ...current, [field]: null }));
  };

  /** Add chosen files, refusing the ones the server would refuse anyway. */
  function addFiles(event) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ''; // so choosing the same file again still fires
    const problems = [];
    const accepted = [];
    for (const file of chosen) {
      if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
        problems.push(p('errors.fileType', { name: file.name }));
      } else if (file.size > MAX_FILE_BYTES) {
        problems.push(p('errors.fileSize', { name: file.name }));
      } else {
        accepted.push(file);
      }
    }
    const next = [...files, ...accepted];
    if (next.length > MAX_FILES) problems.push(p('errors.fileCount', { count: MAX_FILES }));
    setFiles(next.slice(0, MAX_FILES));
    setErrors((current) => ({ ...current, files: problems.join(' ') || null }));
  }

  // "Fill it in from a screenshot": 'idle' | 'reading' | 'done' | 'nothing' | 'failed'.
  const [readState, setReadState] = useState('idle');

  /**
   * Reads a screenshot of the order or shipping e-mail with AI (backend
   * prealerts/reading.py) and puts what it found in the form. Only empty
   * boxes are filled: anything the customer already typed stays. The
   * screenshot is also added to the documents, as proof of the order.
   * Nothing is sent until the customer presses Send.
   */
  async function readScreenshot(event) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = ''; // so choosing the same file again still fires
    if (!file) return;
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name)) || file.size > MAX_FILE_BYTES) {
      setReadState('failed');
      return;
    }

    setReadState('reading');
    try {
      const found = await readPrealertScreenshot(file);
      // A shop id only counts if it is one in our list (else "Other").
      const shop = found.shop && shops.some((item) => item.id === found.shop) ? String(found.shop) : '';
      const carrier = carriers.some((item) => item.code === found.carrier) ? found.carrier : '';
      const suggestions = {
        trackingNumber: found.tracking_number ?? '',
        carrier,
        shop: shop || (found.shop_name ? OTHER_SHOP : ''),
        shopName: shop ? '' : found.shop_name ?? '',
        description: (found.description ?? '').slice(0, MAX_DESCRIPTION),
      };
      const useful = Object.values(suggestions).some(Boolean);
      setForm((current) => {
        const next = { ...current };
        for (const [field, value] of Object.entries(suggestions)) {
          if (value && !String(current[field]).trim()) next[field] = value;
        }
        // The shop name belongs with "Other": only set together.
        if (next.shop !== OTHER_SHOP) next.shopName = current.shopName;
        return next;
      });
      setErrors((current) => ({ ...current, trackingNumber: null, carrier: null, shop: null, description: null }));
      if (useful) setFiles((current) => (current.length < MAX_FILES ? [...current, file] : current));
      setReadState(useful ? 'done' : 'nothing');
    } catch {
      setReadState('failed');
    }
  }

  /** What the browser can tell before sending: keys of `prealert.errors`. */
  function check() {
    const found = {};
    if (!form.trackingNumber.trim()) found.trackingNumber = p('errors.trackingNumber');
    if (!form.carrier) found.carrier = p('errors.carrier');
    if (!form.shop || (form.shop === OTHER_SHOP && !form.shopName.trim())) found.shop = p('errors.shop');
    if (!form.description.trim()) found.description = p('errors.description');
    if (!form.consigneeName.trim()) found.consigneeName = p('errors.consignee');
    if (!form.restrictedConfirmed) found.restrictedConfirmed = p('errors.restricted');
    return found;
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return; // a second click while the first is on its way
    setFailure('');
    const found = check();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setBusy(true);
    try {
      const result = await createPrealert({
        trackingNumber: form.trackingNumber.trim(),
        carrier: form.carrier,
        shop: form.shop && form.shop !== OTHER_SHOP ? Number(form.shop) : null,
        shopName: form.shop === OTHER_SHOP ? form.shopName.trim() : '',
        description: form.description.trim(),
        consigneeName: form.consigneeName.trim(),
        restrictedConfirmed: form.restrictedConfirmed,
        files,
      });
      setSaved(result);
    } catch (error) {
      // The server's own words beside the field they are about.
      const fields = error?.fields ?? {};
      setErrors({
        trackingNumber: serverMessage(fields, 'tracking_number'),
        carrier: serverMessage(fields, 'carrier'),
        shop: serverMessage(fields, 'shop'),
        description: serverMessage(fields, 'description'),
        consigneeName: serverMessage(fields, 'consignee_name'),
        restrictedConfirmed: serverMessage(fields, 'restricted_items_confirmed'),
        files: serverMessage(fields, 'documents'),
      });
      setFailure(serverMessage(fields, 'detail') ?? p('errors.failed'));
    } finally {
      setBusy(false);
    }
  }

  const shopOptions = useMemo(
    () => [...shops].sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })),
    [shops],
  );

  // After the server has saved it - never before.
  if (saved) {
    return (
      <main className={`${profile.page} ${styles.page}`}>
        <section className={`${profile.card} ${styles.card}`} aria-live="polite">
          <h1 className={styles.title}>{p('savedTitle')}</h1>
          <p className={profile.ok} role="status">
            {p('savedText', { reference: saved.reference })}
          </p>
          <p className={styles.lead}>{p('savedNext')}</p>
          <div className={styles.actions}>
            <Link to="/profile#shipments" className={profile.submit}>
              {p('toShipments')}
            </Link>
            <button
              type="button"
              className={profile.linkButton}
              onClick={() => {
                setSaved(null);
                setFiles([]);
                setForm((current) => ({
                  ...current,
                  trackingNumber: '',
                  description: '',
                  restrictedConfirmed: false,
                }));
              }}
            >
              {p('another')}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const fieldError = (key) =>
    errors[key] ? (
      <span className={profile.error} id={`prealert-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const described = (key) => (errors[key] ? `prealert-${key}-error` : undefined);

  return (
    <main className={`${profile.page} ${styles.page}`}>
      <section className={`${profile.card} ${styles.card}`}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)}>
          ← {p('back')}
        </button>
        {/* data-tour="prealert-...": what the robot's tour of this page
            highlights (src/components/Tutorial/tutorialSteps.js). */}
        <h1 className={styles.title} data-tour="prealert-intro">{p('title')}</h1>
        <p className={styles.lead}>{p('intro')}</p>
        <p className={styles.note}>{p('requiredNote')}</p>

        {/* Optional shortcut: a screenshot of the order or shipping e-mail
            fills in the form below (readScreenshot). */}
        <section className={styles.reader} aria-labelledby="prealert-read-title">
          <h2 className={styles.readerTitle} id="prealert-read-title">
            {p('read.title')}
          </h2>
          <p className={styles.readerText}>{p('read.text')}</p>
          <label className={styles.fileButton} aria-disabled={readState === 'reading'}>
            <input
              type="file"
              className={styles.fileInput}
              accept={ACCEPT}
              onChange={readScreenshot}
              disabled={readState === 'reading'}
            />
            {readState === 'reading' ? p('read.reading') : p('read.button')}
          </label>
          {['done', 'nothing', 'failed'].includes(readState) && (
            <p className={readState === 'done' ? profile.ok : profile.error} role="status">
              {p(`read.${readState}`)}
            </p>
          )}
        </section>

        <form className={profile.form} onSubmit={submit} noValidate>
          <div className={profile.row} data-tour="prealert-courier">
            <div className={profile.field}>
              <label className={profile.label} htmlFor="prealert-tracking">
                {p('trackingNumber')} *
              </label>
              <input
                id="prealert-tracking"
                className={profile.input}
                value={form.trackingNumber}
                onChange={set('trackingNumber')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
                maxLength={255}
                placeholder="3SABC1234567"
                aria-invalid={Boolean(errors.trackingNumber)}
                aria-describedby={described('trackingNumber')}
              />
              {fieldError('trackingNumber')}
            </div>

            <div className={profile.field}>
              <label className={profile.label} htmlFor="prealert-carrier">
                {p('carrier')} *
              </label>
              <select
                id="prealert-carrier"
                className={profile.input}
                value={form.carrier}
                onChange={set('carrier')}
                aria-invalid={Boolean(errors.carrier)}
                aria-describedby={described('carrier')}
              >
                <option value="">{p('chooseCarrier')}</option>
                {carriers.map((carrier) => (
                  <option key={carrier.code} value={carrier.code}>
                    {/* "Other" in the customer's own language. */}
                    {carrier.code === 'other' ? t('courier.otherCarrier') : carrier.name}
                  </option>
                ))}
              </select>
              {fieldError('carrier')}
            </div>
          </div>

          <div className={profile.row} data-tour="prealert-shop">
            <div className={profile.field}>
              <label className={profile.label} htmlFor="prealert-shop">
                {p('shop')} *
              </label>
              <select
                id="prealert-shop"
                className={profile.input}
                value={form.shop}
                onChange={set('shop')}
                aria-invalid={Boolean(errors.shop)}
                aria-describedby={described('shop')}
              >
                <option value="">{p('chooseShop')}</option>
                {shopOptions.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
                <option value={OTHER_SHOP}>{p('otherShop')}</option>
              </select>
              {form.shop !== OTHER_SHOP && fieldError('shop')}
            </div>

            {form.shop === OTHER_SHOP && (
              <div className={profile.field}>
                <label className={profile.label} htmlFor="prealert-shopname">
                  {p('shopName')} *
                </label>
                <input
                  id="prealert-shopname"
                  className={profile.input}
                  value={form.shopName}
                  onChange={set('shopName')}
                  maxLength={80}
                  aria-invalid={Boolean(errors.shop)}
                  aria-describedby={described('shop')}
                />
                {fieldError('shop')}
              </div>
            )}
          </div>

          {/* A div with a label for the name only: inside the <label>, the
              counter and hint would be read out as part of the field's name. */}
          <div className={profile.field} data-tour="prealert-description">
            <label className={profile.label} htmlFor="prealert-description">
              {p('description')} *
            </label>
            <textarea
              id="prealert-description"
              className={profile.input}
              rows={3}
              value={form.description}
              onChange={set('description')}
              maxLength={MAX_DESCRIPTION}
              placeholder={p('descriptionPlaceholder')}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={described('description') ?? 'prealert-description-count'}
            />
            <span className={styles.count} id="prealert-description-count">
              {form.description.length}/{MAX_DESCRIPTION}
            </span>
            {fieldError('description')}
          </div>

          <div className={profile.row} data-tour="prealert-receiver">
            <div className={profile.field}>
              <label className={profile.label} htmlFor="prealert-consignee">
                {p('consignee')} *
              </label>
              <input
                id="prealert-consignee"
                className={profile.input}
                value={form.consigneeName}
                onChange={set('consigneeName')}
                maxLength={150}
                autoComplete="name"
                aria-invalid={Boolean(errors.consigneeName)}
                aria-describedby={described('consigneeName')}
              />
              {fieldError('consigneeName')}
            </div>

          </div>

          {/* The shop's invoice: optional, but it speeds up customs. */}
          <fieldset className={styles.files} data-tour="prealert-invoice">
            <legend className={profile.label}>{p('invoice')}</legend>
            <p className={styles.count}>{p('invoiceHint', { count: MAX_FILES })}</p>
            {files.length > 0 && (
              <ul className={styles.fileList}>
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      className={profile.linkButton}
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      aria-label={`${p('removeFile')}: ${file.name}`}
                    >
                      {p('removeFile')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {files.length < MAX_FILES && (
              <label className={styles.fileButton}>
                {p('addFile')}
                <input type="file" accept={ACCEPT} multiple onChange={addFiles} className={styles.fileInput} />
              </label>
            )}
            {fieldError('files')}
          </fieldset>

          <label className={styles.confirm} data-tour="prealert-confirm">
            <input
              type="checkbox"
              checked={form.restrictedConfirmed}
              onChange={set('restrictedConfirmed')}
              aria-invalid={Boolean(errors.restrictedConfirmed)}
              aria-describedby={described('restrictedConfirmed')}
            />
            <span>
              {p('restrictedBefore')} <Link to="/faq">{p('restrictedLink')}</Link> {p('restrictedAnd')}{' '}
              <Link to="/terms">{p('termsLink')}</Link>. *
            </span>
          </label>
          {fieldError('restrictedConfirmed')}

          {failure && (
            <p className={profile.failure} role="alert">
              {failure}
            </p>
          )}

          <div className={styles.actions}>
            <button type="submit" className={profile.submit} disabled={busy}>
              {busy ? p('sending') : p('send')}
            </button>
            <button type="button" className={profile.linkButton} onClick={() => navigate(-1)}>
              {p('leave')}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
