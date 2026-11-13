// src/pages/Privacy/Privacy.jsx
//
// The privacy statement: a heading band and one article of prose.
//
// The structure lives here and the words live in translations.js
// (privacy.*), the same split as every other page: SECTIONS below is the
// order the sections are read in, which is a fact about the document rather
// than about Dutch, so it cannot differ between the three languages.
//
// Each section in translations.js has a `heading` and any of:
//   body          paragraphs
//   list          a bullet list, after the paragraphs
//   items         labelled paragraphs: { term, text } - the term in bold
//   after         paragraphs after the list
//   registration  (controller only) the Chamber of Commerce sentence
//
// The company's address and registration number are not typed into the
// text: they come from src/data/company.js, the one place they are kept.
// The registration sentence is left out while no number is filled in there.
//
// Dutch is the original. The English and Papiamentu versions are
// translations for readability - if the wording of the statement is ever
// disputed, the Dutch is the text that was written.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /privacy
//   Who can open: everybody
//   Links to:     / (Home), /contact
//   Linked from:  the Footer, Sign up
//   Backend:      -

import { Link } from 'react-router-dom';
import { COMPANY, WAREHOUSE_ADDRESS } from '../../data/company';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import styles from './Privacy.module.css';

const SECTIONS = [
  'services',
  'data',
  'thirdParties',
  'purposes',
  'sharing',
  'location',
  'retention',
  'loginMonitoring',
  'legalBasis',
  'complaints',
  'controller',
];

// What {address} and {number} in the texts stand for.
const VALUES = {
  address: `${WAREHOUSE_ADDRESS.street}, ${WAREHOUSE_ADDRESS.postcode} ${WAREHOUSE_ADDRESS.town}`,
  number: COMPANY.chamberOfCommerce,
};

/** A value from translations.js that should be a list, or an empty one. */
const asList = (value) => (Array.isArray(value) ? value : []);

function Section({ id }) {
  const { t } = useLanguage();
  const base = `privacy.sections.${id}`;
  const paragraphs = (key) =>
    asList(t(`${base}.${key}`)).map((text) => (
      <p key={text} className={styles.paragraph}>
        {fill(text, VALUES)}
      </p>
    ));

  const list = asList(t(`${base}.list`));
  const items = asList(t(`${base}.items`));
  const registration = t(`${base}.registration`);
  const hasRegistration =
    registration !== `${base}.registration` && Boolean(COMPANY.chamberOfCommerce);

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t(`${base}.heading`)}</h2>

      {paragraphs('body')}

      {hasRegistration && (
        <p className={styles.paragraph}>{fill(registration, VALUES)}</p>
      )}

      {list.length > 0 && (
        <ul className={styles.list}>
          {list.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {items.map((item) => (
        <p key={item.term} className={styles.paragraph}>
          <strong className={styles.term}>{item.term}</strong> {item.text}
        </p>
      ))}

      {paragraphs('after')}
    </section>
  );
}

export default function Privacy() {
  const { t } = useLanguage();

  usePageMeta(t('privacy.title'), t('privacy.summary'), '/privacy');

  return (
    <main className={styles.page}>
      <header className={styles.banner}>
        <div className={styles.bannerInner}>
          <h1 className={styles.title}>{t('privacy.title')}</h1>
          <hr className={styles.rule} />
          <p className={styles.breadcrumb}>
            <Link to="/" className={styles.crumbLink}>
              {t('nav.home')}
            </Link>{' '}
            &raquo; {t('privacy.title')}
          </p>
        </div>
      </header>

      <article className={styles.article} data-tour="privacy-intro">
        {asList(t('privacy.intro')).map((paragraph) => (
          <p key={paragraph} className={styles.lead}>
            {paragraph}
          </p>
        ))}

        {SECTIONS.map((id) => (
          <Section key={id} id={id} />
        ))}

        <p className={styles.contact} data-tour="privacy-contact">
          {t('privacy.questions')}{' '}
          <Link to="/contact" className={styles.contactLink}>
            {t('nav.contact')}
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
