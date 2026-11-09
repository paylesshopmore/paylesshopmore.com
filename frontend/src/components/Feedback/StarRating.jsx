// src/components/Feedback/StarRating.jsx
//
// Five stars to choose a score from 1 to 5. Used by the "Feedback" button
// (FeedbackButton.jsx) and the delivery reviews on the profile page.
//
// Built from five radio buttons, so a keyboard (arrow keys) and a screen
// reader ("3 out of 5 stars, selected") work without extra code. The radio
// circles are hidden; the stars are their labels.
//
// Read-only mode (`readOnly`) just shows a score, e.g. a review already given.

import { useId } from 'react';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Feedback.module.css';

const SCORES = [1, 2, 3, 4, 5];

/**
 * @param {object} props
 * @param {number} props.value            0 (nothing chosen yet) to 5
 * @param {(score: number) => void} [props.onChange]
 * @param {string} props.label            what the group is called, e.g. "Your rating"
 * @param {boolean} [props.readOnly]
 */
export default function StarRating({ value, onChange, label, readOnly = false }) {
  const { t } = useLanguage();
  // One name per group, so two star rows on one page do not share radios.
  const name = useId();

  if (readOnly) {
    return (
      <span className={styles.starsStatic} role="img" aria-label={fill(t('feedback.star'), { count: value })}>
        {SCORES.map((score) => (
          <span key={score} className={score <= value ? styles.starOn : styles.starOff} aria-hidden="true">
            ★
          </span>
        ))}
      </span>
    );
  }

  return (
    <fieldset className={styles.stars}>
      <legend className={styles.srOnly}>{label}</legend>
      {SCORES.map((score) => (
        <label key={score} className={styles.starLabel}>
          <input
            type="radio"
            className={styles.srOnly}
            name={name}
            value={score}
            checked={value === score}
            onChange={() => onChange?.(score)}
            aria-label={fill(t('feedback.star'), { count: score })}
          />
          <span className={score <= value ? styles.starOn : styles.starOff} aria-hidden="true">
            ★
          </span>
        </label>
      ))}
    </fieldset>
  );
}
