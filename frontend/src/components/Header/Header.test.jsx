// The header's account area. Signed in, it is one button (initials, name,
// role) that opens a menu, instead of three separate controls side by side:
// staff get "Dashboard" in that menu, customers do not.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Header from './Header';

const auth = {
  user: null,
  isAuthenticated: false,
  signOut: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  auth.signOut.mockClear();
});

function signIn(user) {
  auth.user = user;
  auth.isAuthenticated = true;
}

describe('the header account area', () => {
  it('shows Log in and Sign up when signed out', () => {
    renderWithProviders(<Header />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('puts a warehouse account behind one button with a menu', async () => {
    const user = userEvent.setup();
    signIn({
      name: 'Warehouse 1',
      email: 'w1@example.com',
      role: 'warehouse',
      isWarehouse: true,
    });
    renderWithProviders(<Header />);

    // One button, not a separate Dashboard link, name link and Log out.
    const button = screen.getByRole('button', { name: /Warehouse 1/ });
    expect(button).toHaveTextContent('W1');
    expect(button).toHaveTextContent('Warehouse worker');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();

    await user.click(button);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/warehouse',
    );
    // The same profile page a customer has, with a button to the warehouse;
    // the warehouse shell's own profile is the office's.
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute(
      'href',
      '/profile',
    );

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('gives a customer no Dashboard, and their own account page', async () => {
    const user = userEvent.setup();
    signIn({ name: 'Ana Martis', email: 'ana@example.com', role: 'customer' });
    renderWithProviders(<Header />);

    await user.click(screen.getByRole('button', { name: /Ana Martis/ }));
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('gives an admin Dashboard and Warehouse, without My account', async () => {
    const user = userEvent.setup();
    signIn({
      name: 'Christopher Molina',
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true,
      isStaff: true,
    });
    renderWithProviders(<Header />);

    await user.click(screen.getByRole('button', { name: /Christopher Molina/ }));
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Warehouse' })).toHaveAttribute('href', '/warehouse/login?choose=1');
    expect(screen.queryByRole('link', { name: 'My account' })).toBeNull();
  });
});
