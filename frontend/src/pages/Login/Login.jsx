// src/pages/Login/Login.jsx
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /login
//   Who can open: everybody
//   Links to:     /signup, /forgot-password, /warehouse/pin; after signing in: homeFor()
//                 in src/auth/home.js. Already signed in: RedirectIfSignedIn in App.jsx
//                 sends them on before this page shows.
//   Linked from:  the Header "Log in", Sign up, Reset password, and every guarded page when signed
//                 out
//   Backend:      api/auth.js

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AUTH_ERRORS, getFloorRoster } from '../../api/auth';
import { homeFor } from '../../auth/home';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import FloorSignIn from './FloorSignIn';
import styles from './Login.module.css';

const EMPTY_FORM = { email: '', password: '', code: '', remember: false };

// Deliberately loose: catches typos, not every RFC-legal address. The server
// is the real authority on whether an address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The code an admin e-mails a warehouse worker. Four digits, and the server
// refuses anything else too; this is so a typo is caught before a guess is
// spent on it.
const CODE_PATTERN = /^\d{4}$/;

// Returns translation keys rather than messages, so errors already on screen
// follow the visitor when they switch language.
function validate({ email, password, code }, method) {
  const errors = {};

  if (!email.trim()) errors.email = 'login.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'login.errors.emailInvalid';

  if (method === 'code') {
    if (!code) errors.code = 'login.errors.codeRequired';
    else if (!CODE_PATTERN.test(code)) errors.code = 'login.errors.codeInvalid';
  } else if (!password) {
    errors.password = 'login.errors.passwordRequired';
  }

  return errors;
}

// Which form this device last signed somebody in with. A shared floor phone
// signs in with codes all day, and every worker finding the password form and
// switching it over is seconds lost at every handover. The method only - never
// the address: the next person on the device is a colleague, and an e-mail
// left in the field is somebody else's.
const METHOD_KEY = 'plsm.loginMethod';

// Where the method is kept when the browser refuses storage (a locked-down
// profile, some private windows): good until the page reloads, which still
// covers the device going back to the form after a sign-out or an idle timeout.
let methodInMemory = null;

function rememberedMethod() {
  try {
    return window.localStorage.getItem(METHOD_KEY);
  } catch {
    return methodInMemory;
  }
}

function rememberMethod(method) {
  try {
    window.localStorage.setItem(METHOD_KEY, method);
  } catch {
    methodInMemory = method;
  }
}

/** The link's choice first (the e-mail with a code sets it), then the device's. */
function initialMethod(searchParams) {
  const asked = searchParams.get('method');
  if (asked === 'code' || asked === 'password') return asked;
  return rememberedMethod() === 'code' ? 'code' : 'password';
}

// Maps a failure from the auth layer onto the message the visitor sees.
const FAILURE_KEYS = {
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'login.errors.failed',
  [AUTH_ERRORS.UNAVAILABLE]: 'login.errors.offline',
  [AUTH_ERRORS.RATE_LIMITED]: 'login.errors.tooMany',
  // The API rejects an unusable body with 400; for this form that means the
  // credentials were not accepted either way.
  [AUTH_ERRORS.VALIDATION]: 'login.errors.failed',
};

// The same, for the warehouse code form. One sentence for every way a code can
// be wrong - mistyped, expired, already used, out of guesses, or not a
// warehouse account at all - because the server does not say which, and a form
// that guessed would be inventing a reason.
const CODE_FAILURE_KEYS = {
  ...FAILURE_KEYS,
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'login.errors.codeFailed',
  [AUTH_ERRORS.VALIDATION]: 'login.errors.codeFailed',
};

/** A floor worker who may set a PIN now - signed in with an e-mailed code. */
function shouldSetPin(profile) {
  return Boolean(profile?.canSetPin && profile?.isWarehouse && !profile?.isStaff);
}

