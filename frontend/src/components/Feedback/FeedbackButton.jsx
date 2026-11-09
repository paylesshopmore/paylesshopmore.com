// src/components/Feedback/FeedbackButton.jsx
//
// The "Feedback" tab on the right edge of every page of the website (not the
// dashboards). It opens a small pop-up: 1-5 stars, a comment, and - for a
// visitor who is not signed in - an optional e-mail address for an answer.
// Sent to the server with the page it was on and the language
// (backend feedback/views.py). The office reads it in Dashboard -> Feedback.

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sendFeedback } from '../../api/feedback';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import HelpDialog from '../HelpDialog/HelpDialog';
import StarRating from './StarRating';
import styles from './Feedback.module.css';

const MAX_COMMENT = 2000;

export default function FeedbackButton() {
  const { t, language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function close() {
    setOpen(false);
    // Start fresh next time once something was sent; keep typing otherwise.
    if (sent) {
      setRating(0);
      setComment('');
      setEmail('');
      setSent(false);
    }
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (rating < 1) {
      setError(t('feedback.chooseStars'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendFeedback({
        rating,
        comment: comment.trim(),
        // Signed in: the server knows who it is.
        email: isAuthenticated ? '' : email.trim(),
        page: pathname,
        language,
      });
      setSent(true);
    } catch {
      setError(t('feedback.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.tab} data-tour="feedback" onClick={() => setOpen(true)}>
        {/* A speech bubble: "tell us something". */}
        <svg
          className={styles.tabIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" />
        </svg>
        <span className={styles.tabText}>{t('feedback.button')}</span>
      </button>

      <HelpDialog
        open={open}
        onClose={close}
        title={t('feedback.title')}
        closeLabel={t('feedback.close')}
        doneLabel={sent ? t('feedback.close') : t('feedback.cancel')}
      >
        {sent ? (
          <p className={styles.thanks} role="status">
            {t('feedback.thanks')}
          </p>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <p className={styles.intro}>{t('feedback.intro')}</p>

            <StarRating
              value={rating}
              onChange={(score) => {
                setRating(score);
                setError('');
              }}
              label={t('feedback.starsLabel')}
            />

            <label className={styles.field}>
              <span className={styles.label}>{t('feedback.comment')}</span>
              <textarea
                className={styles.input}
                rows={4}
                maxLength={MAX_COMMENT}
                value={comment}
                placeholder={t('feedback.commentPlaceholder')}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>

            {!isAuthenticated && (
              <label className={styles.field}>
                <span className={styles.label}>{t('feedback.email')}</span>
                <input
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button type="submit" className={styles.send} disabled={busy}>
              {busy ? t('feedback.sending') : t('feedback.send')}
            </button>
          </form>
        )}
      </HelpDialog>
    </>
  );
}
