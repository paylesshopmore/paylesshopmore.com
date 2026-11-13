// src/pages/Profile/Profile.jsx
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /profile  (and /tracking, which redirects to /profile#tracking)
//   Who can open: anyone signed in (RequireAuth in App.jsx)
//   Links to:     / (Home), /booking, /contact, /dashboard (staff), /warehouse (warehouse workers)
//   Linked from:  the Header account menu, Log in, Sign up, Booking, Home
//   Backend:      api/profile.js, api/booking.js, api/invoices.js, api/auth.js

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  USING_PLACEHOLDER_DATA,
  changePassword,
  deleteAccount,
  getProfile,
  updateNotifications,
  updateProfile,
} from '../../api/profile';
import { listInvoices } from '../../api/invoices';
import MyBookings from './MyBookings';
import NextSteps from './NextSteps';
import WarehouseUnlock from './WarehouseUnlock';
import Shipments from './Shipments';
import { AUTH_ERRORS } from '../../api/auth';
import { useAuth } from '../../auth/useAuth';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import TrackingPanel from '../../components/TrackingPanel/TrackingPanel';
import TrackedOrder from './TrackedOrder';
import PreAlerts from './PreAlerts';
import WarehouseAddressCard from './WarehouseAddressCard';
import { useLanguage } from '../../i18n/useLanguage';
import TwoFactorCard from './TwoFactorCard';
import styles from './Profile.module.css';
import { sanitizePhone } from '../../utils/phone';

// Destinations we ship to. Values are ISO codes so the server never has to
// parse a display name.


