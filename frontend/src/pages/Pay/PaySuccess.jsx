// src/pages/Pay/PaySuccess.jsx
//
// Where Stripe sends the customer after paying. It is only a thank-you note:
// anybody can type this address, so it does NOT mark anything as paid. The
// invoice is marked paid by Stripe's message to the backend (the webhook).
//
// Deliberately not behind the admin's on/off switch: somebody who has just
// paid must still see this, even if the page is switched off a minute later.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /pay/success
//   Who can open: everybody
//   Links to:     / (Home)
//   Linked from:  Stripe's payment page (the success address, set in the backend)
//   Backend:      none

import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Pay.module.css';

export default function PaySuccess() {
  const { t } = useLanguage();
  usePageMeta(t('pay.success.title'), t('pay.success.summary'), '/pay/success');

  return (
    <main className={styles.page}>
      <div className={styles.body}>
        <section className={styles.card} aria-labelledby="pay-success-title">
          <h1 className={styles.cardTitle} id="pay-success-title">
            {t('pay.success.headline')}
          </h1>
          <p className={styles.stepText}>{t('pay.success.text')}</p>
          <p className={styles.hint}>{t('pay.success.note')}</p>
          <Link className={styles.button} to="/">
            {t('pay.success.home')}
          </Link>
        </section>
      </div>
    </main>
  );
}
