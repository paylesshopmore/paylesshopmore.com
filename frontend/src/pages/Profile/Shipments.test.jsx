// "Mijn zendingen" on the profile page: the customer's shipments, split
// under "Nog te verzenden", "Onderweg" and "Ontvangen". Each is a slim bar;
// clicking it opens a pop-up window with how long it will still take, where
// it is, the facts and its invoice.
//
// Read in Dutch, the site's default language, because the English the
// server sends is exactly what these tests make sure is replaced.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { listPackages, setHandover } from '../../api/profile';
import Shipments from './Shipments';

vi.mock('../../api/profile', () => ({
  listPackages: vi.fn(),
  setHandover: vi.fn(),
  getOrderOverview: vi.fn(),
}));

const STAGES = [
  'paid',
  'purchased',
  'received',
  'measured',
  'packed',
  'ready_for_shipping',
  'in_transit',
  'arrived',
  'delivered',
].map((value) => ({ value, label: `EN ${value}` }));

/** A shipment as the API sends it. */
function shipment(id, status, extra = {}) {
  return {
    id,
    tracking_number: `PLSM-${id}`,
    description: `Zending ${id}`,
    status,
    // What the server sends: English only.
    status_display: `EN ${status}`,
    locked: ['in_transit', 'arrived', 'delivered', 'cancelled'].includes(status),
    shipped_at: null,
    delivered_at: null,
    estimated_arrival: null,
    created_at: '2026-09-29T10:12:00Z',
    destination: 'Curaçao',
    progress: 20,
    stages: STAGES,
    stage_index: STAGES.findIndex((stage) => stage.value === status),
    ...extra,
  };
}

/** An ISO date `days` from today, as the API sends estimated_arrival. */
function dateIn(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  listPackages.mockReset();
});

/** The group headings in the order they are on the page. */
const headings = () =>
  screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

/** The bar (button) for a shipment. */
const bar = (number) => screen.getByRole('button', { name: new RegExp(`^${number}`) });

