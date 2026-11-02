// src/api/staff.js
//
// The back-office API, /api/staff/. Every route here is refused with a 403
// unless the session belongs to a staff account — the dashboard hiding itself
// from customers is only tidiness, this is what actually holds.

import { request } from './client';

/** Turns `{ status: 'new', search: '' }` into `?status=new`, dropping blanks. */
function query(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // `false` is a real value for `handled`, so only empty and null go.
    if (value === '' || value === null || value === undefined) continue;
    search.set(key, String(value));
  }

  const string = search.toString();
  return string ? `?${string}` : '';
}

/**
 * DRF pages every list. Normalising here means the pages render one shape and
 * never have to care whether pagination happened to be on.
 */
function toPage(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };

  return {
    results: data?.results ?? [],
    count: data?.count ?? 0,
    hasNext: Boolean(data?.next),
    hasPrevious: Boolean(data?.previous),
  };
}

/**
 * Counts, recent activity and the daily series behind the chart.
 *
 * @param {number} [days] how far back the chart reaches. The server accepts
 *   7, 30 or 90 and falls back to 30 for anything else, so a stale value here
 *   degrades to the default rather than erroring.
 */
export async function getOverview(days) {
  return request(`/staff/overview/${query({ days })}`);
}

/**
 * The office's daily summary (backend staff/daily_summary.py): yesterday's
 * activity, what is waiting now, and the shipments that need somebody.
 * With `highlights`, also the AI's "Start with" lines ("" when the AI is off).
 */
export async function getDailySummary({ highlights = false } = {}) {
  return request(`/staff/summary/${highlights ? '?highlights=1' : ''}`);
}

/**
 * The monthly report (backend staff/reports.py): one month's figures, the
 * month before for comparison, bookings per destination and freight, and 12
 * months of history for the chart.
 *
 * @param {string} [month] 'YYYY-MM'. Left out: the current month.
 */
export async function getMonthlyReport(month) {
  return request(`/staff/reports/monthly/${query({ month })}`);
}

/**
 * The System page (admins only, backend ops/views.py): the recent database
 * backups, whether error monitoring (Sentry) is on, and whether e-mail works.
 */
export async function getSystemStatus() {
  return request('/staff/system/');
}

/** @param {{ search?: string, status?: string, destination?: string, ordering?: string, page?: number }} filters */
export async function listQuotes(filters) {
  return toPage(await request(`/staff/quotes/${query(filters)}`));
}

