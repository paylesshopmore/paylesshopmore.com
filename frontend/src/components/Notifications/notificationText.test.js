// What the bell says when an admin confirms an item (or a whole store order)
// arrived at the warehouse (backend notifications/services.py
// notify_item_received). The words in each language come from translations.js.

import { describe, expect, it } from 'vitest';
import { translations } from '../../i18n/translations';
import { describeNotification } from './notificationText';

/** A `t` for one language, like the site's: the key itself when missing. */
function tFor(language) {
  return (key) => key.split('.').reduce((value, part) => value?.[part], translations[language]) ?? key;
}

const item = {
  kind: 'shipment_status',
  tracking_number: 'PLSM-00010',
  context: { tracking_number: 'PLSM-00010', status: 'item_received', item: 'Stage Decks', shop: 'bol.com' },
};

describe('"received at our warehouse" notifications', () => {
  it('names the item and the shop, in Dutch', () => {
    const shown = describeNotification(item, tFor('nl'));
    expect(shown.title).toBe('Een product van uw bestelling is aangekomen in ons magazijn');
    expect(shown.text).toBe('Stage Decks (van bol.com)');
    expect(shown.link).toBe('/profile#bookings');
  });

  it('is translated in English and Papiamentu too', () => {
    expect(describeNotification(item, tFor('en')).title).toBe('An item of your order has arrived at our warehouse');
    expect(describeNotification(item, tFor('en')).text).toBe('Stage Decks (from bol.com)');
    expect(describeNotification(item, tFor('pap')).text).toBe('Stage Decks (di bol.com)');
  });

  it('has its own title for a whole store order', () => {
    const order = { ...item, context: { ...item.context, status: 'order_received' } };
    expect(describeNotification(order, tFor('en')).title).toBe('Your order has arrived at our warehouse');
  });
});

describe('"we are missing the invoice" notifications', () => {
  const requested = {
    kind: 'shipment_status',
    tracking_number: 'PLSM-00010',
    context: { tracking_number: 'PLSM-00010', status: 'invoice_requested', item: 'Laptop', shop: 'Bol.com' },
  };

  it('names the order, in each language, and opens the bookings', () => {
    const nl = describeNotification(requested, tFor('nl'));
    expect(nl.title).toBe('Wij missen de factuur van uw bestelling');
    expect(nl.text).toBe('Laptop (van Bol.com)');
    expect(nl.link).toBe('/profile#bookings');

    expect(describeNotification(requested, tFor('en')).title).toBe('We are missing the invoice of your order');
    expect(describeNotification(requested, tFor('pap')).text).toBe('Laptop (di Bol.com)');
  });
});

describe('"order confirmation required" notifications', () => {
  const asked = {
    kind: 'shipment_status',
    tracking_number: 'PLSM-0000010',
    context: {
      tracking_number: 'PLSM-0000010',
      status: 'confirmation_requested',
      booking_number: 'PLSM-0000010',
      item: 'Laptop',
      shop: 'Bol.com',
    },
  };

  it('names the booking and the order, in each language, and opens the bookings', () => {
    const nl = describeNotification(asked, tFor('nl'));
    expect(nl.title).toBe('Orderbevestiging gevraagd');
    expect(nl.text).toBe('PLSM-0000010 \u00b7 Laptop (van Bol.com)');
    expect(nl.link).toBe('/profile#bookings');

    const en = describeNotification(asked, tFor('en'));
    expect(en.title).toBe('Order confirmation required');
    expect(en.text).toBe('PLSM-0000010 \u00b7 Laptop (from Bol.com)');
    expect(describeNotification(asked, tFor('pap')).text).toBe('PLSM-0000010 \u00b7 Laptop (di Bol.com)');
  });
});
