// src/components/ShopAndShip/ShopAndShip.jsx
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { boxCart, boxes, containerShip } from '../../images/optimized/photos';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './ShopAndShip.module.css';

// Copy lives in src/i18n/translations.js; this holds only what does not
// translate — the destination, the artwork, and the alt text.
// `image: null` renders a labelled slot until the artwork exists.
const CARDS = [
  {
    id: 'particulier',
    href: '/services',
    image: boxCart,
    imageAlt: 'Pakketten in een winkelwagen',
    slotLabel: '',
  },
  {
    id: 'zakelijk',
    href: '/services',
    image: boxes,
    imageAlt: 'Gewikkelde pallet met dozen in een magazijn',
    slotLabel: '',
  },
  {
    id: 'payless',
    href: '/services',
    image: containerShip,
    imageAlt: 'Containers gestapeld op een vrachtschip',
    slotLabel: '',
  },
];

// One card's copy and its single yellow button.
//
// The text is cut to a few lines so the three cards stay the same height.
// While it is cut off, the yellow button opens the rest ("Lees meer") and
// then closes it again ("Lees minder"); once opened, a link to the services
// page appears under the text. If the text is short enough to fit, nothing is
// cut off, so the yellow button is simply the link to the services page.
function CardCopy({ card, title }) {
  const { t } = useLanguage();
  const textId = useId();
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const body = t(`home.shopAndShip.${card.id}.body`);

  // Is the text taller than the box it is cut to? Measured while it is cut
  // (not expanded), and again whenever the card changes width, because a
  // narrower card wraps into more lines.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return undefined;

    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [body, expanded]);

  const canToggle = overflows || expanded;

  return (
    <div className={styles.body}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p
        id={textId}
        ref={textRef}
        className={expanded ? styles.text : `${styles.text} ${styles.textClamped}`}
      >
        {body}
      </p>

      {expanded && (
        <Link to={card.href} className={styles.servicesLink}>
          {t('home.shopAndShip.toServices')}
        </Link>
      )}

      {/* Pushed to the bottom so the buttons line up across cards */}
      {canToggle ? (
        <button
          type="button"
          className={styles.button}
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t('home.shopAndShip.readLess') : t('home.shopAndShip.readMore')}
          <span className={styles.srOnly}>
            {' '}
            {t('home.shopAndShip.readMoreAbout')} {title}
          </span>
        </button>
      ) : (
        <Link to={card.href} className={styles.button}>
          {t('home.shopAndShip.readMore')}
          <span className={styles.srOnly}>
            {' '}
            {t('home.shopAndShip.readMoreAbout')} {title}
          </span>
        </Link>
      )}
    </div>
  );
}

export default function ShopAndShip() {
  const { t } = useLanguage();

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('home.shopAndShip.title')}</h2>

      <ul className={styles.cards}>
        {CARDS.map((card) => {
          const title = t(`home.shopAndShip.${card.id}.title`);

          return (
            <li key={card.id} className={styles.card}>
              <CardCopy card={card} title={title} />

              {card.image ? (
                <img
                  src={card.image.src}
                  srcSet={card.image.srcSet}
                  // A strip across one card in a row of them, never the full
                  // window.
                  sizes="(max-width: 900px) 100vw, 33vw"
                  width={card.image.width}
                  height={card.image.height}
                  alt={card.imageAlt}
                  className={styles.strip}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                // Swap for an <img> once the artwork is in src/images/
                <div className={styles.stripSlot}>{card.slotLabel}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
