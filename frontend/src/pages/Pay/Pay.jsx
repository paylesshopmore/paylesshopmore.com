// src/pages/Pay/Pay.jsx
//
// Pay an invoice online. The customer types the invoice number printed on the
// invoice we sent them; we send ONLY that number to the server, which looks up
// the amount itself and answers with the address of Stripe's payment page. The
// customer then pays there - card details never touch this site.
//
// This page never says an invoice is paid. Only Stripe's message to the
// backend (the webhook) does that; see backend payments/views.py.
//
// The page is switched on and off by an admin (Dashboard > Website, or "Site
// settings" in the Django admin); the guard is PayPage in App.jsx.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /pay
//   Who can open: everybody, while an admin has it switched on
//   Links to:     Stripe's payment page, then /pay/success (or back here)
//   Linked from:  the Header menu
//   Backend:      api/payments.js (backend payments/)

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_ERRORS } from '../../api/client';
import { startCheckout } from '../../api/payments';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useLanguage } from '../../i18n/useLanguage';
import PayIllustration from './PayIllustration';
import PayMethods from './PayMethods';
import styles from './Pay.module.css';

// Same rule as the server (backend payments/models.py). Checked here only to
// give a helpful message sooner; the server checks again and is the real gate.
const NUMBER_PATTERN = /^PLSM-\d{4,8}$/;

// Where customers reach us. The same details as on our invoices.
const SUPPORT_EMAIL = 'info@paylessshopmore.com';
const SUPPORT_PHONE = '010 310 5317';
const SUPPORT_PHONE_LINK = 'tel:+31103105317';

// Stripe's payment page lives on this domain. We only ever follow an address
// the server gave us, but check it anyway: a redirect to anywhere else would
// be a phishing link, so refuse it.
function isStripeAddress(address) {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && url.hostname.endsWith('.stripe.com');
  } catch {
    return false;
  }
}

const BADGES = ['secure', 'fast', 'number'];
const STEPS = ['check', 'pay', 'keep'];
const ITEMS = ['shipping', 'other'];

export default function Pay() {
  const { t } = useLanguage();
  usePageMeta(t('pay.title'), t('pay.summary'), '/pay');

  // Stripe sends people back with ?cancelled=1 when they close its page.
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get('cancelled') === '1';

  const [number, setNumber] = useState('');
  // The translation key of what went wrong, or null.
  const [errorKey, setErrorKey] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    // Typed by hand, so forgive spaces and lower case.
    const cleaned = number.trim().toUpperCase();

    if (!cleaned) {
      setErrorKey('pay.errors.empty');
      return;
    }
    if (!NUMBER_PATTERN.test(cleaned)) {
      setErrorKey('pay.errors.format');
      return;
    }

    setErrorKey(null);
    setBusy(true);
    try {
      const { url } = await startCheckout(cleaned);
      if (!isStripeAddress(url)) throw new Error('Unexpected payment address');
      // Leave the site for Stripe. Stay "busy" so a second click cannot start
      // a second payment while the browser is navigating.
      window.location.assign(url);
    } catch (error) {
      setBusy(false);
      if (error?.code === API_ERRORS.RATE_LIMITED) {
        setErrorKey('pay.errors.busy');
      } else if (error?.status === 404) {
        setErrorKey('pay.errors.notFound');
      } else {
        setErrorKey('pay.errors.unavailable');
      }
    }
  }

  const describedBy = errorKey ? 'pay-hint pay-error' : 'pay-hint';

  return (
    <main className={styles.page}>
      {/* ------------------------------------------------ 1. hero */}
      <section className={styles.banner} aria-labelledby="pay-title">
        <div className={styles.bannerInner}>
          <p className={styles.label}>{t('pay.label')}</p>
          <h1 className={styles.title} id="pay-title">
            {t('pay.headline')}
          </h1>
          <p className={styles.bannerText}>{t('pay.intro')}</p>
          <ul className={styles.badges}>
            {BADGES.map((badge) => (
              <li key={badge} className={styles.badge}>
                {t(`pay.badges.${badge}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className={styles.body}>
        {/* ------------------------------------------------ 2. payment card */}
        <section className={styles.card} aria-labelledby="pay-card-title">
          <PayIllustration />
          <h2 className={styles.cardTitle} id="pay-card-title">
            {t('pay.card.title')}
          </h2>

          {cancelled && (
            <p className={styles.notice} role="status">
              {t('pay.cancelled')}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="pay-number">
                {t('pay.card.label')}
              </label>
              <input
                id="pay-number"
                className={styles.input}
                type="text"
                name="number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="PLSM-10231"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
                maxLength={20}
                aria-invalid={Boolean(errorKey)}
                aria-describedby={describedBy}
              />
              <span className={styles.hint} id="pay-hint">
                {t('pay.card.hint')}
              </span>
              {/* role="alert": a screen reader announces the message the
                  moment it appears, without the visitor having to find it. */}
              <div id="pay-error" className={styles.error} role="alert">
                {errorKey ? t(errorKey) : ''}
              </div>
            </div>

            <button type="submit" className={styles.button} disabled={busy}>
              {busy ? t('pay.card.busy') : t('pay.card.button')}
            </button>
          </form>

          <p className={styles.secured}>{t('pay.card.secured')}</p>
          <PayMethods label={t('pay.card.methods')} />
        </section>

        {/* ------------------------------------------------ 3. steps */}
        <section className={styles.section} aria-labelledby="pay-steps-title">
          <h2 className={styles.sectionTitle} id="pay-steps-title">
            {t('pay.steps.title')}
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.stepTitle}>{t(`pay.steps.${step}`)}</h3>
                <p className={styles.stepText}>{t(`pay.steps.${step}Text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------ 4. what can be paid */}
        <section className={styles.section} aria-labelledby="pay-what-title">
          <h2 className={styles.sectionTitle} id="pay-what-title">
            {t('pay.what.title')}
          </h2>
          <ul className={styles.list}>
            {ITEMS.map((item) => (
              <li key={item}>{t(`pay.what.items.${item}`)}</li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------ 5. anti-fraud */}
        <section className={styles.warning} aria-labelledby="pay-fraud-title">
          <h2 className={styles.warningTitle} id="pay-fraud-title">
            {t('pay.fraud.title')}
          </h2>
          <p>{t('pay.fraud.text')}</p>
        </section>

        {/* ------------------------------------------------ 6. contact */}
        <section className={styles.section} aria-labelledby="pay-contact-title">
          <h2 className={styles.sectionTitle} id="pay-contact-title">
            {t('pay.contact.title')}
          </h2>
          <p className={styles.stepText}>{t('pay.contact.text')}</p>
          <div className={styles.contactButtons}>
            <a className={styles.secondary} href={`mailto:${SUPPORT_EMAIL}`}>
              {t('pay.contact.email')}: {SUPPORT_EMAIL}
            </a>
            <a className={styles.secondary} href={SUPPORT_PHONE_LINK}>
              {t('pay.contact.phone')}: {SUPPORT_PHONE}
            </a>
          </div>
        </section>

        <div className={styles.back}>
          <Link className={styles.homeLink} to="/">
            <span aria-hidden="true">←</span> {t('pay.success.home')}
          </Link>
        </div>
      </div>
    </main>
  );
}
