// src/pages/Home/Home.jsx
//
// The homepage. Built from sections that each answer one question a visitor
// has, in the order they tend to ask them: what is this, where is my parcel,
// can I trust you, how does it work, where do you ship, what do you offer,
// what happens after I book, and how do I start.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /
//   Who can open: everybody
//   Links to:     /services, /destinations, /destinations/:slug, /contact, /signup, /profile,
//                 /tracking
//   Linked from:  the logo and "Home" in the Header and Footer menus, and the "back to home" links
//                 on most pages
//   Backend:      api/tracking.js (TrackingPanel, StatsBand), api/shops.js (ShopGrid)

import { Link } from 'react-router-dom';
import TrackingPanel from '../../components/TrackingPanel/TrackingPanel';
import ShipmentTimeline from '../../components/ShipmentTimeline/ShipmentTimeline';
import StatsBand from '../../components/StatsBand/StatsBand';
import Steps from '../../components/Steps/Steps';
import ShopAndShip from '../../components/ShopAndShip/ShopAndShip';
import ShopGrid from '../../components/ShopGrid/ShopGrid';
import RouteMap from './RouteMap';
import { findDestination } from '../../data/destinations';
import { useAuth } from '../../auth/useAuth';
import { useInViewport } from '../../hooks/useInViewport';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './Home.module.css';

// The services this company actually sells, not the freight-forwarder menu.
// Each links somewhere real; a card that goes nowhere is worse than no card.
const SERVICES = [
  { id: 'shopAndShip', to: '/services', icon: 'cart' },
  { id: 'consolidation', to: '/services', icon: 'boxes' },
  { id: 'doorToDoor', to: '/destinations', icon: 'truck' },
  { id: 'customs', to: '/services', icon: 'document' },
  // Signed-out visitors are asked to log in first: tracking lives in the
  // customer's account.
  { id: 'tracking', to: '/tracking', icon: 'pin' },
  { id: 'business', to: '/contact', icon: 'building' },
];

const ICONS = {
  cart: (
    <>
      <path d="M6 8h30l-3 16H10Z" />
      <path d="M6 8 4 3H1" />
      <circle cx="14" cy="32" r="3" />
      <circle cx="30" cy="32" r="3" />
    </>
  ),
  boxes: (
    <>
      <path d="M4 14h16v16H4zM24 14h16v16H24z" />
      <path d="M14 4h16v10H14z" />
    </>
  ),
  truck: (
    <>
      <path d="M3 10h22v18H3z" />
      <path d="M25 16h7l5 6v6h-12z" />
      <circle cx="11" cy="31" r="3" />
      <circle cx="30" cy="31" r="3" />
    </>
  ),
  document: (
    <>
      <path d="M9 3h16l8 8v26H9z" />
      <path d="M25 3v8h8" />
      <path d="M15 21h12M15 27h8" />
    </>
  ),
  pin: (
    <>
      <path d="M21 4a12 12 0 0 1 12 12c0 8-12 21-12 21S9 24 9 16A12 12 0 0 1 21 4Z" />
      <circle cx="21" cy="16" r="4.5" />
    </>
  ),
  building: (
    <>
      <path d="M6 37V7h18v30" />
      <path d="M24 17h12v20" />
      <path d="M11 13h8M11 20h8M11 27h8M29 23h3M29 29h3" />
    </>
  ),
};

/** The stages of a shipment, for the explainer. Labels come from the API on
 *  the tracking page; here there is no shipment, so they are translated.
 *  Ordered, delivered to and collected at our warehouse, in transit, arrived,
 *  ready: the customer buys for themselves, so the journey starts at their
 *  order rather than at a payment to us. */
const EXPLAINER_STAGES = [
  'ordered',
  'collected',
  'inTransit',
  'arrived',
  'ready',
];

// The three sentences that say what this company does, shown in the hero so a
// first-time visitor knows before scrolling.
const HERO_POINTS = ['shop', 'ship', 'deliver'];

function Section({ children, className = '', id }) {
  const [ref, seen] = useInViewport();

  return (
    <section
      id={id}
      ref={ref}
      className={`${styles.section} ${className} ${seen ? styles.revealed : ''}`}
    >
      {children}
    </section>
  );
}

// The ABC islands under the hero title, in that order: Aruba, Bonaire,
// Curaçao. Each is the island's shape in its own flag, leading to its page.
const HERO_ISLANDS = ['aruba', 'bonaire', 'curacao'].map(findDestination);