describe('Mijn zendingen', () => {
  it('splits the shipments into to send, on the way and received', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'paid'),
      shipment(2, 'in_transit', { shipped_at: '2026-09-24T16:30:00Z' }),
      shipment(3, 'delivered', {
        shipped_at: '2026-08-23T16:30:00Z',
        delivered_at: '2026-09-13T11:15:00Z',
      }),
      shipment(4, 'ready_for_shipping'),
    ]);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    // Heading text includes the count badge.
    expect(headings()).toEqual(['Nog te verzenden2', 'Onderweg1', 'Ontvangen1']);

    const toSend = screen.getByRole('heading', { name: /Nog te verzenden/ }).closest('section');
    expect(within(toSend).getByText('PLSM-1')).toBeInTheDocument();
    expect(within(toSend).getByText('PLSM-4')).toBeInTheDocument();
  });

  it('folds the groups open and closed like a dropdown', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(1, 'paid'),
      shipment(2, 'in_transit', { shipped_at: '2026-09-24T16:30:00Z' }),
      shipment(3, 'delivered', {
        shipped_at: '2026-08-23T16:30:00Z',
        delivered_at: '2026-09-13T11:15:00Z',
      }),
      shipment(5, 'cancelled'),
    ]);
    renderWithProviders(<Shipments />);
    await screen.findByText('PLSM-1');

    const toSend = screen.getByRole('button', { name: /^Nog te verzenden/ });
    const onTheWay = screen.getByRole('button', { name: /^Onderweg/ });
    const received = screen.getByRole('button', { name: /^Ontvangen/ });
    const cancelled = screen.getByRole('button', { name: /^Geannuleerd/ });

    // What is still happening starts open; the history starts folded.
    expect(toSend).toHaveAttribute('aria-expanded', 'true');
    expect(onTheWay).toHaveAttribute('aria-expanded', 'true');
    expect(received).toHaveAttribute('aria-expanded', 'false');
    expect(cancelled).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('PLSM-3')).toBeNull();
    // A folded group still says how many are in it.
    expect(received).toHaveTextContent('1');

    await user.click(received);
    expect(received).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('PLSM-3')).toBeInTheDocument();

    await user.click(toSend);
    expect(toSend).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('PLSM-1')).toBeNull();
  });

  it('splits a group by the month the orders were placed in, newest first', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'paid', { created_at: '2026-08-14T10:00:00Z' }),
      shipment(4, 'purchased', { created_at: '2026-09-29T10:00:00Z' }),
      shipment(6, 'paid', { created_at: '2026-09-02T10:00:00Z' }),
    ]);
    renderWithProviders(<Shipments />);
    await screen.findByText('PLSM-1');

    const months = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    // Month name, then the count (the "·" between them is drawn by the CSS).
    expect(months).toEqual(['Besteld in september 20262', 'Besteld in augustus 20261']);
  });

  it('shows which shipment arrives first, and marks it in the list', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(2, 'in_transit', { estimated_arrival: dateIn(10) }),
      shipment(7, 'in_transit', { estimated_arrival: dateIn(3) }),
      // Already on the island: not "coming next" any more.
      shipment(8, 'arrived', { estimated_arrival: dateIn(1) }),
      // Passed without arriving: cannot be the next one.
      shipment(9, 'in_transit', { estimated_arrival: dateIn(-2) }),
    ]);
    renderWithProviders(<Shipments />);

    const next = await screen.findByRole('button', { name: /^Komt als eerste aan/ });
    expect(next).toHaveTextContent('PLSM-7');
    // The countdown: "nog" / 3 / "dagen", stacked.
    expect(next).toHaveTextContent(/nog\s*3\s*dagen/);
    // The badge is on PLSM-7's bar, and only there.
    expect(screen.getAllByText('Volgende')).toHaveLength(1);
    expect(bar('PLSM-7')).toHaveTextContent('Volgende');

    // Clicking it opens that shipment's pop-up.
    await user.click(next);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Zending PLSM-7');
  });

  it('within a month, the one arriving soonest comes first', async () => {
    listPackages.mockResolvedValue([
      shipment(2, 'in_transit', { estimated_arrival: dateIn(10) }),
      shipment(7, 'in_transit', { estimated_arrival: dateIn(3) }),
    ]);
    renderWithProviders(<Shipments />);
    await screen.findByText('PLSM-2');

    const list = screen.getByRole('heading', { level: 4 }).nextElementSibling;
    const order = within(list).getAllByRole('button').map((b) => b.textContent.slice(0, 6));
    expect(order).toEqual(['PLSM-7', 'PLSM-2']);
  });

  it('shows no "comes first" block when nothing has an expected date', async () => {
    listPackages.mockResolvedValue([shipment(1, 'paid')]);
    renderWithProviders(<Shipments />);
    await screen.findByText('PLSM-1');

    expect(screen.queryByText('Komt als eerste aan')).toBeNull();
  });

  it('lets the customer choose to pick it up themselves', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'in_transit', { handover: 'delivery' })]);
    setHandover.mockResolvedValue(
      shipment(1, 'in_transit', { handover: 'pickup', handover_chosen_at: '2026-10-22T09:00:00Z' }),
    );
    // "Are you sure?" - yes.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    await user.click(bar('PLSM-1'));
    const popup = screen.getByRole('dialog');
    // Not chosen yet: nothing pressed, and the customer is told it is once.
    expect(within(popup).getByRole('button', { name: 'Bezorgen' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(popup).getByText(/maar één keer kiezen/)).toBeInTheDocument();

    await user.click(within(popup).getByRole('button', { name: 'Zelf ophalen' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(setHandover).toHaveBeenCalledWith(1, 'pickup');
    expect(within(popup).getByRole('button', { name: 'Zelf ophalen' })).toHaveAttribute('aria-pressed', 'true');
    // The line under the buttons says what happens now.
    expect(within(popup).getByText(/U haalt het zelf op/)).toBeInTheDocument();
    // Locked: both buttons off, a change goes by e-mail.
    expect(within(popup).getByRole('button', { name: 'Bezorgen' })).toBeDisabled();
    expect(within(popup).getByRole('link', { name: 'info@paylesshopmore.com' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:info@paylesshopmore.com?subject='),
    );
    confirm.mockRestore();
  });

  it('saves nothing when the customer says no to "are you sure?"', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'in_transit', { handover: 'delivery' })]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    await user.click(bar('PLSM-1'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Zelf ophalen' }));

    expect(setHandover).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('does not let the customer choose a second time', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(1, 'in_transit', { handover: 'delivery', handover_chosen_at: '2026-10-21T09:00:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    await user.click(bar('PLSM-1'));
    const popup = screen.getByRole('dialog');
    expect(within(popup).getByRole('button', { name: 'Bezorgen' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(popup).getByRole('button', { name: 'Zelf ophalen' })).toBeDisabled();
    expect(within(popup).getByText(/Stuur een e-mail naar/)).toBeInTheDocument();
  });

  it('shows the choice but does not let it change once the shipment is finished', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(1, 'delivered', { handover: 'pickup', delivered_at: '2026-09-30T10:00:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    await user.click(await screen.findByRole('button', { name: /Ontvangen/ }));
    await user.click(bar('PLSM-1'));
    const popup = screen.getByRole('dialog');
    expect(within(popup).getByRole('button', { name: 'Bezorgen' })).toBeDisabled();
    expect(within(popup).getByText('Deze zending is afgerond.')).toBeInTheDocument();
  });

  it('says Opgehaald, not Afgeleverd, for a shipment the customer collected', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'delivered', { handover: 'pickup', delivered_at: '2026-09-30T10:00:00Z' }),
      shipment(2, 'delivered', { handover: 'delivery', delivered_at: '2026-09-29T10:00:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    // The "Received" group starts folded: open it.
    await userEvent.setup().click(await screen.findByRole('button', { name: /Ontvangen/ }));
    expect(within(bar('PLSM-1')).getByText('Opgehaald')).toBeInTheDocument();
    expect(within(bar('PLSM-2')).getByText('Afgeleverd')).toBeInTheDocument();
  });

  it('shows the status in Dutch, not the English the server sends', async () => {
    listPackages.mockResolvedValue([
      shipment(1, 'paid'),
      shipment(2, 'arrived', { shipped_at: '2026-09-12T16:30:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('Betaald')).toBeInTheDocument();
    expect(screen.getByText('Aangekomen op bestemming')).toBeInTheDocument();
    expect(screen.queryByText(/^EN /)).toBeNull();
  });

  it('opens the details in a pop-up window, and closes it again', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(2, 'in_transit', {
        shipped_at: '2026-09-24T16:30:00Z',
        estimated_arrival: dateIn(10),
      }),
    ]);
    renderWithProviders(<Shipments />);

    const button = await screen.findByRole('button', { name: /^PLSM-2/ });
    // The bar's date: when it is expected.
    expect(button).toHaveTextContent(/Verwacht/);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(button);
    const popup = screen.getByRole('dialog', { name: 'Zending PLSM-2' });
    expect(within(popup).getByText('Hoe lang duurt het nog?')).toBeInTheDocument();

    // The button at the bottom closes it...
    await user.click(within(popup).getAllByRole('button', { name: 'Sluiten' }).pop());
    expect(screen.queryByRole('dialog')).toBeNull();

    // ...and so does Escape.
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says how many days are left until the expected arrival', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(2, 'in_transit', {
        shipped_at: '2026-09-24T16:30:00Z',
        estimated_arrival: dateIn(10),
      }),
    ]);
    renderWithProviders(<Shipments />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-2/ }));
    expect(screen.getByText(/Verwachte aankomst:/)).toBeInTheDocument();
    expect(screen.getByText('Nog ongeveer 10 dagen.')).toBeInTheDocument();
    // Where it is: the journey, with its stages in Dutch.
    expect(screen.getByText('Waar is uw zending?')).toBeInTheDocument();
    expect(screen.getByText('Ontvangen in ons magazijn')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  });

  it('says when a delivered shipment arrived and how long it took', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(3, 'delivered', {
        shipped_at: '2026-08-23T16:30:00Z',
        delivered_at: '2026-09-13T16:30:00Z',
      }),
    ]);
    renderWithProviders(<Shipments />);

    // "Ontvangen" starts folded: open it first.
    await user.click(await screen.findByRole('button', { name: /^Ontvangen/ }));
    await user.click(screen.getByRole('button', { name: /^PLSM-3/ }));
    expect(screen.getByText(/Afgeleverd op 13 september 2026/)).toBeInTheDocument();
    expect(screen.getByText('De reis duurde 21 dagen.')).toBeInTheDocument();
    // Asked in the past tense: it has arrived.
    expect(screen.getByText('Hoe lang duurde het?')).toBeInTheDocument();
    // The notice heading matches: delivered, not "on its way".
    expect(screen.getByText('Zending is afgeleverd')).toBeInTheDocument();
    expect(screen.queryByText('Zending is onderweg')).toBeNull();
  });

  it('says an arrived shipment is on the island, not that it is late', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(8, 'arrived', {
        shipped_at: '2026-09-12T16:30:00Z',
        // Already passed: it has arrived, which is not "late".
        estimated_arrival: dateIn(-4),
      }),
    ]);
    renderWithProviders(<Shipments />);

    const button = await screen.findByRole('button', { name: /^PLSM-8/ });
    expect(button).toHaveTextContent(/Verscheept/);
    expect(button).not.toHaveTextContent(/Verwacht/);

    await user.click(button);
    expect(screen.getByText('Aangekomen op het eiland')).toBeInTheDocument();
    expect(screen.queryByText(/langer dan verwacht/)).toBeNull();
  });

  it('gives the usual sailing time when it has not shipped yet', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'paid')]);
    renderWithProviders(<Shipments />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-1/ }));
    expect(screen.getByText('Nog niet verscheept')).toBeInTheDocument();
    // Curaçao: 17 days at sea, from src/data/destinations.js.
    expect(screen.getByText(/naar Curaçao ongeveer 17 dagen/)).toBeInTheDocument();
  });

  it('shows the shipment that was clicked', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'paid'), shipment(4, 'purchased')]);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    await user.click(bar('PLSM-4'));

    const popup = screen.getByRole('dialog');
    expect(popup).toHaveAccessibleName('Zending PLSM-4');
    expect(within(popup).getByText('Zending 4')).toBeInTheDocument();
    // Its status, as the label (and again as a step on the timeline).
    expect(within(popup).getAllByText('Producten gekocht').length).toBeGreaterThan(0);
  });

  it('shows the photos the warehouse took of the package', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(1, 'received', {
        photos: [
          { id: 7, url: '/packages/1/photos/7/', uploaded_at: '2026-10-05T10:00:00Z' },
          { id: 8, url: '/packages/1/photos/8/', uploaded_at: '2026-10-05T10:01:00Z' },
        ],
      }),
      shipment(4, 'purchased'),
    ]);
    renderWithProviders(<Shipments />);

    await screen.findByText('PLSM-1');
    await user.click(bar('PLSM-1'));
    const popup = screen.getByRole('dialog');
    // The gallery (components/PhotoGallery): a title with the count, and a
    // thumbnail per photo that opens the big viewer.
    expect(within(popup).getByText(/Foto's van uw pakket/)).toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: 'Openen: Foto 1' })).toBeInTheDocument();
    expect(within(popup).getByAltText('Foto 1')).toHaveAttribute('src', '/api/packages/1/photos/7/');
    expect(within(popup).getByRole('button', { name: 'Openen: Foto 2' })).toBeInTheDocument();

    // A shipment without photos shows no photo section.
    await user.click(within(popup).getAllByRole('button', { name: 'Sluiten' })[0]);
    await user.click(bar('PLSM-4'));
    expect(within(screen.getByRole('dialog')).queryByText("Foto's van uw pakket")).toBeNull();
  });

  it('shows what the warehouse measured', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([
      shipment(1, 'received', {
        measurement: {
          weight_kg: '21.00',
          length_cm: '50.0',
          width_cm: '40.0',
          height_cm: '30.0',
          volume_m3: '0.0600',
          measured_at: '2026-10-05T10:00:00Z',
        },
      }),
    ]);
    renderWithProviders(<Shipments />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-1/ }));
    const popup = screen.getByRole('dialog');
    expect(within(popup).getByText('Gemeten in het magazijn')).toBeInTheDocument();
    expect(within(popup).getByText('21 kg · 50 × 40 × 30 cm · 0,06 m³')).toBeInTheDocument();
  });

  it('shows the invoice that belongs to the shipment, and only that one', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'paid'), shipment(4, 'purchased')]);
    const invoices = [
      { id: 10, number: 'INV-2026-00010', trackingNumber: 'PLSM-1', valueEur: '50.00', downloadUrl: '/api/invoices/10/download/' },
      { id: 11, number: 'INV-2026-00011', trackingNumber: 'PLSM-4', valueEur: '80.00', downloadUrl: '/api/invoices/11/download/' },
    ];
    renderWithProviders(<Shipments invoices={invoices} />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-1/ }));
    expect(screen.getByText('INV-2026-00010')).toBeInTheDocument();
    expect(screen.queryByText('INV-2026-00011')).toBeNull();
  });

  it('says so when a shipment has no invoice yet', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'paid')]);
    renderWithProviders(<Shipments invoices={[]} />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-1/ }));
    expect(
      screen.getByText('Er is nog geen factuur voor deze zending.'),
    ).toBeInTheDocument();
  });

  it('shows dates with the time', async () => {
    const user = userEvent.setup();
    listPackages.mockResolvedValue([shipment(1, 'paid')]);
    renderWithProviders(<Shipments />);

    await user.click(await screen.findByRole('button', { name: /^PLSM-1/ }));
    // "29 sep 2026, 12:12" - the hour depends on the time zone the tests
    // run in, so only the shape is checked.
    const registered = screen.getByText('Aangemeld', { selector: 'dt' });
    expect(registered.nextElementSibling.textContent).toMatch(/2026,? \d{1,2}:\d{2}/);
  });

  it('still shows a shipment with a status it does not know', async () => {
    // A status added on the server after this page was written: placed by
    // its dates, and labelled with what the server sends.
    listPackages.mockResolvedValue([
      shipment(9, 'held_at_customs', { shipped_at: '2026-09-20T16:30:00Z' }),
    ]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('PLSM-9')).toBeInTheDocument();
    expect(headings()).toEqual(['Onderweg1']);
    expect(screen.getByText('EN held_at_customs')).toBeInTheDocument();
  });

  it('says so when there are no shipments', async () => {
    listPackages.mockResolvedValue([]);
    renderWithProviders(<Shipments />);

    expect(await screen.findByText('U heeft nog geen zendingen.')).toBeInTheDocument();
  });
});
