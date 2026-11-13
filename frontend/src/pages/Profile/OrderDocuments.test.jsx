// Adding a document to a store on the customer's booking, and the documents
// as the order list shows them.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrderDocument, removeBookingDocument, setOrderNumber, setOrderTracking } from '../../api/booking';
import { API_ERRORS, ApiError } from '../../api/client';
import { getCarriers } from '../../api/tracking';
import OrderList from '../../components/AttachmentList/OrderList';
import { renderWithProviders } from '../../test/utils';
import AddOrderDocument from './OrderDocuments';

vi.mock('../../api/booking', async (importOriginal) => ({
  ...(await importOriginal()),
  addOrderDocument: vi.fn(),
  removeBookingDocument: vi.fn(),
  setOrderNumber: vi.fn(),
  setOrderTracking: vi.fn(),
}));

// The "Courier company" list, without a server.
vi.mock('../../api/tracking', async (importOriginal) => ({
  ...(await importOriginal()),
  getCarriers: vi.fn(),
}));

const ORDER = { id: 5, shop_name: 'MediaMarkt', description: 'monitor', screenshot: null, documents: [] };
const pdf = () => new File(['%PDF-1.4'], 'factuur.pdf', { type: 'application/pdf' });

beforeEach(() => {
  window.localStorage.setItem('plsm.language', 'en');
  addOrderDocument.mockReset();
  setOrderTracking.mockReset();
  setOrderNumber.mockReset();
  removeBookingDocument.mockReset().mockResolvedValue(null);
  getCarriers.mockReset().mockResolvedValue([
    { code: 'postnl', name: 'PostNL', trackable: true },
    { code: 'dhl-parcel-nl', name: 'DHL Parcel (NL)', trackable: true },
  ]);
});

describe('adding a document to a store', () => {
  it('uploads the chosen type and file, and hands back the updated store', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated = { ...ORDER, documents: [{ id: 9, kind: 'invoice', name: 'factuur.pdf', url: '/api/x/' }] };
    addOrderDocument.mockResolvedValue(updated);
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={onUpdated} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'invoice');
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(addOrderDocument).toHaveBeenCalledWith(3, 5, { kind: 'invoice', file: expect.any(File) });
    expect(onUpdated).toHaveBeenCalledWith(updated);
    // Closed again, ready for the next one.
    expect(screen.getByRole('button', { name: '+ Add document' })).toBeInTheDocument();
  });

  it('asks for the type before sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose what kind of document this is.');
    expect(addOrderDocument).not.toHaveBeenCalled();
  });

  it("shows the server's reason for refusing a file", async () => {
    const user = userEvent.setup();
    addOrderDocument.mockRejectedValue(
      new ApiError(API_ERRORS.VALIDATION, { file: ['virus.exe: only a PNG, JPG, WebP or PDF can be added.'] }, 400),
    );
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'other');
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('only a PNG, JPG, WebP or PDF');
  });
});

describe('the order list with documents', () => {
  const withDocs = {
    ...ORDER,
    documents: [
      { id: 9, kind: 'invoice', kind_display: 'Invoice', name: 'factuur.pdf', url: '/api/bookings/mine/3/attachments/9/' },
      { id: 10, kind: 'tracking', kind_display: 'Track-and-trace', name: 'track.png', url: '/api/bookings/mine/3/attachments/10/' },
    ],
  };

  it('lists each document with its type and a link to open it', () => {
    renderWithProviders(<OrderList orders={[withDocs]} />);

    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Track-and-trace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'factuur.pdf' })).toHaveAttribute(
      'href',
      expect.stringContaining('/bookings/mine/3/attachments/9/'),
    );
    // No remove button unless the page offers one (the office does not).
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('offers remove when the page passes a handler', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderWithProviders(<OrderList orders={[withDocs]} onRemoveDocument={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove: track.png' }));

    expect(onRemove).toHaveBeenCalledWith(withDocs, withDocs.documents[1]);
  });
});

describe('track-and-trace as text', () => {
  it('swaps the file for a text box and saves the code on the store', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    setOrderTracking.mockResolvedValue({ ...ORDER, tracking_code: '3SABC1234567' });
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={onUpdated} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'tracking');

    expect(screen.queryByLabelText('File')).toBeNull();
    await user.type(screen.getByLabelText('Track-and-trace code or link'), ' 3SABC1234567 ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // No courier chosen: saved as text only, as before.
    expect(setOrderTracking).toHaveBeenCalledWith(3, 5, '3SABC1234567', '');
    expect(addOrderDocument).not.toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledWith({ ...ORDER, tracking_code: '3SABC1234567' });
  });

  it('sends the chosen courier, so the parcel is followed automatically', async () => {
    const user = userEvent.setup();
    setOrderTracking.mockResolvedValue({ ...ORDER, tracking_code: '3SABC1234567' });
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'tracking');
    await user.selectOptions(await screen.findByLabelText('Courier company'), 'postnl');
    await user.type(screen.getByLabelText('Track-and-trace code or link'), '3SABC1234567');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setOrderTracking).toHaveBeenCalledWith(3, 5, '3SABC1234567', 'postnl');
  });

  it('starts from the saved code, so it can be corrected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddOrderDocument bookingId={3} order={{ ...ORDER, tracking_code: 'OLD123' }} onUpdated={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'tracking');

    expect(screen.getByLabelText('Track-and-trace code or link')).toHaveValue('OLD123');
  });

  it('asks for something before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'tracking');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the track-and-trace code or link.');
    expect(setOrderTracking).not.toHaveBeenCalled();
  });
});