export default function Home() {
  const { t } = useLanguage();
  // Tracking is for customers with a shipment: the box and the buttons that
  // lead to it are only shown once somebody is signed in. A first-time visitor
  // gets what we do and how to start instead.
  const { isAuthenticated } = useAuth();
  usePageMeta(t('home.hero.title'), t('home.hero.lead'), '/');

  return (
    <main className={styles.page}>
      {/* 1. Hero ---------------------------------------------------------- */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{t('home.hero.eyebrow')}</p>
            <h1 className={styles.heroTitle} data-tour="hero">{t('home.hero.title')}</h1>

            {/* The ABC islands, each in the shape of its coast and painted in
                its own flag. No card behind them: they glow white when
                pointed at, pressed or focused. */}
            <ul className={styles.heroIslands}>
              {HERO_ISLANDS.map((island) => (
                <li key={island.slug} className={styles.heroIsland}>
                  <Link
                    to={`/destinations/${island.slug}`}
                    className={styles.heroIslandCard}
                  >
                    <span className={styles.heroIslandFrame}>
                      <img
                        className={styles.heroIslandMap}
                        src={island.flagMap}
                        alt=""
                        decoding="async"
                      />
                    </span>
                    <span className={styles.heroIslandName}>
                      {t(island.nameKey)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className={styles.heroLead}>{t('home.hero.lead')}</p>

            <ol className={styles.heroPoints}>
              {HERO_POINTS.map((point, index) => (
                <li key={point} className={styles.heroPoint}>
                  <span className={styles.heroPointNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>
                    <strong className={styles.heroPointTitle}>
                      {t(`home.hero.points.${point}.title`)}
                    </strong>
                    <span className={styles.heroPointBody}>
                      {t(`home.hero.points.${point}.body`)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <div className={styles.heroButtons}>
              {isAuthenticated ? (
                <>
                  <a className={styles.primaryButton} href="#track">
                    {t('home.hero.trackCta')}
                  </a>
                  <Link className={styles.ghostButton} to="/profile">
                    {t('home.hero.myShipments')}
                  </Link>
                </>
              ) : (
                <>
                  <a className={styles.primaryButton} href="#how">
                    {t('home.hero.howCta')}
                  </a>
                  <Link className={styles.ghostButton} to="/signup">
                    {t('home.hero.startCta')}
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Under the copy, the full width of the hero: the shops customers
              order from, sliding past. The shops are in src/data/shops.js. */}
          {/* data-tour: highlighted by the onboarding tour's shopping step. */}
          <div className={styles.visual} data-tour="shops">
            <ShopGrid />
          </div>
        </div>

        {/* 2. Tracking, for signed-in customers only - it is the most common
            reason a returning customer opens the site. */}
        {isAuthenticated && (
          <div className={styles.heroTracking} id="track">
            <TrackingPanel variant="hero" />
          </div>
        )}
      </div>

      {/* 3. Live statistics ---------------------------------------------- */}
      <StatsBand />

      {/* 4. How to order — the client's own five steps, in the design they
          sent. Wider than the other sections: five bars side by side need
          the room. */}
      <Section
        className={`${styles.plain} ${styles.anchor} ${styles.wide}`}
        id="how"
      >
        <Steps />
      </Section>

      {/* 5. Interactive map ----------------------------------------------- */}
      <RouteMap />

      {/* 6. Services ------------------------------------------------------ */}
      <Section>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{t('home.services.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('home.services.title')}</h2>
          <p className={styles.sectionLead}>{t('home.services.lead')}</p>
        </div>

        <div className={styles.serviceGrid}>
          {SERVICES.map((service) => (
            <Link key={service.id} to={service.to} className={styles.serviceCard}>
              <span className={styles.serviceIcon} aria-hidden="true">
                <svg viewBox="0 0 42 42">{ICONS[service.icon]}</svg>
              </span>
              <h3 className={styles.serviceTitle}>
                {t(`home.services.${service.id}.title`)}
              </h3>
              <p className={styles.serviceBody}>
                {t(`home.services.${service.id}.body`)}
              </p>
              <span className={styles.serviceLink}>
                {t('home.services.learnMore')} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 7. What happens to a shipment ------------------------------------ */}
      <Section className={styles.timelineSection}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{t('home.journey.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('home.journey.title')}</h2>
          <p className={styles.sectionLead}>{t('home.journey.lead')}</p>
        </div>

        <div className={styles.timelineCard}>
          <ShipmentTimeline
            stages={EXPLAINER_STAGES.map((id) => ({
              value: id,
              label: t(`home.journey.stages.${id}`),
            }))}
            // Third of five, so the example shows a completed part, a current
            // stage and what is still to come — which is the point of showing
            // it at all.
            currentIndex={2}
          />
        </div>
      </Section>

      {/* The existing shop-and-ship explainer, kept as it was. */}
      <Section className={styles.plain}>
        <ShopAndShip />
      </Section>

      {/* 8. Closing call to action ---------------------------------------- */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>{t('home.cta2.title')}</h2>
          <p className={styles.ctaLead}>{t('home.cta2.lead')}</p>
          <div className={styles.heroButtons}>
            <Link className={styles.primaryButton} to="/signup">
              {t('home.cta2.start')}
            </Link>
            {isAuthenticated && (
              <Link className={styles.ghostButton} to="/tracking">
                {t('home.cta2.track')}
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
