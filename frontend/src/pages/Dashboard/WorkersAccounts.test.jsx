// Dashboard -> Workers: opening warehouse accounts and looking after them.
//
// The server decides who may do what (backend accounts/test_account_permissions.py).
// These pin what the page does with it: a manager is only offered the
// warehouse worker role, a new worker's first PIN is shown once, and
// "Sign out everywhere" is there for the right people.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomer, listWorkers, signOutWorkerEverywhere } from '../../api/staff';
import { renderWithProviders } from '../../test/utils';
import Workers from './Workers';

vi.mock('../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  listWorkers: vi.fn(),
  createCustomer: vi.fn(),
  signOutWorkerEverywhere: vi.fn(),
}));

const auth = { user: null, refreshUser: vi.fn() };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

const ADMIN = { id: 1, role: 'admin', isAdmin: true, isStaff: true };
const MANAGER = { id: 3, role: 'manager', isWarehouseManager: true, canManageWarehouse: true };

function worker(overrides) {
  return {
    id: 10,
    name: 'Wim Vloer',
    first_name: 'Wim',
    last_name: 'Vloer',
    username: 'wim@example.com',
    email: 'wim@example.com',
    phone_number: '',
    date_joined: '2026-01-05T09:00:00Z',
    role: 'warehouse',
    can_change_role: false,
    is_active: true,
    is_erased: false,
    is_superuser: false,
    pin_status: 'set',
    ...overrides,
  };
}

beforeEach(() => {
  auth.user = MANAGER;
  listWorkers
    .mockReset()
    .mockResolvedValue({ results: [worker()], count: 1, hasNext: false, hasPrevious: false });
  createCustomer.mockReset();
  signOutWorkerEverywhere.mockReset().mockResolvedValue(worker());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

async function openTheForm(user) {
  renderWithProviders(<Workers />);
  await screen.findByText('Wim Vloer');
  await user.click(screen.getByRole('button', { name: 'New colleague' }));
}

describe('opening an account', () => {
  it('offers a manager the warehouse worker role and nothing else', async () => {
    const user = userEvent.setup();
    await openTheForm(user);

    const role = screen.getByLabelText('Role');
    expect(within(role).getAllByRole('option').map((option) => option.value)).toEqual(['warehouse']);
  });

  it('offers an admin every staff role, managers included', async () => {
    auth.user = ADMIN;
    const user = userEvent.setup();
    await openTheForm(user);

    // The form's own Role (an admin also has a Role filter above the list).
    const form = screen.getByRole('button', { name: /Create account/ }).closest('form');
    const values = within(within(form).getByLabelText('Role'))
      .getAllByRole('option')
      .map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['admin', 'office', 'manager', 'warehouse']));
  });

  it('shows a new worker’s first PIN once, to hand over', async () => {
    const user = userEvent.setup();
    createCustomer.mockResolvedValue(
      worker({ id: 20, name: 'Nina Nieuw', email: 'nina@example.com', initial_pin: '4821' }),
    );
    await openTheForm(user);

    await user.type(screen.getByLabelText('First name'), 'Nina');
    await user.type(screen.getByLabelText('Last name'), 'Nieuw');
    await user.type(screen.getByLabelText('E-mail'), 'nina@example.com');
    await user.type(screen.getByLabelText('Phone'), '+31 6 1234 5678');
    await user.click(screen.getByRole('button', { name: /Create account/ }));

    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nina@example.com', role: 'warehouse' }),
    );
    expect(await screen.findByText('4821')).toBeInTheDocument();

    // Done hides it, for good.
    await user.click(screen.getByRole('button', { name: 'Done - hide the PIN' }));
    expect(screen.queryByText('4821')).toBeNull();
  });
});

describe('signing somebody out everywhere', () => {
  it('a manager can, for a worker, after confirming', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Workers />);
    await screen.findByText('Wim Vloer');

    await user.click(screen.getByRole('button', { name: 'Sign Wim Vloer out on every device' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(signOutWorkerEverywhere).toHaveBeenCalledWith(10);
    expect(await screen.findByText('Wim Vloer is signed out everywhere.')).toBeInTheDocument();
  });

  it('is not offered for an account that is switched off, or for yourself', async () => {
    auth.user = ADMIN;
    listWorkers.mockResolvedValue({
      results: [
        worker({ is_active: false }),
        worker({ id: 1, name: 'Bea Baas', email: 'bea@example.com', role: 'admin' }),
      ],
      count: 2,
      hasNext: false,
      hasPrevious: false,
    });
    renderWithProviders(<Workers />);
    await screen.findByText('Wim Vloer');

    expect(screen.queryByRole('button', { name: /out on every device/ })).toBeNull();
  });
});
