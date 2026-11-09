// src/pages/Booking/Booking.jsx
//
// The boekingsbon, typed rather than written. It follows the paper form's
// order so that somebody who knows the paper one is not hunting for anything,
// but it only asks for the sender's half — the shipping number, volume,
// weight and packing assessment are filled in at the counter afterwards.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /booking
//   Who can open: everybody (the bookings list is on /profile)
//   Links to:     / (Home), /profile, /terms
//   Linked from:  the Header and Footer menus, Tutorial, Profile
//   Backend:      api/booking.js, api/shops.js (OrdersField)
//
// TWO WAYS TO FILL IT IN (the choice at the top of the page)
//   Normal form   every section on one page, as it always was.
//   Guided form   the same sections one at a time - Shipment, Sender,
//                 Recipient, Consignment, Options - then a Review page with
//                 the terms and signature. Continue checks only the step on
//                 screen; Back and the progress bar never lose anything.
// Both are this one component with one set of answers (form + orders), one
// validate() and one handleSubmit(): the same checks, the same request, the
// same booking. Switching between them keeps everything typed so far.
// The choice of mode is remembered for this browser tab (sessionStorage) -
// only the word "normal" or "guided", never any of the answers.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DESTINATIONS,
  FREIGHT,
  submitBooking,
} from '../../api/booking';
import { API_ERRORS } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import OrdersField from './OrdersField';
import { newRow, toPayload, validateOrders } from './orders';
import { listShops } from '../../api/shops';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import { COMPANY } from '../../data/company';
import { connectBookingForm } from '../../components/ChatAssistant/bookingBridge';
import styles from './Booking.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

const EMPTY = {
  freight: 'sea',
  destination: 'CW',
  destination_other: '',

  sender_first_name: '',
  sender_last_name: '',
  sender_address: '',
  sender_postal_code: '',
  sender_city: '',
  sender_phone: '',
  sender_email: '',

  recipient_first_name: '',
  recipient_last_name: '',
  recipient_address: '',
  recipient_city: '',
  recipient_phone: '',
  recipient_email: '',
  recipient_crib_number: '',

  // Not asked any more: the number of parcels and their kind (counted at
  // the warehouse), packing, payment, vehicle and the value. The server's
  // defaults apply; the office fills in the value from the screenshots.

  emigration: false,
  id_present: false,
  deregistered: false,
  deregistration_present: false,

  insured: false,
  insured_value_eur: '',
  notes: '',

  signature_name: '',
  agreed_terms: false,
};

// Every required text field, with the key of the message shown when it is
// empty. Kept as data so the validator below is one loop rather than thirty
// near-identical ifs.
const REQUIRED = [
  ['sender_first_name', 'booking.errors.required'],
  ['sender_last_name', 'booking.errors.required'],
  ['sender_address', 'booking.errors.required'],
  ['sender_postal_code', 'booking.errors.required'],
  ['sender_city', 'booking.errors.required'],
  ['sender_phone', 'booking.errors.required'],
  ['sender_email', 'booking.errors.required'],
  ['recipient_first_name', 'booking.errors.required'],
  ['recipient_last_name', 'booking.errors.required'],
  ['recipient_address', 'booking.errors.required'],
  ['recipient_city', 'booking.errors.required'],
  ['recipient_phone', 'booking.errors.required'],
];

function validate(form) {
  const errors = {};

  for (const [field, key] of REQUIRED) {
    if (!String(form[field]).trim()) errors[field] = key;
  }

  if (form.sender_email && !EMAIL_PATTERN.test(form.sender_email.trim()))
    errors.sender_email = 'booking.errors.email';
  if (form.recipient_email && !EMAIL_PATTERN.test(form.recipient_email.trim()))
    errors.recipient_email = 'booking.errors.email';

  for (const field of ['sender_phone', 'recipient_phone']) {
    if (form[field].trim() && !PHONE_PATTERN.test(form[field].trim()))
      errors[field] = 'booking.errors.phone';
  }

  if (form.destination === 'other' && !form.destination_other.trim())
    errors.destination_other = 'booking.errors.required';


  if (form.insured && !(Number(form.insured_value_eur) > 0))
    errors.insured_value_eur = 'booking.errors.insuredValue';

  if (form.signature_name.trim().length < 3)
    errors.signature_name = 'booking.errors.signature';
  if (!form.agreed_terms) errors.agreed_terms = 'booking.errors.terms';

  return errors;
}

