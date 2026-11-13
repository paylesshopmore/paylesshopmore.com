// "Mijn boekingen" on the profile page: the booking forms this customer sent
// while signed in. Each is a bar; clicking it opens a pop-up with what they
// filled in, in the words of the booking form itself.
//
// Read in English (jsdom's default), so the labels can be checked against
// the booking form's English texts.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { translations } from '../../i18n/translations';
import { listMyBookings } from '../../api/booking';
import MyBookings from './MyBookings';

// Only the request is faked; attachmentUrl stays real.
vi.mock('../../api/booking', async (importOriginal) => ({
  ...(await importOriginal()),
  listMyBookings: vi.fn(),
}));

/** A booking as GET /api/bookings/mine/ sends it. */
function booking(id, extra = {}) {
  return {
    id,
    created_at: '2026-10-01T09:30:00Z',
    signed_at: '2026-10-01T09:30:00Z',
    shipping_number: '',
    status: 'new',
    volume_m3: null,
    weight_kg: null,
    destination_label: 'Curaçao',
    freight: 'sea',
    destination: 'CW',
    destination_other: '',
    sender_first_name: 'Client',
    sender_last_name: 'One',
    sender_address: 'Hertzstraat 10',
    sender_postal_code: '2652 XX',
    sender_city: 'Berkel en Rodenrijs',
    sender_phone: '+31 6 12345678',
    sender_email: 'client@client.com',
    recipient_first_name: 'Maria',
    recipient_last_name: 'Martina',
    recipient_address: 'Kaya Grandi 24',
    recipient_city: 'Willemstad',
    recipient_phone: '+599 9 512 4433',
    recipient_email: '',
    recipient_crib_number: '',
    packing: 'sender',
    payment: 'bank',
    quantity: 3,
    unit: 'boxes',
    contents: 'Clothes and books',
    contents_attached: false,
    value_eur: '450.00',
    vehicle: 'na',
    emigration: false,
    id_present: false,
    deregistered: false,
    deregistration_present: false,
    insured: false,
    insured_value_eur: null,
    notes: '',
    signature_name: 'Client One',
    orders: [],
    ...extra,
  };
}

beforeEach(() => {
  listMyBookings.mockReset();
});

