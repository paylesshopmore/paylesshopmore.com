// src/pages/About/About.jsx
//
// The About us page: who we are, with the number that matters most up front -
// 14 years in business. The footer has linked to /about-us for a while; until
// this file the address led to the "not found" page.
//
// The standard words live in translations.js (about.*). An admin can change
// the number of years, the headline, the introduction and the story in the
// Django admin under "About page"; what they type replaces the standard text
// (an empty box keeps it). While that answer loads, or if it cannot be
// loaded, the page simply shows the standard text.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /about-us
//   Who can open: everybody
//   Links to:     /booking, /contact
//   Linked from:  the Footer
//   Backend:      api/about.js (backend accounts/public.py AboutPageView)

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAboutPage } from '../../api/about';
import { usePageMeta } from '../../hooks/usePageMeta';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './About.module.css';

// Used until (or unless) the admin's own number arrives.
const DEFAULT_YEARS = 14;
const HIGHLIGHTS = ['experience', 'oneplace', 'vat'];

// Counts up from 0 to the target once, so the number "arrives". Visitors who
// asked their device for less motion get the final number straight away.
function useCountUp(target) {
  const [value, setValue] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? target
      : 0,
  );

  useEffect(() => {
    if (value >= target) return undefined;
    const timer = setTimeout(() => setValue((current) => current + 1), 90);
    return () => clearTimeout(timer);
  }, [value, target]);

  // Never above the target, in case the admin's number is smaller than the
  // one the count started towards.
  return Math.min(value, target);
}

export default function About() {
  const { t, language } = useLanguage();
  // What the admin typed, or null (not loaded yet / could not be loaded).
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    let live = true;
    getAboutPage()
      .then((data) => {
        if (live) setCustom(data);
      })
      .catch(() => {
        // The standard text is a complete page; nothing to tell the visitor.
      });
    return () => {
      live = false;
    };
  }, []);

  const years = custom?.years_in_business || DEFAULT_YEARS;
  // The admin writes Dutch and English; Papiamentu visitors get the Dutch.
  const lang = language === 'en' ? 'en' : 'nl';
  // The admin's text for this language if they wrote one, else the standard.
  const pick = (field, standardKey) =>
    fill(custom?.[field]?.[lang]?.trim() || t(standardKey), { years });

  usePageMeta(t('about.title'), fill(t('about.summary'), { years }), '/about-us');
  const counted = useCountUp(years);

  return (
    <main className={styles.page}>
      <section className={styles.banner} aria-labelledby="about-title">
        <div className={styles.bannerInner}>
          <div>
            <p className={styles.label}>{t('about.label')}</p>
            <h1 className={styles.title} id="about-title">
              {pick('headline', 'about.headline')}
            </h1>
            <p className={styles.bannerText}>{pick('intro', 'about.intro')}</p>
          </div>

          {/* The animated number is hidden from screen readers (it would read
              out 0, 1, 2, ...); the sentence next to it carries the meaning. */}
          <div className={styles.stat}>
            <span className={styles.statNumber} aria-hidden="true">
              {counted}
            </span>
            <span className={styles.statLabel}>
              <span className={styles.srOnly}>{years} </span>
              {t('about.statLabel')}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.body}>
        <section aria-labelledby="about-story-title">
          <h2 className={styles.sectionTitle} id="about-story-title">
            {t('about.story.title')}
          </h2>
          <p className={styles.text}>{pick('story', 'about.story.text')}</p>
        </section>

        <ul className={styles.cards}>
          {HIGHLIGHTS.map((id) => (
            <li key={id} className={styles.card}>
              <h3 className={styles.cardTitle}>
                {fill(t(`about.highlights.${id}.title`), { years })}
              </h3>
              <p className={styles.cardText}>
                {fill(t(`about.highlights.${id}.text`), { years })}
              </p>
            </li>
          ))}
        </ul>

        <section className={styles.cta} aria-labelledby="about-cta-title">
          <h2 className={styles.ctaTitle} id="about-cta-title">
            {t('about.cta.title')}
          </h2>
          <div className={styles.ctaButtons}>
            <Link className={styles.button} to="/booking">
              {t('about.cta.booking')}
            </Link>
            <Link className={styles.secondary} to="/contact">
              {t('about.cta.contact')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
