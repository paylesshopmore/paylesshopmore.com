// src/components/AttachmentList/OrderList.jsx
//
// The stores on a booking ("Uw bestellingen"), read back: per store its
// name, what was bought there, and the screenshot of the order when there
// is one. Used in the customer's booking pop-up (src/pages/Profile/
// MyBookings.jsx) and in the office's booking list (src/pages/Dashboard/
// Bookings.jsx), so both see the same thing.
//
// Each order comes from the API as { id, shop_name, description,
// screenshot, documents } - screenshot as AttachmentList takes it, or null;
// documents the files added to the store afterwards (order confirmation,
// invoice, track-and-trace), each with a `kind`; carrier_tracking where the
// courier has the parcel now (CourierTracking), or null.

import { attachmentUrl } from '../../api/booking';
import CourierTracking from '../CourierTracking/CourierTracking';

/**
 * Only http(s) addresses become links. What a customer typed is otherwise
 * shown as text - a "javascript:" link must never be clickable.
 */
function isWebLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
import AttachmentList from './AttachmentList';
import ProductList from './ProductList';
import ReceivedBadge from './ReceivedBadge';
import styles from './AttachmentList.module.css';

/**
 * @param {object} props
 * @param {object[]} props.orders
 * @param {(name: string) => string} [props.openLabel] see AttachmentList
 * @param {(document: object) => string} [props.kindLabel] what to call a
 *   document's kind; the server's English name by default
 * @param {(order: object, document: object) => void} [props.onRemoveDocument]
 *   shows a remove button on each document when given
 * @param {string} [props.removeLabel] that button's text
 * @param {(order: object) => import('react').ReactNode} [props.renderOrderExtra]
 *   anything to show under a store - the customer's "Add document"
 * @param {string} [props.orderNumberLabel] when given, the webshop's order number
 *   (if there is one) is shown as a line under the store with this name
 * @param {string} [props.trackingLabel] what to call the track-and-trace line
 * @param {(order: object) => void} [props.onRemoveTracking] shows a remove
 *   button on it when given
 * @param {object} [props.productLabels] the words for the products (ProductList)
 * @param {string} [props.language] for the euro amounts
 * @param {(product: object, order: object) => import('react').ReactNode} [props.renderProductExtra]
 *   anything to show under a product - the office's price check
 */
export default function OrderList({
  orders,
  openLabel,
  kindLabel = (document) => document.kind_display,
  onRemoveDocument,
  removeLabel = 'Remove',
  renderOrderExtra,
  orderNumberLabel,
  trackingLabel = 'Track-and-trace',
  onRemoveTracking,
  productLabels,
  language,
  renderProductExtra,
}) {
  if (!orders?.length) return null;

  return (
    <ol className={styles.orders}>
      {orders.map((order) => (
        <li key={order.id} className={styles.order}>
          <div className={styles.orderTop}>
            <span className={styles.orderText}>
              <span className={styles.orderShop}>{order.shop_name}</span>
              <span className={styles.orderDescription}>{order.description}</span>
              {/* The office confirmed the whole order arrived. */}
              <ReceivedBadge receivedAt={order.received_at} />
            </span>
            {order.screenshot && (
              <span className={styles.orderShot}>
                <AttachmentList attachments={[order.screenshot]} openLabel={openLabel} />
              </span>
            )}
          </div>

          {/* The products one by one, with their links and prices. */}
          <ProductList
            order={order}
            labels={productLabels}
            language={language}
            openLabel={openLabel}
            renderExtra={renderProductExtra}
          />

          {(order.documents?.length > 0 || order.tracking_code || (orderNumberLabel && order.order_number)) && (
            <ul className={styles.docs}>
              {/* The webshop's own order number, typed by the customer. */}
              {orderNumberLabel && order.order_number && (
                <li className={styles.doc}>
                  <span className={styles.docKind}>{orderNumberLabel}</span>
                  <span className={styles.docCode}>{order.order_number}</span>
                </li>
              )}
              {/* The track-and-trace, typed as text: a link when it is one. */}
              {order.tracking_code && (
                <li className={styles.doc}>
                  <span className={styles.docKind}>{trackingLabel}</span>
                  {isWebLink(order.tracking_code) ? (
                    <a
                      className={styles.docLink}
                      href={order.tracking_code}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {order.tracking_code}
                    </a>
                  ) : (
                    <span className={styles.docCode}>{order.tracking_code}</span>
                  )}
                  {onRemoveTracking && (
                    <button
                      type="button"
                      className={styles.docRemove}
                      onClick={() => onRemoveTracking(order)}
                      aria-label={`${removeLabel}: ${trackingLabel}`}
                    >
                      {removeLabel}
                    </button>
                  )}
                </li>
              )}
              {(order.documents ?? []).map((document) => (
                <li key={document.id} className={styles.doc}>
                  <span className={styles.docKind}>{kindLabel(document)}</span>
                  <a
                    className={styles.docLink}
                    href={attachmentUrl(document.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={openLabel ? openLabel(document.name) : document.name}
                  >
                    {document.name}
                  </a>
                  {onRemoveDocument && (
                    <button
                      type="button"
                      className={styles.docRemove}
                      onClick={() => onRemoveDocument(order, document)}
                      aria-label={`${removeLabel}: ${document.name}`}
                    >
                      {removeLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* The couriers bringing this order to our warehouse: the number
              the customer entered, and any our team added (an order can
              arrive in more than one parcel). Older answers only had the
              one `carrier_tracking`. */}
          {(order.carrier_trackings ?? (order.carrier_tracking ? [order.carrier_tracking] : [])).map(
            (tracking) => (
              <CourierTracking key={tracking.id} tracking={tracking} compact maxEvents={5} />
            ),
          )}

          {renderOrderExtra?.(order)}
        </li>
      ))}
    </ol>
  );
}