// The guided form's steps, in order. Each lists the fields it asks for, so
// Continue can check just those (validate() still checks everything).
// The consignment step's stores are checked by validateOrders.
const STEPS = [
  { key: 'shipment', fields: ['destination_other'] },
  {
    key: 'sender',
    fields: [
      'sender_first_name',
      'sender_last_name',
      'sender_address',
      'sender_postal_code',
      'sender_city',
      'sender_phone',
      'sender_email',
    ],
  },
  {
    key: 'recipient',
    fields: [
      'recipient_first_name',
      'recipient_last_name',
      'recipient_address',
      'recipient_city',
      'recipient_phone',
      'recipient_email',
      'recipient_crib_number',
    ],
  },
  { key: 'consignment', fields: [], orders: true },
  { key: 'options', fields: ['insured_value_eur', 'notes'] },
  { key: 'review', fields: ['agreed_terms', 'signature_name'] },
];
const REVIEW_STEP = STEPS.length - 1;

/** The errors validate() found that belong to one step. */
function errorsForStep(index, allErrors) {
  return Object.fromEntries(
    Object.entries(allErrors).filter(([field]) => STEPS[index].fields.includes(field)),
  );
}

// Which mode this tab last used. Only the mode - no answers - is stored, and
// a browser that refuses storage simply starts on the normal form.
const MODE_KEY = 'plsm.bookingMode';

function rememberedMode() {
  try {
    return window.sessionStorage.getItem(MODE_KEY) === 'guided' ? 'guided' : 'normal';
  } catch {
    return 'normal';
  }
}

function rememberMode(mode) {
  try {
    window.sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; nothing else changes.
  }
}

const FAILURE_KEYS = {
  [API_ERRORS.RATE_LIMITED]: 'booking.errors.tooMany',
  [API_ERRORS.VALIDATION]: 'booking.errors.invalid',
  [API_ERRORS.UNAVAILABLE]: 'booking.errors.offline',
};

/** A labelled text input, since the form has thirty of them. */
function TextField({
  name,
  labelKey,
  type = 'text',
  autoComplete,
  required = true,
  form,
  errors,
  onChange,
  t,
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {t(labelKey)}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        className={styles.input}
        type={type}
        name={name}
        value={form[name]}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={Boolean(errors[name])}
      />
      {errors[name] && <span className={styles.error}>{t(errors[name])}</span>}
    </label>
  );
}

