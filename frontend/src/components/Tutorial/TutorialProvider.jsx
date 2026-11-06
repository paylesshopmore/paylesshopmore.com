// src/components/Tutorial/TutorialProvider.jsx
//
// The onboarding tour: a step-by-step walk through how ordering works, which
// darkens the page and highlights the part of the site each step talks about.
//
// HOW THE PIECES FIT
//
//   tutorialSteps.js         the list of steps (edit this to change the tour)
//   storage.js               remembers in localStorage that it was seen
//   TutorialProvider.jsx     (this file) state, auto-open, safety net
//   TutorialModal.jsx        the dark overlay + the card with the buttons
//   TutorialSpotlight.jsx    the dark layer with a lit "hole" round a target
//   useTargetRect.js         finds the element to highlight, follows it
//   TutorialStep.jsx         the text and extra content of one step
//   TutorialProgress.jsx     "Step 3 of 8" and the progress bar
//   TutorialHelpMenu.jsx     the "Help" list in the robot's panel
//                            (PageGuide), which can restart it
//   Tutorial.module.css      all the styling
//
// TWO KINDS OF TOUR (see tutorialSteps.js): the general tour, and a short
// tour of each page, which the robot's "Tour this page" starts. Only the
// general tour opens by itself, and only closing that one is remembered.
//
// WHEN IT OPENS BY ITSELF
//
//   - Only for visitors who are not signed in (a new user). Signed-in
//     customers already get the robot guide in the corner (PageGuide).
//   - Only if the tour has not been finished or skipped in this browser
//     before (see storage.js).
//   - Not on pages where it would get in the way: the tutorial page itself
//     (same content, at length), and the log-in / sign-up / password pages.
//   - After a short delay, so the page shows first.
//
// Anyone can open it again at any time from the robot in the corner
// (PageGuide), under "Help".
//
// SAFETY NET: the tour must never be able to break or block the website. The
// card is loaded as a separate download (lazy) and wrapped in an error
// boundary: if it fails to download or crashes, it disappears and the site
// carries on as if it were not there.

import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { TutorialContext } from './context';
import {
  clearProgress,
  isTutorialDone,
  markTutorialDone,
  readProgress,
  saveProgress,
} from './storage';
import { GENERAL_TOUR, stepsOf, tourForPath } from './tutorialSteps';

const TutorialModal = lazy(() => import('./TutorialModal'));

// Pages where the tour does not open by itself.
const NO_AUTO_OPEN = [
  '/tutorial',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];

// Milliseconds after the page loads before the tour opens by itself.
const AUTO_OPEN_DELAY = 1200;

/**
 * The tour that was open in this tab before a refresh (storage.js), checked
 * against the tours that exist now: a step number past the end of its tour
 * (the tour was shortened in an update) is moved back to the last step.
 * null when there is nothing to resume.
 */
function resumable() {
  const saved = readProgress();
  if (!saved) return null;
  const count = stepsOf(saved.tourId).length;
  return { tourId: saved.tourId, stepIndex: Math.min(saved.stepIndex, count - 1) };
}

/**
 * Renders nothing if the tour crashes, instead of taking the page down.
 * `onError` closes the tour so it does not try again straight away.
 */
class TourErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('The onboarding tour failed and was closed.', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * @param {object} props
 * @param {boolean} props.enabled  false on the staff dashboards, where the
 *                                 tour has nothing to explain
 */
export default function TutorialProvider({ enabled = true, children }) {
  const { pathname } = useLocation();
  const { isAuthenticated, isChecking } = useAuth();

  // A tour that was open before a page refresh (or a sign-in / sign-out that
  // reloaded the page) opens again on the same step. Read once, on the
  // first render; useState's function form makes sure of that.
  const [resumed] = useState(resumable);
  const [isOpen, setIsOpen] = useState(Boolean(resumed));
  // Which tour is showing: GENERAL_TOUR or a page tour's id.
  const [tourId, setTourId] = useState(resumed?.tourId ?? GENERAL_TOUR);
  const [stepIndex, setStepIndex] = useState(resumed?.stepIndex ?? 0);
  const steps = stepsOf(tourId);
  // The tour of the page being looked at, for "Tour this page".
  const pageTourId = tourForPath(pathname);
  // Bumped on every (re)start, so the error boundary and the card start
  // fresh each time the tour is opened.
  const [session, setSession] = useState(0);
  // Set the first time any tour opens in this visit. After that the general
  // tour never opens by itself again until the page is reloaded - even when
  // the browser could not save the "seen" flag (private windows, blocked
  // site data). Without this, the auto-open below would fire again every
  // time a tour closed, and the tour could never be got rid of.
  // A resumed tour counts as opened, so the auto-open below does not
  // start a second one on top of it.
  const openedThisVisit = useRef(Boolean(resumed));

  /**
   * Open a tour, at its start or at the step with this id.
   * start()                    the general tour from the beginning
   * start('shipping')          the general tour at its shipping step
   * start(undefined, 'login')  the login page's tour
   */
  const start = useCallback((stepId, tour = GENERAL_TOUR) => {
    const index = stepId
      ? stepsOf(tour).findIndex((step) => step.id === stepId)
      : 0;
    openedThisVisit.current = true;
    setTourId(tour);
    setStepIndex(Math.max(index, 0));
    setSession((current) => current + 1);
    setIsOpen(true);
  }, []);

  /** The tour of the page being looked at (the general tour on the home
   *  page and on pages without one of their own). */
  const startPageTour = useCallback(() => {
    start(undefined, pageTourId);
  }, [start, pageTourId]);

  // Every way out - Skip, ×, Escape, Finish - comes through here. For the
  // general tour all of them count as "seen": a visitor who skipped it does
  // not want it to open by itself again. A page tour is only ever opened on
  // request, so there is nothing to remember.
  const close = useCallback(() => {
    if (tourId === GENERAL_TOUR) markTutorialDone();
    clearProgress();
    setIsOpen(false);
  }, [tourId]);

  // While a tour is open, remember where it is (storage.js), so a refresh,
  // a sign-in or a sign-out picks it up on the same step.
  //
  // Note what is NOT here: the language. Switching language only changes
  // the words (LanguageContext); tourId and stepIndex live in this
  // component's state, which a language change does not touch. So the tour
  // stays on the same step, just translated.
  useEffect(() => {
    if (isOpen) saveProgress(tourId, stepIndex);
  }, [isOpen, tourId, stepIndex]);

  const next = useCallback(() => {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  // Opening by itself for a new visitor, once per visit at most (see
  // openedThisVisit). Waits for the log-in check to finish, so a signed-in
  // customer never sees it flash up.
  useEffect(() => {
    if (!enabled || isOpen || isChecking || isAuthenticated) return undefined;
    if (openedThisVisit.current) return undefined;
    if (NO_AUTO_OPEN.some((path) => pathname.startsWith(path))) return undefined;
    if (isTutorialDone()) return undefined;

    const timer = window.setTimeout(() => start(), AUTO_OPEN_DELAY);
    return () => window.clearTimeout(timer);
  }, [enabled, isOpen, isChecking, isAuthenticated, pathname, start]);

  const value = useMemo(
    () => ({
      isOpen,
      tourId,
      isGeneralTour: tourId === GENERAL_TOUR,
      stepIndex,
      steps,
      start,
      startPageTour,
      close,
      next,
      back,
    }),
    [isOpen, tourId, stepIndex, steps, start, startPageTour, close, next, back],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {enabled && isOpen && (
        <TourErrorBoundary key={session} onError={close}>
          {/* null while it downloads: better nothing than a spinner over
              the page the visitor is reading. */}
          <Suspense fallback={null}>
            <TutorialModal />
          </Suspense>
        </TourErrorBoundary>
      )}
    </TutorialContext.Provider>
  );
}