// The e-mail switches under "Meldingen". Only shipping updates: the offers
// and newsletter switches were removed, as the company does not send those.
const NOTIFICATION_KEYS = ['shipping'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 12;

const EMPTY_PASSWORDS = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

// Both validators return translation keys, so an error on screen follows the
// visitor when they switch language.
function validateDetails({ firstName, lastName, email }) {
  const errors = {};

  if (!firstName.trim()) errors.firstName = 'profile.errors.firstNameRequired';
  if (!lastName.trim()) errors.lastName = 'profile.errors.lastNameRequired';

  if (!email.trim()) errors.email = 'profile.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'profile.errors.emailInvalid';

  return errors;
}

function validatePasswords({ currentPassword, newPassword, confirmPassword }) {
  const errors = {};

  if (!currentPassword) errors.currentPassword = 'profile.errors.currentRequired';

  if (newPassword.length < MIN_PASSWORD_LENGTH)
    errors.newPassword = 'profile.errors.passwordShort';

  if (newPassword !== confirmPassword)
    errors.confirmPassword = 'profile.errors.confirmMismatch';

  return errors;
}

const FAILURE_KEYS = {
  [AUTH_ERRORS.NOT_IMPLEMENTED]: 'profile.notImplemented',
  [AUTH_ERRORS.VALIDATION]: 'profile.errors.currentRequired',
  [AUTH_ERRORS.INVALID_CREDENTIALS]: 'profile.errors.currentRequired',
  [AUTH_ERRORS.UNAVAILABLE]: 'profile.errors.offline',
  [AUTH_ERRORS.UNAUTHENTICATED]: 'profile.errors.offline',
};

// Initials for the avatar circle: "Voorbeeld Klant" becomes "VK".
function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// One per section, so a glance down the page tells the sections apart. Same
// family as the rest of the site: 24-box, no fill, 1.9 stroke, round caps.
function SectionIcon({ name }) {
  const paths = {
    details: (
      <>
        <circle cx="12" cy="8" r="3.8" />
        <path d="M4.5 20v-1.6A4.9 4.9 0 0 1 9.4 13.5h5.2a4.9 4.9 0 0 1 4.9 4.9V20" />
      </>
    ),
    address: (
      <>
        <path d="M12 2.5a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7Z" />
        <circle cx="12" cy="9.5" r="2.6" />
      </>
    ),
    // The warehouse address card: the same map pin.
    'warehouse-address': (
      <>
        <path d="M12 2.5a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7Z" />
        <circle cx="12" cy="9.5" r="2.6" />
      </>
    ),
    tracking: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15 15 5.5 5.5" />
        <path d="M8 10.5h5M10.5 8v5" />
      </>
    ),
    shipments: (
      <>
        <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" />
        <path d="M3 8.5 12 13l9-4.5" />
        <path d="M12 13v7" />
      </>
    ),
    bookings: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2.8h6V4" />
        <path d="m8.5 12.5 2.2 2.2 4.8-4.8" />
      </>
    ),
    invoices: (
      <>
        <path d="M6 3h9l3.5 3.5V21H6Z" />
        <path d="M14.6 3v3.9h3.9" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),
    password: (
      <>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
        <path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3" />
        <circle cx="12" cy="15.5" r="1.2" />
      </>
    ),
    notifications: (
      <>
        <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
        <path d="M10 18.5a2 2 0 0 0 4 0" />
      </>
    ),
    danger: (
      <>
        <path d="M12 3.5 21 19H3Z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <svg
      className={styles.sectionIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// The order they appear in, for the side navigation.
const SECTIONS = [
  { id: 'details', labelKey: 'profile.sections.details' },
  // The warehouse address to order to - see WarehouseAddressCard.jsx.
  { id: 'warehouse-address', labelKey: 'profile.sections.warehouseAddress' },
  { id: 'tracking', labelKey: 'profile.sections.tracking' },
  { id: 'shipments', labelKey: 'profile.sections.shipments' },
  { id: 'bookings', labelKey: 'profile.sections.bookings' },
  { id: 'invoices', labelKey: 'profile.sections.invoices' },
  { id: 'password', labelKey: 'profile.sections.password' },
  { id: 'two-factor', labelKey: 'profile.sections.twoFactor' },
  { id: 'notifications', labelKey: 'profile.sections.notifications' },
  { id: 'danger', labelKey: 'profile.sections.danger' },
];

export default function Profile() {
  const { t, language } = useLanguage();
  // setUser, because the header, the booking form and the dashboard's
  // customer table all render from the copy <AuthProvider> holds. Saving here
  // has to republish it, or the header goes on greeting the old name.
  const { signOut, setUser, user: signedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { hash } = location;
  // The "Go to the warehouse" form. Already open when the warehouse sent a
  // worker here to show their e-mail and PIN first (RequireWarehouse).
  const [unlocking, setUnlocking] = useState(Boolean(location.state?.openWarehouse));

  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState(null);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [notifications, setNotifications] = useState(null);

  // The invoices load on their own, separately from the profile above.
  // They are one card on a page of six, so a slow or failing invoice list
  // must not keep the visitor from changing their password.
  const [invoices, setInvoices] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [invoiceState, setInvoiceState] = useState('loading');

  // Asked for only while the e-mail box differs from the saved address: the
  // server refuses an e-mail change without it, because that address is
  // where a password-reset link goes.
  const [emailPassword, setEmailPassword] = useState('');
  const [detailErrors, setDetailErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});

  // One status slot per section, so saving the address does not clear a
  // message sitting above the password form.
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  // null | 'deleted' | 'anonymised' — set once the account is gone.
  const [deleted, setDeleted] = useState(null);

  // 'loading' | 'ready' | 'error'. Bumping `attempt` re-runs the fetch, which
  // is what the retry button does.
  const [loadState, setLoadState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getProfile()
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setDetails(loaded);
        setNotifications(loaded.notifications);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState('error');
      });

    return () => {
      // Stops a slow response from overwriting state after the visitor has
      // navigated away, or after a retry has already superseded it.
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;

    // No setInvoiceState('loading') here: 'loading' is the initial value, and
    // a retry re-runs this effect from behind the page-level spinner, so the
    // card is not on screen to show a stale message in the meantime.
    listInvoices()
      .then((loaded) => {
        if (cancelled) return;
        setInvoices(loaded);
        setInvoiceState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // Reported inside the card rather than thrown at the page, for the
        // same reason it is fetched separately.
        setInvoiceState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Arriving from another page with a section in the address - the header's
  // Track & Trace link, the old /tracking address - lands on that card. The
  // browser's own jump fires before the profile has loaded, when the cards
  // are not on the page yet, so it is made again once they are.
  useEffect(() => {
    if (loadState !== 'ready' || !hash) return;
    document
      .getElementById(decodeURIComponent(hash.slice(1)))
      ?.scrollIntoView({ block: 'start' });
  }, [loadState, hash]);

  // Back to the spinner, then bump `attempt` to re-run the effect above.
  function retry() {
    setLoadState('loading');
    setAttempt((n) => n + 1);
  }

  if (loadState === 'error') {
    return (
      <main className={styles.page}>
        <ConnectionError onRetry={retry} />
      </main>
    );
  }

  if (loadState === 'loading' || !details) {
    return (
      <main className={styles.page}>
        <Loading />
      </main>
    );
  }

  function setSectionStatus(section, value) {
    setStatus((current) => ({ ...current, [section]: value }));
  }

  function handleDetailChange(event) {
    const { name, value } = event.target;

    // Same rule as the signup form: the phone field refuses letters as they
    // are typed, rather than letting them through to the server.
    const sanitized = name === 'phone' ? sanitizePhone(value) : value;

    setDetails((current) => ({ ...current, [name]: sanitized }));
    setDetailErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswords((current) => ({ ...current, [name]: value }));
    setPasswordErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  // Shared shape for all four save handlers: run the call, report honestly.
  async function runSave(section, call, onSuccess) {
    setBusy((current) => ({ ...current, [section]: true }));
    setSectionStatus(section, null);

    try {
      await call();
      setSectionStatus(section, { ok: true, key: 'profile.saved' });
      onSuccess?.();
    } catch (error) {
      setSectionStatus(section, {
        ok: false,
        key: FAILURE_KEYS[error.code] ?? 'profile.errors.offline',
      });
    } finally {
      setBusy((current) => ({ ...current, [section]: false }));
    }
  }

  const emailChanging = Boolean(
    profile &&
      details &&
      details.email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase(),
  );

  function handleDetailsSubmit(event) {
    event.preventDefault();
    const found = validateDetails(details);
    if (emailChanging && !emailPassword) {
      found.emailPassword = 'profile.errors.currentRequired';
    }
    setDetailErrors(found);
    if (Object.keys(found).length > 0) return;

    runSave('details', async () => {
      const saved = await updateProfile({
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
        email: details.email.trim(),
        phone: details.phone.trim(),
        ...(emailChanging ? { currentPassword: emailPassword } : {}),
      });

      // Never leave a password sitting in state after the request.
      setEmailPassword('');
      setProfile(saved);
      // Only the identity fields: the address form below shares this state,
      // and an unsaved edit sitting in it should not be thrown away by a save
      // that was never about the address.
      setDetails((current) => ({
        ...current,
        name: saved.name,
        firstName: saved.firstName,
        lastName: saved.lastName,
        email: saved.email,
        phone: saved.phone,
      }));
      setUser(saved);
    });
  }

 

  function handlePasswordSubmit(event) {
    event.preventDefault();
    const found = validatePasswords(passwords);
    setPasswordErrors(found);
    if (Object.keys(found).length > 0) return;

    runSave(
      'password',
      () =>
        changePassword({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      // Never leave passwords sitting in state after the request.
      () => setPasswords(EMPTY_PASSWORDS),
    );
  }

  function handleNotificationsSubmit(event) {
    event.preventDefault();
    runSave('notifications', () => updateNotifications({ notifications }));
  }

  function handleDelete(event) {
    event.preventDefault();

    // The server demands the password too; checking here saves a round trip
    // and gives the same message as the other forms.
    if (!deletePassword) {
      setSectionStatus('danger', {
        ok: false,
        key: 'profile.errors.currentRequired',
      });
      return;
    }

    runSave(
      'danger',
      async () => {
        const result = await deleteAccount({ currentPassword: deletePassword });
        // Shipment records may have to be kept; say which happened rather
        // than claiming everything is gone.
        setDeleted(result?.anonymised ? 'anonymised' : 'deleted');
      },
      () => {
        setDeletePassword('');
        setConfirmingDelete(false);
      },
    );
  }

  const memberSince = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.memberSince));

  const invoiceDate = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Euros, because that is what the API sends and what the document says.
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
  });

  async function handleSignOut() {
    setBusy((current) => ({ ...current, logout: true }));

    try {
      await signOut();
    } finally {
      // Home rather than staying put: this page needs an account, so the
      // route guard would bounce them to the login form the moment the
      // session went away.
      navigate('/', { replace: true });
    }
  }

  // Rendered under every form; null when that section has nothing to report.
  function statusFor(section) {
    const value = status[section];
    if (!value) return null;

    return (
      <p
        className={value.ok ? styles.ok : styles.failure}
        role={value.ok ? 'status' : 'alert'}
      >
        {t(value.key)}
      </p>
    );
  }

  // The name at the top of the page, from the two boxes below as typed.
  const displayName = `${details.firstName} ${details.lastName}`.trim();

  return (
    <main className={styles.page}>

      {/* Removed automatically once profile.js talks to a real server */}
      {USING_PLACEHOLDER_DATA && (
        <p className={styles.notice} role="status">
          {t('profile.demoNotice')}
        </p>
      )}

      {/* The identity leads the page rather than sitting in a sidebar: it is
          the answer to "whose account is this", which is the first thing
          anyone checks. */}
      <section className={styles.identity}>
        <div className={styles.identityInner}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(displayName)}
          </span>
          <div className={styles.identityText}>
            <h1 className={styles.identityName}>{displayName}</h1>
            <p className={styles.identityEmail}>{details.email}</p>
            <p className={styles.identityMeta}>
              {t('profile.memberSince')} {memberSince}
              {profile.isStaff && (
                <span className={styles.staffBadge}>Staff</span>
              )}
            </p>
          </div>

          <div className={styles.identityActions}>
            {/* Staff only. Like the header's link this is a shortcut, not a
                permission — the dashboard has its own guard and the staff API
                checks the flag again on every request. Untranslated, because
                the back office is English throughout. */}
            {profile.isStaff ? (
              <Link to="/dashboard" className={styles.dashboardLink}>
                Dashboard
              </Link>
            ) : (
              // A warehouse worker reads this page in their own language,
              // so this one is translated. Straight in once this session has
              // opened the warehouse; otherwise it asks for their e-mail and
              // PIN first (WarehouseUnlock, below).
              profile.isWarehouse &&
              (signedIn?.warehouseUnlocked ? (
                <Link to="/warehouse" className={styles.dashboardLink}>
                  {t('profile.goToWarehouse')}
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.dashboardLink}
                  aria-expanded={unlocking}
                  onClick={() => setUnlocking((open) => !open)}
                >
                  {t('profile.goToWarehouse')}
                </button>
              ))
            )}
            <button
              type="button"
              className={styles.logout}
              onClick={handleSignOut}
              disabled={busy.logout}
            >
              {t('account.logout')}
            </button>
          </div>
        </div>
      </section>

      {unlocking && profile.isWarehouse && !profile.isStaff && (
        <div className={styles.unlockWrap}>
          <WarehouseUnlock
            onOpened={() =>
              navigate(location.state?.from ?? '/warehouse', { replace: true })
            }
            onCancel={() => setUnlocking(false)}
          />
        </div>
      )}

      {/* "What to do next" - customers only. Staff and warehouse workers
          land here too but never book shipments, so they skip it. */}
      {!profile.isStaff && !profile.isWarehouse && (
        <div className={styles.nextStepsWrap}>
          <NextSteps />
        </div>
      )}

      <div className={styles.layout}>
        {/* Five sections is enough that jumping beats scrolling. */}
        <nav className={styles.sideNav} aria-label={t('profile.title')}>
          {SECTIONS.filter(
            // The two-factor card only exists while the admin has it on -
            // or for an admin, who sets up their own app before switching it on.
            (section) =>
              section.id !== 'two-factor' ||
              (signedIn?.twoFactorMode ?? 'disabled') !== 'disabled' ||
              Boolean(signedIn?.isAdmin),
          ).map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={
                section.id === 'danger'
                  ? `${styles.sideLink} ${styles.sideLinkDanger}`
                  : styles.sideLink
              }
            >
              <SectionIcon name={section.id} />
              {t(section.labelKey)}
            </a>
          ))}
        </nav>

        <div className={styles.sections}>
          {/* Personal details */}
          <section className={styles.card} id="details">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="details" />
              {t('profile.sections.details')}
            </h2>

            <form className={styles.form} onSubmit={handleDetailsSubmit} noValidate>
              {/* First and last name in their own boxes, as the account
                  stores them - no guessing where a name splits. */}
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.firstName')}</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="firstName"
                    value={details.firstName}
                    onChange={handleDetailChange}
                    autoComplete="given-name"
                    aria-invalid={Boolean(detailErrors.firstName)}
                  />
                  {detailErrors.firstName && (
                    <span className={styles.error}>{t(detailErrors.firstName)}</span>
                  )}
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.lastName')}</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="lastName"
                    value={details.lastName}
                    onChange={handleDetailChange}
                    autoComplete="family-name"
                    aria-invalid={Boolean(detailErrors.lastName)}
                  />
                  {detailErrors.lastName && (
                    <span className={styles.error}>{t(detailErrors.lastName)}</span>
                  )}
                </label>
              </div>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.email')}</span>
                  <input
                    className={styles.input}
                    type="email"
                    name="email"
                    value={details.email}
                    onChange={handleDetailChange}
                    autoComplete="email"
                    aria-invalid={Boolean(detailErrors.email)}
                  />
                  {detailErrors.email && (
                    <span className={styles.error}>{t(detailErrors.email)}</span>
                  )}
                </label>

                {emailChanging && (
                  <label className={styles.field}>
                    <span className={styles.label}>
                      {t('profile.fields.currentPassword')}
                    </span>
                    <input
                      className={styles.input}
                      type="password"
                      name="emailPassword"
                      value={emailPassword}
                      onChange={(event) => {
                        setEmailPassword(event.target.value);
                        setDetailErrors((current) => {
                          if (!current.emailPassword) return current;
                          const next = { ...current };
                          delete next.emailPassword;
                          return next;
                        });
                      }}
                      autoComplete="current-password"
                      aria-invalid={Boolean(detailErrors.emailPassword)}
                    />
                    {detailErrors.emailPassword && (
                      <span className={styles.error}>{t(detailErrors.emailPassword)}</span>
                    )}
                  </label>
                )}

                <label className={styles.field}>
                  <span className={styles.label}>{t('profile.fields.phone')}</span>
                  <input
                    className={styles.input}
                    type="tel"
                    name="phone"
                    value={details.phone}
                    onChange={handleDetailChange}
                    autoComplete="tel"
                  />
                </label>
              </div>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.details}
              >
                {busy.details ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('details')}
            </form>
          </section>

          {/* The address to type into a webshop's checkout, so the order
              comes to our warehouse. The name is the saved one, not what is
              being typed in the form above. */}
          <WarehouseAddressCard
            firstName={profile.firstName}
            lastName={profile.lastName}
            icon={<SectionIcon name="address" />}
          />

          {/* Track & Trace lives here, in the account, rather than on a page
              of its own: a tracking number alone is not enough to follow a
              shipment, and the lookup only finds this customer's own. */}
          <section className={styles.card} id="tracking">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="tracking" />
              {t('profile.sections.tracking')}
            </h2>

            {/* With renderDetails, a number found here opens the whole
                order: booking, shipment, invoice and every webshop order
                with its courier - see TrackedOrder.jsx. */}
            <TrackingPanel
              variant="inline"
              renderDetails={(result) => <TrackedOrder result={result} invoices={invoices} />}
            />
          </section>

          

          {/* Invoices. Read-only: an invoice is a record of what was
              charged, so there is nothing here to edit. */}
          {/* Every shipment on its own, in the order they happened. A
              customer whose first shipment has already gone has a second one
              for what they bought afterwards, and telling which things are on
              which boat is only possible if the two are never merged. */}
          <section className={styles.card} id="shipments">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="shipments" />
              {t('profile.sections.shipments')}
            </h2>

            {/* Parcels the customer told us about, still on their way to
                our warehouse (or waiting to go into a shipment). */}
            <PreAlerts />

            {/* The invoices loaded for "Mijn facturen" below, so each
                shipment can show its own without a second request. */}
            <Shipments invoices={invoices} />
          </section>

          {/* The booking forms this customer sent while signed in - what
              they placed, exactly as they filled it in. */}
          <section className={styles.card} id="bookings">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="bookings" />
              {t('profile.sections.bookings')}
            </h2>
            <MyBookings />
          </section>

          <section className={styles.card} id="invoices">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="invoices" />
              {t('profile.sections.invoices')}
            </h2>

            <p className={styles.cardIntro}>{t('profile.invoices.intro')}</p>

            {invoiceState === 'loading' && (
              <p className={styles.invoiceMessage} role="status">
                {t('profile.invoices.loading')}
              </p>
            )}

            {invoiceState === 'error' && (
              <p className={styles.failure} role="alert">
                {t('profile.invoices.failed')}{' '}
                <button type="button" className={styles.linkButton} onClick={retry}>
                  {t('profile.invoices.retry')}
                </button>
              </p>
            )}

            {invoiceState === 'ready' && invoices.length === 0 && (
              <p className={styles.invoiceMessage}>{t('profile.invoices.empty')}</p>
            )}

            {invoiceState === 'ready' && invoices.length > 0 && (
              <ul className={styles.invoiceList}>
                {invoices.map((invoice) => (
                  <li key={invoice.id} className={styles.invoice}>
                    <div className={styles.invoiceText}>
                      <p className={styles.invoiceNumber}>{invoice.number}</p>
                      <p className={styles.invoiceMeta}>
                        {/* The date on the document rather than the moment
                            it was e-mailed. Those are usually the same day
                            and occasionally are not, and the one the customer
                            can check against the PDF is this one. */}
                        {invoice.datedOn || invoice.sentAt
                          ? invoiceDate.format(
                              new Date(invoice.datedOn ?? invoice.sentAt),
                            )
                          : ''}
                        {(invoice.datedOn || invoice.sentAt) && ' · '}
                        {t('profile.invoices.tracking')} {invoice.trackingNumber}
                      </p>
                      {invoice.description && (
                        <p className={styles.invoiceMeta}>{invoice.description}</p>
                      )}
                    </div>

                    <div className={styles.invoiceRight}>
                      {invoice.valueEur != null && (
                        <span className={styles.invoiceAmount}>
                          {money.format(Number(invoice.valueEur))}
                        </span>
                      )}
                      {/* A plain link, not a fetch: the session cookie rides
                          along on a normal navigation, and the browser's own
                          download handling beats rebuilding it with a blob.
                          The server sends Content-Disposition: attachment. */}
                      <a
                        className={styles.invoiceDownload}
                        href={invoice.downloadUrl}
                        download
                      >
                        {t('profile.invoices.download')}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Change password */}
          <section className={styles.card} id="password">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="password" />
              {t('profile.sections.password')}
            </h2>

            <form
              className={styles.form}
              onSubmit={handlePasswordSubmit}
              noValidate
            >
              <label className={styles.field}>
                <span className={styles.label}>
                  {t('profile.fields.currentPassword')}
                </span>
                <input
                  className={styles.input}
                  type="password"
                  name="currentPassword"
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  autoComplete="current-password"
                  aria-invalid={Boolean(passwordErrors.currentPassword)}
                />
                {passwordErrors.currentPassword && (
                  <span className={styles.error}>
                    {t(passwordErrors.currentPassword)}
                  </span>
                )}
              </label>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.fields.newPassword')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    name="newPassword"
                    value={passwords.newPassword}
                    onChange={handlePasswordChange}
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordErrors.newPassword)}
                  />
                  {passwordErrors.newPassword && (
                    <span className={styles.error}>
                      {t(passwordErrors.newPassword)}
                    </span>
                  )}
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.fields.confirmPassword')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    name="confirmPassword"
                    value={passwords.confirmPassword}
                    onChange={handlePasswordChange}
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordErrors.confirmPassword)}
                  />
                  {passwordErrors.confirmPassword && (
                    <span className={styles.error}>
                      {t(passwordErrors.confirmPassword)}
                    </span>
                  )}
                </label>
              </div>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.password}
              >
                {busy.password ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('password')}
            </form>
          </section>

          {/* Two-factor sign-in: drawn only while the admin has it switched on. */}
          <TwoFactorCard icon={<SectionIcon name="password" />} />

          {/* Notification preferences */}
          <section className={styles.card} id="notifications">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="notifications" />
              {t('profile.sections.notifications')}
            </h2>

            <form className={styles.form} onSubmit={handleNotificationsSubmit}>
              <ul className={styles.toggles}>
                {NOTIFICATION_KEYS.map((key) => (
                  <li key={key}>
                    <label className={styles.toggle}>
                      {/* A real checkbox, hidden but focusable, with the
                          switch drawn beside it — so the keyboard, the label
                          click and the screen reader all behave normally. */}
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={notifications[key]}
                        onChange={(event) =>
                          setNotifications((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span className={styles.switch} aria-hidden="true">
                        <span className={styles.switchThumb} />
                      </span>
                      <span className={styles.toggleLabel}>
                        {t(`profile.notifications.${key}`)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <button
                type="submit"
                className={styles.submit}
                disabled={busy.notifications}
              >
                {busy.notifications ? t('profile.saving') : t('profile.save')}
              </button>

              {statusFor('notifications')}
            </form>
          </section>

          {/* Deleting is irreversible, so it is visually separated and needs a
              second, explicit confirmation. */}
          <section className={`${styles.card} ${styles.danger}`} id="danger">
            <h2 className={styles.cardTitle}>
              <SectionIcon name="danger" />
              {t('profile.sections.danger')}
            </h2>
            <p className={styles.dangerText}>{t('profile.dangerText')}</p>

            {deleted ? (
              // The account is gone; there is nothing left to act on here.
              <p className={styles.ok} role="status">
                {deleted === 'anonymised'
                  ? t('profile.deleteAnonymised')
                  : t('profile.deleteDone')}
              </p>
            ) : confirmingDelete ? (
              <form className={styles.confirm} onSubmit={handleDelete}>
                <p className={styles.confirmText}>{t('profile.deleteConfirm')}</p>

                {/* The password is required by the server too. A destructive,
                    irreversible action should not ride on a session alone. */}
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t('profile.deletePasswordLabel')}
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>

                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      setDeletePassword('');
                      setConfirmingDelete(false);
                    }}
                  >
                    {t('profile.deleteCancel')}
                  </button>
                  <button
                    type="submit"
                    className={styles.deleteConfirmed}
                    disabled={busy.danger}
                  >
                    {t('profile.deleteYes')}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.delete}
                onClick={() => setConfirmingDelete(true)}
              >
                {t('profile.deleteAccount')}
              </button>
            )}

            {statusFor('danger')}
          </section>
        </div>
      </div>
    </main>
  );
}
