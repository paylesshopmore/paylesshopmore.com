// src/pages/Destination/Destination.jsx
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /destinations/:slug  (e.g. /destinations/curacao)
//   Who can open: everybody
//   Links to:     /contact, /destinations
//   Linked from:  the Header "Destinations" menu, Destinations, Home, Services
//   Backend:      api/quote.js (the QuoteForm at the bottom)

import { Link, Navigate, useParams } from 'react-router-dom';
import { findDestination } from '../../data/destinations';
import DestinationHero from '../../components/DestinationHero/DestinationHero';
import QuoteForm from '../../components/QuoteForm/QuoteForm';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './Destination.module.css';

// The four stages of an order, laid out as a timeline rather than a row of
// equal columns: they happen one after another, and two of them are ours
// rather than the customer's, which the alternating sides make visible.
//
// The customer does the buying. We do not shop on anyone's behalf, so the
// stages that are ours start once the goods are on their way to us: shipping
// them, then clearing and delivering them on the island.
const STAGES = [
  {
    id: 'quote',
    who: 'you',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M11 6h20l6 6v30H11z" />
        <path d="M31 6v6h6" />
        <path d="M17 22h14M17 29h10" />
      </svg>
    ),
  },
  {
    id: 'purchase',
    who: 'you',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 8h6l5 22h22" />
        <path d="M13 14h30l-3 12H15" />
        <circle cx="19" cy="38" r="3" />
        <circle cx="35" cy="38" r="3" />
      </svg>
    ),
  },
  {
    id: 'ship',
    who: 'us',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 32h32l-3 8H11Z" />
        <path d="M12 32V20h10v12" />
        <path d="M22 26h14v6H22z" />
        <path d="M15 20v-5h4v5" />
        <path d="M26 26v6M30 26v6M34 26v6" />
      </svg>
    ),
  },
  {
    id: 'deliver',
    who: 'us',
    icon: (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 12h24v18H4z" />
        <path d="M28 18h8l6 6v6h-14z" />
        <circle cx="13" cy="34" r="3.5" />
        <circle cx="34" cy="34" r="3.5" />
      </svg>
    ),
  },
];

const FAQ_IDS = ['what', 'cost', 'time', 'customs', 'oversize'];

export default function Destination() {
  const { slug } = useParams();
  const { t } = useLanguage();

  const destination = findDestination(slug);
  const name = destination ? t(destination.nameKey) : '';

  // Above the early return, because a hook cannot sit behind a condition. An
  // unknown slug leaves these empty and usePageMeta falls back to the site
  // defaults, which is the right thing for a page that only redirects.
  usePageMeta(
    name && t('destination.howTitle').replace('{island}', name),
    name && t('destination.howSubtitle'),
    name && `/destinations/${slug}`,
  );

  // An unknown island in the URL goes to the index rather than a blank page.
  if (!destination) return <Navigate to="/destinations" replace />;

  /** Fills {island}, {port} and {days} in a translated string. */
  const fill = (key) =>
    t(key)
      .replace('{island}', name)
      .replace('{port}', destination.port)
      .replace('{days}', destination.transitDays);

  return (
    <main>
      {/* The banner photo is `banner`, not `hero`: `hero` is the picture on
          the island's card on /destinations. An island without a banner
          gets the plain ocean gradient. An island with a titleFlag has its
          name drawn in its own flag. */}
      <DestinationHero
        title={name}
        image={destination.banner?.src}
        flag={destination.titleFlag}
      />

      {/* The three things people ask before anything else. */}
      {/* data-tour="..." on this page: what the robot's page tour
          highlights (src/components/Tutorial/tutorialSteps.js). The quote
          form marks itself (data-tour="quote-form"). */}
      <section className={styles.facts} data-tour="destination-facts">
        <dl className={styles.factList}>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>{t('destination.facts.transit')}</dt>
            <dd className={styles.factValue}>
              {t('destination.facts.transitValue').replace(
                '{days}',
                destination.transitDays,
              )}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>{t('destination.facts.arrives')}</dt>
            <dd className={styles.factValue}>{destination.port}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>{t('destination.facts.vat')}</dt>
            <dd className={styles.factValue}>{t('destination.facts.vatValue')}</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>{t('destination.facts.handover')}</dt>
            <dd className={styles.factValue}>
              {t('destination.facts.handoverValue')}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.how} data-tour="destination-how">
        <div className={styles.howInner}>
          <header className={styles.howHead}>
            <p className={styles.eyebrow}>{t('destination.eyebrow')}</p>
            <h2 className={styles.howTitle}>{fill('destination.howTitle')}</h2>
            <p className={styles.howSubtitle}>{fill('destination.howSubtitle')}</p>
          </header>

          <ol className={styles.stages}>
            {STAGES.map((stage, index) => (
              <li
                key={stage.id}
                className={`${styles.stage} ${
                  stage.who === 'us' ? styles.stageOurs : styles.stageYours
                }`}
              >
                <span className={styles.stageMarker} aria-hidden="true">
                  <span className={styles.stageIcon}>{stage.icon}</span>
                </span>

                <div className={styles.stageBody}>
                  <p className={styles.stageWho}>
                    {t(`destination.who.${stage.who}`)}
                    <span className={styles.stageNumber}>
                      {t('destination.step')} {index + 1}
                    </span>
                  </p>
                  <h3 className={styles.stageTitle}>
                    {t(`destination.stages.${stage.id}.title`)}
                  </h3>
                  <p className={styles.stageText}>
                    {fill(`destination.stages.${stage.id}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Answers to what the contact form gets asked most. Plain <details>,
          so it opens without JavaScript and the browser handles the
          keyboard and screen-reader behaviour correctly. */}
      <section className={styles.faq} data-tour="destination-faq">
        <div className={styles.faqInner}>
          <h2 className={styles.faqTitle}>{fill('destination.faq.title')}</h2>

          <div className={styles.faqList}>
            {FAQ_IDS.map((id) => (
              <details key={id} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>
                  {fill(`destination.faq.${id}.q`)}
                  <span className={styles.faqChevron} aria-hidden="true" />
                </summary>
                <p className={styles.faqAnswer}>{fill(`destination.faq.${id}.a`)}</p>
              </details>
            ))}
          </div>

          <p className={styles.faqMore}>
            {t('destination.faq.more')}{' '}
            <Link to="/contact" className={styles.faqLink}>
              {t('destination.faq.contact')}
            </Link>
          </p>
        </div>
      </section>

      <QuoteForm destination={name} />
    </main>
  );
}
