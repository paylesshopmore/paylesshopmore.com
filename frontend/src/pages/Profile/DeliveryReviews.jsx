// src/pages/Profile/DeliveryReviews.jsx
//
// "Rate your delivery" on the profile page: the customer's delivered
// shipments (newest ten), each with 1-5 stars and an optional comment. A
// shipment already reviewed shows the review instead. One review per
// shipment - the server refuses a second (backend feedback/views.py).
//
// The "delivered" e-mail links here as /profile?review=<shipment id>#reviews:
// that shipment is highlighted and its stars get the focus.

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listMyDeliveries, reviewDelivery } from '../../api/feedback';
import StarRating from '../../components/Feedback/StarRating';
import styles from '../../components/Feedback/Feedback.module.css';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';

const MAX_COMMENT = 2000;

/** One delivered shipment: its review, or the form to give one. */
function DeliveryRow({ row, chosen, onReviewed }) {
  const { t, language } = useLanguage();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const itemRef = useRef(null);

  // Opened from the e-mail's link: bring this one into view.
  useEffect(() => {
    if (chosen) itemRef.current?.scrollIntoView?.({ block: 'center' });
  }, [chosen]);

  const date = row.delivered_at
    ? new Date(row.delivered_at).toLocaleDateString(language === 'pap' ? 'nl' : language)
    : '';

  async function submit(event) {
    event.preventDefault();
    if (rating < 1) {
      setError(t('feedback.chooseStars'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reviewDelivery(row.package, rating, comment.trim());
      onReviewed(row.package, { rating, comment: comment.trim() });
    } catch (caught) {
      setError(caught?.status === 409 ? t('feedback.reviews.already') : t('feedback.failed'));
      setBusy(false);
    }
  }

  return (
    <li ref={itemRef} className={chosen ? `${styles.reviewItem} ${styles.reviewItemChosen}` : styles.reviewItem}>
      <div className={styles.reviewHead}>
        <span className={styles.reviewTitle}>{row.tracking_number}</span>
        {date && <span className={styles.muted}>{fill(t('feedback.reviews.deliveredOn'), { date })}</span>}
      </div>

      {row.review ? (
        <div>
          <span className={styles.muted}>{t('feedback.reviews.yourReview')}: </span>
          <StarRating value={row.review.rating} readOnly />
          {row.review.comment && <p className={styles.muted}>“{row.review.comment}”</p>}
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <StarRating
            value={rating}
            onChange={(score) => {
              setRating(score);
              setError('');
            }}
            label={`${t('feedback.starsLabel')} - ${row.tracking_number}`}
          />
          <label className={styles.field}>
            <span className={styles.label}>{t('feedback.comment')}</span>
            <textarea
              className={styles.input}
              rows={2}
              maxLength={MAX_COMMENT}
              value={comment}
              placeholder={t('feedback.commentPlaceholder')}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={styles.send} disabled={busy}>
            {busy ? t('feedback.sending') : t('feedback.reviews.rate')}
          </button>
        </form>
      )}
    </li>
  );
}

export default function DeliveryReviews() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  // The shipment the "delivered" e-mail pointed at, if any.
  const chosenId = Number(params.get('review')) || null;

  // null while loading, 'error' when it failed, else the list.
  const [rows, setRows] = useState(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let live = true;
    listMyDeliveries().then(
      (list) => live && setRows(Array.isArray(list) ? list : []),
      () => live && setRows('error'),
    );
    return () => {
      live = false;
    };
  }, []);

  function reviewed(packageId, review) {
    setRows((current) => current.map((row) => (row.package === packageId ? { ...row, review } : row)));
    setThanks(true);
  }

  if (rows === null) return null;
  if (rows === 'error') return <p className={styles.muted}>{t('feedback.reviews.loadFailed')}</p>;

  return (
    <>
      <p className={styles.muted}>{rows.length === 0 ? t('feedback.reviews.empty') : t('feedback.reviews.intro')}</p>
      {thanks && (
        <p className={styles.thanks} role="status">
          {t('feedback.reviews.thanks')}
        </p>
      )}
      {rows.length > 0 && (
        <ul className={styles.reviewList}>
          {rows.map((row) => (
            <DeliveryRow key={row.package} row={row} chosen={row.package === chosenId} onReviewed={reviewed} />
          ))}
        </ul>
      )}
    </>
  );
}
