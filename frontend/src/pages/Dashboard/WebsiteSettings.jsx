// src/pages/Dashboard/WebsiteSettings.jsx
//
// "Website": which pages of the public site are switched on. For now one
// switch, the Calculator page. Switched off, its links leave the menu and the
// footer and visitors who type /calculator are sent to the home page; staff
// can still open it, to check it before switching it back on.
//
// The same switch is in the Django admin under "Site settings"; both edit
// one row (SiteSettings, backend accounts/models.py).
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/website
//   Who can open: admins
//   Links to:     /calculator
//   Linked from:  the dashboard sidebar
//   Backend:      api/staff.js (backend staff/site_settings.py)

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSiteSettings, saveSiteSettings } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { resetSiteSwitches } from '../../hooks/useSiteSwitches';
import { Banner } from './ui';
import styles from './Dashboard.module.css';
import { usePageText } from './usePageText';

export default function WebsiteSettings() {
  const { user } = useAuth();
  const d = usePageText('website');
  const c = usePageText('common');
  const isAdmin = Boolean(user?.isAdmin);

  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [showCalculator, setShowCalculator] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // The server refuses anyone but an admin, so do not even ask.
    if (!isAdmin) return undefined;
    let live = true;
    getSiteSettings()
      .then((settings) => {
        if (!live) return;
        setShowCalculator(settings.show_calculator);
        setState('ready');
      })
      .catch(() => {
        if (live) setState('error');
      });
    return () => {
      live = false;
    };
  }, [attempt, isAdmin]);

  const header = (
    <header className={styles.head}>
      <h1 className={styles.title}>{d('title')}</h1>
      <p className={styles.subtitle}>{d('subtitle')}</p>
    </header>
  );

  if (!isAdmin) {
    return (
      <>
        {header}
        <Banner tone="info">{d('onlyAdmin')}</Banner>
      </>
    );
  }
  if (state === 'loading') return <Loading inline />;
  if (state === 'error') {
    return (
      <ConnectionError
        inline
        onRetry={() => {
          setState('loading');
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  // Saved the moment the switch is flipped: there is only one, so a separate
  // Save button would just be one more click to forget.
  async function toggle(next) {
    setBusy(true);
    setMessage(null);
    try {
      const settings = await saveSiteSettings({ show_calculator: next });
      setShowCalculator(settings.show_calculator);
      // This tab's header and footer ask again, so they follow the change.
      resetSiteSwitches();
      setMessage({
        tone: 'success',
        text: settings.show_calculator ? d('calculatorShown') : d('calculatorHidden'),
      });
    } catch {
      setMessage({ tone: 'error', text: d('saveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {header}
      <Banner tone={message?.tone}>{message?.text}</Banner>

      <section className={styles.accessCard}>
        <ul className={styles.accessList}>
          <li className={styles.accessRow}>
            <label htmlFor="website-calculator" className={styles.accessText}>
              <span className={styles.accessTitle}>{d('calculator')}</span>
              <span className={styles.accessDescription}>
                {d('calculatorAbout')} <Link to="/calculator">{d('open')}</Link>
              </span>
            </label>
            {/* A checkbox styled as a slider, as on the Warehouse access page. */}
            <span className={styles.switch}>
              <input
                id="website-calculator"
                type="checkbox"
                role="switch"
                checked={showCalculator}
                disabled={busy}
                onChange={(event) => toggle(event.target.checked)}
              />
              <span className={styles.switchTrack} aria-hidden="true" />
            </span>
            <span className={showCalculator ? styles.accessOn : styles.accessOff}>
              {busy ? c('saving') : showCalculator ? d('on') : d('off')}
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
