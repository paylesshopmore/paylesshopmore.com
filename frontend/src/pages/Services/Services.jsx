// src/pages/Services/Services.jsx
//
// The services page, in six bands: the photo banner (shared with the
// destination pages, here in the brand colours), the yellow strip of selling
// points, the three islands as flag maps, what the company does,
// the companies whose services are offered, and a closing call to action.
//
// The island cards carry the island drawn in its own flag, and nothing else -
// no photograph, no name, no caption, no button. The shape is the label: it
// says which island without a word of text on the card. They are still links,
// and still named for a screen reader through the drawing's alt text, because
// a card that can be clicked has to be reachable and announced; none of that
// shows on screen.
//
// "What we do" is the company's own services. The companies grid under it is
// the shops the office maintains in the dashboard, read through useShops -
// which falls back to the bundled list in src/data/shops.js while the request
// is in flight or if it fails.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /services
//   Who can open: everybody
//   Links to:     / (Home), /contact, /destinations/:slug
//   Linked from:  the Header and Footer menus, Home, Tutorial
//   Backend:      -

import { Link } from 'react-router-dom';
import DestinationHero from '../../components/DestinationHero/DestinationHero';
import { containerShip } from '../../images/optimized/photos';
import { DESTINATIONS } from '../../data/destinations';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useShops } from '../../hooks/useShops';
import styles from './Services.module.css';

// Inline SVGs: public/icons.svg only holds the footer's social logos.
const HIGHLIGHTS = [
  {
    labelKey: 'services.highlights.vat',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12a6 6 0 0 1 6-6h4a6 6 0 0 1 5.2 3H21v4h-2.2a6 6 0 0 1-1.8 2.2V19h-3v-1.2H12V19H9v-2.3A6 6 0 0 1 6 13H4.5A1.5 1.5 0 0 1 3 11.5Z" />
        <path d="M9 6V5a2.5 2.5 0 0 1 4 0" />
        <circle cx="15.5" cy="10.5" r=".6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    labelKey: 'services.highlights.products',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m2 11 3-3 4.2 1.3a2 2 0 0 0 1.6-.2L13 8l6 4.5" />
        <path d="M13 8h4.5L22 11" />
        <path d="M11 16.5 9 15a1.5 1.5 0 0 1 .3-2.4l1.7-1" />
        <path d="m11 16.5 1.7 1.3a1.4 1.4 0 0 0 2-.3l3.6-4.6" />
      </svg>
    ),
  },
  {
    labelKey: 'services.highlights.transport',
    icon: (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 7h11v9H2z" />
        <path d="M13 10h4.5l3.5 3v3h-8z" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </svg>
    ),
  },
];

// What the company does, in the order a shipment meets it: how it travels,
// what happens before it leaves, and what happens once it lands.
const OFFER = [
  {
    id: 'sea',
    icon: (
      <>
        <path d="M3 15h18l-2.5 5h-13Z" />
        <path d="M6 15V9h6v6" />
        <path d="M12 12h7v3h-7z" />
        <path d="M8 9V6h2v3" />
      </>
    ),
  },
  {
    id: 'air',
    icon: (
      <path d="M3 11h5l3-4h2.5l-1.5 4h5l2-2h1.5l-1 3 1 3h-1.5l-2-2H12l1.5 4H11l-3-4H3" />
    ),
  },
  {
    id: 'warehouse',
    icon: (
      <>
        <path d="M3 12h8v8H3zM13 12h8v8h-8z" />
        <path d="M8 4h8v8H8z" />
      </>
    ),
  },
  {
    id: 'customs',
    icon: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 12h7M9 16h5" />
      </>
    ),
  },
  {
    id: 'delivery',
    icon: (
      <>
        <path d="M2 7h11v9H2z" />
        <path d="M13 10h4.5l3.5 3v3h-8z" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </>
    ),
  },
  {
    id: 'moving',
    icon: (
      <>
        <path d="M3 11 12 4l9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
  },
];

// The range of sailing times, read from the island list rather than written
// into the copy, so the card cannot disagree with the destination pages.
const SAILING_DAYS = DESTINATIONS.map((island) => island.transitDays);
const FEWEST_DAYS = Math.min(...SAILING_DAYS);
const MOST_DAYS = Math.max(...SAILING_DAYS);

