// The services page is six bands: the photo banner, the yellow strip, the
// three islands as flag maps, what we do, the companies, and the closing call to action.
//
// These check the shape rather than the styling. The thing most worth pinning
// down is what the island cards must *not* carry: the design brief asks for a
// photograph and nothing else - no name, no caption, no button drawn on the
// card. That is easy to undo by accident, so it is tested.
//
// jsdom reports an English browser, so these read the English dictionary.

import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import Services from './Services';
import { DESTINATIONS } from '../../data/destinations';
import { SHOPS } from '../../data/shops';
import { sortByName } from '../../hooks/useShops';

describe('the services page', () => {
  it('opens with the same photo banner as the destination pages', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'SERVICES' }),
    ).toBeInTheDocument();
    expect(screen.getByText('OUR')).toBeInTheDocument();
  });

  it('shows the three selling points in the yellow strip', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Each item is an icon and its label in one element, so the text is
    // matched on the element's own content rather than exactly.
    const strip = screen.getByText('VAT exemption').closest('ul');

    // The wording customers arrive knowing: no VAT, and it gets there.
    expect(within(strip).getByText('VAT exemption')).toBeInTheDocument();
    expect(within(strip).getByText('Unique products')).toBeInTheDocument();
    expect(
      within(strip).getByText('Transport taken care of'),
    ).toBeInTheDocument();
  });

  it('introduces the page in one line', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByText('Discover our services for Aruba, Bonaire and Curaçao.'),
    ).toBeInTheDocument();
  });

  it('shows one photograph per island, linking to that island', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const islands = screen.getByRole('list', { name: 'Our islands' });
    const cards = within(islands).getAllByRole('listitem');
    expect(cards).toHaveLength(DESTINATIONS.length);

    // The island is named only in the alt text, never drawn on the card.
    expect(
      within(islands)
        .getAllByRole('img')
        .map((image) => image.getAttribute('alt')),
    ).toEqual(['Aruba', 'Bonaire', 'Curaçao']);

    const links = within(islands).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      DESTINATIONS.map((destination) => `/destinations/${destination.slug}`),
    );
  });

  it('draws nothing on an island card but the photograph', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const islands = screen.getByRole('list', { name: 'Our islands' });

    for (const card of within(islands).getAllByRole('listitem')) {
      // Whatever the card contains, none of it is visible text: no island
      // name, no country, no caption, no button label.
      expect(card.textContent).toBe('');
      expect(within(card).queryByRole('button')).not.toBeInTheDocument();
      expect(within(card).queryByRole('heading')).not.toBeInTheDocument();
    }
  });

  it('lists what we do', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Scoped to the section: the company cards further down carry level-3
    // headings too.
    const offer = screen.getByRole('region', { name: 'What we do for you' });

    const named = within(offer).getAllByRole('heading', { level: 3 });
    expect(named.map((heading) => heading.textContent)).toEqual([
      'Sea freight',
      'Air freight',
      'Receiving and consolidation',
      'Customs and clearance',
      'Delivery on the island',
      'Moving and business',
    ]);
  });

  it('quotes the sailing times the islands actually have', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Read from the island list, so a change there cannot leave this card
    // promising a different crossing from the destination pages.
    const days = DESTINATIONS.map((destination) => destination.transitDays);
    const range = `${Math.min(...days)} to ${Math.max(...days)} days`;

    expect(screen.getByText(new RegExp(range))).toBeInTheDocument();
  });

  it('lays the shops out as a grid of cards', async () => {
    renderWithProviders(<Services />, { route: '/services' });

    const companies = screen.getByRole('region', {
      name: 'Shops',
    });

    // The bundled list is what renders before - and instead of - an answer
    // from the API, so the grid is never empty even with no server behind it.
    const named = await within(companies).findAllByRole('heading', { level: 3 });
    // A to Z, whatever order the list is kept in.
    expect(named.map((heading) => heading.textContent)).toEqual(
      sortByName(SHOPS).map((shop) => shop.name),
    );
  });

  it('puts the companies under what we do', () => {
    renderWithProviders(<Services />, { route: '/services' });

    const offer = screen.getByRole('region', { name: 'What we do for you' });
    const companies = screen.getByRole('region', {
      name: 'Shops',
    });

    expect(
      offer.compareDocumentPosition(companies) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('sends each shop card to that shop, safely', () => {
    renderWithProviders(<Services />, { route: '/services' });

    for (const shop of SHOPS) {
      const card = screen
        .getByRole('heading', { level: 3, name: shop.name })
        .closest('li');
      const link = within(card).getByRole('link', { name: 'View shop' });

      expect(link).toHaveAttribute('href', shop.href);
      // Without noopener the shop's page can reach back through window.opener.
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('closes on the call to action', () => {
    renderWithProviders(<Services />, { route: '/services' });

    expect(
      screen.getByRole('heading', { name: 'Wondering what we can do for you?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Get in touch with us' }),
    ).toHaveAttribute('href', '/contact');
  });

  it('no longer carries the rates table or the questions', () => {
    renderWithProviders(<Services />, { route: '/services' });

    // Removed on purpose, and still gone after the redesign. If one of these
    // ever passes again, somebody has put a section back without deciding to.
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /frequently asked/i }),
    ).not.toBeInTheDocument();
  });
});