describe('the order list with a track-and-trace', () => {
  it('shows a code as text', () => {
    renderWithProviders(<OrderList orders={[{ ...ORDER, tracking_code: '3SABC1234567' }]} />);

    expect(screen.getByText('Track-and-trace')).toBeInTheDocument();
    expect(screen.getByText('3SABC1234567').tagName).not.toBe('A');
  });

  it('makes a web address a link', () => {
    const url = 'https://jouw.postnl.nl/track-and-trace/3SABC';
    renderWithProviders(<OrderList orders={[{ ...ORDER, tracking_code: url }]} />);

    expect(screen.getByRole('link', { name: url })).toHaveAttribute('href', url);
  });

  it('never makes anything else a link', () => {
    renderWithProviders(<OrderList orders={[{ ...ORDER, tracking_code: 'javascript:alert(1)' }]} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('offers remove when the page passes a handler', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const order = { ...ORDER, tracking_code: '3SABC' };
    renderWithProviders(<OrderList orders={[order]} onRemoveTracking={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove: Track-and-trace' }));

    expect(onRemove).toHaveBeenCalledWith(order);
  });
});

describe("the webshop's order number (optional)", () => {
  it('swaps the file for a text box and saves the number on the store', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated = { ...ORDER, order_number: '1234567890' };
    setOrderNumber.mockResolvedValue(updated);
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={onUpdated} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'order_number');
    // No file picker: a number is typed, not uploaded.
    expect(screen.queryByLabelText('File')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("The shop's order number (optional)"), ' 1234567890 ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setOrderNumber).toHaveBeenCalledWith(3, 5, '1234567890');
    expect(addOrderDocument).not.toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('starts from the saved number, so it can be corrected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddOrderDocument bookingId={3} order={{ ...ORDER, order_number: 'OLD-1' }} onUpdated={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'order_number');

    expect(screen.getByLabelText("The shop's order number (optional)")).toHaveValue('OLD-1');
  });

  it('asks for something before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Add document' }));
    await user.selectOptions(screen.getByLabelText('Type of document'), 'order_number');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the order number.');
    expect(setOrderNumber).not.toHaveBeenCalled();
  });

  it('is shown under the store when the page gives it a label', () => {
    renderWithProviders(
      <OrderList
        orders={[{ ...ORDER, order_number: '1234567890' }]}
        orderNumberLabel="Order number (from the shop)"
      />,
    );
    expect(screen.getByText('Order number (from the shop)')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('is not shown on pages that give no label (the office has its own block)', () => {
    renderWithProviders(<OrderList orders={[{ ...ORDER, order_number: '1234567890' }]} />);
    expect(screen.queryByText('1234567890')).not.toBeInTheDocument();
  });
});

describe('the order confirmation the office asked for', () => {
  const ASKED = { ...ORDER, confirmation_requested_at: '2026-11-13T10:40:00Z' };
  const CONFIRMATION = { id: 8, kind: 'order_confirmation', name: 'oud.pdf', url: '/api/x/8/' };

  it('shows which store was asked about, with an Upload Order Confirmation button', () => {
    renderWithProviders(<AddOrderDocument bookingId={3} order={ASKED} onUpdated={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('order confirmation');
    // Optional: the text says the booking carries on without it.
    expect(screen.getByRole('status')).toHaveTextContent('not required');
    expect(screen.getByRole('button', { name: 'Upload Order Confirmation' })).toBeInTheDocument();
  });

  it('shows nothing special when it was not asked for', () => {
    renderWithProviders(<AddOrderDocument bookingId={3} order={ORDER} onUpdated={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload Order Confirmation' })).not.toBeInTheDocument();
  });

  it('uploads straight away as an order confirmation, without asking for the type', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const updated = { ...ASKED, documents: [{ ...CONFIRMATION, name: 'orderbevestiging.pdf' }] };
    addOrderDocument.mockResolvedValue(updated);
    renderWithProviders(<AddOrderDocument bookingId={3} order={ASKED} onUpdated={onUpdated} />);

    await user.click(screen.getByRole('button', { name: 'Upload Order Confirmation' }));
    expect(screen.queryByLabelText('Type of document')).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(addOrderDocument).toHaveBeenCalledWith(3, 5, { kind: 'order_confirmation', file: expect.any(File) });
    expect(removeBookingDocument).not.toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledWith(updated);
  });

  it('offers to replace an uploaded one, and removes the old one once the new one is saved', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const order = { ...ORDER, documents: [CONFIRMATION] };
    addOrderDocument.mockResolvedValue({
      ...order,
      documents: [CONFIRMATION, { id: 9, kind: 'order_confirmation', name: 'nieuw.pdf', url: '/api/x/9/' }],
    });
    renderWithProviders(<AddOrderDocument bookingId={3} order={order} onUpdated={onUpdated} />);

    // Uploaded already, so there is no "asked" prompt - only a way to replace it.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace Order Confirmation' }));
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(addOrderDocument).toHaveBeenCalledWith(3, 5, { kind: 'order_confirmation', file: expect.any(File) });
    expect(removeBookingDocument).toHaveBeenCalledWith(3, 8);
    // The customer's list ends with the new document only.
    const shown = onUpdated.mock.calls[0][0];
    expect(shown.documents.map((document) => document.name)).toEqual(['nieuw.pdf']);
  });

  it('keeps the old one when the new one could not be saved', async () => {
    const user = userEvent.setup();
    const order = { ...ORDER, documents: [CONFIRMATION] };
    addOrderDocument.mockRejectedValue(new ApiError(API_ERRORS.VALIDATION, { file: ['Too big.'] }, 400));
    renderWithProviders(<AddOrderDocument bookingId={3} order={order} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Replace Order Confirmation' }));
    await user.upload(screen.getByLabelText('File'), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too big.');
    expect(removeBookingDocument).not.toHaveBeenCalled();
  });
});
