// src/api/profile.js
//
// The signed-in customer's profile, addresses and packages. The server
// identifies the customer from the session cookie — no id is ever sent from
// the browser, which is what makes it impossible to read someone else's data.

import { request } from './client';

// The placeholder data is gone; the profile page now reads the real thing.
export const USING_PLACEHOLDER_DATA = false;

/** Maps the API's snake_case onto the shape the Profile page renders. */
function toProfile(data) {
  const address = data.addresses?.find((item) => item.is_default) ?? {};

  return {
    // Carried so the dashboard's customer table can tell which row is the
    // account the staff member is signed in as. Comparing e-mail addresses
    // almost worked, and stopped working the moment an e-mail was editable
    // from that table.
    id: data.id,
    name: [data.first_name, data.last_name].filter(Boolean).join(' '),
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    // PLSM-C00001: the customer's own number, written in front of their first
    // name on a parcel (profile -> "Your shipping address"). null for an
    // account the server has not numbered.
    customerCode: data.customer_code ?? null,
    email: data.email ?? '',
    phone: data.phone_number ?? '',
    // The site language the account last used, so e-mails arrive in it. '' until
    // set; see auth/LanguageSync.jsx.
    language: data.language ?? '',
    street: [address.street, address.house_number].filter(Boolean).join(' '),
    postalCode: address.postal_code ?? '',
    city: address.city ?? '',
    country: address.country ?? 'CW',
    addressId: address.id ?? null,
    memberSince: data.date_joined,
    // Which of the three roles this account holds. Not permissions: the API
    // checks both flags itself on every request, and these only decide which
    // navigation gets drawn.
    //
    //   isStaff      the office. The whole dashboard.
    //   isWarehouse  the floor. The scanner and intake sheets only.
    //
    // Neither implies the other, so read them together wherever "can this
    // person open the dashboard at all" is the question.
    isStaff: Boolean(data.is_staff),
    isWarehouse: Boolean(data.is_warehouse),
    // The named role: 'admin', 'office', 'manager', 'warehouse', 'driver' or
    // 'customer'.
    role: data.role ?? 'customer',
    isAdmin: data.role === 'admin',
    // The warehouse manager: the floor's admin. isWarehouse without isStaff,
    // so the warehouse app plus the dashboard pages that run the floor
    // (pages/Dashboard/managerAccess.js) - not the office.
    isWarehouseManager: data.role === 'manager',
    // Admins and warehouse managers: who may run the floor - the warehouse
    // workers, floor devices and the Warehouse access switches.
    canManageWarehouse: data.role === 'admin' || data.role === 'manager',
    addresses: data.addresses ?? [],
    // Seconds this session may sit idle before the server ends it: set for a
    // warehouse code sign-in on a shared floor device, null for everyone else.
    sessionIdleSeconds: data.session_idle_seconds ?? null,
    // Two-factor sign-in for THIS session: "off", "verified", "code_required"
    // or "setup_required". The last two send them to /two-factor first - see
    // auth/twoFactor.js.
    twoFactor: data.two_factor ?? 'off',
    // The admin's mode ("disabled", "optional", "required_admins",
    // "required_all"), and this account's place in it - for the profile's
    // "Two-factor sign-in" card.
    twoFactorMode: data.two_factor_mode ?? 'disabled',
    twoFactorEnabled: Boolean(data.two_factor_enabled),
    twoFactorRequired: Boolean(data.two_factor_required),
    // A warehouse worker's floor PIN: whether they have one, and whether this
    // session may set it (it began with an e-mailed code, not yet used for that).
    hasPin: Boolean(data.has_pin),
    canSetPin: Boolean(data.can_set_pin),
    pinLocked: Boolean(data.pin_locked),
    // Signed in with a PIN a manager generated: must choose their own before
    // the warehouse opens (the server refuses it until then).
    mustChangePin: Boolean(data.pin_must_change),
    // Whether this session may open the warehouse. A warehouse worker who
    // signed in with a password has the customer profile only, until their
    // e-mail and PIN open it (see unlockWarehouse in api/auth.js).
    warehouseUnlocked: Boolean(data.warehouse_unlocked),
    notifications: {
      shipping: data.notify_shipping ?? true,
      // Staff only: whether released warehouse intake sheets are e-mailed to
      // this person. Read on the dashboard, never shown on the profile page,
      // which is a customer's page and has nothing to say about it.
      warehouse: data.notify_warehouse ?? true,
    },
  };
}

/**
 * @param {{ silentAuthFailure?: boolean }} [options] pass it when this call is
 *   how a refusal is being checked, rather than a call that could be refused.
 *   A 403 here means nobody is signed in, which is an answer and not an
 *   incident — see onAuthFailure in api/client.js.
 */
export async function getProfile(options = {}) {
  return toProfile(await request('/profile/', { silentAuthFailure: true, ...options }));
}

/**
 * @param {{ firstName?: string, lastName?: string, name?: string,
 *          email?: string, phone?: string, currentPassword?: string }} changes
 *   firstName and lastName as typed in their own boxes (the profile page).
 *   `name` is the older single box, still split here for any caller using it.
 */
/**
 * Remembers the site language on the account, so e-mails about the customer's
 * shipments are written in it. Fire-and-forget: see auth/LanguageSync.jsx.
 */
export async function saveProfileLanguage(language) {
  return request('/profile/', { method: 'PATCH', body: { language } });
}

