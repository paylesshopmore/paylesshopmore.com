// Dashboard -> Website: an admin switches the public Calculator page on and
// off; anybody else is told only an admin can.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { getSiteSettings, saveSiteSettings } from '../../api/staff';
import WebsiteSettings from './WebsiteSettings';

vi.mock('../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  getSiteSettings: vi.fn(),
  saveSiteSettings: vi.fn(),
}));

const auth = { user: { isAdmin: true } };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth.user = { isAdmin: true };
  getSiteSettings.mockReset().mockResolvedValue({ show_calculator: true });
  saveSiteSettings.mockReset();
});

describe('Website settings', () => {
  it('lets an admin hide the Calculator page', async () => {
    const user = userEvent.setup();
    saveSiteSettings.mockResolvedValue({ show_calculator: false });
    renderWithProviders(<WebsiteSettings />);

    const calculator = await screen.findByRole('switch', { name: /Calculator page/ });
    expect(calculator).toBeChecked();

    await user.click(calculator);

    expect(saveSiteSettings).toHaveBeenCalledWith({ show_calculator: false });
    expect(await screen.findByText(/hidden from visitors/)).toBeInTheDocument();
    expect(calculator).not.toBeChecked();
  });

  it('is closed to anybody who is not an admin', async () => {
    auth.user = { isAdmin: false };
    renderWithProviders(<WebsiteSettings />);

    expect(await screen.findByText('Only an admin can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(getSiteSettings).not.toHaveBeenCalled();
  });
});
