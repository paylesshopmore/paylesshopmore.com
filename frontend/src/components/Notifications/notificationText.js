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

  // News about one store order on a booking (backend notifications/services.py):
  //   item_received / order_received  an admin confirmed it arrived at the warehouse
  //   invoice_requested               the office is missing its invoice
  //   confirmation_requested          the office asks for the order confirmation
  // The sentence names the order: "Stage Decks (from bol.com)". "View" opens
  // the customer's bookings - where the green "Received" label is, and where
  // the invoice is added.
  const ORDER_NEWS = ['item_received', 'order_received', 'invoice_requested', 'confirmation_requested'];
  if (ORDER_NEWS.includes(context.status)) {
    // The request for an order confirmation also names the BOOKING, so the
    // customer sees which one it is about.
    const sentence =
      context.status === 'confirmation_requested' ? 'notifications.confirmationRequested' : 'notifications.receivedItem';
    return {
      title: t(`notifications.status.${context.status}`),
      text: fill(t(sentence), {
        item: context.item ?? '',
        shop: context.shop ?? '',
        booking: context.booking_number ?? '',
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