export async function updateQuote(id, changes) {
  return request(`/staff/quotes/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * E-mails an answer (the quote) to whoever asked (backend enquiries/replies.py).
 * Resolves with the whole request: its `replies` list ends with this one,
 * whose `sent` says whether the e-mail went out.
 */
export async function replyToQuote(id, body) {
  return request(`/staff/quotes/${id}/reply/`, { method: 'POST', body: { body } });
}

/** A first draft of the answer by AI (assistant/drafts.py). Nothing is sent: resolves with { body }. */
export async function draftReplyToQuote(id) {
  return request(`/staff/quotes/${id}/draft-reply/`, { method: 'POST', body: {} });
}

/** @param {{ search?: string, handled?: boolean, ordering?: string, page?: number }} filters */
// ---- Courier tracking (/api/staff/carrier-tracking/, backend/tracking/) ----
// Webshop orders on their way to our warehouse. Office and warehouse manager
// may read and add lines; correcting a line, changing the courier and
// "check now" are for the office (the server checks this, not the page).

/** @param {{ search?: string, status?: string, problems?: '1', page?: number }} filters */
export async function listCarrierShipments(filters) {
  return toPage(await request(`/staff/carrier-tracking/${query(filters)}`));
}

export async function getCarrierShipment(id) {
  return request(`/staff/carrier-tracking/${id}/`);
}

/** @param {{ carrier?: string, estimated_delivery?: string | null }} changes */
export async function updateCarrierShipment(id, changes) {
  return request(`/staff/carrier-tracking/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * Add a line typed by staff. "delivered" needs `confirmation`: how delivery
 * was confirmed (proof of delivery, scan, signature).
 * @param {{ status: string, description?: string, location?: string,
 *           occurred_at?: string, confirmation?: string }} line
 */
export async function addCarrierEvent(id, line) {
  return request(`/staff/carrier-tracking/${id}/events/`, { method: 'POST', body: line });
}

/** Correct a wrong line: hidden from the customer, kept on record with the reason. */
export async function voidCarrierEvent(id, eventId, reason) {
  return request(`/staff/carrier-tracking/${id}/events/${eventId}/void/`, {
    method: 'POST',
    body: { reason },
  });
}

/** Ask the courier now instead of waiting for the next automatic check. */
export async function refreshCarrierShipment(id) {
  return request(`/staff/carrier-tracking/${id}/refresh/`, { method: 'POST' });
}

/**
 * Register a courier number for a customer (office only).
 * Incoming: on one of their orders (`order`) or pre-alerts (`prealert`).
 * Outgoing: on one of their shipments (`package`).
 * @param {{ customer: number, stage: 'incoming'|'outgoing', order?: number,
 *   prealert?: number, package?: number, carrier: string, tracking_number: string }} body
 */
export async function createCarrierShipment(body) {
  return request('/staff/carrier-tracking/', { method: 'POST', body });
}

/** Customers matching `q` (name, e-mail, PLSM-C number) with their orders, pre-alerts and shipments. */
export async function lookupTrackingCustomers(q) {
  return request(`/staff/carrier-tracking/lookup/${query({ q })}`);
}

/** Fix a wrong number or courier; the old one is kept on record with the reason. */
export async function correctCarrierNumber(id, body) {
  return request(`/staff/carrier-tracking/${id}/correct-number/`, { method: 'POST', body });
}

export async function listMessages(filters) {
  return toPage(await request(`/staff/messages/${query(filters)}`));
}

export async function updateMessage(id, changes) {
  return request(`/staff/messages/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * E-mails an answer to whoever sent the message (backend enquiries/replies.py).
 * Resolves with the whole message: its `replies` list ends with this reply,
 * whose `sent` says whether the e-mail actually went out.
 */
export async function replyToMessage(id, body) {
  return request(`/staff/messages/${id}/reply/`, { method: 'POST', body: { body } });
}

/**
 * Has the AI sort the messages it has not sorted yet - topic, urgency and a
 * one-line summary (backend enquiries/sorting.py). A batch per call.
 * Resolves with { sorted: n }; 0 when the AI is off.
 */
export async function sortMessages() {
  return request('/staff/messages/sort/', { method: 'POST', body: {} });
}

/**
 * A first draft of the reply, written by AI (backend assistant/drafts.py).
 * Nothing is sent or saved: resolves with { body } for the reply box.
 */
export async function draftReplyToMessage(id) {
  return request(`/staff/messages/${id}/draft-reply/`, { method: 'POST', body: {} });
}

/**
 * Is this shipment's paperwork ready for customs? (backend staff/customs_check.py)
 * Reads only. With `ai`, also a few AI-written notes on whether the documents
 * match what is declared ("" when the AI is off).
 *
 * @returns {Promise<{ verdict: 'missing'|'check'|'ok',
 *   issues: { code: string, level: 'block'|'warn', message: string, params: object }[],
 *   declared_eur: string|null, invoices_eur: string|null, documents: object, ai_notes?: string }>}
 */
export async function getCustomsCheck(id, { ai = false } = {}) {
  return request(`/staff/packages/${id}/customs-check/${ai ? '?ai=1' : ''}`);
}

/** @param {{ search?: string, status?: string, ordering?: string, page?: number }} filters */
export async function listPackages(filters) {
  return toPage(await request(`/staff/packages/${query(filters)}`));
}

/**
 * Booking forms submitted by customers. Only the office half is writable —
 * what the sender declared is a record of what they said.
 *
 * @param {{ search?: string, status?: string, destination?: string, freight?: string, ordering?: string, page?: number }} filters
 */
export async function listBookings(filters) {
  return toPage(await request(`/staff/bookings/${query(filters)}`));
}

export async function updateBooking(id, changes) {
  return request(`/staff/bookings/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * For the pop-ups in the dashboard corner (pages/Dashboard/StaffAlerts.jsx):
 * the newest contact messages nobody has handled yet, and the newest bookings
 * still on "new". Newest first, because the server orders by -created_at.
 *
 * `background: true` because these are asked on a timer, not because somebody
 * clicked something - so they must not keep an idle session awake.
 * `silentAuthFailure: true` because a session that ran out while the tab sat
 * open is normal, and the next real click will ask to sign in again anyway.
 */
export async function listNewMessagesForAlerts() {
  return toPage(
    await request(`/staff/messages/${query({ handled: 'false' })}`, {
      background: true,
      silentAuthFailure: true,
    }),
  );
}

export async function listNewBookingsForAlerts() {
  return toPage(
    await request(`/staff/bookings/${query({ status: 'new' })}`, {
      background: true,
      silentAuthFailure: true,
    }),
  );
}

/**
 * Send a booking to the warehouse: it gets the next shipping number
 * (PLSM-00001, PLSM-00002 ...) if it has none, its shipment goes on the
 * warehouse floor's list, and an intake sheet with the number on it is made
 * for the workers. Answers with the booking.
 */
export async function sendBookingToWarehouse(id) {
  return request(`/staff/bookings/${id}/send-to-warehouse/`, { method: 'POST' });
}

export const BOOKING_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'booked_in', label: 'Booked in' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Customers, with their addresses and shipment counts.
 *
 * These are the same rows each customer edits on their own profile page, not
 * a back-office copy of them: a correction made here is what that customer
 * reads next time they open their profile, and an edit they make there is
 * what the next load of this list shows.
 *
 * @param {{ search?: string, erased?: string, staff?: string, role?: string,
 *           ordering?: string, page?: number }} filters
 */
export async function listCustomers(filters) {
  return toPage(await request(`/staff/customers/${query(filters)}`));
}

/**
 * The people who work here: admins, office, warehouse and drivers.
 *
 * The same endpoint and the same rows as `listCustomers` — an account is one
 * User record whichever page it is looked at from — narrowed to the four
 * staff roles. `role=worker` is the server's name for that set, and it is not
 * the same question as `staff=true`: a driver carries neither flag and a
 * warehouse worker carries the other one, so asking by flag would miss both.
 *
 * A `role` passed in the filters names one role instead, which is how the
 * Workers page's own filter narrows to, say, drivers only.
 *
 * @param {{ search?: string, erased?: string, role?: string,
 *           ordering?: string, page?: number }} filters
 */
export async function listWorkers(filters) {
  return listCustomers({ ...filters, role: filters?.role || 'worker' });
}

/**
 * Corrects a customer's contact details. Answers with the whole row, so the
 * table can swap it in without refetching the page.
 *
 * Only what the office plausibly finds wrong: an agent at the destination
 * cannot arrange a handover against a mistyped phone number, and the customer
 * has no way of knowing it is mistyped. The username and the role are not in
 * here - the role has `setCustomerRole` below, where its refusals live.
 *
 * @param {number} id
 * @param {{ first_name?: string, last_name?: string, email?: string,
 *           phone_number?: string }} changes
 */
export async function updateCustomer(id, changes) {
  return request(`/staff/customers/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * Opens an account for somebody, from the back office.
 *
 * No password is sent, and there is nowhere to put one. The account is
 * created unusable and its owner is e-mailed a link to choose their own, so
 * nobody in the office ever knows it. That is the whole point of the feature
 * rather than a detail of it.
 *
 * Answers with the full customer row, so the table can show the new account
 * without refetching the page.
 *
 * @param {{ first_name: string, last_name: string, email: string,
 *           phone_number: string, role?: 'admin'|'warehouse'|'customer' }} details
 */
export async function createCustomer(details) {
  return request('/staff/customers/', { method: 'POST', body: details });
}

/**
 * Saves one of a customer's delivery addresses: with an `id` it corrects that
 * address, without one it adds it. Answers with the whole customer row.
 *
 * The same table the customer's own profile page writes to, so an address
 * fixed here is the one that pre-fills their next order.
 *
 * @param {number} id the customer
 * @param {{ id?: number|null, label?: string, street?: string,
 *           house_number?: string, postal_code?: string, city?: string,
 *           country?: string, is_default?: boolean }} address
 */
export async function saveCustomerAddress(id, address) {
  return request(`/staff/customers/${id}/address/`, {
    method: 'POST',
    body: address,
  });
}

/** The delivery countries, matching Address.Country on the server. */
export const ADDRESS_COUNTRIES = [
  { value: 'CW', label: 'Curaçao' },
  { value: 'BQ', label: 'Bonaire' },
  { value: 'AW', label: 'Aruba' },
  { value: 'SX', label: 'Sint Maarten' },
  { value: 'SR', label: 'Suriname' },
  { value: 'NL', label: 'Nederland' },
];

/**
 * Moves an account between the five roles. Answers with the whole customer
 * row, so the table can swap it in without a refetch.
 *
 *   customer   no dashboard at all
 *   driver     no dashboard either - a name on a delivery, deliberately
 *              without warehouse or office access
 *   warehouse  the scanner and intake sheets, on a phone. Not the rest of the
 *              back office, and not Django's own /admin/
 *   office     the back office and the warehouse screens, without roles
 *   admin      the whole back office, roles included
 *
 * The server refuses your own account, a superuser and an erased one - each
 * row carries `can_change_role` saying so up front, which is what the select
 * is disabled by. That flag is a hint for the UI: the refusal itself lives on
 * the server, and holds whatever the browser sends.
 *
 * @param {number} id
 * @param {'admin' | 'warehouse' | 'customer'} role
 */
export async function setCustomerRole(id, role) {
  return request(`/staff/customers/${id}/role/`, {
    method: 'POST',
    body: { role },
  });
}

/**
 * Delete an account. Admins only, refused for the same accounts as a role
 * change (your own, a superuser, an erased one).
 *
 * An account with shipments is not removed but erased: its personal data is
 * stripped and the row kept so the shipment records still hold together.
 * The answer says which happened.
 *
 * @param {number} id
 * @returns {Promise<{ anonymised: boolean }>}
 */
export async function deleteCustomer(id) {
  return request(`/staff/customers/${id}/`, { method: 'DELETE' });
}

/**
 * E-mails a warehouse worker a four-digit sign-in code. Admins only.
 *
 * The worker uses it, with their address, on the login page - a way in that
 * takes seconds on a busy floor. Answers `{ sent_to, expires_in_minutes }` and
 * never the code itself: it goes to the worker's inbox and nowhere else, so
 * that sending one is not a way of signing in as them.
 *
 * Refused with a 400 naming the reason when the address is nobody's or the
 * account is not a warehouse worker, and with a 503 when the mail could not be
 * sent. Codes are for warehouse accounts only; everyone else uses a password.
 *
 * @param {string} email the worker's address
 * @returns {Promise<{ sent_to: string, expires_in_minutes: number }>}
 */
export async function sendWarehouseSignInCode(email) {
  return request('/staff/workers/sign-in-code/', {
    method: 'POST',
    body: { email },
  });
}

/**
 * Takes a warehouse worker's floor PIN away, so it stops working at once. They
 * set a new one after signing in with an e-mailed code. Admins only.
 */
export async function resetWorkerPin(id) {
  return request(`/staff/workers/${id}/reset-pin/`, { method: 'POST' });
}

/**
 * Removes an admin's or office worker's authenticator app (a lost or new
 * phone); their next sign-in sets it up again. Admins only, never yourself.
 * Answers the updated row.
 */
export async function resetWorkerTwoFactor(id) {
  return request(`/staff/customers/${id}/reset-two-factor/`, { method: 'POST' });
}

/** The registered floor devices, newest first. Admins only. */
export async function listFloorDevices() {
  return request('/staff/floor-devices/');
}

/**
 * Registers the device this browser is running on as a floor device. The
 * server answers by setting the device's token in a cookie that no script
 * can read; this code never sees it.
 */
export async function registerThisFloorDevice(name) {
  return request('/staff/floor-devices/', { method: 'POST', body: { name } });
}

export async function revokeFloorDevice(id) {
  return request(`/staff/floor-devices/${id}/revoke/`, { method: 'POST' });
}

/**
 * Lets a floor device be used in a location (an area of the warehouse).
 * Answers the device, with its updated `locations`. Admins only.
 */
export async function grantFloorDeviceLocation(deviceId, locationId) {
  return request(`/staff/floor-devices/${deviceId}/grant-location/`, {
    method: 'POST',
    body: { location: locationId },
  });
}

/** Stops a floor device being used in a location, at once. Admins only. */
export async function revokeFloorDeviceLocation(deviceId, locationId) {
  return request(`/staff/floor-devices/${deviceId}/revoke-location/`, {
    method: 'POST',
    body: { location: locationId },
  });
}

/**
 * The warehouse's locations: [{ id, name, description, sections, device_count }].
 * `sections` are WarehouseAccess section keys. Admins only.
 */
export async function listFloorLocations() {
  return request('/staff/floor-locations/');
}

/** location: { name, description, sections } */
export async function createFloorLocation(location) {
  return request('/staff/floor-locations/', { method: 'POST', body: location });
}

export async function updateFloorLocation(id, location) {
  return request(`/staff/floor-locations/${id}/`, { method: 'PATCH', body: location });
}

/** Deleting a location takes it away from every device at once. */
export async function deleteFloorLocation(id) {
  return request(`/staff/floor-locations/${id}/`, { method: 'DELETE' });
}

/** The most recent floor sign-ins and PIN changes, newest first. Admins only. */
export async function listFloorEvents() {
  return request('/staff/floor-events/');
}

// Widest first, which is the order somebody reads them in when deciding how
// much to give an account. Only an admin may set any of them but Customer;
// the server refuses the rest.
export const CUSTOMER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'office', label: 'Office worker' },
  { value: 'manager', label: 'Warehouse manager' },
  { value: 'warehouse', label: 'Warehouse worker' },
  { value: 'driver', label: 'Driver' },
  { value: 'customer', label: 'Customer' },
];

/** The roles that mean somebody works here, widest access first. */
export const WORKER_ROLES = CUSTOMER_ROLES.filter((role) => role.value !== 'customer');

/** The word for a role value, for a row whose role cannot be changed. */
export function roleLabel(role) {
  return CUSTOMER_ROLES.find((option) => option.value === role)?.label ?? 'Customer';
}

export async function updatePackage(id, changes) {
  return request(`/staff/packages/${id}/`, { method: 'PATCH', body: changes });
}

// The choice lists, kept next to the API rather than in each page: they have
// to match the models' TextChoices, so one copy is easier to keep honest.
export const QUOTE_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'quoted', label: 'Quote sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];

export const PACKAGE_STATUSES = [
  { value: 'quoted', label: 'Quote sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'purchased', label: 'Products purchased' },
  { value: 'ready_for_shipping', label: 'Ready for shipping' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived at destination' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * The invoice review queue.
 *
 * An invoice is raised automatically when a package is marked paid, and it
 * lands here in `pending_review`. It becomes visible to the customer on their
 * profile page only once it has been approved and the document has rendered —
 * approving is the act that publishes it, which is why there is no "send"
 * button anywhere.
 *
 * @param {{ search?: string, status?: string, page?: number }} filters
 */
export async function listInvoices(filters) {
  // The server reads a missing status as "the queue", which is the right
  // default for an API and the wrong one for a <select> whose blank option
  // reads "Any status". Every other list in the dashboard treats blank as
  // no filter, so blank is spelled out as `all` here. The page opens on
  // blank, so it shows every status by default.
  const status = filters?.status ? filters.status : 'all';

  return toPage(await request(`/staff/invoices/${query({ ...filters, status })}`));
}

// The three an invoice may be raised into by hand. Draft is not offered —
// nothing reads a draft, and an invoice raised by hand is raised in order to
// go somewhere — and rejected is a verdict rather than a starting point. The
// server refuses the other two; this only decides what the form offers.
export const CREATABLE_INVOICE_STATUSES = [
  {
    value: 'sent',
    label: 'Send it to the customer now',
    hint: 'Approved in your name and published to their profile page straight away.',
  },
  {
    value: 'pending_review',
    label: 'Put it in the review queue',
    hint: 'Someone else approves it before the customer sees it.',
  },
  {
    value: 'approved',
    label: 'Approve it, but do not send yet',
    hint: 'Approved in your name. Send it later from this page.',
  },
];

/**
 * Raises an invoice by hand, with the document already in hand.
 *
 * The automatic path is untouched: an invoice still appears by itself when a
 * shipment is marked paid. This is for the shipment that never went through
 * that transition, where the office has the PDF and wants it on the
 * customer's profile.
 *
 * Both ids go up and neither is believed. The server checks the shipment
 * against the customer in the database before anything is written — see
 * InvoiceCreateSerializer — so a stale dropdown cannot put one customer's
 * invoice on another customer's shipment.
 *
 * A 409 means the shipment already has an invoice; the body carries
 * `existing_invoice` so the page can offer to open it.
 *
 * @param {{ customerId: number, packageId: number, file: File,
 *           status?: string, invoiceDate?: string }} invoice
 */
export async function createInvoice({
  customerId,
  packageId,
  file,
  status = 'sent',
  invoiceDate,
}) {
  const body = new FormData();
  body.append('customer', String(customerId));
  body.append('package', String(packageId));
  body.append('pdf', file);
  body.append('status', status);
  // Omitted rather than sent empty: the server reads a missing date as today,
  // and an empty string as a malformed one.
  if (invoiceDate) body.append('invoice_date', invoiceDate);

  // formData, so request() lets the browser write the multipart Content-Type
  // and its boundary — the one header that must never be set by hand.
  return request('/staff/invoices/', { method: 'POST', formData: body });
}

/**
 * pending_review -> approved, which queues the PDF and, once that lands,
 * marks the invoice sent and shows it to the customer.
 *
 * Answers with the whole row. A 409 means somebody else moved it first — the
 * state machine refusing, not a malformed request.
 */
export async function approveInvoice(id) {
  return request(`/staff/invoices/${id}/approve/`, { method: 'POST' });
}

/**
 * pending_review -> rejected. The reason is required and is shown to whoever
 * corrects the invoice, so it has to say what is actually wrong.
 */
/**
 * approved -> sent, for an invoice that already carries its document.
 *
 * The other half of "approve it, but do not send yet" on the Add invoice
 * form. An invoice raised that way sits approved with its PDF attached and
 * deliberately off the customer's profile; this is what finishes it.
 *
 * A 409 means it is not in a state where sending makes sense - still in
 * review, or already sent.
 */
export async function sendInvoice(id) {
  return request(`/staff/invoices/${id}/send/`, { method: 'POST' });
}

export async function rejectInvoice(id, reason) {
  return request(`/staff/invoices/${id}/reject/`, {
    method: 'POST',
    body: { rejection_reason: reason },
  });
}

/**
 * The paperwork customers have sent in: receipts, shop invoices, customs
 * forms. Staff see every customer's, which is the point of them uploading.
 *
 * @param {{ search?: string, kind?: string, unattached?: string, page?: number }} filters
 */
export async function listDocuments(filters) {
  return toPage(await request(`/documents/${query(filters)}`));
}

/**
 * Files a document against a shipment, or takes it off one when `packageId`
 * is null.
 *
 * The other half of letting a receipt arrive before the parcel does: somebody
 * uploads a till receipt the day they buy a television, the shipment is
 * booked later, and this joins the two so the document turns up on the parcel
 * where the office looks for it.
 */
export async function attachDocument(id, packageId) {
  return request(`/documents/${id}/attach/`, {
    method: 'POST',
    body: { package: packageId ?? null },
  });
}

export const DOCUMENT_KINDS = [
  { value: 'receipt', label: 'Till receipt' },
  { value: 'invoice', label: 'Shop invoice' },
  { value: 'customs', label: 'Customs form' },
  { value: 'other', label: 'Other' },
];

/**
 * Raises the invoice for a shipment that has none.
 *
 * Marking a package paid through the dashboard raises one by itself. This is
 * for the shipments that never passed through that transition — seeded rows,
 * imports, anything set in the Django admin — which otherwise have no invoice
 * and no way to get one, because every other invoice control lives on the
 * queue and an empty queue offers nothing.
 *
 * Idempotent: pressing it twice answers with the same invoice.
 */
export async function raiseInvoice(packageId) {
  return request(`/staff/packages/${packageId}/invoice/`, { method: 'POST' });
}

/**
 * Attaches a PDF to an invoice by hand, instead of waiting for the worker to
 * draw one.
 *
 * On an approved invoice this is what sends it: the document lands, the
 * invoice becomes sent, and it appears on the customer's own profile page.
 * On an already-sent invoice it replaces a wrong document without moving the
 * status and without telling the customer again.
 *
 * Anything else is refused with a 409 — an invoice still in review has not
 * been approved by anybody, and a document must not go around the queue.
 *
 * @param {number} id
 * @param {File} file the PDF, straight from the <input type="file">
 */
export async function uploadInvoiceDocument(id, file) {
  const body = new FormData();
  body.append('pdf', file);

  // formData rather than body: request() lets the browser set the multipart
  // Content-Type, boundary and all, which is the one header that must not be
  // written by hand.
  return request(`/staff/invoices/${id}/document/`, {
    method: 'POST',
    formData: body,
  });
}

// Queue first: it is where the work is, and the order the review flow runs in
// afterwards. Draft last, because nothing normally sits there.
export const INVOICE_STATUSES = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Draft' },
];

// ---------------------------------------------------------------------------
// Warehouse intake sheets
//
// The paper form filled in on the floor when goods arrive, and the handover
// that follows it. Nothing here has a customer-facing counterpart: a sheet
// records what staff saw - bad packing, damage, a driver's name - and lives
// entirely behind /api/staff/.
// ---------------------------------------------------------------------------

/**
 * `measured: 'true'` keeps only sheets with measured lines; `mine: 'true'`
 * only the sheets the signed-in person started.
 *
 * @param {{ search?: string, status?: string, freight?: string, measured?: string,
 *   mine?: string, ordering?: string, page?: number }} filters
 */
export async function listIntakeSheets(filters) {
  return toPage(await request(`/staff/intake/${query(filters)}`));
}

/**
 * Starts a sheet. Everything is optional - a sheet begins the moment somebody
 * has a delivery in front of them, which is before they know most of it.
 *
 * @param {object} [fields]
 */
export async function createIntakeSheet(fields = {}) {
  return request('/staff/intake/', { method: 'POST', body: fields });
}

/**
 * Saves changes to a draft. Refused with a 409 once the sheet has been
 * released - at that point it is the record of a handover rather than a form.
 *
 * @param {number} id
 * @param {object} changes
 */
export async function updateIntakeSheet(id, changes) {
  return request(`/staff/intake/${id}/`, { method: 'PATCH', body: changes });
}

/**
 * Hands the sheet to the rest of the staff and mails it to them.
 *
 * Two refusals worth telling apart, both of which the page already guards
 * against and neither of which it can rule out - somebody else may have the
 * same sheet open:
 *
 *   400 with `fields.missing`  something is still unanswered, by name
 *   409                        it has already been released
 *
 * @param {number} id
 */
export async function releaseIntakeSheet(id) {
  return request(`/staff/intake/${id}/release/`, { method: 'POST' });
}

/**
 * Reads a photo of a parcel's label with AI (backend warehouse/label_ai.py).
 * Nothing is saved. Rejects (503) when the AI is not set up or failed - the
 * label reader then reads the photo on the device instead.
 *
 * @param {Blob} photo  a camera picture or a chosen file
 * @returns {Promise<{ fields: { supplier: string, sender: string, recipient: string,
 *   destination: string }, tracking_number: string, lines: string[], match: object|null }>}
 */
export async function readLabelWithAi(photo) {
  const formData = new FormData();
  // A camera picture is a Blob without a name; the server checks the
  // extension, so it gets one.
  formData.append('file', photo, photo.name || 'label.jpg');
  return request('/staff/intake/read-label/', { method: 'POST', formData });
}

/**
 * Looks up a code read off a package.
 *
 * Writes nothing, which is the point: a mis-scan should cost a second scan
 * and not a junk sheet somebody has to find and explain. Starting the sheet
 * is a separate, deliberate call to createIntakeSheet.
 *
 * The answer names what was found in `match`:
 *
 *   'sheet'    a sheet already exists - `sheet` carries it, open it
 *   'package'  a shipment on file with no sheet yet - `package` carries it
 *   'booking'  a booking form on file with no sheet yet - `booking` has it
 *   'none'     nothing recognised the code, which is a normal answer for
 *              goods that arrived with only a supplier's own barcode on them
 *
 * @param {string} code
 * @returns {Promise<{ code: string, match: string, sheet: object|null,
 *   package: object|null, booking: object|null }>}
 */
export async function scanCode(code) {
  return request(`/staff/intake/scan/${query({ code })}`);
}

/**
 * The parcel with this courier barcode (PostNL, DHL ...) is at the warehouse.
 * Recorded once: scanning the same box again answers `already: true` with
 * when and by whom it was first recorded.
 * @returns {Promise<{ already: boolean, courier: object }>}
 */
export async function confirmCourierArrival(code) {
  return request('/staff/intake/courier-arrival/', { method: 'POST', body: { code } });
}

/**
 * Puts a released sheet back into draft so a mistake can be corrected.
 *
 * Sends nothing. What tells everybody is the next release, which says in its
 * subject line that it is a correction and which version it is.
 *
 * Refused with a 409 when the sheet is already a draft - somebody else got
 * there first, and there is nothing to do.
 *
 * @param {number} id
 */
export async function reopenIntakeSheet(id) {
  return request(`/staff/intake/${id}/reopen/`, { method: 'POST' });
}

/** The photos on an intake sheet (see pages/Dashboard/IntakePhotos.jsx). */
export async function listIntakePhotos(id) {
  return request(`/staff/intake/${id}/photos/`);
}

/**
 * Uploads photos to a draft sheet; returns the sheet's full photo list.
 * Refused with a 409 once the sheet is released.
 *
 * @param {number} id
 * @param {File[]} photos
 */
export async function uploadIntakePhotos(id, photos) {
  const body = new FormData();
  for (const photo of photos) body.append('photos', photo);
  return request(`/staff/intake/${id}/photos/`, { method: 'POST', formData: body });
}

export async function deleteIntakePhoto(id, photoId) {
  return request(`/staff/intake/${id}/photos/${photoId}/`, { method: 'DELETE' });
}

/**
 * Who a release would be mailed to right now.
 *
 * Asked for so the page can say so above the button. The quiet failure this
 * exists to prevent is a staff account with no work address on it: the sheet
 * releases, the dashboard says it did, and no inbox ever hears about it.
 *
 * @returns {Promise<{ count: number, addresses: string[] }>}
 */
export async function getIntakeRecipients() {
  return request('/staff/intake/recipients/');
}

/**
 * The warehouse home screen's numbers. Open to the floor as well as the
 * office, unlike getOverview, which a warehouse account is refused.
 *
 * @returns {Promise<{ drafts: number, my_drafts: number, started_today: number,
 *   released_today: number, my_released_today: number, my_released_week: number,
 *   my_released_total: number, recent: object[] }>}
 */
export async function getWarehouseSummary() {
  return request('/staff/intake/summary/');
}

// ---------------------------------------------------------------------------
// Warehouse shipments
//
// A shipment as the floor sees it: the warehouse stage, a problem flag, and
// everything a scan should show. Open to warehouse accounts as well as the
// office. The customer-facing status is not writable from here.
// ---------------------------------------------------------------------------

/** The warehouse board: a count per stage, today's intake, problems, overdue. */
/** @param {{ background?: boolean }} [options] see request() in client.js */
export async function getWarehouseBoard({ background = false } = {}) {
  return request('/staff/warehouse/shipments/board/', { background });
}

/** @param {{ stage?: string, problem?: string, overdue?: string, search?: string, page?: number }} filters */
export async function listWarehouseShipments(filters, { background = false } = {}) {
  return toPage(await request(`/staff/warehouse/shipments/${query(filters)}`, { background }));
}

export async function getWarehouseShipment(id) {
  return request(`/staff/warehouse/shipments/${id}/`);
}

/** The shipment behind a scanned code. Rejects with a 404 ApiError when there is none. */
export async function lookupWarehouseShipment(code) {
  return request(`/staff/warehouse/shipments/lookup/${query({ code })}`);
}

export async function setWarehouseStage(id, stage) {
  return request(`/staff/warehouse/shipments/${id}/stage/`, {
    method: 'POST',
    body: { stage },
  });
}

export async function reportShipmentProblem(id, note) {
  return request(`/staff/warehouse/shipments/${id}/problem/`, {
    method: 'POST',
    body: { note },
  });
}

export async function resolveShipmentProblem(id) {
  return request(`/staff/warehouse/shipments/${id}/resolve/`, { method: 'POST' });
}

// How a shipment travels. Blank until the office decides or an intake sheet says.
export const PACKAGE_FREIGHT = [
  { value: 'sea', label: 'Sea freight' },
  { value: 'air', label: 'Air freight' },
];

// How the customer gets a shipment at the end. Changes the last step of the
// customer's timeline: "Delivered" or "Picked up".
export const PACKAGE_HANDOVER = [
  { value: 'delivery', label: 'Delivered to customer' },
  { value: 'pickup', label: 'Customer picks it up' },
];

// In the order the floor works through them. A warehouse worker may only set
// the ones each shipment lists in `allowed_stages`; the server enforces it.
export const WAREHOUSE_STAGES = [
  { value: 'awaiting_pickup', label: 'Package expected' },
  { value: 'received', label: 'Package received' },
  { value: 'awaiting_measurement', label: 'Waiting for measurement' },
  { value: 'measured', label: 'Measured' },
  { value: 'awaiting_packaging', label: 'Waiting for packaging' },
  { value: 'packed', label: 'Packaged' },
  { value: 'ready', label: 'Ready for shipping' },
  { value: 'shipped', label: 'Shipped' },
];

export const INTAKE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'released', label: 'Released' },
];

export const INTAKE_FREIGHT = [
  { value: 'sea', label: 'Zeevracht' },
  { value: 'air', label: 'Luchtvracht' },
];

// The Dutch words the paper form prints, in the order it prints them.
export const INTAKE_PACKAGING = [
  { value: 'pallet', label: 'Pallet' },
  { value: 'doos', label: 'Doos' },
  { value: 'colli', label: 'Colli' },
  { value: 'kist', label: 'Kist' },
  { value: 'other', label: 'Anders…' },
];

// The Ja / Nee boxes. Blank first and blank by default: a sheet starts with
// nobody having looked, and that is not the same answer as "Nee".
export const INTAKE_CHECKS = [
  { value: '', label: 'Niet gecontroleerd' },
  { value: 'yes', label: 'Ja' },
  { value: 'no', label: 'Nee' },
];

// ---- Pre-alerts (/api/staff/prealerts/, backend/prealerts/) ----
// Parcels customers told us about. Office and warehouse manager may read;
// adding one to a shipment and cancelling are for the office.

/** @param {{ search?: string, status?: string, page?: number }} filters */
export async function listStaffPrealerts(filters) {
  return toPage(await request(`/staff/prealerts/${query(filters)}`));
}

/** Put the parcel in one of the same customer's shipments: "PLSM-00042". */
export async function addPrealertToShipment(id, packageNumber) {
  return request(`/staff/prealerts/${id}/add-to-shipment/`, {
    method: 'POST',
    body: { package: packageNumber },
  });
}

export async function cancelStaffPrealert(id) {
  return request(`/staff/prealerts/${id}/cancel/`, { method: 'POST' });
}

// ---- Document review (AI document reading, backend docreview/) ------------
//
// Every incoming document gets a "job": read by AI, matched against our
// records, and either linked by itself or put in the review queue. These are
// the calls the Document review page makes. Every action answers with the
// whole job again, so the page can simply show what comes back.

/** @param {{ status?: string, source?: string, search?: string, page?: number }} filters */
export async function listDocumentJobs(filters) {
  return toPage(await request(`/staff/document-jobs/${query(filters)}`));
}

export async function getDocumentJob(id) {
  return request(`/staff/document-jobs/${id}/`);
}

/** Upload a file to be read (a scan, a PDF, a photo of a label). */
export async function uploadDocumentForReview(file, note = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (note) formData.append('note', note);
  return request('/staff/document-jobs/', { method: 'POST', formData });
}

/** Records a person can pick, for one kind: 'customer' | 'package' | 'order' | 'invoice'. */
export async function searchDocumentCandidates(id, entity, q) {
  return request(`/staff/document-jobs/${id}/candidates/${query({ entity, q })}`);
}

export async function editDocumentFields(id, changes, reason) {
  return request(`/staff/document-jobs/${id}/fields/`, { method: 'POST', body: { changes, reason } });
}

/** Pick a record (or clear the choice with recordId = null). */
export async function selectDocumentMatch(id, entity, recordId) {
  return request(`/staff/document-jobs/${id}/select/`, { method: 'POST', body: { entity, id: recordId } });
}

export async function rejectDocumentMatch(id, entity, recordId, reason) {
  return request(`/staff/document-jobs/${id}/reject/`, { method: 'POST', body: { entity, id: recordId, reason } });
}

export async function confirmDocumentJob(id, reason) {
  return request(`/staff/document-jobs/${id}/confirm/`, { method: 'POST', body: { reason } });
}

export async function retryDocumentJob(id) {
  return request(`/staff/document-jobs/${id}/retry/`, { method: 'POST' });
}

export async function resolveDocumentJob(id, reason) {
  return request(`/staff/document-jobs/${id}/resolve/`, { method: 'POST', body: { reason } });
}

/** The Website page's switches (admins): `{ show_calculator: boolean }`. */
export async function getSiteSettings() {
  return request('/staff/site-settings/');
}

/** Change one or more of them; answers with all of them as they are now. */
export async function saveSiteSettings(switches) {
  return request('/staff/site-settings/', { method: 'PUT', body: switches });
}
