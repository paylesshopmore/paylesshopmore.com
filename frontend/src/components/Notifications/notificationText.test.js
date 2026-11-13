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
