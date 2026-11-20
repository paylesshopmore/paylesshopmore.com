// src/pages/Dashboard/AboutPageEditor.jsx
//
// The "About us page" card on the Website page. It shows the number of years
// and an Edit button; the button opens a pop-up with the form: the years and
// the headline, introduction and story (Dutch and English) of the public About
// us page. A box left empty keeps the standard wording built into the
// website, so nobody has to fill everything in.
//
// The pop-up is the browser's own <dialog>: it dims the page behind it, keeps
// the keyboard inside it, closes with Escape and hands focus back to the Edit
// button afterwards - all without extra code.
//
// Shown inside WebsiteSettings.jsx (admins only; the server refuses anyone
// else). Backend: api/staff.js getAboutSettings / saveAboutSettings, and
// staff/about_page.py.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { getAboutSettings, saveAboutSettings } from '../../api/staff';
import { Banner } from './ui';
import styles from './Dashboard.module.css';
import popup from './AboutPageEditor.module.css';
import { usePageText } from './usePageText';

const LANGUAGES = [
  { code: 'nl', labelKey: 'aboutDutch' },
  { code: 'en', labelKey: 'aboutEnglish' },
];
const TEXTS = [
  { name: 'headline', labelKey: 'aboutHeadline', rows: 2 },
  { name: 'intro', labelKey: 'aboutIntro', rows: 3 },
  { name: 'story', labelKey: 'aboutStory', rows: 6 },
];

// The server's answer as form values: years as text (that is what a number
// box gives us), every text by its server name, e.g. headline_nl.
function toForm(data) {
  return { ...data, years_in_business: String(data.years_in_business) };
}

export default function AboutPageEditor() {
  const d = usePageText('website');
  const c = usePageText('common');
  const dialogRef = useRef(null);

  // What was last saved (shown on the card) and what is in the form (a copy
  // that Cancel throws away).
  const [saved, setSaved] = useState(null);
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  // On the card, after a save; in the pop-up, when a save is refused.
  const [message, setMessage] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let live = true;
    getAboutSettings()
      .then((data) => {
        if (!live) return;
        setSaved(toForm(data));
        setValues(toForm(data));
      })
      .catch(() => {
        if (live) setMessage({ tone: 'error', text: d('saveFailed') });
      });
    return () => {
      live = false;
    };
  }, [d]);

  if (!saved || !values) return <Banner tone={message?.tone}>{message?.text}</Banner>;

  function openEditor() {
    // Always start from what is saved, not from an abandoned half-edit.
    setValues(saved);
    setFormError(null);
    setMessage(null);
    dialogRef.current?.showModal?.();
  }

  function closeEditor() {
    dialogRef.current?.close?.();
  }

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const result = await saveAboutSettings({
        ...values,
        years_in_business: Number(values.years_in_business),
      });
      setSaved(toForm(result));
      setValues(toForm(result));
      setMessage({ tone: 'success', text: d('aboutSaved') });
      closeEditor();
    } catch (error) {
      // 400: something typed was not acceptable. Anything else: no connection.
      // The pop-up stays open so nothing typed is lost.
      setFormError(
        error instanceof ApiError && error.status === 400 ? d('aboutInvalid') : d('saveFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  // How many of the six texts the admin has replaced, for the card's summary.
  const customised = Object.entries(saved).filter(
    ([name, value]) => name !== 'years_in_business' && value,
  ).length;

  return (
    <section className={styles.section} aria-labelledby="about-editor-title">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="about-editor-title">
          {d('aboutTitle')}
        </h2>
        <Link className={styles.sectionLink} to="/about-us">
          {d('aboutOpen')}
        </Link>
      </div>
      <p className={styles.subtitle}>{d('aboutAbout', { years: '{years}' })}</p>

      <Banner tone={message?.tone}>{message?.text}</Banner>

      <div className={popup.summary}>
        <p className={popup.summaryText}>
          <strong>{saved.years_in_business}</strong> {d('aboutYears').toLowerCase()}
          {' · '}
          {d('aboutCustomised', { count: customised, total: 6 })}
        </p>
        <button type="button" className={styles.primaryButton} onClick={openEditor}>
          {d('aboutEdit')}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className={popup.dialog}
        aria-labelledby="about-dialog-title"
        // Clicking the dimmed area outside the window closes it, like Cancel.
        onClick={(event) => {
          if (event.target === event.currentTarget) closeEditor();
        }}
      >
        <form onSubmit={handleSubmit} className={popup.form}>
          <h2 className={popup.title} id="about-dialog-title">
            {d('aboutTitle')}
          </h2>

          <div className={popup.body}>
            <div className={styles.officeField}>
              <label className={styles.officeLabel} htmlFor="about-years">
                {d('aboutYears')}
              </label>
              <input
                id="about-years"
                className={`${styles.intakeInput} ${popup.years}`}
                type="number"
                min="1"
                max="200"
                step="1"
                value={values.years_in_business}
                onChange={(event) => change('years_in_business', event.target.value)}
              />
            </div>

            {LANGUAGES.map((language) => (
              <fieldset key={language.code} className={popup.language}>
                <legend className={popup.legend}>{d(language.labelKey)}</legend>
                {TEXTS.map((text) => {
                  const name = `${text.name}_${language.code}`;
                  const id = `about-${name}`;
                  return (
                    <div key={name} className={styles.officeField}>
                      <label className={styles.officeLabel} htmlFor={id}>
                        {d(text.labelKey)}
                      </label>
                      <textarea
                        id={id}
                        className={styles.intakeTextarea}
                        rows={text.rows}
                        value={values[name] ?? ''}
                        onChange={(event) => change(name, event.target.value)}
                      />
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>

          {/* role="alert": announced the moment a save is refused. */}
          {formError && (
            <p className={popup.error} role="alert">
              {formError}
            </p>
          )}

          <div className={popup.actions}>
            <button type="button" className={popup.cancel} onClick={closeEditor}>
              {d('aboutCancel')}
            </button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {busy ? c('saving') : d('aboutSave')}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
