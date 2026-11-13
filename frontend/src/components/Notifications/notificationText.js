// src/components/Notifications/notificationText.js
//
// Turns a notification from the server into words in the visitor's
// language. The server only sends facts - `kind` and a small `context`
// (tracking number, status, invoice number) - see backend
// notifications/serializers.py. The words live in translations.js under
// notifications.*.
//
// TO ADD A KIND: add it here and add its texts in nl, en and pap.

import { fill } from '../../i18n/fill';

/**
 * @param {object} notification { kind, context, tracking_number }
 * @param {(key: string) => string} t
 * @returns {{ title: string, text: string, link: string }}
 *   link: where "Bekijken" goes, on the profile page.
 */
export function describeNotification(notification, t) {
  const context = notification.context ?? {};
  const tracking = notification.tracking_number || context.tracking_number || '';

  if (notification.kind === 'invoice_sent') {
    return {
      title: t('notifications.invoice.title'),
      text: fill(t('notifications.invoice.text'), {
        invoice: context.invoice_number ?? '',
        tracking,
      }),
      link: '/profile#invoices',
    };
  }

  // An admin confirmed an item (or a whole store order) arrived at the
  // warehouse (backend notifications/services.py notify_item_received). The
  // sentence names what arrived: "Stage Decks (from bol.com)". "View" opens
  // the customer's bookings, where the green "Received" label is.
  if (context.status === 'item_received' || context.status === 'order_received') {
    return {
      title: t(`notifications.status.${context.status}`),
      text: fill(t('notifications.receivedItem'), {
        item: context.item ?? '',
        shop: context.shop ?? '',
      }),
      link: '/profile#bookings',
    };
  }

  // shipment_status, and anything newer the site does not know yet.
  const key = `notifications.status.${context.status}`;
  const title = t(key);
  // News from a webshop's courier ("courier_delivered", ...) is about an
  // order on a booking, so "View" opens the bookings rather than shipments.
  const courier = String(context.status ?? '').startsWith('courier_');
  return {
    title: title === key ? t('notifications.status.other') : title,
    text: fill(t('notifications.shipment'), { tracking }),
    link: courier ? '/profile#bookings' : '/profile#shipments',
  };
}
