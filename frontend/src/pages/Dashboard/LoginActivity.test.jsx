// Dashboard -> Login activity: the cards, the filters, the table, the review
// button and the CSV export.
//
// The map itself is replaced by a stub: Leaflet draws on a canvas that jsdom
// does not have. What the map is given, and what its popups say, is checked
// here and in loginMapPopup.test.js.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadLoginActivityCsv,
  getLoginMap,
  getLoginStats,
  listLoginActivity,
  reviewLoginActivity,
} from '../../api/loginActivity';
import { API_ERRORS } from '../../api/client';
import { renderWithProviders } from '../../test/utils';
import LoginActivity from './LoginActivity';

vi.mock('../../api/loginActivity', () => ({
  downloadLoginActivityCsv: vi.fn(),
  getLoginMap: vi.fn(),
  getLoginStats: vi.fn(),
  listLoginActivity: vi.fn(),
  reviewLoginActivity: vi.fn(),
}));

// A stand-in that shows what the real map would be given.
vi.mock('./LoginActivityMap', () => ({
  default: ({ data, showMarkers, showHeat }) => (
    <div data-testid="map-stub">
      points:{data ? data.points.length : 'none'} markers:{String(showMarkers)} heat:{String(showHeat)}
    </div>
  ),
}));

const STATS = {
  total: 120,
  successful: 90,
  failed: 30,
  unique_users: 14,
  active_sessions: 6,
  suspicious: 3,
  unique_countries: 5,
  last_24h: 18,
  retention_days: 90,
};

const ROW = {
  id: 1,
  user: 5,
  identifier: 'john@example.com',
  ip_address: '203.0.113.10',
  country: 'Netherlands',
  country_code: 'NL',
  region: '',
  city: 'Rotterdam',
  latitude: 51.92,
  longitude: 4.48,
  device: 'Windows 10/11',
  browser: 'Chrome',
  status: 'success',
  method: 'password',
  security_status: 'normal',
  flags: [],
  reviewed_at: null,
  reviewed_by_name: '',
  created_at: '2026-11-12T13:30:00Z',
};

const SUSPICIOUS = {
  ...ROW,
  id: 2,
  identifier: 'victim@example.com',
  status: 'failed',
  security_status: 'suspicious',
  flags: ['many_failures_ip'],
};

function page(rows = [ROW], count = rows.length) {
  return { results: rows, count, hasNext: false, hasPrevious: false };
}

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'nl');
  for (const mock of [downloadLoginActivityCsv, getLoginMap, getLoginStats, listLoginActivity, reviewLoginActivity]) {
    mock.mockReset();
  }
  getLoginStats.mockResolvedValue(STATS);
  getLoginMap.mockResolvedValue({ points: [ROW], heat: [], truncated: false, unknown: { count: 0, latest: [] } });
  listLoginActivity.mockResolvedValue(page());
});

describe('the cards', () => {
  it('shows the numbers the server counted', async () => {
    renderWithProviders(<LoginActivity />);
    const cards = await screen.findByRole('region', { name: 'Cijfers over inlogpogingen' });
    const card = (label) => within(screen.getByText(label).closest('div'));

    expect(cards).toBeInTheDocument();
    expect(card('Inlogpogingen').getByText('120')).toBeInTheDocument();
    expect(card('Gelukte logins').getByText('90')).toBeInTheDocument();
    expect(card('Mislukte pogingen').getByText('30')).toBeInTheDocument();
    expect(card('Unieke gebruikers').getByText('14')).toBeInTheDocument();
    expect(card('Actieve sessies').getByText('6')).toBeInTheDocument();
    expect(card('Verdachte pogingen').getByText('3')).toBeInTheDocument();
    expect(card('Unieke landen').getByText('5')).toBeInTheDocument();
    expect(card('Laatste 24 uur').getByText('18')).toBeInTheDocument();
  });

  it('shows zeros as zeros, not as made-up numbers', async () => {
    getLoginStats.mockResolvedValue({ ...STATS, total: 0, successful: 0, failed: 0, suspicious: 0, last_24h: 0 });
    renderWithProviders(<LoginActivity />);
    const card = within((await screen.findByText('Inlogpogingen')).closest('div'));
    expect(card.getByText('0')).toBeInTheDocument();
  });

  it('says how long the records are kept, from the server', async () => {
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByText(/90 dagen bewaard/)).toBeInTheDocument();
  });
});

