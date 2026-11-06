// src/components/Tutorial/TutorialModal.jsx
//
// What the visitor sees while the tour is open: the darkened page with the
// spotlight (TutorialSpotlight), and the card with the step, the progress
// and the buttons.
//
// WHERE THE CARD GOES
//   - Phones (up to 640px wide): a panel along the bottom of the screen, or
//     along the top - whichever side of the highlighted element has more
//     room - and no taller than that room, so it does not cover the element
//     (it scrolls inside instead). See sheetPlacement() below and .sheet /
//     .sheetTop in the CSS.
//   - Larger screens: under the highlighted element, or above it if there is
//     no room below. If it fits neither way, it goes on the roomier side and
//     is made shorter (its text scrolls, the buttons stay). Centred on the
//     screen when nothing is highlighted. Worked out in cardPosition().
//
// KEYBOARD
//   Escape closes the tour. Left/Right arrows go back/forward. Tab moves
//   between the card's buttons and stays inside the card (focus trap) while
//   it is open. Focus moves to the step's title on every step, and goes back
//   to wherever it was when the tour closes.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import TutorialLanguage from './TutorialLanguage';
import TutorialProgress from './TutorialProgress';
import TutorialSpotlight from './TutorialSpotlight';
import TutorialStep from './TutorialStep';
import { useTutorial } from './useTutorial';
import { useTargetRect } from './useTargetRect';
import styles from './Tutorial.module.css';
import { viewportSize } from '../../utils/pageZoom';

// Distance from the screen edges, and between the card and the element.
const MARGIN = 16;
const GAP = 20;
// Must match the phone breakpoint in Tutorial.module.css.
const PHONE_QUERY = '(max-width: 640px)';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isPhone() {
  return window.matchMedia?.(PHONE_QUERY).matches ?? false;
}

// Shorter than this the card is too cramped; it may then overlap a little.
const MIN_CARD_HEIGHT = 320;

/**
 * Where the card goes on a larger screen: { top, left } in pixels, plus a
 * maxHeight when it has to be shortened to fit beside the element.
 * `card` is the card's measured size.
 */
function cardPosition(rect, card) {
  // The screen in the page's own pixels (the page may be zoomed).
  const { width: vw, height: vh } = viewportSize();
  const centred = {
    top: Math.max(MARGIN, (vh - card.height) / 2),
    left: Math.max(MARGIN, (vw - card.width) / 2),
  };
  if (!rect) return centred;

  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP - card.height;
  // How much height there is under and over the element.
  const roomBelow = vh - MARGIN - below;
  const roomAbove = rect.top - GAP - MARGIN;
  let top;
  let maxHeight;
  if (card.height <= roomBelow) top = below;
  else if (above >= MARGIN) top = above;
  else if (roomBelow >= roomAbove) {
    // Fits neither way: shorten it to fit under the element.
    top = below;
    maxHeight = Math.max(roomBelow, MIN_CARD_HEIGHT);
  } else {
    maxHeight = Math.max(roomAbove, MIN_CARD_HEIGHT);
    top = Math.max(MARGIN, rect.top - GAP - maxHeight);
  }
  // Never past the bottom of the screen.
  if (maxHeight) top = Math.min(top, vh - MARGIN - maxHeight);

  // Centred under the element, but never off the screen.
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - card.width / 2),
    Math.max(MARGIN, vw - card.width - MARGIN),
  );
  return maxHeight ? { top, left, maxHeight } : { top, left };
}

// Below this height a phone panel would be too cramped to read; it may then
// overlap the highlighted element a little instead.
const MIN_SHEET_HEIGHT = 260;

/**
 * Phones: whether the panel goes at the top, and how tall it may be.
 * Nothing highlighted: at the bottom, at its normal maximum height.
 */
function sheetPlacement(rect) {
  if (!rect) return { top: false, style: undefined };
  const { height: vh } = viewportSize();
  const edge = 12; // matches the 0.75rem gap in the CSS
  const below = vh - (rect.top + rect.height) - GAP - edge;
  const above = rect.top - GAP - edge;
  const top = above > below;
  const room = Math.max(top ? above : below, MIN_SHEET_HEIGHT);
  return { top, style: { maxHeight: Math.min(room, vh * 0.72) } };
}