describe('My bookings', () => {
  it('says where to follow a booking the office has turned into a shipment', async () => {
    listMyBookings.mockResolvedValue([
      booking(3, {
        status: 'confirmed',
        shipment: { id: 9, tracking_number: 'PLSM-B00003', status: 'quoted', status_display: 'Quote sent' },
      }),
      booking(2),
    ]);
    renderWithProviders(<MyBookings />);

    expect(await screen.findByText('PLSM-B00003')).toBeInTheDocument();
    expect(screen.getAllByText(/Follow it under My shipments:/)).toHaveLength(1);
  });

  it('lists each booking with its destination, contents and status', async () => {
    listMyBookings.mockResolvedValue([
      booking(7, { shipping_number: 'PLSM-1001', status: 'booked_in' }),
      booking(6, { contents: 'Garden chairs' }),
    ]);
    renderWithProviders(<MyBookings />);

    const bars = await screen.findAllByRole('button', { name: /Curaçao/ });
    expect(bars).toHaveLength(2);
    expect(within(bars[0]).getByText('PLSM-1001')).toBeInTheDocument();
    expect(within(bars[0]).getByText('Booked in')).toBeInTheDocument();
    // No shipping number yet: the reference stands in for it.
    expect(within(bars[1]).getByText('PLSM-0000006')).toBeInTheDocument();
    expect(within(bars[1]).getByText(/Garden chairs/)).toBeInTheDocument();
    expect(within(bars[1]).getByText('Received')).toBeInTheDocument();
  });

  it('opens a pop-up with everything that was filled in', async () => {
    const user = userEvent.setup();
    listMyBookings.mockResolvedValue([
      booking(6, { insured: true, insured_value_eur: '500.00', notes: 'Fragile' }),
    ]);
    renderWithProviders(<MyBookings />);

    await user.click(await screen.findByRole('button', { name: /Curaçao/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Booking PLSM-0000006')).toBeInTheDocument();
    expect(within(dialog).getByText('Sea freight')).toBeInTheDocument();
    expect(within(dialog).getByText('Maria Martina')).toBeInTheDocument();
    expect(within(dialog).getByText('Kaya Grandi 24, Willemstad')).toBeInTheDocument();
    expect(within(dialog).getByText('3 boxes')).toBeInTheDocument();
    expect(within(dialog).getByText('Clothes and books')).toBeInTheDocument();
    expect(within(dialog).getByText('€450.00')).toBeInTheDocument();
    expect(within(dialog).getByText('€500.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Fragile')).toBeInTheDocument();
    expect(within(dialog).getByText('No shipping number yet')).toBeInTheDocument();
    // The sender's name, and the same name again as the signature.
    expect(within(dialog).getByText(/Signed by/)).toHaveTextContent('Signed by Client One');
  });

  it('shows the shipping number, volume and weight once the office has them', async () => {
    const user = userEvent.setup();
    listMyBookings.mockResolvedValue([
      booking(6, { shipping_number: 'PLSM-1001', volume_m3: '1.250', weight_kg: '84.00' }),
    ]);
    renderWithProviders(<MyBookings />);

    await user.click(await screen.findByRole('button', { name: /Curaçao/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Shipping number: PLSM-1001')).toBeInTheDocument();
    expect(within(dialog).getByText('1.250 m³ · 84.00 kg')).toBeInTheDocument();
  });

  it('shows the stores ordered from, each with its screenshot', async () => {
    const user = userEvent.setup();
    listMyBookings.mockResolvedValue([
      booking(6, {
        contents: 'bol.com: Laptop; IKEA: Kast',
        orders: [
          {
            id: 1,
            shop_name: 'bol.com',
            description: 'Laptop',
            screenshot: { id: 4, name: 'bol.png', is_image: true, url: '/api/bookings/mine/6/attachments/4/' },
          },
          { id: 2, shop_name: 'IKEA', description: 'Kast', screenshot: null },
        ],
      }),
    ]);
    renderWithProviders(<MyBookings />);

    await user.click(await screen.findByRole('button', { name: /Curaçao/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Your orders')).toBeInTheDocument();
    expect(within(dialog).getByText('bol.com')).toBeInTheDocument();
    expect(within(dialog).getByText('Kast')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open: bol.png' })).toHaveAttribute(
      'href',
      '/api/bookings/mine/6/attachments/4/',
    );
    // With stores, the typed-contents line is not repeated.
    expect(within(dialog).queryByText('Contents')).toBeNull();
  });

  it('says the value is still to come when the office has not filled it in', async () => {
    const user = userEvent.setup();
    listMyBookings.mockResolvedValue([booking(6, { value_eur: null })]);
    renderWithProviders(<MyBookings />);

    await user.click(await screen.findByRole('button', { name: /Curaçao/ }));
    expect(
      within(screen.getByRole('dialog')).getByText(/Not filled in yet/),
    ).toBeInTheDocument();
  });

  it('says so when there are none yet, and offers a new booking', async () => {
    listMyBookings.mockResolvedValue([]);
    renderWithProviders(<MyBookings />);

    expect(await screen.findByText(/You have no bookings yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New booking' })).toHaveAttribute('href', '/booking');
  });

  it('offers to try again when loading fails', async () => {
    const user = userEvent.setup();
    listMyBookings.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([booking(6)]);
    renderWithProviders(<MyBookings />);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('button', { name: /Curaçao/ })).toBeInTheDocument();
  });

  it.each(['nl', 'en', 'pap'])('has all its words in %s', (language) => {
    const words = translations[language].profile.bookings;
    const keys = (value) => Object.keys(value).sort();
    expect(keys(words)).toEqual(keys(translations.en.profile.bookings));
    expect(keys(words.status)).toEqual(['booked_in', 'cancelled', 'confirmed', 'new', 'shipped']);
    expect(translations[language].profile.sections.bookings).toBeTruthy();
  });
});
