// src/pages/Profile/NextSteps.jsx
//
// "What to do next" banner at the top of the profile page, for customers.
//
// Why it exists: after signing in, a customer lands on /profile (see
// auth/home.js). That page is long - details, address, tracking, shipments -
// and the "New booking" button used to sit at the bottom of the "My bookings"
// card, so new customers did not know a booking was the next step. This
// banner sits right under their name and spells out the three steps, with the
// booking button as the big, obvious action.
//
// Only customers see it: staff and warehouse workers do not book shipments
// (Profile.jsx decides that before rendering this).
//
// The words live in translations.js under profile.nextSteps.*, so the banner
// follows the language switcher like the rest of the page.

import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// The three steps, in order. `href` jumps to the matching card further down
// this same page, so a customer can read more about that step.
const STEPS = [
  { key: 'order', href: '#warehouse-address' },
  { key: 'book', href: null }, // the big button below covers this one
  { key: 'follow', href: '#shipments' },
];

export default function NextSteps() {
  const { t } = useLanguage();
  // Short helper so the JSX below stays readable: n('title') reads
  // profile.nextSteps.title from translations.js.
  const n = (key) => t(`profile.nextSteps.${key}`);

  return (
    <section className={styles.nextSteps} aria-labelledby="next-steps-title">
      <h2 id="next-steps-title" className={styles.nextStepsTitle}>
        {n('title')}
      </h2>
      <p className={styles.nextStepsIntro}>{n('intro')}</p>

      {/* An ordered list, so screen readers announce "1 of 3" etc. The
          numbers in the circles are drawn by CSS from the list position. */}
      <ol className={styles.nextStepsList}>
        {STEPS.map((step) => (
          <li
            key={step.key}
            // The booking step is the one we want people to act on, so it is
            // highlighted.
            className={
              step.key === 'book'
                ? `${styles.nextStep} ${styles.nextStepMain}`
                : styles.nextStep
            }
          >
            <span className={styles.nextStepTitle}>{n(`steps.${step.key}.title`)}</span>
            <span className={styles.nextStepText}>{n(`steps.${step.key}.text`)}</span>
            {step.href && (
              <a href={step.href} className={styles.nextStepLink}>
                {n(`steps.${step.key}.link`)}
              </a>
            )}
          </li>
        ))}
      </ol>

      <div className={styles.nextStepsActions}>
        {/* The main call to action: the booking form. */}
        <Link to="/booking" className={styles.submit}>
          {n('bookButton')}
        </Link>
      </div>
    </section>
  );
}