export default function TutorialModal() {
  const { steps, stepIndex, next, back, close, tourId, isGeneralTour } =
    useTutorial();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const titleId = useId();

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const rect = useTargetRect(step.target, step.id);

  const cardRef = useRef(null);
  // Wraps everything inside the card. Its height is the card's FULL height,
  // even while the card itself has been made shorter to fit the screen.
  const contentRef = useRef(null);
  // The card's full (uncut) size, for cardPosition().
  const [cardSize, setCardSize] = useState({ width: 400, height: 340 });
  // Re-render on resize / rotate, so the position is recalculated.
  const [, setViewport] = useState(0);

  // Measured whenever the contents change size (a new step, a longer
  // translation, a rotated phone). ResizeObserver also reports the size
  // once straight away. Very old browsers lack it and keep the estimate.
  //
  // IMPORTANT: this measures the contents, not the card. cardPosition() may
  // make the card shorter (maxHeight) to fit beside the highlighted element.
  // Measuring the shortened card would report "it fits now", the card would
  // be made full height again, then measured as "too tall", shortened...
  // an endless loop that made the card flicker (and hid its buttons) on
  // screens around 1536x730. The contents' height does not change when the
  // card is shortened, so the decision stays the same.
  useEffect(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    if (!card || !content || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      const style = window.getComputedStyle(card);
      // The card's own padding and border, around the contents.
      const frame =
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth);
      const width = card.offsetWidth;
      const height = Math.round(content.offsetHeight + frame);
      // Only when it really changed, so a re-render cannot set off another.
      setCardSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Remember what had focus before the tour, and give it back afterwards.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  // On every step: focus the title, so keyboard and screen-reader users are
  // taken to the new content.
  useEffect(() => {
    document.getElementById(titleId)?.focus({ preventScroll: true });
  }, [stepIndex, titleId]);

  // Escape closes, wherever focus happens to be.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const handleCardKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        // Stop the tutorial page's own arrow-key slideshow reacting too.
        event.stopPropagation();
        if (event.key === 'ArrowRight' && !isLast) next();
        if (event.key === 'ArrowLeft' && !isFirst) back();
        return;
      }

      // Focus trap: Tab from the last button goes to the first, and
      // Shift+Tab from the first goes to the last.
      if (event.key === 'Tab') {
        const focusable = [...cardRef.current.querySelectorAll(FOCUSABLE)];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (
          event.shiftKey &&
          (active === first || !cardRef.current.contains(active))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [isFirst, isLast, next, back],
  );

  const phone = isPhone();
  const sheet = phone ? sheetPlacement(rect) : null;
  const style = phone ? sheet.style : cardPosition(rect, cardSize);
  const sheetTop = phone && sheet.top;

  function openWebsite() {
    close();
    navigate('/');
  }

  return (
    <div className={styles.root}>
      <TutorialSpotlight
        rect={rect}
        // A click on the dark area does not close the tour (too easy to do
        // by accident); it puts focus back on the card instead.
        onBackdropClick={() => document.getElementById(titleId)?.focus()}
      />

      <div
        ref={cardRef}
        className={[
          styles.card,
          phone && styles.sheet,
          sheetTop && styles.sheetTop,
        ]
          .filter(Boolean)
          .join(' ')}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleCardKeyDown}
      >
        {/* Everything inside the card, so its full height can be measured
            (see contentRef above). */}
        <div ref={contentRef}>
          <div className={styles.cardHead}>
            <TutorialProgress current={stepIndex + 1} total={steps.length} />
            {/* Change language without leaving the tour (TutorialLanguage.jsx).
                Shown on every step, the welcome step included. */}
            <TutorialLanguage />
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label={t('onboarding.close')}
            >
              ×
            </button>
          </div>

          {/* Keyed on the step, so each new step plays the fade-in. The texts
            of a page tour live under onboarding.pages.<tour>. */}
          <div key={step.id} className={styles.stepAnimate}>
            <TutorialStep
              step={step}
              titleId={titleId}
              textBase={
                isGeneralTour
                  ? 'onboarding.steps'
                  : `onboarding.pages.${tourId}`
              }
            />
          </div>

          <div className={styles.footer}>
            {isFirst && isGeneralTour ? (
              // The general tour's welcome step: Skip or Start.
              <>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={close}
                >
                  {t('onboarding.skip')}
                </button>
                <button type="button" className={styles.primary} onClick={next}>
                  {t('onboarding.start')}
                </button>
              </>
            ) : (
              <>
                {/* "Skip" on the left, quietly; Back and Next on the right.
                  No Back on the first step of a page tour, nothing to go
                  back to. */}
                {!isLast && (
                  <button type="button" className={styles.skip} onClick={close}>
                    {t('onboarding.skip')}
                  </button>
                )}
                <span className={styles.footerSpacer} />
                {!isFirst && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={back}
                  >
                    {t('onboarding.back')}
                  </button>
                )}
                {isLast ? (
                  <>
                    {/* "Open website" belongs to the general tour, which may
                      have been started anywhere; a page tour ends where it
                      is. */}
                    {isGeneralTour && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={openWebsite}
                      >
                        {t('onboarding.openWebsite')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={close}
                    >
                      {t('onboarding.finish')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={next}
                  >
                    {t('onboarding.next')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
