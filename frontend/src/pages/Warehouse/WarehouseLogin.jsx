// src/pages/Warehouse/WarehouseLogin.jsx
//
// The warehouse's own sign-in page, separate from the customers' /login.
//
// TWO WAYS IN, chosen by the server, not by this page:
//
//   - On a warehouse tablet or computer an admin REGISTERED (Dashboard >
//     Floor devices): "Who is working?" - tap your name, type your PIN.
//     The server only sends that list to a registered device (its token is
//     in a cookie no script can read), so this page asks for the list and
//     shows it if it comes back.
//   - Anywhere else: type your work e-mail address and your PIN. The list of
//     names is NOT shown here on purpose - this address is public, and a list
//     of everybody who works here would tell a stranger whom to try PINs on.
//
// Either way the same rules hold on the server (accounts/floor.py): five
// wrong PINs lock it, every try is on the record, and a PIN a manager just
// generated has to be replaced by the worker's own before the warehouse
// opens - which is why a successful sign-in may go to /warehouse/pin first.
//
// Office staff sign in with a password on /login, linked at the bottom.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/login
//   Who can open: anyone (it is a login page)
//   Links to:     /warehouse, /warehouse/pin, /login
//   Linked from:  RequireWarehouse (anyone not signed in who opens /warehouse)
//   Backend:      api/auth.js (getFloorRoster, signInWithPin, signInWithEmailPin)

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AUTH_ERRORS, getFloorRoster } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import FloorSignIn from '../Login/FloorSignIn';
import Loading from '../../components/Loading/Loading';
import styles from '../Login/Login.module.css';

const PIN_PATTERN = /^\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// What the visitor reads for each way signing in can fail. One sentence for
// a wrong address and a wrong PIN alike: the server does not say which, so
// that the page cannot be used to find out which addresses work here.
const FAILURE_KEYS = {
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'warehouseLogin.errors.failed',
  [AUTH_ERRORS.VALIDATION]: 'warehouseLogin.errors.failed',
  [AUTH_ERRORS.RATE_LIMITED]: 'warehouseLogin.errors.tooMany',
  [AUTH_ERRORS.UNAVAILABLE]: 'login.errors.offline',
};

/** Where to go once signed in: their own PIN first if they must choose one. */
function destination(profile, from) {
  if (profile?.mustChangePin) return '/warehouse/pin';
  return from ?? '/warehouse';
}

export default function WarehouseLogin() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isChecking, signInWithEmailPin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where they were going before RequireWarehouse sent them here.
  const from = location.state?.from;

  // 'checking' while we ask whether this is a registered device; then the
  // list (a registered device) or null (anywhere else).
  const [roster, setRoster] = useState('checking');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [errorKey, setErrorKey] = useState(null);
  const [busy, setBusy] = useState(false);
  // Guards against a double tap sending the PIN twice (two tries counted).
  const sending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getFloorRoster().then(
      (list) => !cancelled && setRoster(list),
      // 403 "not a registered device", or offline: the e-mail form.
      () => !cancelled && setRoster(null),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // A registered device: put the help robot away while the list is up, as
  // the ordinary login page does (PageGuide.module.css, data-floor-device).
  useEffect(() => {
    if (!roster || roster === 'checking') return undefined;
    document.documentElement.dataset.floorDevice = 'true';
    return () => {
      delete document.documentElement.dataset.floorDevice;
    };
  }, [roster]);

  if (isChecking || roster === 'checking') return <Loading />;

  // Already in (a refresh, or the back button): straight on.
  if (isAuthenticated && (user?.isStaff || user?.warehouseUnlocked)) {
    return <Navigate to={destination(user, from)} replace />;
  }

  function signedIn(profile) {
    navigate(destination(profile, from), { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending.current) return;

    if (!EMAIL_PATTERN.test(email.trim())) {
      setErrorKey('warehouseLogin.errors.email');
      return;
    }
    if (!PIN_PATTERN.test(pin)) {
      setErrorKey('warehouseLogin.errors.pin');
      return;
    }

    sending.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      signedIn(await signInWithEmailPin({ email: email.trim(), pin }));
    } catch (error) {
      setErrorKey(FAILURE_KEYS[error.code] ?? 'login.errors.offline');
      // Never keep a PIN around after a failed try.
      setPin('');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('warehouseLogin.title')}</h1>
        <p className={styles.subtitle}>
          {roster ? t('login.floor.subtitle') : t('warehouseLogin.subtitle')}
        </p>

        {roster ? (
          // A registered device: "Who is working?" (the same component the
          // ordinary login page uses on these devices).
          <FloorSignIn
            roster={roster}
            onRoster={setRoster}
            onSignedIn={signedIn}
            onUseCode={() => navigate('/login?method=code', { state: { from } })}
            onUsePassword={() => navigate('/login?method=password', { state: { from } })}
          />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {errorKey && (
              <p className={styles.failure} role="alert">
                {t(errorKey)}
              </p>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="warehouse-email">
                {t('warehouseLogin.email')}
              </label>
              <input
                id="warehouse-email"
                className={styles.input}
                type="email"
                name="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorKey(null);
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="warehouse-pin">
                {t('warehouseLogin.pin')}
              </label>
              <input
                id="warehouse-pin"
                className={`${styles.input} ${styles.codeInput}`}
                // Dots, not digits: somebody may be standing behind them.
                type="password"
                name="pin"
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setErrorKey(null);
                }}
                // The number pad on an iPad or phone.
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                // Never offered for saving: warehouse computers are shared.
                autoComplete="off"
                aria-describedby="warehouse-pin-hint"
                required
              />
              <span className={styles.hint} id="warehouse-pin-hint">
                {t('warehouseLogin.pinHint')}
              </span>
            </div>

            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? t('login.submitting') : t('warehouseLogin.submit')}
            </button>
          </form>
        )}

        <p className={styles.hint}>{t('warehouseLogin.forgotten')}</p>
        <p className={styles.footer}>
          {t('warehouseLogin.office')}{' '}
          <Link to="/login" state={{ from }} className={styles.footerLink}>
            {t('warehouseLogin.officeLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
