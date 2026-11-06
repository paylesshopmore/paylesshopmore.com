// src/components/Tutorial/storage.js
//
// Remembers, in this browser, that the visitor has been through the tour (or
// skipped it), so it does not open by itself again.
//
// Two localStorage entries:
//   plsm.tutorialCompleted  'true' once the tour was finished or skipped
//   plsm.tutorialVersion    which version of the tour that was
//
// The tour counts as done only when both match. So raising
// TUTORIAL_VERSION in tutorialSteps.js shows the new tour once to everyone,
// including people who saw the old one.
//
// TO SEE THE TOUR AGAIN WHILE TESTING: click the robot in the corner and
// choose "Start tutorial again", or run this in the browser console and
// reload:
//   localStorage.removeItem('plsm.tutorialCompleted')
//
// localStorage throws in private windows and when site data is blocked.
// Every call is wrapped. Then the flag is simply not saved: the tour opens
// once per visit (each fresh page load), never more than that - the
// provider also remembers, in memory, that it has already been shown.

import { TUTORIAL_VERSION } from './tutorialSteps';

export const COMPLETED_KEY = 'plsm.tutorialCompleted';
export const VERSION_KEY = 'plsm.tutorialVersion';

export function isTutorialDone() {
  try {
    return (
      window.localStorage.getItem(COMPLETED_KEY) === 'true' &&
      window.localStorage.getItem(VERSION_KEY) === String(TUTORIAL_VERSION)
    );
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    window.localStorage.setItem(COMPLETED_KEY, 'true');
    window.localStorage.setItem(VERSION_KEY, String(TUTORIAL_VERSION));
  } catch {
    // Nothing to do; see the note at the top.
  }
}

// ---- A tour in progress ---------------------------------------------------
//
// Which tour is open and on which step, so a page refresh, a sign-in or a
// sign-out carries on where the visitor was instead of starting over at
// step 1. Kept in sessionStorage (this browser tab only, gone when the tab
// closes): a tour left open yesterday should not pop up again tomorrow.
// Cleared as soon as the tour is closed, skipped or finished.

export const PROGRESS_KEY = 'plsm.tutorialProgress';

/** { tourId, stepIndex } of the tour that was open, or null. */
export function readProgress() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PROGRESS_KEY));
    if (
      saved &&
      typeof saved.tourId === 'string' &&
      Number.isInteger(saved.stepIndex) &&
      saved.stepIndex >= 0
    ) {
      return saved;
    }
  } catch {
    // Blocked storage or a damaged value: start fresh.
  }
  return null;
}

export function saveProgress(tourId, stepIndex) {
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ tourId, stepIndex }));
  } catch {
    // Then a refresh starts the tour over. Harmless.
  }
}

export function clearProgress() {
  try {
    window.sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to do.
  }
}
