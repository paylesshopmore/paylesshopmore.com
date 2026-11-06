// src/pages/Warehouse/SetPinPage.jsx
//
// A warehouse worker choosing their floor PIN, straight after signing in with
// a code an admin e-mailed them. From then on a handover on a shared device is
// their name and four digits. The same page replaces a forgotten or locked
// PIN: an e-mailed code is the way back in either way.
//
// The server only allows it in a session that began with an e-mailed code, and
// once per code - not from a PIN session, or anybody who watched a colleague
// type their PIN could change it and keep the account.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/pin
//   Who can open: a warehouse worker signed in with an e-mailed code
//   Links to:     /warehouse (when the PIN is saved)
//   Linked from:  Log in (straight after an e-mailed code)
//   Backend:      api/profile.js

import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { setPin } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import styles from '../Login/Login.module.css';

const PIN_PATTERN = /^\d{4}$/;

const digits = (value) => value.replace(/\D/g, '').slice(0, 4);

export default function SetPinPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const repeatInput = useRef(null);

  const [pin, setPinValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errorKey, setErrorKey] = useState(null);
  // The server's own reason for refusing a PIN, e.g. "too easy to guess".
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = location.state?.from ?? '/warehouse';

  if (!user?.canSetPin) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('login.setPin.title')}</h1>
          <p className={styles.subtitle}>{t('login.setPin.notAllowed')}</p>
          <Link to="/warehouse" className={styles.footerLink}>
            {t('login.setPin.later')}
          </Link>
        </div>
      </main>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');

    if (!PIN_PATTERN.test(pin)) return setErrorKey('login.setPin.errors.invalid');
    if (pin !== repeat) {
      setRepeat('');
      return setErrorKey('login.setPin.errors.mismatch');
    }

    setErrorKey(null);
    setBusy(true);
    try {
      await setPin(pin);
      await refreshUser();
      navigate(next, { replace: true });
    } catch (error) {
      const reason = error?.fields?.pin;
      if (reason) setServerError(String(Array.isArray(reason) ? reason[0] : reason));
      else setErrorKey('login.setPin.errors.failed');
      setPinValue('');
      setRepeat('');
    } finally {
      setBusy(false);
    }
  }

  const message = serverError || (errorKey && t(errorKey));

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('login.setPin.title')}</h1>
        <p className={styles.subtitle}>
          {/* After a PIN a manager generated: say why they are here. */}
          {user.mustChangePin ? t('login.setPin.mustChange') : t('login.setPin.subtitle')}
        </p>

        {message && (
          <p className={styles.failure} role="alert">
            {message}
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="set-pin">
              {t('login.setPin.pin')}
            </label>
            <input
              id="set-pin"
              className={`${styles.input} ${styles.codeInput}`}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              // Not "new-password": a password manager on a shared device would
              // offer to keep it for the next person.
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(event) => {
                const value = digits(event.target.value);
                setPinValue(value);
                setErrorKey(null);
                setServerError('');
                if (value.length === 4) repeatInput.current?.focus();
              }}
              aria-describedby="set-pin-hint"
            />
            <span className={styles.hint} id="set-pin-hint">
              {t('login.setPin.hint')}
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="set-pin-repeat">
              {t('login.setPin.repeat')}
            </label>
            <input
              id="set-pin-repeat"
              ref={repeatInput}
              className={`${styles.input} ${styles.codeInput}`}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={repeat}
              onChange={(event) => {
                setRepeat(digits(event.target.value));
                setErrorKey(null);
              }}
            />
          </div>

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('login.setPin.saving') : t('login.setPin.submit')}
          </button>
        </form>

        {/* No "Later" after a generated PIN: the warehouse stays closed
            until they have chosen their own, so there is nowhere to go. */}
        {!user.mustChangePin && (
          <p className={styles.footer}>
            <Link to={next} replace className={styles.footerLink}>
              {t('login.setPin.later')}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