export async function updateProfile(changes) {
  const body = {};

  if (changes.firstName !== undefined) body.first_name = changes.firstName;
  if (changes.lastName !== undefined) body.last_name = changes.lastName;

  if (changes.name !== undefined && changes.firstName === undefined) {
    // The API stores the two halves separately. Everything after the first
    // space is the surname — imperfect for compound names, but it round-trips.
    const [first, ...rest] = changes.name.trim().split(/\s+/);
    body.first_name = first ?? '';
    body.last_name = rest.join(' ');
  }

  if (changes.email !== undefined) body.email = changes.email;
  if (changes.phone !== undefined) body.phone_number = changes.phone;
  // Required by the server whenever the e-mail address changes.
  if (changes.currentPassword !== undefined) body.current_password = changes.currentPassword;

  return toProfile(await request('/profile/', { method: 'PATCH', body }));
}

/**
 * Sets the signed-in warehouse worker's floor PIN. Only allowed straight after
 * signing in with an e-mailed code (a 403 otherwise); a 400 with a reason
 * under `pin` for one that is too easy to guess.
 */
export async function setPin(pin) {
  return request('/profile/pin/', { method: 'POST', body: { pin } });
}

/** @param {{ currentPassword: string, newPassword: string }} passwords */
export async function changePassword({ currentPassword, newPassword }) {
  return request('/profile/password/', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

/**
 * Saves the profile page's single address block: patches the customer's
 * default address, or creates one if they have none yet.
 *
 * @param {{ addressId: number|null, street: string, postalCode: string,
 *           city: string, country: string }} address
 */
export async function saveDefaultAddress({
  addressId,
  street,
  postalCode,
  city,
  country,
}) {
  // The API stores street and house number separately; the form asks for one
  // line. Treat a trailing token containing a digit as the house number.
  const trimmed = street.trim();
  const match = trimmed.match(/^(.*?)\s+(\S*\d\S*)$/);

  const body = {
    street: match ? match[1] : trimmed,
    house_number: match ? match[2] : '',
    postal_code: postalCode,
    city,
    country,
    is_default: true,
  };

  return addressId
    ? request(`/addresses/${addressId}/`, { method: 'PATCH', body })
    : request('/addresses/', { method: 'POST', body });
}

export async function listAddresses() {
  const data = await request('/addresses/');
  return data.results ?? data;
}

export async function createAddress(address) {
  return request('/addresses/', { method: 'POST', body: address });
}

export async function updateAddress(id, address) {
  return request(`/addresses/${id}/`, { method: 'PATCH', body: address });
}

export async function deleteAddress(id) {
  return request(`/addresses/${id}/`, { method: 'DELETE' });
}

/**
 * The customer's shipments, newest first.
 *
 * Each row carries `locked` and `lock_reason` from the server. Pages read
 * those rather than testing the status themselves: which statuses mean "gone"
 * is a rule, it lives on the model next to what it enforces, and a second
 * copy of it in JavaScript is a copy that will drift.
 */
export async function listPackages() {
  const data = await request('/packages/');
  return data.results ?? data;
}

/**
 * The customer's choice of how they get a shipment at the end: 'delivery'
 * (our agent brings it) or 'pickup' (they come and collect it). Returns the
 * shipment as the server now has it.
 *
 * @param {number} id  the shipment's id
 * @param {'delivery'|'pickup'} handover
 */
export async function setHandover(id, handover) {
  return request(`/packages/${id}/handover/`, { method: 'POST', body: { handover } });
}

/**
 * The "Factuur bekijken" panel of one shipment: its invoice (null until the
 * office has sent it) and every product the customer ordered, with how many
 * the warehouse has received (backend accounts/views.py order_overview).
 *
 * The server only answers for the signed-in customer's own shipment - any
 * other id is a 404. Never cached: each call reads the warehouse's latest
 * counts, so a refresh shows a correction straight away.
 *
 * @param {number} id  the shipment's id
 * @returns {Promise<{ tracking_number: string, invoice: object|null, products: object[] }>}
 */
export async function getOrderOverview(id) {
  return request(`/packages/${id}/order-overview/`);
}

/**
 * Saves the customer's e-mail choice. Only shipping updates: the offers and
 * newsletter switches were removed from the profile page, so they are no
 * longer sent (the server keeps whatever it already has).
 *
 * @param {{ notifications: {shipping: boolean} }} preferences
 */
export async function updateNotifications({ notifications }) {
  return toProfile(
    await request('/profile/', {
      method: 'PATCH',
      body: {
        notify_shipping: notifications.shipping,
      },
    }),
  );
}

/**
 * Turns the warehouse handover e-mail on or off for the signed-in account.
 *
 * Its own call rather than a fourth flag on updateNotifications, which sends
 * all three of a customer's marketing preferences at once: this is set from
 * the dashboard, beside the button it is about, and a staff member ticking it
 * there must not silently rewrite what they agreed to be sent about.
 *
 * @param {boolean} enabled
 */
export async function setWarehouseEmails(enabled) {
  return toProfile(
    await request('/profile/', {
      method: 'PATCH',
      body: { notify_warehouse: enabled },
    }),
  );
}

/**
 * Erases the account. Returns { anonymised: true } when shipment records had
 * to be kept — personal data is stripped either way.
 *
 * @param {{ currentPassword: string }} confirmation
 */
export async function deleteAccount({ currentPassword }) {
  return request('/profile/delete/', {
    method: 'POST',
    body: { current_password: currentPassword },
  });
}
