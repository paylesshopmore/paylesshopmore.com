// The sliding shop row. What is worth pinning down is the wiring rather than
// the styling: that the shops the office maintains are all there, each one
// linking out to its own Dutch storefront, and that the "all shops" link
// still leads somewhere real.
//
// These render without a server - the shop list request is refused unless a
// test answers it - so what they see is the bundled fallback in
// src/data/shops.js, which is the point of that fallback existing.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import { SHOPS, displayLogo } from '../../data/shops';
import { listShops } from '../../api/shops';
import { sortByName } from '../../hooks/useShops';
import ShopGrid from './ShopGrid';

vi.mock('../../api/shops', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listShops: vi.fn() };
});

describe('ShopGrid', () => {
  beforeEach(() => {
    listShops.mockReset();
    listShops.mockRejectedValue(new Error('offline'));
  });

  it('shows every shop, A to Z', () => {
    renderWithProviders(<ShopGrid />);

    const named = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));

    // One row, so the running order reads straight across.
    expect(named).toEqual(sortByName(SHOPS).map((shop) => shop.name));
  });

  it('puts the API shops A to Z, whatever order they arrive in', async () => {
    listShops.mockResolvedValue([
      // Names with no bundled logo, so each card shows its name as text.
      { id: 1, name: 'Zulu', url: 'https://z.example/', logo: null },
      { id: 2, name: 'bravo', url: 'https://b.example/', logo: null },
      { id: 3, name: 'Alpha', url: 'https://a.example/', logo: null },
    ]);
    renderWithProviders(<ShopGrid />);

    // Each shop's one reachable link, in the order the row shows them.
    await waitFor(() =>
      expect(
        screen.getAllByRole('link', { name: /Alpha|bravo|Zulu/ }).map((link) => link.textContent),
      ).toEqual([
        expect.stringContaining('Alpha'),
        expect.stringContaining('bravo'),
        expect.stringContaining('Zulu'),
      ]),
    );
  });

  it('fills a short list without announcing any shop twice', async () => {
    listShops.mockResolvedValue([
      { id: 1, name: 'Alpha', url: 'https://alpha.example/', logo: null },
      { id: 2, name: 'Beta', url: 'https://beta.example/', logo: null },
    ]);
    const { container } = renderWithProviders(<ShopGrid />);

    // Two shops come nowhere near filling the row's window, so the row
    // repeats them until they do...
    await waitFor(() =>
      expect(screen.getAllByText('Alpha').length).toBeGreaterThan(2),
    );
    expect(container.querySelectorAll('li').length).toBeGreaterThan(4);

    // ...but a screen reader hears each shop once, and tab reaches it once.
    expect(screen.getAllByRole('link', { name: /Alpha/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Beta/ })).toHaveLength(1);
    expect(
      [...container.querySelectorAll('li a')].filter(
        (link) => link.getAttribute('tabindex') !== '-1',
      ),
    ).toHaveLength(2);
  });

  it('prefers a long logo where a shop has one', () => {
    renderWithProviders(<ShopGrid />);

    const bol = SHOPS.find((shop) => shop.name === 'Bol.com');
    expect(screen.getAllByRole('img', { name: 'Bol.com' })[0]).toHaveAttribute(
      'src',
      displayLogo(bol),
    );
  });

  it("links each card to that shop's own site, safely", () => {
    renderWithProviders(<ShopGrid />);

    for (const shop of SHOPS) {
      const link = screen.getAllByRole('img', { name: shop.name })[0].closest('a');
      expect(link).toHaveAttribute('href', shop.href);
      // Without noopener the shop's page can reach back through window.opener.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders the row twice but only announces it once', () => {
    const { container } = renderWithProviders(<ShopGrid />);

    // The track is doubled so the slide can loop without a seam, so the
    // markup holds well over one copy of the list...
    expect(container.querySelectorAll('li').length).toBeGreaterThan(
      SHOPS.length,
    );

    // ...but a screen reader is told about each shop once, and only those
    // are reachable by tab. Hearing or tabbing the same shops twice would be
    // a bug.
    expect(screen.getAllByRole('img')).toHaveLength(SHOPS.length);
    // Scoped to the cards: the "See all shops" link below them is an anchor
    // too, and is meant to be tabbable.
    expect(
      [...container.querySelectorAll('li a')].filter(
        (link) => link.getAttribute('tabindex') !== '-1',
      ),
    ).toHaveLength(SHOPS.length);
  });

  it('sends anyone wanting more shops to the services page', () => {
    renderWithProviders(<ShopGrid />);

    expect(screen.getByRole('link', { name: 'See all shops' })).toHaveAttribute(
      'href',
      '/services',
    );
  });

  it('is titled, so the section is announced rather than anonymous', () => {
    renderWithProviders(<ShopGrid />);

    expect(
      screen.getByRole('region', { name: 'ORDER FROM YOUR FAVOURITE SHOPS' }),
    ).toBeInTheDocument();
  });
});
