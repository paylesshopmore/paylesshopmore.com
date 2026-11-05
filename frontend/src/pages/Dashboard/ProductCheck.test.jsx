// The products on a booking as the office reads them: a link that opens the
// webshop in a new tab and can be copied, the customer's price, and the
// office's own price check beside it.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateBookingProduct } from '../../api/staff';
import OrderList from '../../components/AttachmentList/OrderList';
import { renderWithProviders } from '../../test/utils';
import ProductCheck from './ProductCheck';

vi.mock('../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  updateBookingProduct: vi.fn(),
}));

const PRODUCT = {
  id: 5,
  description: 'White T-shirt, size L',
  url: 'https://www.bol.com/nl/nl/p/white-t-shirt/1/',
  customer_price_eur: '19.99',
  quantity: 2,
  customer_subtotal_eur: '39.98',
  screenshot: null,
  store_name: 'bol.com',
  verified_price_eur: null,
  verification_status: 'not_checked',
  staff_notes: '',
  verified_by_name: '',
  verified_at: null,
};

const ORDER = {
  id: 1,
  shop_name: 'bol.com',
  description: 'White T-shirt, size L',
  screenshot: null,
  documents: [],
  products: [
    PRODUCT,
    { ...PRODUCT, id: 6, url: 'javascript:alert(1)', description: 'Shoes' },
    { ...PRODUCT, id: 7, url: 'http://old.example.com/p/1', description: 'Hat' },
  ],
  products_subtotal_eur: '79.96',
};

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
  updateBookingProduct.mockReset();
});

describe('the products on a booking', () => {
  it('opens a web link in a new tab, and never makes another kind of link clickable', () => {
    renderWithProviders(<OrderList orders={[ORDER]} />);

    const link = screen.getByRole('link', { name: PRODUCT.url });
    expect(link).toHaveAttribute('href', PRODUCT.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    // Not secure: shown, but not a link.
    expect(screen.queryByRole('link', { name: 'http://old.example.com/p/1' })).toBeNull();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWithProviders(<OrderList orders={[{ ...ORDER, products: [PRODUCT] }]} />);

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith(PRODUCT.url);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('the price check', () => {
  it('saves the checked price, the status and the notes - not the customer price', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const saved = { ...PRODUCT, verified_price_eur: '24.99', verification_status: 'price_changed' };
    updateBookingProduct.mockResolvedValue(saved);
    renderWithProviders(<ProductCheck product={PRODUCT} onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Verified webshop price (€)'), '24,99');
    expect(screen.getByText('+5.00 compared with the customer’s price')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Price check'), 'price_changed');
    await user.type(screen.getByLabelText('Internal notes (not shown to the customer)'), 'Went up.');
    await user.click(screen.getByRole('button', { name: 'Save check' }));

    expect(updateBookingProduct).toHaveBeenCalledWith(5, {
      verified_price_eur: '24.99',
      verification_status: 'price_changed',
      staff_notes: 'Went up.',
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('refuses a price that is not one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductCheck product={PRODUCT} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText('Verified webshop price (€)'), 'abc');
    expect(screen.getByText('Type a price such as 24.99.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save check' })).toBeDisabled();
  });
});