describe('the filters', () => {
  it('start on the last 30 days, and ask the cards, map and table the same question', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    for (const mock of [listLoginActivity, getLoginStats, getLoginMap]) {
      expect(mock.mock.calls[0][0]).toMatchObject({ period: '30d', status: '', security: '' });
    }
  });

  it('changing the period changes all three', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Vandaag' }));

    const lastOf = (mock) => mock.mock.calls.at(-1)[0];
    for (const mock of [listLoginActivity, getLoginStats, getLoginMap]) {
      await vi.waitFor(() => expect(lastOf(mock)).toMatchObject({ period: 'today' }));
    }
  });

  it('"Failed" asks for failed attempts and "Suspicious" for suspicious ones', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Mislukt' }));
    await vi.waitFor(() => expect(listLoginActivity.mock.calls.at(-1)[0]).toMatchObject({ status: 'failed', security: '' }));

    await userEvent.click(screen.getByRole('button', { name: 'Verdacht' }));
    await vi.waitFor(() =>
      expect(listLoginActivity.mock.calls.at(-1)[0]).toMatchObject({ status: '', security: 'suspicious' }),
    );
  });

  it('typing a country filters by it', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.type(screen.getByLabelText('Land'), 'NL');
    await vi.waitFor(() => expect(getLoginStats.mock.calls.at(-1)[0]).toMatchObject({ country: 'NL' }));
  });

  it('clicking a heading sorts by it, and again reverses it', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.click(screen.getByRole('button', { name: /^Land/ }));
    await vi.waitFor(() => expect(listLoginActivity.mock.calls.at(-1)[0]).toMatchObject({ ordering: 'country' }));
    await userEvent.click(screen.getByRole('button', { name: /^Land/ }));
    await vi.waitFor(() => expect(listLoginActivity.mock.calls.at(-1)[0]).toMatchObject({ ordering: '-country' }));
  });
});

describe('the map', () => {
  it('is given the points from the server, with markers and the heatmap on', async () => {
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByText(/points:1 markers:true heat:true/)).toBeInTheDocument();
  });

  it('the toggles switch the layers', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText(/points:1/);
    await userEvent.click(screen.getByLabelText('Heatmap'));
    expect(screen.getByText(/markers:true heat:false/)).toBeInTheDocument();
  });

  it('has a legend with the four colours', async () => {
    renderWithProviders(<LoginActivity />);
    const legend = await screen.findByRole('list', { name: 'Kleuren op de kaart' });
    for (const word of ['Gelukt', 'Mislukt', 'Verdacht', 'Plaats onbekend']) {
      expect(within(legend).getByText(word)).toBeInTheDocument();
    }
  });

  it('says the places are approximate', async () => {
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByText(/bij benadering/)).toBeInTheDocument();
    expect(screen.getByText(/Er wordt geen GPS gebruikt/)).toBeInTheDocument();
  });
});

