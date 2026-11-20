// src/pages/Maintenance/Maintenance.jsx
//
// What visitors see instead of the website while an admin has maintenance mode
// switched on (Dashboard > Website, or "Site settings" in the Django admin).
// There is no header or footer here on purpose: nothing on the site should be
// reachable. Staff are not shown this page - see App.jsx.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      every public address, while maintenance mode is on
//   Who can open: visitors and customers (staff see the real site)
//   Links to:     /login (for staff)
//   Linked from:  -
//   Backend:      none (api/site.js says whether it is on)

import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useLanguage } from '../../i18n/useLanguage';
import logoMark from '../../images/logo-mark.webp';
import styles from './Maintenance.module.css';

// The same address as on our invoices.
const SUPPORT_EMAIL = 'info@paylessshopmore.com';

export default function Maintenance() {
  const { t } = useLanguage();
  usePageMeta(t('maintenance.title'), t('maintenance.text'), '/');

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* alt="": the name next to it already says who we are. */}
        <img src={logoMark} alt="" className={styles.logo} width="155" height="128" />
        <p className={styles.brand}>
          PayLesShopMore<span className={styles.dot}>.com</span>
        </p>
        <h1 className={styles.title}>{t('maintenance.headline')}</h1>
        <p className={styles.text}>{t('maintenance.text')}</p>
        <p className={styles.text}>
          {t('maintenance.contact')}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p className={styles.staff}>
          <Link to="/login">{t('maintenance.staff')}</Link>
        </p>
      </div>
    </main>
  );
}
