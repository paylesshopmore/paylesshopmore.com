// src/pages/NotFound/NotFound.jsx
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      * (any address App.jsx does not know)
//   Who can open: everybody
//   Links to:     / (Home)
//   Linked from:  every mistyped or removed address (the Footer's /about-us too)
//   Backend:      -

import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './NotFound.module.css';

export default function NotFound() {
  const { t } = useLanguage();
  usePageMeta(t('notFound.title'), t('notFound.body'));

  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>{t('notFound.title')}</h1>
      <p className={styles.body}>{t('notFound.body')}</p>
      <Link to="/" className={styles.link}>
        {t('notFound.home')}
      </Link>
    </main>
  );
}
