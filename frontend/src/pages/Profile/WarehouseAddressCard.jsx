// src/pages/Profile/WarehouseAddressCard.jsx
//
// "Your shipping address": the address a customer types into a webshop's
// checkout (bol.com, Amazon, Coolblue ...) so the order is delivered to our
// warehouse in Berkel en Rodenrijs instead of to them. From there we ship it
// on to the island.
//
// What it shows:
//   1. A reminder, at the top where it cannot be missed: use this address for
//      EVERY order, as the delivery address.
//   2. The address, field by field, the way a checkout asks for it - each
//      line with its own copy button, because checkouts have separate boxes.
//      Full name: the account holder's full name, from their account.
//      Company: our name, for a checkout that
//      has the box, so the courier knows the address is a business.
//   3. "Copy the whole address", for a checkout with one big address box.
//   4. What to do after ordering: pre-alert the parcel with the courier's
//      track-and-trace, so we can follow it and recognise it when it arrives.
//
// The address itself is written once, in src/data/company.js, and is the same
// one the onboarding tour and the contact page show.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, CopyIcon } from '../../components/Icons/icons';
import { WAREHOUSE_ADDRESS } from '../../data/company';
import { useLanguage } from '../../i18n/useLanguage';
import { copyText } from '../../utils/copyText';
import styles from './Profile.module.css';

/**
 * @param {object} props
 * @param {string} props.firstName  the account holder's first name
 * @param {import('react').ReactNode} [props.icon]  the section icon
 */
export default function WarehouseAddressCard({ firstName, icon }) {
  const { t } = useLanguage();
  const a = (key) => t(`profile.warehouseAddress.${key}`);

  // Which line was just copied ('all' for the whole address), for the tick.
  const [copied, setCopied] = useState(null);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  // First name: the customer's own. Last name: always the company's
  // ("Pay less Shop More") - that is how the warehouse knows the parcel is
  // for us, and the first name tells us whose it is. A placeholder when the
  // account has no first name yet, which tells the customer what goes there.
  const ownFirstName = firstName?.trim() || a('firstNameFallback');
  const country = t('onboarding.address.countryValue');

  // In the order a checkout asks for them.
  const rows = [
    { key: 'firstName', label: a('firstName'), value: ownFirstName },
    { key: 'lastName', label: a('lastName'), value: WAREHOUSE_ADDRESS.lastName },
    { key: 'street', label: a('street'), value: WAREHOUSE_ADDRESS.street },
    { key: 'postcode', label: a('postcode'), value: WAREHOUSE_ADDRESS.postcode },
    { key: 'city', label: a('city'), value: WAREHOUSE_ADDRESS.town },
    { key: 'country', label: a('country'), value: country },
  ];

  async function copy(key, text) {
    const ok = await copyText(text);
    setFailed(!ok);
    setCopied(ok ? key : null);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(null), 2500);
  }

  // The whole address as it would be written on an envelope.
  const wholeAddress = [
    `${ownFirstName} ${WAREHOUSE_ADDRESS.lastName}`,
    WAREHOUSE_ADDRESS.street,
    `${WAREHOUSE_ADDRESS.postcode} ${WAREHOUSE_ADDRESS.town}`,
    country,
  ].join('\n');

  return (
    <section className={styles.card} id="warehouse-address">
      <h2 className={styles.cardTitle}>
        {icon}
        {a('title')}
      </h2>
      <p className={styles.cardIntro}>{a('intro')}</p>

      {/* The one thing to remember. role="note": read out as part of the card. */}
      <div className={styles.addressReminder} role="note">
        <strong>{a('reminderTitle')}</strong> {a('reminder')}
      </div>

      <dl className={styles.addressList}>
        {rows.map((row) => (
          <div key={row.key} className={styles.addressRow}>
            <dt>{row.label}</dt>
            <dd>
              <span className={styles.addressValue}>{row.value}</span>
              <button
                type="button"
                className={styles.addressCopy}
                onClick={() => copy(row.key, row.value)}
                // The value is in the name, so a screen reader hears what
                // will be copied rather than six buttons called "Copy".
                aria-label={`${a('copy')}: ${row.label} ${row.value}`}
              >
                {copied === row.key ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
              </button>
            </dd>
          </div>
        ))}
      </dl>

      {/* Why the name line matters, under the address it explains. */}
      <p className={styles.addressHint}>{a('nameHint')}</p>

      <button type="button" className={styles.submit} onClick={() => copy('all', wholeAddress)}>
        {copied === 'all' ? a('copiedAll') : a('copyAll')}
      </button>

      {/* Announced to screen readers when it changes. */}
      <p className={styles.addressStatus} role="status">
        {failed ? a('copyFailed') : copied ? a('copied') : ''}
      </p>

      <h3 className={styles.addressStepsTitle}>{a('afterTitle')}</h3>
      <ol className={styles.addressSteps}>
        <li>{a('after1')}</li>
        <li>
          {a('after2')} <Link to="/prealert">{a('after2Link')}</Link>
        </li>
        <li>{a('after3')}</li>
      </ol>
    </section>
  );
}
