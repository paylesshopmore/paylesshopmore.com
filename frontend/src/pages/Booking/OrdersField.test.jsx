// "Uw bestellingen" on the booking form: one card per store, with the store
// from the site's list (or another one by name), what was bought, and an
// optional screenshot. Plus the rules in orders.js the form checks with.

import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../i18n/translations';
import { listShops } from '../../api/shops';
import OrdersField from './OrdersField';
import { isProductUrl, newProduct, newRow, toPayload, validateOrders } from './orders';

vi.mock('../../api/shops', () => ({ listShops: vi.fn() }));

const words = translations.en;
const t = (key) => key.split('.').reduce((value, part) => value?.[part], words) ?? key;

/** The field with real state around it, like the booking form gives it. */
function Harness({ onRows = () => {}, errors = {} }) {
  const [rows, setRows] = useState(() => [newRow()]);
  return (
    <OrdersField
      rows={rows}
      onChange={(next) => {
        setRows(next);
        onRows(next);
      }}
      errors={errors}
      serverError={null}
      t={t}
      language="en"
    />
  );
}

const png = (name = 'order.png') => new File([new Uint8Array(3000)], name, { type: 'image/png' });

beforeEach(() => {
  listShops.mockReset();
  listShops.mockResolvedValue([
    { id: 3, name: 'bol.com' },
    { id: 7, name: 'IKEA' },
  ]);
});

describe('the store cards', () => {
  it('offers the stores from the site, and another store by name', async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);

    const select = screen.getByLabelText('Store');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'IKEA' })).toBeInTheDocument());
    expect(within(select).getByRole('option', { name: 'Another store' })).toBeInTheDocument();

    await user.selectOptions(select, 'other');
    await user.type(screen.getByLabelText('Name of the store'), 'Coolblue');
    await user.type(screen.getByLabelText('What did you order?'), 'Headphones');

    expect(toPayload(onRows.mock.calls.at(-1)[0])).toEqual([
      {
        shop: null,
        shop_name: 'Coolblue',
        description: 'Headphones',
        products: [{ description: 'Headphones', url: '' }],
      },
    ]);
  });

  it('adds and removes stores', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add another store' }));
    await user.click(screen.getByRole('button', { name: '+ Add another store' }));
    expect(screen.getByText('Store 3')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.queryByText('Store 3')).toBeNull();
    expect(screen.getByText('Store 2')).toBeInTheDocument();
  });

  it('has no screenshot for the whole store any more, only per product', () => {
    render(<Harness />);
    expect(screen.queryByText('Screenshot of your order (optional)')).toBeNull();
    expect(screen.queryByLabelText('Screenshot for store 1')).toBeNull();
    expect(screen.getAllByText('Add a screenshot')).toHaveLength(1);
  });

  it('takes a screenshot per product and can remove it again', async () => {
    const user = userEvent.setup();
    const onRows = vi.fn();
    render(<Harness onRows={onRows} />);

    await user.upload(screen.getByLabelText('Screenshot for product 1 of store 1'), png('shirt.png'));
    expect(screen.getByText('shirt.png')).toBeInTheDocument();
    expect(onRows.mock.calls.at(-1)[0][0].products[0].file.name).toBe('shirt.png');

    await user.click(screen.getByRole('button', { name: 'Remove shirt.png' }));
    expect(screen.queryByText('shirt.png')).toBeNull();
    expect(screen.getByText('Add a screenshot')).toBeInTheDocument();
  });

  it('refuses a file that is not a picture or PDF', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);

    await user.upload(
      screen.getByLabelText('Screenshot for product 1 of store 1'),
      new File(['MZ'], 'setup.exe'),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'setup.exe cannot be added: only PNG, JPG, WebP or PDF.',
    );
    expect(screen.queryByText('setup.exe', { selector: 'span' })).toBeNull();
  });

  it('still works when the store list cannot be loaded', async () => {
    listShops.mockRejectedValue(new Error('offline'));
    render(<Harness />);

    const select = screen.getByLabelText('Store');
    await waitFor(() => expect(listShops).toHaveBeenCalled());
    expect(within(select).getByRole('option', { name: 'Another store' })).toBeInTheDocument();
  });
});

describe('the products under a store', () => {
  it('adds and removes products, and asks no price or quantity', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByLabelText('Price per item (€)')).toBeNull();
    expect(screen.queryByLabelText('Quantity')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();

    await user.click(screen.getByRole('button', { name: '+ Add another product' }));
    expect(screen.getByText('Product 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove product 2' }));
    expect(screen.queryByText('Product 2')).toBeNull();
  });

  it('asks for the product link with a helpful placeholder', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Product link (optional)')).toHaveAttribute(
      'placeholder',
      'Paste the direct link to your product here.',
    );
  });
});

describe('the rules', () => {
  it('needs a store and what was bought on every row', () => {
    const product = (description) => ({ ...newProduct(), description });
    const empty = { ...newRow() };
    const other = { ...newRow(), shop: 'other', products: [product('Shoes')] };
    const fine = { ...newRow(), shop: '3', products: [product('Laptop')] };

    expect(validateOrders([empty, other, fine])).toEqual({
      [empty.key]: {
        shop: 'booking.orders.errors.shop',
        products: { [empty.products[0].key]: { description: 'booking.orders.errors.description' } },
      },
      [other.key]: { shopName: 'booking.orders.errors.shopName' },
    });
  });

  it('checks each product link', () => {
    const bad = { ...newProduct(), description: 'Shirt', url: 'javascript:alert(1)' };
    const row = { ...newRow(), shop: '3', products: [bad] };
    expect(validateOrders([row])[row.key].products[bad.key]).toEqual({
      url: 'booking.orders.errors.url',
    });
  });

  it('only takes secure https links', () => {
    expect(isProductUrl('https://www.bol.com/nl/nl/p/example-product/')).toBe(true);
    for (const link of ['http://shop.example.com/p/1', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'www.bol.com', 'https://localhost']) {
      expect(isProductUrl(link)).toBe(false);
    }
  });

  it('sends each product with its link', () => {
    const row = {
      ...newRow(),
      shop: '3',
      products: [
        { ...newProduct(), description: 'White T-shirt, size L', url: ' https://www.bol.com/p/1 ' },
        { ...newProduct(), description: 'Black shoes, size 42' },
      ],
    };
    expect(toPayload([row])).toEqual([
      {
        shop: 3,
        description: 'White T-shirt, size L; Black shoes, size 42',
        products: [
          { description: 'White T-shirt, size L', url: 'https://www.bol.com/p/1' },
          { description: 'Black shoes, size 42', url: '' },
        ],
      },
    ]);
  });

  it.each(['nl', 'en', 'pap'])('has all its words in %s', (language) => {
    const keys = (value) => Object.keys(value).sort();
    expect(keys(translations[language].booking.orders)).toEqual(keys(words.booking.orders));
    expect(keys(translations[language].booking.orders.errors)).toEqual(
      keys(words.booking.orders.errors),
    );
  });
});