describe('the table', () => {
  it('shows the columns that were asked for', async () => {
    renderWithProviders(<LoginActivity />);
    const row = within((await screen.findByText('john@example.com')).closest('tr'));
    expect(row.getByText('203.0.113.10')).toBeInTheDocument();
    expect(row.getByText('Netherlands')).toBeInTheDocument();
    expect(row.getByText('Rotterdam')).toBeInTheDocument();
    expect(row.getByText('Windows 10/11')).toBeInTheDocument();
    expect(row.getByText('Chrome')).toBeInTheDocument();
    expect(row.getByText('Normaal')).toBeInTheDocument();
  });

  it('shows a typed name as plain text, never as markup', async () => {
    listLoginActivity.mockResolvedValue(page([{ ...ROW, identifier: '<img src=x onerror=alert(1)>' }]));
    const { container } = renderWithProviders(<LoginActivity />);
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('table img')).toBeNull();
  });

  it('explains why an attempt was flagged', async () => {
    listLoginActivity.mockResolvedValue(page([SUSPICIOUS]));
    renderWithProviders(<LoginActivity />);
    const row = within((await screen.findByText('victim@example.com')).closest('tr'));
    expect(row.getByText('Verdacht')).toBeInTheDocument();
    expect(row.getByText('Veel mislukte pogingen vanaf dit IP-adres')).toBeInTheDocument();
  });

  it('lets an administrator mark a suspicious attempt as reviewed', async () => {
    listLoginActivity.mockResolvedValue(page([SUSPICIOUS]));
    reviewLoginActivity.mockResolvedValue({
      ...SUSPICIOUS,
      reviewed_at: '2026-11-12T14:00:00Z',
      reviewed_by_name: 'Ada',
    });
    renderWithProviders(<LoginActivity />);
    await userEvent.click(await screen.findByRole('button', { name: 'Beoordeeld' }));

    expect(reviewLoginActivity).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/Beoordeeld door Ada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Beoordeeld' })).not.toBeInTheDocument();
  });

  it('offers no review button on a normal attempt', async () => {
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    expect(screen.queryByRole('button', { name: 'Beoordeeld' })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    listLoginActivity.mockResolvedValue(page([]));
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByText('Geen inlogpogingen gevonden voor deze filters.')).toBeInTheDocument();
  });

  it('offers to reload when new activity has come in since the table loaded', async () => {
    // The cards (refreshed on a timer) count more than the table holds.
    getLoginStats.mockResolvedValue({ ...STATS, total: 5 });
    listLoginActivity.mockResolvedValue(page([ROW], 4));
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByText(/nieuwe activiteit/)).toBeInTheDocument();
  });

  it('does not nag when the cards and the table agree', async () => {
    getLoginStats.mockResolvedValue({ ...STATS, total: 1 });
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    expect(screen.queryByText(/nieuwe activiteit/)).not.toBeInTheDocument();
  });
});

describe('errors and loading', () => {
  it('shows a retry when the table cannot be loaded', async () => {
    listLoginActivity.mockRejectedValue(new Error('down'));
    renderWithProviders(<LoginActivity />);
    expect(await screen.findByRole('button', { name: /opnieuw/i })).toBeInTheDocument();
  });
});

describe('the CSV export', () => {
  it('downloads with the current filters', async () => {
    downloadLoginActivityCsv.mockResolvedValue(12);
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'CSV exporteren' }));
    expect(downloadLoginActivityCsv).toHaveBeenCalledWith(expect.objectContaining({ period: '30d' }));
  });

  it('says so when the export fails', async () => {
    downloadLoginActivityCsv.mockRejectedValue(new Error('nope'));
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'CSV exporteren' }));
    expect(await screen.findByText('De export is niet gelukt. Probeer het opnieuw.')).toBeInTheDocument();
  });

  it('is quiet when the administrator closes the "confirm it\'s you" box', async () => {
    downloadLoginActivityCsv.mockRejectedValue(Object.assign(new Error('x'), { code: API_ERRORS.REAUTH_CANCELLED }));
    renderWithProviders(<LoginActivity />);
    await screen.findByText('john@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'CSV exporteren' }));
    await vi.waitFor(() => expect(downloadLoginActivityCsv).toHaveBeenCalled());
    expect(screen.queryByText(/De export is niet gelukt/)).not.toBeInTheDocument();
  });
});
