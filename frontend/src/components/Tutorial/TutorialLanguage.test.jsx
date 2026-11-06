// Changing language during the onboarding tour.
//
// What must hold, whoever the visitor is (guest or signed in):
//   - the language picker is in the card on every step, the welcome included;
//   - picking a language translates the card straight away, with no reload;
//   - the tour stays on the SAME step - never back to step 1, never closed;
//   - the tour and the website share one language: a change on either side
//     shows on the other;
//   - a refresh, a sign-in or a sign-out carries on at the same step.
//
// The texts are read from translations.js rather than typed in here, so a
// rewording there does not break these tests.

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { fill } from '../../i18n/fill';
import { LANGUAGES, translations } from '../../i18n/translations';
import LanguageMenu from '../LanguageSwitcher/LanguageMenu';
import PageGuide from '../PageGuide/PageGuide';
import TutorialProvider from './TutorialProvider';
import { COMPLETED_KEY, PROGRESS_KEY } from './storage';
import { tutorialSteps } from './tutorialSteps';

const auth = { user: null, isAuthenticated: false, isChecking: false };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

const TOTAL = tutorialSteps.length;
const ui = (code) => translations[code].onboarding;
const stepLabel = (code, n) => fill(ui(code).stepOf, { current: n, total: TOTAL });
const labelOf = (code) => LANGUAGES.find((lang) => lang.code === code).label;

/** The site as App.jsx renders it, with the site's own language menu. */
function renderSite({ route = '/' } = {}) {
  return renderWithProviders(
    <TutorialProvider>
      <LanguageMenu />
      <PageGuide />
    </TutorialProvider>,
    { route },
  );
}

const findTour = () => screen.findByRole('dialog', {}, { timeout: 5000 });

/** Clicks Start/Next until the card shows step `n` (1-based). */
async function goToStep(user, tour, n) {
  await user.click(within(tour).getByRole('button', { name: ui('en').start }));
  for (let i = 2; i < n; i += 1) {
    await user.click(within(tour).getByRole('button', { name: ui('en').next }));
  }
  expect(within(tour).getByText(stepLabel('en', n))).toBeInTheDocument();
}

/** The picker inside the card. Found without its name, because its name is
 *  translated too ("Choose a language" / "Kies een taal"). */
const picker = (tour) => within(within(tour).getByRole('radiogroup'));

beforeAll(async () => {
  await import('./TutorialModal');
});

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  auth.isChecking = false;
});

describe('the language picker in the tour', () => {
  it('is on the welcome card for a first-time visitor, with every site language', async () => {
    renderSite();
    const tour = await findTour();

    for (const lang of LANGUAGES) {
      expect(picker(tour).getByRole('radio', { name: lang.label })).toBeInTheDocument();
    }
    expect(picker(tour).getByRole('radio', { name: labelOf('en') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('translates the welcome card before the tour is started', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();

    await user.click(picker(tour).getByRole('radio', { name: labelOf('nl') }));

    expect(within(tour).getByText(stepLabel('nl', 1))).toBeInTheDocument();
    expect(within(tour).getByRole('radiogroup')).toHaveAccessibleName(
      translations.nl.language.choose,
    );
    expect(within(tour).getByRole('button', { name: ui('nl').start })).toBeInTheDocument();
    expect(within(tour).getByRole('button', { name: ui('nl').skip })).toBeInTheDocument();
    // Saved for the next visit, the same way the site's own switcher saves it.
    expect(window.localStorage.getItem('plsm.language')).toBe('nl');

    // Starting goes on in Dutch.
    await user.click(within(tour).getByRole('button', { name: ui('nl').start }));
    expect(within(tour).getByText(stepLabel('nl', 2))).toBeInTheDocument();
  });

  it('stays on step 3 when the language changes there', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();
    await goToStep(user, tour, 3);

    await user.click(picker(tour).getByRole('radio', { name: labelOf('nl') }));

    expect(within(tour).getByText(stepLabel('nl', 3))).toBeInTheDocument();
    expect(within(tour).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(within(tour).getByRole('button', { name: ui('nl').next })).toBeInTheDocument();
    expect(within(tour).getByRole('button', { name: ui('nl').back })).toBeInTheDocument();
  });

  it('stays on the last step, and can be switched back and forth', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();
    await goToStep(user, tour, TOTAL);

    await user.click(picker(tour).getByRole('radio', { name: labelOf('nl') }));
    expect(within(tour).getByText(stepLabel('nl', TOTAL))).toBeInTheDocument();
    expect(within(tour).getByRole('button', { name: ui('nl').finish })).toBeInTheDocument();

    await user.click(picker(tour).getByRole('radio', { name: labelOf('en') }));
    expect(within(tour).getByText(stepLabel('en', TOTAL))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(tour);
  });

  it('shares one language with the website, both ways', async () => {
    const user = userEvent.setup();
    renderSite();
    const tour = await findTour();
    await goToStep(user, tour, 2);

    // From the tour: the site's own menu follows.
    await user.click(picker(tour).getByRole('radio', { name: labelOf('nl') }));
    const siteMenu = screen.getByRole('button', { name: new RegExp(labelOf('nl')) });
    expect(siteMenu).toBeInTheDocument();

    // From the site: the tour follows, still on step 2.
    await user.click(siteMenu);
    await user.click(
      screen
        .getAllByRole('radio', { name: labelOf('en') })
        .find((radio) => !tour.contains(radio)),
    );
    expect(within(tour).getByText(stepLabel('en', 2))).toBeInTheDocument();
  });
});

describe('keeping the place in the tour', () => {
  it('carries on at the same step, in the same language, after a refresh', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSite();
    let tour = await findTour();
    await goToStep(user, tour, 4);
    await user.click(picker(tour).getByRole('radio', { name: labelOf('nl') }));
    unmount();

    // A refresh: everything rebuilt from storage.
    renderSite();
    tour = await findTour();
    expect(within(tour).getByText(stepLabel('nl', 4))).toBeInTheDocument();
  });

  it('keeps the step when the visitor signs in and out with the tour open', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSite();
    const tour = await findTour();
    await goToStep(user, tour, 5);

    const site = (
      <TutorialProvider>
        <LanguageMenu />
        <PageGuide />
      </TutorialProvider>
    );

    auth.user = { id: 7 };
    auth.isAuthenticated = true;
    rerender(site);
    expect(within(screen.getByRole('dialog')).getByText(stepLabel('en', 5))).toBeInTheDocument();

    auth.user = null;
    auth.isAuthenticated = false;
    rerender(site);
    expect(within(screen.getByRole('dialog')).getByText(stepLabel('en', 5))).toBeInTheDocument();
  });

  it('does not open the robot panel on top of a resumed tour for a signed-in customer', async () => {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ tourId: 'general', stepIndex: 2 }));
    auth.user = { id: 7 };
    auth.isAuthenticated = true;
    renderSite({ route: '/profile' });

    const tour = await findTour();
    expect(within(tour).getByText(stepLabel('en', 3))).toBeInTheDocument();
    // Past the robot's own 0.9s auto-open: still only the one pop-up.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('forgets the place once finished, and does not open again next visit', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSite();
    const tour = await findTour();
    await goToStep(user, tour, TOTAL);
    await user.click(within(tour).getByRole('button', { name: ui('en').finish }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.sessionStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(window.localStorage.getItem(COMPLETED_KEY)).toBe('true');
    unmount();

    renderSite();
    await act(() => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
