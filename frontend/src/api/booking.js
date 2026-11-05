// src/api/booking.js
//
// The digital booking form (boekingsbon): sending one, and a signed-in
// customer reading back their own (listMyBookings, for "Mijn boekingen" on
// the profile page). The server only ever returns the asker's own bookings,
// so nothing here can read somebody else's.

import { apiUrl, request } from './client';

export const FREIGHT = [
  { value: 'sea', labelKey: 'booking.freight.sea' },
  { value: 'air', labelKey: 'booking.freight.air' },
];

// The islands the form offers. Fewer than Booking.Destination on the server,
// which still carries Sint Maarten and Suriname so that bookings taken while
// those routes ran still read back by name rather than as a code. "other"
// opens a free-text box.
export const DESTINATIONS = [
  { value: 'AW', label: 'Aruba' },
  { value: 'BQ', label: 'Bonaire' },
  { value: 'CW', label: 'Curaçao' },
  { value: 'other', labelKey: 'booking.destinationOther' },
];

export const PACKING = [
  { value: 'sender', labelKey: 'booking.packing.sender' },
  { value: 'company', labelKey: 'booking.packing.company' },
];

export const PAYMENT = [
  { value: 'bank', labelKey: 'booking.payment.bank' },
  { value: 'cash', labelKey: 'booking.payment.cash' },
];

export const UNITS = [
  { value: 'boxes', labelKey: 'booking.units.boxes' },
  { value: 'pallets', labelKey: 'booking.units.pallets' },
  { value: 'colli', labelKey: 'booking.units.colli' },
];

export const VEHICLES = [
  { value: 'na', labelKey: 'booking.vehicle.na' },
  { value: 'combustion', labelKey: 'booking.vehicle.combustion' },
  { value: 'electric', labelKey: 'booking.vehicle.electric' },
];

/**
 * Send the booking form.
 *
 * The stores go as `orders` (see src/pages/Booking/orders.js toPayload).
 * Without screenshots everything goes as JSON. With screenshots it goes as
 * one multipart form - the fields as text, `orders` as a JSON string, and
 * the screenshot for store N as `order_N_screenshot` - so the booking and
 * its screenshots are saved together or not at all.
 *
 * A product's own screenshot goes as `order_N_product_M_screenshot`.
 *
 * @param {object} booking the sender's half of the form
 * @param {object[]} orders [{shop, shop_name?, description, products}], one per store
 * @param {(File|null)[]} [screenshots] per store, in the same order
 * @param {(File|null)[][]} [productScreenshots] per store, per product
 * @returns {Promise<{id: number, created_at: string}>} the reference only
 */
export async function submitBooking(booking, orders, screenshots = [], productScreenshots = []) {
  if (!screenshots.some(Boolean) && !productScreenshots.flat().some(Boolean)) {
    return request('/bookings/', { method: 'POST', body: { ...booking, orders } });
  }

  const formData = new FormData();
  for (const [name, value] of Object.entries(booking)) {
    // Left out rather than sent as the text "null": the server reads a
    // missing field as empty.
    if (value === null || value === undefined) continue;
    formData.append(name, typeof value === 'boolean' ? String(value) : value);
  }
  formData.append('orders', JSON.stringify(orders));
  screenshots.forEach((file, index) => {
    if (file) formData.append(`order_${index}_screenshot`, file);
  });
  productScreenshots.forEach((files, index) => {
    (files ?? []).forEach((file, number) => {
      if (file) formData.append(`order_${index}_product_${number}_screenshot`, file);
    });
  });

  return request('/bookings/', { method: 'POST', formData });
}

/**
 * The address of one attachment, for an <img> or a link. The server lists
 * it as a path starting with /api; apiUrl adds the right origin.
 */
export function attachmentUrl(path) {
  return apiUrl(path.replace(/^\/api(?=\/)/, ''));
}

/**
 * Adds a document to one store on the customer's own booking, after it was
 * sent: an order confirmation, an invoice, a track-and-trace or another file.
 *
 * @param {number} bookingId
 * @param {number} orderId
 * @param {{ kind: 'order_confirmation'|'invoice'|'tracking'|'other', file: File }} document
 * @returns {Promise<object>} the store row as it now reads, with its documents
 */
export async function addOrderDocument(bookingId, orderId, { kind, file }) {
  const formData = new FormData();
  formData.append('kind', kind);
  formData.append('file', file);
  return request(`/bookings/mine/${bookingId}/orders/${orderId}/documents/`, {
    method: 'POST',
    formData,
  });
}

/**
 * Sets (or, with an empty string, clears) the track-and-trace of one store on
 * the customer's own booking: a code or the carrier's link, as text.
 *
 * With a courier (`carrier`, a code from getCarriers() such as "postnl") the
 * server also follows the parcel automatically; the answer's
 * `carrier_tracking` then holds where it is. Without one, the code is only
 * kept as text for the office to read, as before.
 *
 * @param {number} bookingId
 * @param {number} orderId
 * @param {string} trackingCode
 * @param {string} [carrier] courier code, or '' for none
 * @returns {Promise<object>} the store row as it now reads
 */
export async function setOrderTracking(bookingId, orderId, trackingCode, carrier = '') {
  return request(`/bookings/mine/${bookingId}/orders/${orderId}/tracking/`, {
    method: 'PATCH',
    body: { tracking_code: trackingCode, carrier },
  });
}

/** Removes a document the customer added to their own booking. */
export async function removeBookingDocument(bookingId, attachmentId) {
  return request(`/bookings/mine/${bookingId}/attachments/${attachmentId}/`, {
    method: 'DELETE',
  });
}

/**
 * The signed-in customer's own bookings, newest first.
 * @returns {Promise<object[]>} see bookings/serializers.py MyBookingSerializer
 */
export async function listMyBookings() {
  const data = await request('/bookings/mine/');
  return Array.isArray(data) ? data : (data?.results ?? []);
}