export default function Login() {
  const location = useLocation();

  // The e-mail with the code in it links here with ?method=code&email=..., so
  // a worker with a phone in one hand opens the form already switched to the
  // code and with their address filled in. The code is never in the link: see
  // accounts/emails.py.
  const [searchParams] = useSearchParams();

  const [method, setMethod] = useState(() => initialMethod(searchParams));

  // Whether this visit may switch between the password and the code. Only
  // when the code form was in play from the start - the e-mailed link, or a
  // device that signs in with codes - or on a floor device (`roster`, below).
  // Kept for the whole visit, so a worker who looks at the password form can
  // still come back to the code. A customer never has it.
  const [offerCode] = useState(method === 'code');

  // On a shared floor device an admin registered, the server sends the list
  // of who works here. The page still opens on the ordinary form - the same
  // one every customer sees - and "Who is working?" is one button away
  // (`onFloor` turns it on). Everywhere else `roster` stays null and the
  // button is not there.
  const [roster, setRoster] = useState(null);
  const [onFloor, setOnFloor] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A 403 is the answer for every device nobody registered: the ordinary
    // form, which is already on screen.
    getFloorRoster().then(
      (answer) => {
        if (!cancelled) setRoster(answer);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const showFloor = Boolean(roster && onFloor);

  // A registered floor device: the help robot is put away while this page is
  // up (PageGuide.module.css). It covered the Log in button on a phone, and a
  // shared workstation has nobody to give the site's tour to.
  useEffect(() => {
    if (!roster) return undefined;
    document.documentElement.dataset.floorDevice = 'true';
    return () => {
      delete document.documentElement.dataset.floorDevice;
    };
  }, [roster]);

  // Signup sends the address along when it turns out to be registered
  // already, so the visitor does not type it a second time. Read once, as the
  // initial value — this is a starting point for the field, not a value the
  // page keeps in sync with the route.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    email: location.state?.email ?? searchParams.get('email') ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { t } = useLanguage();
  const { signIn, signInWithCode } = useAuth();

  const navigate = useNavigate();
  const codeInput = useRef(null);
  // `busy` is state, so two submits in the same tick would both read it as
  // false. This is read and set synchronously.
  const submitting = useRef(false);

  const isCode = method === 'code';

  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    // Digits only, and no more than four: a code pasted with a space or a
    // dash still works, and the field cannot hold something that was never
    // going to be accepted.
    const next =
      type === 'checkbox'
        ? checked
        : name === 'code'
          ? value.replace(/\D/g, '').slice(0, 4)
          : value;
    setForm((current) => ({ ...current, [name]: next }));

    // Clear a field's error as soon as the visitor edits it again.
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });

    // The fourth digit is the end of the code, so it is also the end of the
    // form: no reaching for the button with somebody waiting for the device.
    // Only once the address looks right, so a half-typed one does not spend
    // one of the code's five guesses. The button stays for anybody who would
    // rather press it.
    const values = { ...form, [name]: next };
    if (
      isCode &&
      name === 'code' &&
      CODE_PATTERN.test(next) &&
      Object.keys(validate(values, method)).length === 0
    ) {
      submit(values);
    }
  }

  // Enter (or the phone keyboard's Next) in the address goes on to the code,
  // the way a worker reads the form, rather than submitting a form with no
  // code in it and showing an error for the field they were about to fill.
  function handleEmailKeyDown(event) {
    if (!isCode || event.key !== 'Enter' || CODE_PATTERN.test(form.code)) return;
    event.preventDefault();
    codeInput.current?.focus();
  }

  function chooseMethod(next) {
    if (next === method) return;
    setMethod(next);
    setErrors({});
    setFailureKey(null);
    // The address is kept - it is the same person - but neither secret is
    // carried across.
    setForm((current) => ({ ...current, password: '', code: '' }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit(form);
  }

  async function submit(values) {
    if (submitting.current) return;

    const found = validate(values, method);
    setErrors(found);
    setFailureKey(null);
    if (Object.keys(found).length > 0) return;

    submitting.current = true;
    setBusy(true);
    try {
      const profile = isCode
        ? await signInWithCode({ email: values.email.trim(), code: values.code })
        : await signIn({
            email: values.email.trim(),
            password: values.password,
            remember: values.remember,
          });

      rememberMethod(method);
      goOn(profile, method);
    } catch (error) {
      const keys = isCode ? CODE_FAILURE_KEYS : FAILURE_KEYS;
      setFailureKey(keys[error.code] ?? 'login.errors.offline');
      // Never keep a secret around after a failed attempt.
      setForm((current) => ({ ...current, password: '', code: '' }));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function goOn(profile, way) {
    // replace throughout: the login page should not sit in history behind them.
    if (shouldSetPin(profile)) {
      // Straight after an e-mailed code is the one moment a PIN can be set,
      // so it is offered now; the page has a "Later".
      navigate('/warehouse/pin', { replace: true, state: { from: location.state?.from } });
      return;
    }
    // Back to the page they were trying to reach, or to their account.
    navigate(location.state?.from ?? homeFor(profile, way), { replace: true });
  }

  function leaveFloor(next) {
    setOnFloor(false);
    chooseMethod(next);
  }

  if (showFloor) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('login.floor.title')}</h1>
          <p className={styles.subtitle}>{t('login.floor.subtitle')}</p>
          <FloorSignIn
            roster={roster}
            onRoster={setRoster}
            onSignedIn={(profile) => {
              rememberMethod('code');
              goOn(profile, 'code');
            }}
            onUseCode={() => leaveFloor('code')}
            onUsePassword={() => leaveFloor('password')}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.subtitle}>
          {isCode ? t('login.codeSubtitle') : t('login.subtitle')}
        </p>

        {/* Only on a registered floor device: opens "Who is working?", where
            a warehouse worker taps their name and types their PIN. */}
        {roster && (
          <button
            type="button"
            className={styles.floorLink}
            onClick={() => setOnFloor(true)}
          >
            {t('login.floor.openList')}
          </button>
        )}

        {/* Two ways in, switched by buttons rather than tabs: there is no
            panel to move focus into, only one form that changes its fields.
            aria-pressed says which is on without leaning on colour.

            Only once the code form is in play: opened from the link in the
            e-mail an admin sent, from a floor device, or on a device that
            signs in with codes. A customer never sees it - the warehouse
            code is nothing to them, and a second way in on their login page
            only invites the question of which one to use. */}
        {(offerCode || isCode || roster) && (
          <div
            className={styles.methods}
            role="group"
            aria-label={t('login.methodLabel')}
          >
            {['password', 'code'].map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.method} ${
                  method === option ? styles.methodActive : ''
                }`}
                aria-pressed={method === option}
                onClick={() => chooseMethod(option)}
              >
                {t(option === 'code' ? 'login.methodCode' : 'login.methodPassword')}
              </button>
            ))}
          </div>
        )}

        {/* Sent here by the reset page, which deliberately does not sign
            anyone in — without this the trip would look like it failed. */}
        {location.state?.passwordReset && (
          <p className={styles.success} role="status">
            {t('passwordReset.done')}
          </p>
        )}

        {/* role="alert" so a screen reader announces the failure as it appears */}
        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}
          </p>
        )}

        {/* data-tour="..." on this page: what the robot's page tour
            highlights (src/components/Tutorial/tutorialSteps.js). */}
        <form
          className={styles.form}
          onSubmit={handleSubmit}
          noValidate
          data-tour="login-form"
        >
          <label className={styles.field}>
            <span className={styles.label}>{t('login.email')}</span>
            <input
              className={styles.input}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              onKeyDown={handleEmailKeyDown}
              // Not on the code form: that is the shared floor device, and the
              // browser's list of addresses typed here before is a list of
              // colleagues, one tap from signing in as the wrong one.
              autoComplete={isCode ? 'off' : 'email'}
              enterKeyHint={isCode ? 'next' : undefined}
              // The first thing a returning visitor wants to type, unless the
              // address is already there - then it is the code.
              autoFocus={!form.email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {errors.email && (
              <span className={styles.error} id="login-email-error">
                {t(errors.email)}
              </span>
            )}
          </label>

          {isCode ? (
            // A div and an explicit label, unlike the fields around it: the hint
            // below describes the input, and inside the <label> it would also
            // become part of the field's name, so a screen reader would read it
            // twice.
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-code">
                {t('login.code')}
              </label>
              <input
                id="login-code"
                ref={codeInput}
                className={`${styles.input} ${styles.codeInput}`}
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                // A numeric keypad on a phone, and the browser's own offer to
                // fill the code from the message it just received.
                inputMode="numeric"
                pattern="[0-9]*"
                // No maxLength: the browser would cut a pasted "48-21" to "48-2"
                // before the digits are picked out of it. handleChange caps it.
                autoComplete="one-time-code"
                autoFocus={Boolean(form.email)}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={
                  errors.code ? 'login-code-hint login-code-error' : 'login-code-hint'
                }
              />
              <span className={styles.hint} id="login-code-hint">
                {t('login.codeHint')}
              </span>
              {errors.code && (
                // role="alert": announced the moment it appears, so somebody
                // typing a code by ear does not have to go looking for it.
                <span className={styles.error} id="login-code-error" role="alert">
                  {t(errors.code)}
                </span>
              )}
            </div>
          ) : (
            <>
              <label className={styles.field}>
                <span className={styles.label}>{t('login.password')}</span>
                <span className={styles.passwordWrap}>
                  <input
                    className={`${styles.input} ${styles.passwordInput}`}
                    type={revealed ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password ? 'login-password-error' : undefined
                    }
                  />
                  {/* Lets people check a typo instead of retyping the whole thing */}
                  <button
                    type="button"
                    className={styles.reveal}
                    onClick={() => setRevealed((current) => !current)}
                    aria-pressed={revealed}
                    aria-label={
                      revealed ? t('login.hidePassword') : t('login.showPassword')
                    }
                  >
                    {revealed ? (
                      <svg
                        className={styles.revealIcon}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M3 3l18 18" />
                        <path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.1 3.6" />
                        <path d="M6.5 8.3A15.3 15.3 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3.6-.75" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                      </svg>
                    ) : (
                      <svg
                        className={styles.revealIcon}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </span>
                {errors.password && (
                  <span className={styles.error} id="login-password-error">
                    {t(errors.password)}
                  </span>
                )}
              </label>

              <div className={styles.row}>
                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    name="remember"
                    checked={form.remember}
                    onChange={handleChange}
                  />
                  {t('login.remember')}
                </label>

                <Link
                  to="/forgot-password"
                  data-tour="login-forgot"
                  // Carries whatever they have already typed, so the next page
                  // does not ask for it again.
                  state={{ email: form.email.trim() }}
                  className={styles.forgot}
                >
                  {t('login.forgot')}
                </Link>
              </div>
            </>
          )}

          <button type="submit" className={styles.submit} disabled={busy}>
            {busy ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className={styles.footer} data-tour="login-signup">
          {t('login.noAccount')}{' '}
          <Link to="/signup" className={styles.footerLink}>
            {t('login.signupLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
