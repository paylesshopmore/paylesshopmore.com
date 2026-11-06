// src/components/Tutorial/TutorialLanguage.jsx
//
// The language picker inside the tour's card, top right, next to the step
// counter and the ×. While the tour is open it darkens the whole page, so
// the site's own language rail (LanguageSwitcher) cannot be reached - this
// is the way to change language without leaving the tour.
//
// HOW IT STAYS IN STEP WITH THE REST OF THE SITE
//   There is only one language setting for the whole website: the one in
//   LanguageContext (src/i18n). This picker calls the same setLanguage() as
//   the site's own switcher, so:
//     - picking here translates the tour AND the website behind it;
//     - picking on the site's switcher translates the tour too;
//     - the choice is saved the same way (localStorage for everyone, and on
//       the account for signed-in customers - see auth/LanguageSync.jsx).
//   Nothing reloads, and the tour stays on the same step: the step number
//   lives in TutorialProvider, which a language change does not touch.
//
// Small buttons side by side, not a drop-down: a drop-down menu could be cut
// off by the card's edge when the card is short, and a button per language
// is one tap on a tablet instead of two.

import { useLanguage } from '../../i18n/useLanguage';
import { FlagCW, FlagGB, FlagNL } from '../LanguageSwitcher/flags';
import styles from './Tutorial.module.css';

// The same flags the site's language rail uses.
const FLAGS = { nl: FlagNL, en: FlagGB, pap: FlagCW };

export default function TutorialLanguage() {
  // `languages` is the site's own list (LANGUAGES in translations.js), so a
  // language switched on or off there appears or disappears here as well.
  const { language, setLanguage, languages, t } = useLanguage();

  return (
    <div className={styles.language} role="radiogroup" aria-label={t('language.choose')}>
      {languages.map((lang) => {
        const Flag = FLAGS[lang.code];
        const active = lang.code === language;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            // The full name for screen readers and as a tooltip on hover;
            // the button itself shows the flag and the short code.
            aria-label={lang.label}
            title={lang.label}
            className={active ? `${styles.languageOption} ${styles.languageActive}` : styles.languageOption}
            onClick={() => setLanguage(lang.code)}
          >
            {Flag && (
              <span className={styles.languageFlag} aria-hidden="true">
                <Flag />
              </span>
            )}
            <span aria-hidden="true">{lang.short}</span>
          </button>
        );
      })}
    </div>
  );
}