/** A row of radio buttons rendered as selectable cards. */
function ChoiceRow({ name, options, form, onChange, t }) {
  return (
    <div className={styles.choices} role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label
          key={option.value}
          className={
            form[name] === option.value
              ? `${styles.choice} ${styles.choiceOn}`
              : styles.choice
          }
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={form[name] === option.value}
            onChange={onChange}
            className={styles.choiceInput}
          />
          {option.labelKey ? t(option.labelKey) : option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * The guided form's review: every answer, section by section, each with an
 * Edit button that goes straight back to its step. Nothing here can be
 * changed directly - Edit, change, Continue back to here.
 */
function Review({ form, orders, shopNames, onEdit, t }) {
  const yes = t('booking.guided.yes');
  const no = t('booking.guided.no');
  const destination =
    form.destination === 'other'
      ? form.destination_other
      : (DESTINATIONS.find((item) => item.value === form.destination)?.label ?? form.destination);
  const freight = FREIGHT.find((item) => item.value === form.freight);

  const sections = [
    {
      step: 0,
      title: t('booking.sections.shipment'),
      rows: [
        [t('booking.freightLabel'), freight ? t(freight.labelKey) : form.freight],
        [t('booking.destinationLabel'), destination],
      ],
    },
    {
      step: 1,
      title: t('booking.sections.sender'),
      rows: [
        [t('booking.guided.name'), `${form.sender_first_name} ${form.sender_last_name}`],
        [t('booking.address'), `${form.sender_address}, ${form.sender_postal_code} ${form.sender_city}`],
        [t('booking.phone'), form.sender_phone],
        [t('booking.email'), form.sender_email],
      ],
    },
    {
      step: 2,
      title: t('booking.sections.recipient'),
      rows: [
        [t('booking.guided.name'), `${form.recipient_first_name} ${form.recipient_last_name}`],
        [t('booking.address'), `${form.recipient_address}, ${form.recipient_city}`],
        [t('booking.phone'), form.recipient_phone],
        [t('booking.emailOptional'), form.recipient_email || '—'],
        [t('booking.cribOptional'), form.recipient_crib_number || '—'],
      ],
    },
    {
      step: 3,
      title: t('booking.sections.consignment'),
      rows: orders.map((row, index) => [
        `${t('booking.guided.store')} ${index + 1}`,
        [
          row.shop === 'other' ? row.shopName : (shopNames[row.shop] ?? row.shop),
          row.products
            .map((product) =>
              [
                product.description,
                product.file ? `📎 ${product.file.name}` : null,
              ]
                .filter(Boolean)
                .join(' '),
            )
            .join('; '),
        ]
          .filter(Boolean)
          .join(' · '),
      ]),
    },
    {
      step: 4,
      title: t('booking.guided.optionsTitle'),
      rows: [
        [
          t('booking.sections.insurance'),
          form.insured ? `${yes} · € ${form.insured_value_eur}` : no,
        ],
        [t('booking.notes'), form.notes.trim() || '—'],
      ],
    },
  ];

  return (
    <section className={styles.card} aria-labelledby="booking-review-title">
      <h2 className={styles.legend} id="booking-review-title">
        {t('booking.guided.reviewTitle')}
      </h2>
      <p className={styles.hint}>{t('booking.guided.reviewText')}</p>
      {sections.map((section) => (
        <div key={section.step} className={styles.reviewSection}>
          <div className={styles.reviewHead}>
            <h3 className={styles.reviewTitle}>{section.title}</h3>
            <button
              type="button"
              className={styles.reviewEdit}
              onClick={() => onEdit(section.step)}
              aria-label={`${t('booking.guided.edit')}: ${section.title}`}
            >
              {t('booking.guided.edit')}
            </button>
          </div>
          <dl className={styles.reviewList}>
            {section.rows.map(([label, value]) => (
              <div key={label} className={styles.reviewRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

export default function Booking() {
  const { t, language } = useLanguage();
  usePageMeta(t('booking.title'), t('booking.lead'), '/booking');
  const { user } = useAuth();

  // A signed-in customer already told us who they are; the sender block starts
  // filled in and stays editable, because people post on behalf of others.
  // Whether "How does the insurance work?" is open (section 6).
  const [insuranceInfoOpen, setInsuranceInfoOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    sender_first_name: user?.firstName ?? '',
    sender_last_name: user?.lastName ?? '',
    sender_email: user?.email ?? '',
    sender_phone: user?.phone ?? '',
    signature_name: user?.name?.trim() ?? '',
  }));

  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState(null);
  // "Uw bestellingen": one row per store, each with what was bought and
  // an optional screenshot (OrdersField, rules in orders.js).
  const [orders, setOrders] = useState(() => [newRow()]);
  const [orderErrors, setOrderErrors] = useState({});
  // Shown when the server refused a store or a screenshot.
  const [orderServerError, setOrderServerError] = useState(null);

  // "normal": everything on one page. "guided": one step at a time.
  const [mode, setModeState] = useState(rememberedMode);
  // The guided form's step on screen, and the furthest one reached: steps up
  // to there can be revisited from the progress bar.
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  // Names of the listed stores, for the Review page (OrdersField loads its
  // own copy for the drop-down).
  const [shopNames, setShopNames] = useState({});
  const guided = mode === 'guided';
  const shows = (index) => !guided || step === index;

  function setMode(next) {
    setModeState(next);
    rememberMode(next);
  }

  useEffect(() => {
    if (!guided) return undefined;
    let cancelled = false;
    listShops().then(
      (shops) => {
        if (!cancelled) setShopNames(Object.fromEntries(shops.map((shop) => [String(shop.id), shop.name])));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [guided]);

  // Something typed and not sent yet: ask before the tab is closed or
  // reloaded, which would lose it (nothing is saved anywhere until Send).
  const dirty = useMemo(
    () =>
      Object.entries(EMPTY).some(([name, empty]) =>
        ['sender_first_name', 'sender_last_name', 'sender_email', 'sender_phone', 'signature_name'].includes(name)
          ? false
          : form[name] !== empty,
      ) || orders.some(
        (row) =>
          row.shop ||
          row.products.some((product) => product.description.trim() || product.url.trim() || product.file),
      ),
    [form, orders],
  );
  useEffect(() => {
    if (!dirty || reference) return undefined;
    function warn(event) {
      event.preventDefault();
      // Older browsers need a value here to show their own warning.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, reference]);

  /** Check one guided step; show its problems. Returns true when it is fine. */
  function checkStep(index) {
    const found = errorsForStep(index, validate(form));
    const foundInOrders = STEPS[index].orders ? validateOrders(orders) : {};
    setErrors((current) => ({ ...current, ...found }));
    if (STEPS[index].orders) setOrderErrors(foundInOrders);
    const ok = Object.keys(found).length === 0 && Object.keys(foundInOrders).length === 0;
    if (!ok) {
      // Wait for the messages to render, then bring the first into view.
      window.requestAnimationFrame(() =>
        document.querySelector('[aria-invalid="true"]')?.focus?.(),
      );
    }
    return ok;
  }

  /** Show step `index`, at the top of the form. */
  function showStep(index) {
    setStep(index);
    setFurthest((current) => Math.max(current, index));
    window.requestAnimationFrame(() =>
      document.getElementById('booking-step-title')?.focus({ preventScroll: false }),
    );
  }

  /**
   * Go to a step. Backwards always; forwards only through every step in
   * between passing its checks, so a step can never be skipped by clicking
   * ahead in the progress bar.
   */
  function goTo(target) {
    if (target <= step) {
      showStep(target);
      return;
    }
    for (let index = step; index < target; index += 1) {
      if (!checkStep(index)) {
        showStep(index);
        return;
      }
    }
    showStep(target);
  }

  // The chat assistant can type answers into this form (see
  // components/ChatAssistant/bookingBridge.js). Its fields are already
  // checked against the form's own; anything it filled loses its old error.
  useEffect(
    () =>
      connectBookingForm((fields) => {
        setForm((current) => ({ ...current, ...fields }));
        setErrors((current) =>
          Object.fromEntries(Object.entries(current).filter(([name]) => !(name in fields))),
        );
      }),
    [],
  );

  function set(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    set(name, type === 'checkbox' ? checked : value);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Enter in a field of the guided form means Continue, not Send: the
    // booking is only sent from the Review step.
    if (guided && step !== REVIEW_STEP) {
      if (checkStep(step)) showStep(step + 1);
      return;
    }

    const found = validate(form);
    const foundInOrders = validateOrders(orders);
    setErrors(found);
    setOrderErrors(foundInOrders);
    setFailureKey(null);

    if (Object.keys(found).length > 0 || Object.keys(foundInOrders).length > 0) {
      if (guided) {
        // The first step with a problem, so the customer sees it.
        const first = STEPS.findIndex(
          (item, index) =>
            Object.keys(errorsForStep(index, found)).length > 0 ||
            (item.orders && Object.keys(foundInOrders).length > 0),
        );
        if (first !== -1 && first !== step) showStep(first);
        return;
      }
      // Straight to the first thing that needs fixing: this form is long
      // enough that an error above the fold is an error nobody sees.
      const first = Object.keys(found)[0];
      const target = first
        ? document.querySelector(`[name="${first}"]`)
        : document.querySelector('[aria-invalid="true"]');
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // Already sending: a second click must not send a second booking.
    if (busy) return;
    setBusy(true);
    setOrderServerError(null);
    try {
      const saved = await submitBooking(
        {
          ...form,
          insured_value_eur: form.insured ? form.insured_value_eur : null,
          language,
        },
        toPayload(orders),
        // No screenshot per store any more, only per product.
        [],
        orders.map((row) => row.products.map((product) => product.file)),
      );
      setReference(saved);
    } catch (error) {
      // A store or a screenshot was refused: say so next to the stores.
      if (error.fields?.orders) {
        setOrderServerError(t('booking.orders.refused'));
        // In the guided form the stores are on their own step: go there.
        if (guided) showStep(3);
      }
      setFailureKey(FAILURE_KEYS[error.code] ?? 'booking.errors.offline');
    } finally {
      setBusy(false);
    }
  }

  // Spread into each field below. A plain object, deliberately — a wrapper
  // component declared here would be a new component type on every render,
  // and React would remount the input on every keystroke.
  const shared = { form, errors, onChange: handleChange, t };

  if (reference) {
    return (
      <main className={styles.page}>
        <section className={styles.done}>
          <span className={styles.doneMark} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 className={styles.doneTitle}>{t('booking.done.title')}</h1>
          <p className={styles.doneBody}>{t('booking.done.body')}</p>
          <p className={styles.doneRef}>
            {t('booking.done.reference')} <b>#{reference.id}</b>
          </p>
          {/* Signed in: the booking is in their account, so send them
              there. Not signed in: it is not linked to any account, so say
              how to see the next one. */}
          {!user && <p className={styles.doneBody}>{t('booking.done.signInTip')}</p>}
          <div className={styles.doneActions}>
            {user && (
              <Link to="/profile#bookings" className={styles.doneLink}>
                {t('booking.done.seeBookings')}
              </Link>
            )}
            <Link
              to="/"
              className={user ? `${styles.doneLink} ${styles.doneLinkQuiet}` : styles.doneLink}
            >
              {t('booking.done.home')}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* data-tour="..." on this page: what the robot's page tour
          highlights (src/components/Tutorial/tutorialSteps.js). */}
      <section className={styles.banner} data-tour="booking-intro">
        <div className={styles.bannerInner}>
          <p className={styles.eyebrow}>{COMPANY.name}</p>
          <h1 className={styles.title}>{t('booking.title')}</h1>
          <p className={styles.lead}>{t('booking.lead')}</p>
        </div>
      </section>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {/* Normal form or guided form. Radio buttons dressed as cards: one
            choice, both always visible, and the arrow keys move between them. */}
        <fieldset className={styles.modeCard} data-tour="booking-mode">
          <legend className={styles.modeLegend}>{t('booking.mode.title')}</legend>
          <div className={styles.modes}>
            {['normal', 'guided'].map((option) => (
              <label key={option} className={mode === option ? `${styles.mode} ${styles.modeOn}` : styles.mode}>
                <input
                  type="radio"
                  name="booking-mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => setMode(option)}
                  className={styles.choiceInput}
                />
                <span className={styles.modeName}>{t(`booking.mode.${option}`)}</span>
                <span className={styles.modeText}>{t(`booking.mode.${option}Text`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {guided && (
          <nav className={styles.progress} aria-label={t('booking.steps.label')}>
            {/* Always there for screen readers; the only part shown on a phone. */}
            <p className={styles.progressCompact} id="booking-step-title" tabIndex={-1}>
              {t('booking.steps.counter')
                .replace('{step}', String(step + 1))
                .replace('{total}', String(STEPS.length))
                .replace('{name}', t(`booking.steps.${STEPS[step].key}`))}
            </p>
            <ol className={styles.progressList}>
              {STEPS.map((item, index) => {
                const state = index === step ? 'current' : index < step || index <= furthest ? 'done' : 'todo';
                const reachable = index <= furthest && index !== step;
                return (
                  <li key={item.key} className={styles.progressStep} data-state={state}>
                    {reachable ? (
                      <button type="button" className={styles.progressButton} onClick={() => goTo(index)}>
                        <span className={styles.progressNumber}>{index + 1}</span>
                        {t(`booking.steps.${item.key}`)}
                      </button>
                    ) : (
                      <span className={styles.progressButton} aria-current={index === step ? 'step' : undefined}>
                        <span className={styles.progressNumber}>{index + 1}</span>
                        {t(`booking.steps.${item.key}`)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {failureKey && (
          <p className={styles.failure} role="alert">
            {t(failureKey)}
          </p>
        )}

        {/* 1 — the shipment ------------------------------------------- */}
        {shows(0) && (
        <fieldset className={styles.card} data-tour="booking-shipment">
          <legend className={styles.legend}>{t('booking.sections.shipment')}</legend>

          <div className={styles.field}>
            <span className={styles.label}>{t('booking.freightLabel')}</span>
            <ChoiceRow name="freight" options={FREIGHT} {...shared} />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{t('booking.destinationLabel')}</span>
            <ChoiceRow name="destination" options={DESTINATIONS} {...shared} />
            {form.destination === 'other' && (
              <>
                <input
                  className={styles.input}
                  type="text"
                  name="destination_other"
                  value={form.destination_other}
                  onChange={handleChange}
                  placeholder={t('booking.destinationOtherPlaceholder')}
                  aria-invalid={Boolean(errors.destination_other)}
                  aria-label={t('booking.destinationOther')}
                />
                {errors.destination_other && (
                  <span className={styles.error}>{t(errors.destination_other)}</span>
                )}
              </>
            )}
          </div>
        </fieldset>
        )}

        {/* 2 — sender ------------------------------------------------- */}
        {shows(1) && (
        <fieldset className={styles.card} data-tour="booking-sender">
          <legend className={styles.legend}>{t('booking.sections.sender')}</legend>

          <div className={styles.row}>
            <TextField name="sender_first_name" labelKey="booking.firstName" autoComplete="given-name" {...shared} />
            <TextField name="sender_last_name" labelKey="booking.lastName" autoComplete="family-name" {...shared} />
          </div>
          <TextField name="sender_address" labelKey="booking.address" autoComplete="street-address" {...shared} />
          <div className={styles.row}>
            <TextField name="sender_postal_code" labelKey="booking.postalCode" autoComplete="postal-code" {...shared} />
            <TextField name="sender_city" labelKey="booking.city" autoComplete="address-level2" {...shared} />
          </div>
          <div className={styles.row}>
            <TextField name="sender_phone" labelKey="booking.phone" type="tel" autoComplete="tel" {...shared} />
            <TextField name="sender_email" labelKey="booking.email" type="email" autoComplete="email" {...shared} />
          </div>
        </fieldset>
        )}

        {/* 3 — recipient ---------------------------------------------- */}
        {shows(2) && (
        <fieldset className={styles.card}>
          <legend className={styles.legend}>{t('booking.sections.recipient')}</legend>
          {/* In the guided form, say whose details these are. */}
          {guided && <p className={styles.hint}>{t('booking.guided.recipientHint')}</p>}

          <div className={styles.row}>
            <TextField name="recipient_first_name" labelKey="booking.firstName" {...shared} />
            <TextField name="recipient_last_name" labelKey="booking.lastName" {...shared} />
          </div>
          <TextField name="recipient_address" labelKey="booking.address" {...shared} />
          <TextField name="recipient_city" labelKey="booking.city" {...shared} />
          <div className={styles.row}>
            <TextField name="recipient_phone" labelKey="booking.phone" type="tel" {...shared} />
            <TextField
              name="recipient_email"
              labelKey="booking.emailOptional"
              type="email"
              required={false} {...shared} />
          </div>
          <TextField
            name="recipient_crib_number"
            labelKey="booking.cribOptional"
            autoComplete="off"
            required={false} {...shared} />
        </fieldset>
        )}

        {/* 4 — the consignment ---------------------------------------- */}
        {shows(3) && (
        <fieldset className={styles.card} data-tour="booking-consignment">
          <legend className={styles.legend}>{t('booking.sections.consignment')}</legend>

          {/* Which stores they bought from, what, and a screenshot of each
              order. Replaces the paper form's "Inhoud" box: the server
              writes the contents line for customs from these rows. */}
          <OrdersField
            rows={orders}
            onChange={(next) => {
              setOrders(next);
              setOrderErrors({});
              setOrderServerError(null);
            }}
            errors={orderErrors}
            serverError={orderServerError}
            t={t}
            language={language}
          />
        </fieldset>
        )}

        {/* Emigration is no longer asked on the booking form. The fields
            stay in the form state as false, so the server keeps its
            defaults and older bookings keep what they had. */}

        {/* 6 — insurance ---------------------------------------------- */}
        {shows(4) && (
        <fieldset className={styles.card} data-tour="booking-insurance">
          <legend className={styles.legend}>{t('booking.sections.insurance')}</legend>

          <label className={styles.check}>
            <input
              type="checkbox"
              name="insured"
              checked={form.insured}
              onChange={(event) => {
                handleChange(event);
                // What it costs, shown the moment somebody chooses it: the
                // minimum premium is not something to find out afterwards.
                if (event.target.checked) setInsuranceInfoOpen(true);
              }}
            />
            {t('booking.insured')}
          </label>

          {/* How the insurance works. A button that opens it rather than a
              hover: hover does not exist on a phone, and a keyboard or screen
              reader user can reach a button. */}
          <div className={styles.infoWrap}>
            <button
              type="button"
              className={styles.infoButton}
              aria-expanded={insuranceInfoOpen}
              aria-controls="booking-insurance-info"
              onClick={() => setInsuranceInfoOpen((open) => !open)}
            >
              <span className={styles.infoIcon} aria-hidden="true">
                i
              </span>
              {t('booking.insuranceInfo.button')}
            </button>
            {insuranceInfoOpen && (
              <div className={styles.infoPanel} id="booking-insurance-info" role="note">
                <p>{t('booking.insuranceInfo.text')}</p>
              </div>
            )}
          </div>

          {form.insured && (
            <label className={styles.field}>
              <span className={styles.label}>{t('booking.insuredValue')}</span>
              <div className={styles.money}>
                <span className={styles.moneySign} aria-hidden="true">€</span>
                <input
                  className={`${styles.input} ${styles.moneyInput}`}
                  type="number"
                  name="insured_value_eur"
                  min="0"
                  step="0.01"
                  value={form.insured_value_eur}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.insured_value_eur)}
                />
              </div>
              {errors.insured_value_eur && (
                <span className={styles.error}>{t(errors.insured_value_eur)}</span>
              )}
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.label}>{t('booking.notes')}</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              name="notes"
              rows={3}
              value={form.notes}
              onChange={handleChange}
            />
          </label>
        </fieldset>
        )}

        {/* The guided form's review: everything, with Edit per section. */}
        {guided && step === REVIEW_STEP && (
          <Review form={form} orders={orders} shopNames={shopNames} onEdit={showStep} t={t} />
        )}

        {/* 7 — terms and signature ------------------------------------ */}
        {shows(REVIEW_STEP) && (
        <fieldset className={`${styles.card} ${styles.terms}`} data-tour="booking-terms">
          <legend className={styles.legend}>{t('booking.sections.terms')}</legend>

          {/* The clause the sender agrees to, in the visitor's chosen
              language. The Dutch text in translations.js is the original
              from the paper form; English and Papiamentu are translations. */}
          <div className={styles.termsText}>
            <p>
              <b>{t('booking.termsClause.important')}</b>{' '}
              {t('booking.termsClause.agreeBefore')}{' '}
              <Link to="/terms" target="_blank" rel="noopener">
                {t('booking.termsClause.termsLink')}
              </Link>
              .
            </p>
            <p>
              {t('booking.termsClause.liability').replace(
                '{company}',
                COMPANY.name.toUpperCase(),
              )}
            </p>
            <p>{t('booking.termsClause.insurance')}</p>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              name="agreed_terms"
              checked={form.agreed_terms}
              onChange={handleChange}
              aria-invalid={Boolean(errors.agreed_terms)}
            />
            {t('booking.agree')}
          </label>
          {errors.agreed_terms && (
            <span className={styles.error}>{t(errors.agreed_terms)}</span>
          )}

          <label className={styles.field}>
            <span className={styles.label}>
              {t('booking.signature')}
              <span className={styles.required} aria-hidden="true"> *</span>
            </span>
            <input
              className={`${styles.input} ${styles.signature}`}
              type="text"
              name="signature_name"
              value={form.signature_name}
              onChange={handleChange}
              autoComplete="name"
              aria-invalid={Boolean(errors.signature_name)}
            />
            <span className={styles.hint}>{t('booking.signatureHint')}</span>
            {errors.signature_name && (
              <span className={styles.error}>{t(errors.signature_name)}</span>
            )}
          </label>
        </fieldset>
        )}

        {/* Normal form, or the guided form's last step: send. Otherwise
            Back and Continue. */}
        {!guided || step === REVIEW_STEP ? (
          <div className={styles.actions}>
            {guided && (
              <button type="button" className={styles.back} onClick={() => showStep(step - 1)}>
                {t('booking.guided.back')}
              </button>
            )}
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? t('booking.sending') : t('booking.submit')}
            </button>
            <p className={styles.officeNote}>{t('booking.officeNote')}</p>
          </div>
        ) : (
          <div className={styles.actions}>
            {step > 0 && (
              <button type="button" className={styles.back} onClick={() => showStep(step - 1)}>
                {t('booking.guided.back')}
              </button>
            )}
            <button
              type="button"
              className={styles.submit}
              onClick={() => {
                if (checkStep(step)) showStep(step + 1);
              }}
            >
              {t('booking.guided.continue')}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
