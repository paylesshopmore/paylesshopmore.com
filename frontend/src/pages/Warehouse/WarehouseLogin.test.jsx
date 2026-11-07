// /warehouse/login: the warehouse's own sign-in page.
//
// Worth pinning:
//   - anywhere but a registered device it is e-mail + PIN, and the list of
//     who works here is NOT shown;
//   - on a registered device it is "tap your name" instead;
//   - a wrong PIN shows one message (never which half was wrong) and is
//     cleared;
//   - after a PIN a manager generated, the worker goes to choose their own;
//   - the guard in front of /warehouse sends signed-out visitors here, and a
//     worker who must change their PIN to /warehouse/pin.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ERRORS, AuthError, getFloorRoster } from '../../api/auth';
import RequireWarehouse from '../../components/RequireWarehouse/RequireWarehouse';
import { renderWithProviders } from '../../test/utils';
import WarehouseLogin from './WarehouseLogin';

vi.mock('../../api/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getFloorRoster: vi.fn(),
}));

const auth = {
  user: null,
  isAuthenticated: false,
  isChecking: false,
  signInWithEmailPin: vi.fn(),
  signInWithPin: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

const WORKER = { role: 'warehouse', isWarehouse: true, isStaff: false, warehouseUnlocked: true };

function renderAt(route = '/warehouse/login') {
  return renderWithProviders(
    <Routes>
      <Route path="/warehouse/login" element={<WarehouseLogin />} />
      <Route
        path="/warehouse"
        element={
          <RequireWarehouse>
            <p>Warehouse home</p>
          </RequireWarehouse>
        }
      />
      <Route
        path="/warehouse/intake"
        element={
          <RequireWarehouse>
            <p>Intake</p>
          </RequireWarehouse>
        }
      />
      <Route path="/warehouse/pin" element={<p>Choose your PIN</p>} />
      <Route path="/login" element={<p>Office login</p>} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  auth.signInWithEmailPin.mockReset();
  auth.signInWithPin.mockReset();
  // Not a registered device unless a test says so.
  getFloorRoster.mockReset().mockRejectedValue(new AuthError(AUTH_ERRORS.UNAUTHENTICATED));
});

async function fillIn(user, email, pin) {
  await user.type(await screen.findByLabelText('E-mail address'), email);
  await user.type(screen.getByLabelText('PIN'), pin);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('on an ordinary computer', () => {
  it('asks for e-mail and PIN, and shows nobody', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { name: 'Warehouse sign-in' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail address')).toHaveAttribute('type', 'email');
    // Masked, with the number pad.
    expect(screen.getByLabelText('PIN')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('PIN')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.queryByRole('list', { name: 'Who is working?' })).toBeNull();
    // Office staff are pointed to the password sign-in.
    expect(screen.getByRole('link', { name: 'Sign in with a password' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('signs in and opens the warehouse', async () => {
    const user = userEvent.setup();
    // Like the real one: signing in makes this the signed-in account.
    auth.signInWithEmailPin.mockImplementation(async () => {
      auth.user = WORKER;
      auth.isAuthenticated = true;
      return WORKER;
    });
    renderAt();

    await fillIn(user, 'wim@example.com', '4826');

    expect(auth.signInWithEmailPin).toHaveBeenCalledWith({ email: 'wim@example.com', pin: '4826' });
    expect(await screen.findByText('Warehouse home')).toBeInTheDocument();
  });

  it('sends a worker on a generated PIN to choose their own', async () => {
    const user = userEvent.setup();
    auth.signInWithEmailPin.mockResolvedValue({ ...WORKER, mustChangePin: true });
    renderAt();

    await fillIn(user, 'wim@example.com', '4826');

    expect(await screen.findByText('Choose your PIN')).toBeInTheDocument();
  });

  it('says one thing for a wrong address or PIN, and clears the PIN', async () => {
    const user = userEvent.setup();
    auth.signInWithEmailPin.mockRejectedValue(new AuthError(AUTH_ERRORS.INVALID_CREDENTIALS));
    renderAt();

    await fillIn(user, 'wim@example.com', '1111');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That e-mail address or PIN is not right.',
    );
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });

  it('says so when there have been too many tries', async () => {
    const user = userEvent.setup();
    auth.signInWithEmailPin.mockRejectedValue(new AuthError(AUTH_ERRORS.RATE_LIMITED));
    renderAt();

    await fillIn(user, 'wim@example.com', '1111');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries');
  });

  it('checks the form before sending anything', async () => {
    const user = userEvent.setup();
    renderAt();

    await fillIn(user, 'not-an-address', '12');

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your e-mail address.');
    expect(auth.signInWithEmailPin).not.toHaveBeenCalled();
  });

  it('takes digits only, four at most', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(await screen.findByLabelText('PIN'), 'a1b2c3d45');

    expect(screen.getByLabelText('PIN')).toHaveValue('1234');
  });
});

describe('on a registered warehouse device', () => {
  it('shows "Who is working?" instead of the e-mail box', async () => {
    getFloorRoster.mockResolvedValue({
      device: { name: 'Scanner 1' },
      workers: [{ id: 7, name: 'Ana S.', has_pin: true, locked: false }],
    });
    renderAt();

    expect(await screen.findByRole('button', { name: /Ana S\./ })).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail address')).toBeNull();
  });
});

describe('the guard in front of /warehouse', () => {
  it('sends somebody who is not signed in to the warehouse sign-in', async () => {
    renderAt('/warehouse/intake');
    expect(await screen.findByRole('heading', { name: 'Warehouse sign-in' })).toBeInTheDocument();
  });

  it('sends a worker still on a generated PIN to choose their own first', async () => {
    auth.user = { ...WORKER, mustChangePin: true };
    auth.isAuthenticated = true;
    renderAt('/warehouse/intake');
    expect(await screen.findByText('Choose your PIN')).toBeInTheDocument();
  });

  it('lets a worker with their own PIN in', async () => {
    auth.user = WORKER;
    auth.isAuthenticated = true;
    renderAt('/warehouse/intake');
    expect(await screen.findByText('Intake')).toBeInTheDocument();
  });
});

describe('from the header "Warehouse" link (?choose=1), already signed in', () => {
  const ADMIN = { name: 'Christopher Molina', email: 'c@example.com', role: 'admin', isStaff: true };

  beforeEach(() => {
    auth.user = ADMIN;
    auth.isAuthenticated = true;
    auth.signOut.mockReset().mockImplementation(async () => {
      auth.user = null;
      auth.isAuthenticated = false;
    });
  });

  it('asks first instead of going straight in', async () => {
    renderAt('/warehouse/login?choose=1');

    expect(await screen.findByText('You are already signed in as Christopher Molina.')).toBeInTheDocument();
    expect(screen.queryByText('Warehouse home')).toBeNull();
  });

  it('continues to the warehouse as yourself', async () => {
    const user = userEvent.setup();
    renderAt('/warehouse/login?choose=1');

    await user.click(await screen.findByRole('button', { name: 'Continue to the warehouse' }));

    expect(await screen.findByText('Warehouse home')).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('or signs out and shows the e-mail and PIN form for a worker', async () => {
    const user = userEvent.setup();
    const { rerender } = renderAt('/warehouse/login?choose=1');

    await user.click(await screen.findByRole('button', { name: 'Sign in as a worker' }));

    expect(auth.signOut).toHaveBeenCalled();
    rerender(<WarehouseLogin />);
    expect(await screen.findByLabelText('E-mail address')).toBeInTheDocument();
  });

  it('without ?choose=1 still goes straight in', async () => {
    renderAt();
    expect(await screen.findByText('Warehouse home')).toBeInTheDocument();
  });
});
