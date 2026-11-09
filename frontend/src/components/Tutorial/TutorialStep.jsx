// src/components/Tutorial/TutorialStep.jsx
//
// The inside of the tour card for one step: the title, the text, and the
// extra content that belongs to the step's `kind` (see tutorialSteps.js).
//
// All words come from translations.js under `onboarding.*`. The facts - the
// address, the phone number, the sailing days - come from the data files in
// src/data, so the tour can never disagree with the rest of the website.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownIcon,
  CartIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HomeIcon,
  PlaneIcon,
  ShipIcon,
  WarehouseIcon,
} from '../Icons/icons';
import { CONTACT, WAREHOUSE_ADDRESS } from '../../data/company';
import { copyText } from '../../utils/copyText';
import { DESTINATIONS } from '../../data/destinations';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { useTutorial } from './useTutorial';
import styles from './Tutorial.module.css';

// Placeholders a step's texts may use, filled in from src/data/company.js so
// the e-mail address is written down in one place only. Example in
// translations.js: 'E-mail us at {email}.'
const PLACEHOLDERS = { email: CONTACT.email };

/**
 * t() returns the key itself when a text is missing. This returns the text,
 * or null when there is none, so optional texts can simply be left out of
 * translations.js.
 */
function useOptional() {
  const { t } = useLanguage();
  return (key) => {
    const value = t(key);
    return value === key ? null : fill(value, PLACEHOLDERS);
  };
}

/** A value from translations.js that should be a list. */
function asList(value) {
  return Array.isArray(value) ? value : [];
}

// ---- kind: 'welcome' ------------------------------------------------------

function WelcomeExtra() {
  const { t } = useLanguage();
  return (
    <p className={styles.duration}>
      <ClockIcon size={18} /> {t('onboarding.duration')}
    </p>
  );
}

// ---- kind: 'address' ------------------------------------------------------