/** One island, as its flag map, linking to that island's own page. */
function IslandCard({ island, name }) {
  return (
    <li className={styles.islandItem}>
      <Link to={`/destinations/${island.slug}`} className={styles.islandCard}>
        {/* A flat drawing on a transparent ground, imported at full size
            rather than put through `npm run images`: re-encoding flat colour
            as WebP would not make it smaller, and it has to stay crisp at
            whatever size the card lands on. */}
        <img
          src={island.flagMap}
          // The only place the island is named. It is not drawn on the card -
          // it is what a screen reader reads in place of the picture.
          alt={name}
          className={styles.islandFlag}
          loading="lazy"
          decoding="async"
        />
      </Link>
    </li>
  );
}

/** One shop, as a card that links out to that shop's own site. */
function ShopCard({ shop, cta }) {
  return (
    <li className={styles.companyItem}>
      <article className={styles.companyCard}>
        {shop.logo ? (
          <img
            className={styles.companyLogo}
            src={shop.logo}
            alt={shop.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          // A shop the office has added but not yet given a logo. A lettered
          // plate keeps the grid even instead of leaving a card that has
          // visibly lost its picture.
          <span className={styles.companyPlate} aria-hidden="true">
            {shop.name.charAt(0)}
          </span>
        )}

        <h3 className={styles.companyName}>{shop.name}</h3>

        {shop.description && (
          <p className={styles.companyBlurb}>{shop.description}</p>
        )}

        <a
          className={styles.companyCta}
          href={shop.url}
          target="_blank"
          // noopener stops the shop's page reaching back through window.opener.
          rel="noopener noreferrer"
        >
          {cta}
        </a>
      </article>
    </li>
  );
}

export default function Services() {
  const { t } = useLanguage();
  const { shops } = useShops();
  usePageMeta(t('services.sectionTitle'), t('services.hero.lead'), '/services');

  return (
    <main>
      {/* 1. The photo banner ------------------------------------------- */}
      {/* The same banner as /destinations and the island pages, so the
          pages a visitor moves between look like one site. The wrapper only
          carries the hook the robot's page tour highlights
          (src/components/Tutorial/tutorialSteps.js). */}
      <div data-tour="services-intro">
        <DestinationHero
          eyebrow={t('services.eyebrow')}
          title={t('services.title')}
          image={containerShip.src}
          brand
        />
      </div>

      {/* 2. The yellow strip of selling points --------------------------- */}
      <ul className={styles.highlights}>
        {HIGHLIGHTS.map((item) => (
          <li key={item.labelKey} className={styles.highlight}>
            {item.icon}
            {t(item.labelKey)}
          </li>
        ))}
      </ul>


      {/* Everything below runs on white, as one band. */}
      <div className={styles.page}>
        {/* 3. The islands, as photographs and nothing else --------------- */}
        <section className={styles.islands} data-tour="services-islands">
          <p className={styles.intro}>{t('services.hero.lead')}</p>

          {/* The label sits on the list, not the section: it is the list that
              has to be findable and announced, since its items carry no text
              of their own to go by. */}
          <ul
            className={styles.islandGrid}
            aria-label={t('services.islandsLabel')}
          >
            {DESTINATIONS.map((island) => (
              <IslandCard
                key={island.slug}
                island={island}
                name={t(island.nameKey)}
              />
            ))}
          </ul>
        </section>

        {/* 4. What we do ------------------------------------------------- */}
        <section
          className={styles.offer}
          aria-labelledby="offer-title"
          data-tour="services-offer"
        >
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="offer-title">
              {t('services.offer.title')}
            </h2>
            <p className={styles.sectionLead}>{t('services.offer.lead')}</p>
          </div>

          <ul className={styles.offerGrid}>
            {OFFER.map((item) => (
              <li key={item.id} className={styles.offerItem}>
                <article className={styles.offerCard}>
                  <span className={styles.offerIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24">{item.icon}</svg>
                  </span>
                  <h3 className={styles.offerName}>
                    {t(`services.offer.${item.id}.title`)}
                  </h3>
                  <p className={styles.offerBlurb}>
                    {t(`services.offer.${item.id}.body`)
                      .replace('{min}', FEWEST_DAYS)
                      .replace('{max}', MOST_DAYS)}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. The companies --------------------------------------------- */}
        <section
          className={styles.companies}
          aria-labelledby="companies-title"
          data-tour="services-partners"
        >
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="companies-title">
              {t('services.companies.title')}
            </h2>
            <p className={styles.sectionLead}>{t('services.companies.lead')}</p>
          </div>

          <ul className={styles.companyGrid}>
            {shops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                cta={t('services.companies.cta')}
              />
            ))}
          </ul>
        </section>

        {/* 6. Closing call to action ------------------------------------- */}
        <section className={styles.cta} data-tour="services-contact">
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>{t('services.contactCta.title')}</h2>
            <Link className={styles.ctaButton} to="/contact">
              {t('services.contactCta.button')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
