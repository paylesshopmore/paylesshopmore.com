// The warehouse app leaves out what an admin switched off for warehouse
// workers (Dashboard -> Warehouse access), and says so if it is opened by
// its address.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { getWarehouseAccess } from '../../api/warehouse';
import TutorialProvider from '../../components/Tutorial/TutorialProvider';
import WarehouseLayout from './WarehouseLayout';

vi.mock('../../api/warehouse', async (importOriginal) => ({
  ...(await importOriginal()),
  getWarehouseAccess: vi.fn(),
}));

// Signed in, as everybody in the warehouse is - so the site's general tour
// (for new visitors) never opens here.
const auth = {
  user: { name: 'Floor', isWarehouse: true },
  signOut: vi.fn(),
  isAuthenticated: true,
  isChecking: false,
};
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

/** Says where the app went, including the query string. */
function Here({ name }) {
  const { pathname, search } = useLocation();
  return <p>{`${name}: ${pathname}${search}`}</p>;
}

function renderAt(route) {
  return renderWithProviders(
    // As in App.jsx: the tour system around everything, on for the warehouse.
    <TutorialProvider>
      <Routes>
        <Route path="/warehouse" element={<WarehouseLayout />}>
          <Route index element={<p>Home</p>} />
          <Route path="intake" element={<p>Intake page</p>} />
          <Route path="profile" element={<p>Profile page</p>} />
        </Route>
        <Route path="/login" element={<Here name="Login" />} />
        <Route path="/warehouse/login" element={<Here name="Warehouse login" />} />
        <Route path="/" element={<Here name="Public home" />} />
      </Routes>
    </TutorialProvider>,
    { route },
  );
}

beforeEach(() => {
  // The warehouse tour has been seen; the tests about it below clear this.
  window.localStorage.setItem('plsm.warehouseTourSeen', 'true');
  auth.user = { name: 'Floor', isWarehouse: true };
  auth.signOut = vi.fn().mockResolvedValue(undefined);
  window.localStorage.setItem('plsm.language', 'en');
  getWarehouseAccess.mockReset().mockResolvedValue({
    mine: { damage: true, measurements: true, packaging: true, activity: true, intake: false },
  });
});

describe('warehouse access in the app', () => {
  it('leaves a switched-off part out of the menu', async () => {
    renderAt('/warehouse');

    await waitFor(() =>
      expect(screen.queryAllByRole('link', { name: /Intake/ })).toHaveLength(0),
    );
    // The menu is Home, Scan, Intake sheets and Profile - nothing else.
    expect(screen.getAllByRole('link', { name: /Scan/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: /Damage|Activity|Packages|Work/ })).toHaveLength(0);
  });

  it('says so when a switched-off part is opened by its address', async () => {
    renderAt('/warehouse/intake');

    expect(await screen.findByText('This part is switched off')).toBeInTheDocument();
    expect(screen.queryByText('Intake page')).toBeNull();
  });

  it('opens a part that is on', async () => {
    renderAt('/warehouse/profile');
    await waitFor(() => expect(getWarehouseAccess).toHaveBeenCalled());
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });
});

// A device the whole floor shares: whoever finishes has to be out in one tap,
// and whoever is next has to land on the sign-in page without hunting for it.
describe('logging out on a shared floor device', () => {
  it('puts a one-tap Log out in the top bar for a floor account', async () => {
    const user = userEvent.setup();
    renderAt('/warehouse');

    // Visible straight away: the account menu and the More sheet are closed.
    const button = screen.getByRole('button', { name: 'Log out' });
    await user.click(button);

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    // Straight to the warehouse's own sign-in page, not the public home page.
    expect(await screen.findByText('Warehouse login: /warehouse/login')).toBeInTheDocument();
  });

  it('is not there for an office account, who has no queue behind them', () => {
    auth.user = { name: 'Office', isWarehouse: true, isStaff: true };
    renderAt('/warehouse');

    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('still sends an office account to the home page when they sign out', async () => {
    const user = userEvent.setup();
    auth.user = { name: 'Office', isWarehouse: true, isStaff: true };
    renderAt('/warehouse');

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Public home: /')).toBeInTheDocument();
  });

  it('lets an office account sign out and go to the worker sign-in page', async () => {
    const user = userEvent.setup();
    auth.user = { name: 'Office', isWarehouse: true, isStaff: true };
    renderAt('/warehouse');

    // The account menu (the button with the person's name).
    await user.click(screen.getByRole('button', { name: /Office/ }));
    await user.click(screen.getByRole('button', { name: 'Sign in as a worker' }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Warehouse login: /warehouse/login')).toBeInTheDocument();
  });

  it('does not offer it to a floor account (their Log out already goes there)', async () => {
    const user = userEvent.setup();
    renderAt('/warehouse');
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('button', { name: 'Sign in as a worker' })).toBeNull();
  });
});

describe('the warehouse tour', () => {
  it('opens by itself the first time, and only once', async () => {
    window.localStorage.removeItem('plsm.warehouseTourSeen');
    renderAt('/warehouse');

    expect(
      await screen.findByRole('heading', { name: 'Welcome to the warehouse' }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem('plsm.warehouseTourSeen')).toBe('true');
  });

  it('opens again from the Guide button', async () => {
    const user = userEvent.setup();
    renderAt('/warehouse');

    await user.click(screen.getByRole('button', { name: 'Guide' }));

    expect(await screen.findByRole('heading', { name: 'Welcome to the warehouse' })).toBeInTheDocument();
  });
});