function AddressCard() {
  const { t } = useLanguage();
  // 'idle' | 'copied' | 'failed'
  const [copyState, setCopyState] = useState('idle');
  const resetTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const rows = [
    // The same order as "Your shipping address" in the account
    // (WarehouseAddressCard.jsx): first name = the customer's own (that is
    // how the warehouse knows whose parcel it is), last name = our name
    // ("Pay less Shop More"). The first name is shown as an instruction (in
    // italics), not as something to copy. The wording is shared with the
    // tutorial page (tutorial.address.firstNameValue), so the two always
    // say the same.
    {
      label: t('onboarding.address.firstName'),
      value: t('tutorial.address.firstNameValue'),
      ownValue: true,
    },
    { label: t('onboarding.address.lastName'), value: WAREHOUSE_ADDRESS.lastName },
    { label: t('onboarding.address.street'), value: WAREHOUSE_ADDRESS.street },
    { label: t('onboarding.address.postcode'), value: WAREHOUSE_ADDRESS.postcode },
    { label: t('onboarding.address.city'), value: WAREHOUSE_ADDRESS.town },
    {
      label: t('onboarding.address.country'),
      value: t('onboarding.address.countryValue'),
    },
  ];

  async function handleCopy() {
    // Everything except the first name, one line per field, as it would be
    // written on an envelope.
    const text = [
      WAREHOUSE_ADDRESS.lastName,
      WAREHOUSE_ADDRESS.street,
      `${WAREHOUSE_ADDRESS.postcode} ${WAREHOUSE_ADDRESS.town}`,
      t('onboarding.address.countryValue'),
    ].join('\n');

    const ok = await copyText(text);
    setCopyState(ok ? 'copied' : 'failed');
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 3000);
  }

  return (
    <div className={styles.addressCard}>
      <dl className={styles.addressList}>
        {rows.map((row) => (
          <div key={row.label} className={styles.addressRow}>
            <dt>{row.label}</dt>
            <dd className={row.ownValue ? styles.ownValue : undefined}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <button type="button" className={styles.copyButton} onClick={handleCopy}>
        {copyState === 'copied' ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
        {copyState === 'copied'
          ? t('onboarding.address.copied')
          : t('onboarding.address.copy')}
      </button>

      {/* Announced to screen readers when it changes. */}
      <p className={styles.copyStatus} role="status">
        {copyState === 'failed' ? t('onboarding.address.copyFailed') : ''}
      </p>
    </div>
  );
}

// ---- kind: 'flow' ---------------------------------------------------------

const FLOW = [
  { key: 'store', Icon: CartIcon },
  { key: 'warehouse', Icon: WarehouseIcon },
  { key: 'shipping', Icon: ShipIcon },
  { key: 'destination', Icon: HomeIcon },
];

function FlowDiagram() {
  const { t } = useLanguage();
  return (
    // An ordered list: the order is the whole point.
    <ol className={styles.flow} aria-label={t('onboarding.flow.label')}>
      {FLOW.map((item, index) => (
        <li key={item.key} className={styles.flowItem}>
          <span className={styles.flowBox}>
            <span className={styles.flowIcon}>
              <item.Icon size={22} />
            </span>
            {t(`onboarding.flow.${item.key}`)}
          </span>
          {index < FLOW.length - 1 && (
            <span className={styles.flowArrow}>
              <ArrowDownIcon size={22} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---- kind: 'shipping' -----------------------------------------------------

function ShippingCards() {
  const { t } = useLanguage();
  const { close } = useTutorial();

  // Curaçao first in both cards (our main destination), then the rest.
  const curacaoFirst = (isCuracao) => (isCuracao ? 0 : 1);

  // Sea freight: every island with its days at sea - Curaçao first, then
  // the others shortest first. The numbers are the `transitDays` in
  // src/data/destinations.js.
  const sea = [...DESTINATIONS].sort(
    (a, b) =>
      curacaoFirst(a.slug === 'curacao') - curacaoFirst(b.slug === 'curacao') ||
      a.transitDays - b.transitDays,
  );

  // Air freight: which islands each departure applies to, from the
  // `flights` lists in destinations.js. A departure every island has is
  // shown once, as "All islands".
  const flightKeys = [...new Set(DESTINATIONS.flatMap((d) => d.flights ?? []))];
  const air = flightKeys
    .map((key) => {
      const islands = DESTINATIONS.filter((d) => d.flights?.includes(key));
      return {
        key,
        // A flight only for Curaçao goes above "All islands".
        curacaoOnly: islands.length === 1 && islands[0].slug === 'curacao',
        who:
          islands.length === DESTINATIONS.length
            ? t('onboarding.shipping.allIslands')
            : islands.map((d) => t(d.nameKey)).join(', '),
        text: t(`home.map.flights.${key}`),
      };
    })
    .sort((a, b) => curacaoFirst(a.curacaoOnly) - curacaoFirst(b.curacaoOnly));

  return (
    <>
      <div className={styles.shippingGrid}>
        {/* Air freight first: the fastest way, then sea freight. */}
        <section className={styles.shippingCard}>
          <h3 className={styles.shippingTitle}>
            <PlaneIcon size={22} /> {t('home.map.air')}
          </h3>
          <p className={styles.shippingLead}>{t('onboarding.shipping.faster')}</p>
          <ul className={styles.shippingList}>
            {air.map((flight) => (
              <li key={flight.key}>
                <strong>{flight.who}</strong>
                <span>{flight.text}</span>
              </li>
            ))}
          </ul>
          <p className={styles.shippingNote}>{t('home.map.airClearance')}</p>
        </section>

        <section className={styles.shippingCard}>
          <h3 className={styles.shippingTitle}>
            <ShipIcon size={22} /> {t('home.map.sea')}
          </h3>
          <ul className={styles.shippingList}>
            {sea.map((destination) => (
              <li key={destination.slug}>
                <strong>{t(destination.nameKey)}</strong>
                <span>
                  {fill(t('home.map.seaDays'), { days: destination.transitDays })}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.shippingNote}>{t('home.map.seaClearance')}</p>
        </section>
      </div>

      <p className={styles.disclaimer}>{t('onboarding.shipping.disclaimer')}</p>

      {/* The price depends on the shipment, so the tour gives none: it sends
          the visitor to the quote form, which is on each island's page. The
          link closes the tour (and counts it as seen). */}
      <p className={styles.quoteLine}>
        {t('onboarding.shipping.quoteQuestion')}{' '}
        <Link to="/destinations" onClick={close}>
          {t('onboarding.shipping.quoteLink')}
        </Link>
      </p>
    </>
  );
}

// ---- kind: 'help' ---------------------------------------------------------

function HelpExtra() {
  const { t } = useLanguage();

  return (
    <>
      <ul className={styles.topics}>
        {asList(t('onboarding.help.topics')).map((topic) => (
          <li key={topic} className={styles.topic}>
            {topic}
          </li>
        ))}
      </ul>

      <p className={styles.contactLine}>
        {t('onboarding.help.contact')}{' '}
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        {' · '}
        <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
      </p>
      <p className={styles.textSmall}>{t('onboarding.help.again')}</p>

      <div className={styles.done}>
        <p className={styles.doneTitle}>
          <CheckCircleIcon size={24} /> {t('onboarding.help.doneTitle')}
        </p>
        <p className={styles.doneText}>{t('onboarding.help.doneText')}</p>
      </div>
    </>
  );
}

const EXTRAS = {
  welcome: WelcomeExtra,
  address: AddressCard,
  flow: FlowDiagram,
  shipping: ShippingCards,
  help: HelpExtra,
};

/**
 * @param {object} props
 * @param {{ id: string, kind?: string }} props.step  from tutorialSteps.js
 * @param {string} props.titleId  id for the heading, so the dialog can
 *                                point at it for screen readers
 * @param {string} [props.textBase]  where the tour's texts are in
 *   translations.js: 'onboarding.steps' for the general tour,
 *   'onboarding.pages.<tour>' for a page tour
 */
export default function TutorialStep({ step, titleId, textBase = 'onboarding.steps' }) {
  const { t } = useLanguage();
  const optional = useOptional();
  const base = `${textBase}.${step.id}`;

  const text = optional(`${base}.text`);
  const points = asList(t(`${base}.points`)).map((point) =>
    fill(point, PLACEHOLDERS),
  );
  const note = optional(`${base}.note`);
  const warning = optional(`${base}.warning`);
  const Extra = EXTRAS[step.kind];

  return (
    <div className={styles.stepBody}>
      {/* tabIndex -1: the card moves keyboard focus here on every step, so
          screen readers read the new title. */}
      <h2 id={titleId} className={styles.title} tabIndex={-1}>
        {t(`${base}.title`)}
      </h2>

      {text && <p className={styles.text}>{text}</p>}

      {points.length > 0 && (
        <ul className={styles.points}>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {note && <p className={styles.note}>{note}</p>}

      {Extra && <Extra />}

      {/* Shown under the extra content: on the address step it reads
          "enter it exactly as shown", which belongs under the address. */}
      {warning && <p className={styles.warning}>{warning}</p>}
    </div>
  );
}
