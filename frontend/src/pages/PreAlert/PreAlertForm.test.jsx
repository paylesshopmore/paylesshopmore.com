// The pre-alert form: what it checks before sending, what it sends, and that
// it only says "registered" once the server has saved it.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { createPrealert, readPrealertScreenshot } from '../../api/prealerts';
import { renderWithProviders } from '../../test/utils';
import PreAlertForm from './PreAlertForm';

vi.mock('../../api/prealerts', () => ({ createPrealert: vi.fn(), readPrealertScreenshot: vi.fn() }));
vi.mock('../../api/tracking', () => ({
  getCarriers: vi.fn().mockResolvedValue([
    { code: 'postnl', name: 'PostNL', trackable: true },
    { code: 'walk-in', name: 'Walk-in', trackable: false },
  ]),
}));
vi.mock('../../api/shops', () => ({
  listShops: vi.fn().mockResolvedValue([{ id: 3, name: 'bol.com' }]),
}));
const auth = { user: { firstName: 'Klaas', lastName: 'Klant' } };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('plsm.language', 'en');
});

async function fillIn(user) {
  await user.type(screen.getByLabelText('Tracking number *'), '3SABC1234567');
  await user.selectOptions(await screen.findByLabelText('Courier company *'), 'postnl');
  await screen.findByRole('option', { name: 'bol.com' });
  await user.selectOptions(screen.getByLabelText('Store where you bought it *'), '3');
  await user.type(screen.getByLabelText('Package description *'), 'Motherboard');
  await user.click(screen.getByRole('checkbox'));
}

describe('PreAlertForm', () => {
  it('starts with the customer as receiver, and asks no delivery address', async () => {
    renderWithProviders(<PreAlertForm />);
    expect(screen.getByLabelText('Consignee (who receives it) *')).toHaveValue('Klaas Klant');
    expect(screen.queryByLabelText('Delivery address')).toBeNull();
    await screen.findByRole('option', { name: 'PostNL' });
    // A walk-in has no courier number: not offered.
    expect(screen.queryByRole('option', { name: 'Walk-in' })).toBeNull();
  });

  it('starts with the number from the Track & Trace box', () => {
    renderWithProviders(<PreAlertForm />, { route: '/prealert?number=3SABC1234567' });
    expect(screen.getByLabelText('Tracking number *')).toHaveValue('3SABC1234567');
  });

  it('names every missing field and sends nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreAlertForm />);
    await user.click(screen.getByRole('button', { name: 'Send pre-alert' }));

    expect(screen.getByText('Enter the tracking number.')).toBeInTheDocument();
    expect(screen.getByText('Choose the courier company.')).toBeInTheDocument();
    expect(screen.getByText(/Confirm that you have read/)).toBeInTheDocument();
    expect(createPrealert).not.toHaveBeenCalled();
  });

  it('refuses a file type the server would refuse', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<PreAlertForm />);
    const input = document.querySelector('input[type="file"][multiple]');
    await user.upload(input, new File(['x'], 'factuur.docx'));
    expect(screen.getByText(/factuur.docx: only a PDF/)).toBeInTheDocument();
  });

  it('sends the form and says so only after the server saved it', async () => {
    const user = userEvent.setup();
    createPrealert.mockResolvedValue({ reference: 'PA-2026-000007' });
    renderWithProviders(<PreAlertForm />);
    await fillIn(user);
    await user.upload(document.querySelector('input[type="file"][multiple]'), new File(['%PDF'], 'factuur.pdf'));
    await user.click(screen.getByRole('button', { name: 'Send pre-alert' }));

    expect(createPrealert).toHaveBeenCalledTimes(1);
    const sent = createPrealert.mock.calls[0][0];
    expect(sent).toMatchObject({
      trackingNumber: '3SABC1234567',
      carrier: 'postnl',
      shop: 3,
      consigneeName: 'Klaas Klant',
      restrictedConfirmed: true,
    });
    expect(sent.files.map((file) => file.name)).toEqual(['factuur.pdf']);
    expect(await screen.findByText(/PA-2026-000007 has been registered/)).toBeInTheDocument();
  });

  it("keeps what was typed and shows the server's reason beside the field", async () => {
    const user = userEvent.setup();
    createPrealert.mockRejectedValue(
      new ApiError('VALIDATION', { tracking_number: ['This tracking number is already registered with us.'] }, 400),
    );
    renderWithProviders(<PreAlertForm />);
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Send pre-alert' }));

    expect(await screen.findByText('This tracking number is already registered with us.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tracking number *')).toHaveValue('3SABC1234567');
    expect(screen.queryByText(/has been registered/)).toBeNull();
  });
});

describe('PreAlertForm: fill it in from a screenshot', () => {
  const screenshot = () => new File(['png'], 'order.png', { type: 'image/png' });

  it('fills in the empty boxes and adds the screenshot to the documents', async () => {
    readPrealertScreenshot.mockResolvedValue({
      tracking_number: '3SABC1234567',
      carrier: 'postnl',
      shop: 3,
      shop_name: '',
      description: '1 motherboard',
    });
    const user = userEvent.setup();
    renderWithProviders(<PreAlertForm />);
    await screen.findByRole('option', { name: 'bol.com' });

    await user.upload(screen.getByLabelText('Choose screenshot'), screenshot());

    expect(await screen.findByText(/Filled in from your screenshot/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tracking number *')).toHaveValue('3SABC1234567');
    expect(screen.getByLabelText('Courier company *')).toHaveValue('postnl');
    expect(screen.getByLabelText('Store where you bought it *')).toHaveValue('3');
    expect(screen.getByLabelText('Package description *')).toHaveValue('1 motherboard');
    expect(screen.getByText('order.png')).toBeInTheDocument();
    // Nothing is sent until the customer presses Send.
    expect(createPrealert).not.toHaveBeenCalled();
  });

  it('keeps what the customer typed', async () => {
    readPrealertScreenshot.mockResolvedValue({
      tracking_number: '3SOTHER',
      carrier: '',
      shop: null,
      shop_name: '',
      description: '',
    });
    const user = userEvent.setup();
    renderWithProviders(<PreAlertForm />);
    await user.type(screen.getByLabelText('Tracking number *'), 'MINE123');

    await user.upload(screen.getByLabelText('Choose screenshot'), screenshot());

    await screen.findByText(/Filled in from your screenshot/);
    expect(screen.getByLabelText('Tracking number *')).toHaveValue('MINE123');
  });

  it('says so when it cannot be read', async () => {
    readPrealertScreenshot.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderWithProviders(<PreAlertForm />);

    await user.upload(screen.getByLabelText('Choose screenshot'), screenshot());

    expect(await screen.findByText(/could not be read just now/)).toBeInTheDocument();
  });
});
