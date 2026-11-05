// src/pages/Profile/MyBookings.jsx
//
// "Mijn boekingen" on the profile page: every booking form (boekingsbon,
// src/pages/Booking) this customer sent while signed in, newest first. A
// click opens a pop-up with everything they filled in, plus what the office
// has added since (shipping number, volume, weight).
//
// Read-only on purpose. A booking is a signed form; to change one the
// customer contacts the office, as they would with the paper version.
//
// Where the data comes from: GET /api/bookings/mine/ (backend
// bookings/views.py MyBookingListView), which only ever returns the
// signed-in customer's own bookings. Bookings sent without being signed in
// are not linked to an account and do not show here.
//
// Field labels are borrowed from the booking form itself (booking.* in
// translations.js), so the pop-up uses the same words the customer saw when
// filling it in. Only what is new lives under profile.bookings.*.
//
// Once the office starts on a booking it also becomes a shipment (backend
// bookings/shipments.py), and `booking.shipment` holds its tracking number,
// so the customer knows where to follow it under "My shipments". In practice
// the server leaves a booking with a shipment out of this list altogether -
// once the office confirms it, it is only under "My shipments"
// (MyBookingListView) - so that line is a fallback, not the usual sight.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyBookings, removeBookingDocument, setOrderTracking } from '../../api/booking';
import OrderList from '../../components/AttachmentList/OrderList';
import HelpDialog from '../../components/HelpDialog/HelpDialog';
import { ChevronRightIcon } from '../../components/Icons/icons';
import { useLanguage } from '../../i18n/useLanguage';
import AddOrderDocument from './OrderDocuments';
import styles from './Profile.module.css';

// One colour per status, in the same --group-* variables the shipments use
// (see .shipment and .shipmentStatus in Profile.module.css).
const STATUS_COLOURS = {
  new: { tint: '#e0f2fe', ink: '#075985', accent: '#0ea5e9' },
  confirmed: { tint: '#ede9fe', ink: '#5b21b6', accent: '#7c3aed' },
  booked_in: { tint: '#fef3c7', ink: '#92400e', accent: '#f59e0b' },
  shipped: { tint: '#dcfce7', ink: '#166534', accent: '#22c55e' },
  cancelled: { tint: '#f1f5f9', ink: '#475569', accent: '#94a3b8' },
};

function colours(status) {
  const c = STATUS_COLOURS[status] ?? STATUS_COLOURS.new;
  return { '--group-tint': c.tint, '--group-ink': c.ink, '--group-accent': c.accent };
}

/** One label + value row in the pop-up. Left out when there is no value. */
function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className={styles.shipmentFact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A heading and its facts, as one block of the pop-up. */
function Block({ title, children }) {
  return (
    <section>
      <h3 className={styles.shipmentSectionTitle}>{title}</h3>
      <dl className={styles.shipmentFacts}>{children}</dl>
    </section>
  );
}

// Once shipped or cancelled the booking is a record: the server refuses
// changes to its documents, so the buttons are not offered.
const DOCUMENTS_CLOSED = ['shipped', 'cancelled'];

function BookingDetails({ booking, onOrderUpdated }) {
  const { t, language } = useLanguage();
  const b = (key) => t(`booking.${key}`);
  const p = (key) => t(`profile.bookings.${key}`);
  const money = new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' });
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' });

  // Documents per store (order confirmation, invoice, track-and-trace) can be
  // added and removed until the booking is shipped or cancelled.
  const documentsOpen = !DOCUMENTS_CLOSED.includes(booking.status);
  const [removeError, setRemoveError] = useState('');

  async function removeTracking(order) {
    if (!window.confirm(p('documents.confirmRemoveTracking'))) return;
    setRemoveError('');
    try {
      onOrderUpdated(await setOrderTracking(booking.id, order.id, ''));
    } catch {
      setRemoveError(p('documents.errors.removeFailed'));
    }
  }

  async function removeDocument(order, document) {
    if (!window.confirm(`${p('documents.confirmRemove')} ${document.name}`)) return;
    setRemoveError('');
    try {
      await removeBookingDocument(booking.id, document.id);
      onOrderUpdated({
        ...order,
        documents: order.documents.filter((item) => item.id !== document.id),
      });
    } catch {
      setRemoveError(p('documents.errors.removeFailed'));
    }
  }
  const yesNo = (value) => (value ? p('yes') : p('no'));

  return (
    <div className={styles.shipmentDetails} style={colours(booking.status)}>
      <div className={styles.shipmentPopupHead}>
        <span className={styles.shipmentBarText}>
          {p('placedOn')} {when.format(new Date(booking.created_at))}
        </span>
        <span className={styles.shipmentStatus}>{p(`status.${booking.status}`)}</span>
      </div>

      {/* What the office fills in after the parcels have arrived. */}
      <div className={styles.shipmentTiming}>
        <p className={styles.shipmentTimingLabel}>{p('officeHeading')}</p>
        <p className={styles.shipmentTimingHeadline}>
          {booking.shipping_number
            ? `${p('shippingNumber')}: ${booking.shipping_number}`
            : p('noNumber')}
        </p>
        {booking.shipment && (
          <p className={styles.shipmentTimingLine}>
            {p('inShipments')} <strong>{booking.shipment.tracking_number}</strong>
          </p>
        )}
        <p className={styles.shipmentTimingLine}>
          {booking.volume_m3 || booking.weight_kg
            ? [
                booking.volume_m3 && `${booking.volume_m3} m³`,
                booking.weight_kg && `${booking.weight_kg} kg`,
              ]
                .filter(Boolean)
                .join(' · ')
            : p('notMeasured')}
        </p>
      </div>

      <Block title={b('sections.shipment')}>
        <Fact label={b('freightLabel')}>{b(`freight.${booking.freight}`)}</Fact>
        <Fact label={b('destinationLabel')}>{booking.destination_label}</Fact>
      </Block>

      <Block title={b('sections.sender')}>
        <Fact label={p('name')}>
          {`${booking.sender_first_name} ${booking.sender_last_name}`.trim()}
        </Fact>
        <Fact label={b('address')}>
          {[booking.sender_address, `${booking.sender_postal_code} ${booking.sender_city}`.trim()]
            .filter(Boolean)
            .join(', ')}
        </Fact>
        <Fact label={b('phone')}>{booking.sender_phone}</Fact>
        <Fact label={b('email')}>{booking.sender_email}</Fact>
      </Block>

      <Block title={b('sections.recipient')}>
        <Fact label={p('name')}>
          {`${booking.recipient_first_name} ${booking.recipient_last_name}`.trim()}
        </Fact>
        <Fact label={b('address')}>
          {[booking.recipient_address, booking.recipient_city].filter(Boolean).join(', ')}
        </Fact>
        <Fact label={b('phone')}>{booking.recipient_phone}</Fact>
        <Fact label={b('email')}>{booking.recipient_email}</Fact>
        <Fact label={p('crib')}>{booking.recipient_crib_number}</Fact>
      </Block>

      <Block title={b('sections.consignment')}>
        {/* Counted at the warehouse; the form no longer asks for it. */}
        {booking.quantity && (
          <Fact label={b('quantity')}>
            {`${booking.quantity} ${b(`units.${booking.unit}`).toLowerCase()}`}
          </Fact>
        )}
        {/* Bookings from before the store rows: the contents as typed. */}
        {!booking.orders?.length && (
          <Fact label={b('contents')}>
            {booking.contents || (booking.contents_attached ? p('listAttached') : null)}
          </Fact>
        )}
        <Fact label={b('value')}>
          {booking.value_eur == null
            ? p('valuePending')
            : money.format(Number(booking.value_eur))}
        </Fact>
        {/* The same handling costs the office sees, worked out on the server. */}
        {booking.handling && (
          <Fact label={p('handling')}>{money.format(Number(booking.handling.fee_eur))}</Fact>
        )}
        {booking.vehicle !== 'na' && (
          <Fact label={b('vehicleLabel')}>{b(`vehicle.${booking.vehicle}`)}</Fact>
        )}
      </Block>

      {booking.orders?.length > 0 && (
        <section>
          <h3 className={styles.shipmentSectionTitle}>{p('orders')}</h3>
          <OrderList
            orders={booking.orders}
            openLabel={(name) => `${p('openFile')} ${name}`}
            kindLabel={(document) => p(`documents.kinds.${document.kind}`)}
            removeLabel={p('documents.remove')}
            onRemoveDocument={documentsOpen ? removeDocument : undefined}
            trackingLabel={p('documents.kinds.tracking')}
            onRemoveTracking={documentsOpen ? removeTracking : undefined}
            renderOrderExtra={
              documentsOpen
                ? (order) => (
                    <AddOrderDocument
                      bookingId={booking.id}
                      order={order}
                      onUpdated={onOrderUpdated}
                    />
                  )
                : undefined
            }
          />
          {documentsOpen ? (
            <p className={styles.docIntro}>{p('documents.intro')}</p>
          ) : (
            <p className={styles.docIntro}>{p('documents.closed')}</p>
          )}
          {removeError && (
            <p className={styles.failure} role="alert">
              {removeError}
            </p>
          )}
        </section>
      )}

      {booking.emigration && (
        <Block title={b('sections.emigration')}>
          <Fact label={b('id_present')}>{yesNo(booking.id_present)}</Fact>
          <Fact label={b('deregistered')}>{yesNo(booking.deregistered)}</Fact>
          <Fact label={b('deregistration_present')}>
            {yesNo(booking.deregistration_present)}
          </Fact>
        </Block>
      )}

      <Block title={b('sections.insurance')}>
        <Fact label={b('insuredValue')}>
          {booking.insured && booking.insured_value_eur
            ? money.format(Number(booking.insured_value_eur))
            : p('notInsured')}
        </Fact>
        <Fact label={b('notes')}>{booking.notes}</Fact>
      </Block>

      <p className={styles.cardIntro}>
        {p('signedBy')} <b>{booking.signature_name}</b>
        {booking.signed_at && ` — ${when.format(new Date(booking.signed_at))}`}
      </p>
      <p className={styles.cardIntro}>
        {p('changeNote')}{' '}
        <Link to="/contact" className={styles.linkButton}>
          {t('nav.contact')}
        </Link>
      </p>
    </div>
  );
}

export default function MyBookings() {
  const { t, language } = useLanguage();
  const p = (key) => t(`profile.bookings.${key}`);

  const [bookings, setBookings] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listMyBookings()
      .then((rows) => {
        if (cancelled) return;
        setBookings(rows);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const day = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' });
  const selected = bookings.find((booking) => booking.id === openId);

  // A whole booking (the shipping form), or a pre-alert for one parcel that
  // is on its way to our warehouse (pages/PreAlert/PreAlertForm.jsx).
  const newBooking = (
    <span className={styles.bookingsActions}>
      <Link to="/booking" className={styles.submit}>
        {p('new')}
      </Link>
      <Link to="/prealert" className={styles.secondaryButton}>
        {t('prealert.newButton')}
      </Link>
    </span>
  );

  if (state === 'loading') {
    return <p className={styles.invoiceMessage}>{p('loading')}</p>;
  }

  if (state === 'error') {
    return (
      <p className={styles.failure} role="alert">
        {p('failed')}{' '}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setState('loading');
            setAttempt((n) => n + 1);
          }}
        >
          {t('profile.invoices.retry')}
        </button>
      </p>
    );
  }

  return (
    <>
      <p className={styles.cardIntro}>{p('intro')}</p>

      {bookings.length === 0 ? (
        <p className={styles.invoiceMessage}>{p('empty')}</p>
      ) : (
        <ul className={styles.shipmentList}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.shipment} style={colours(booking.status)}>
              <button
                type="button"
                className={styles.shipmentBar}
                onClick={() => setOpenId(booking.id)}
              >
                <span className={styles.shipmentBarMain}>
                  <span className={styles.invoiceNumber}>
                    {booking.shipping_number || `${p('reference')} #${booking.id}`}
                  </span>
                  <span className={styles.shipmentBarText}>
                    {booking.destination_label}
                    {' — '}
                    {booking.contents || p('listAttached')}
                  </span>
                  {/* Once the office has started on it, the booking is a
                      shipment too: say where to follow it. */}
                  {booking.shipment && (
                    <span className={styles.shipmentBarText}>
                      {p('inShipments')} <strong>{booking.shipment.tracking_number}</strong>
                    </span>
                  )}
                </span>
                <span className={styles.shipmentBarSide}>
                  <span className={styles.shipmentStatus}>{p(`status.${booking.status}`)}</span>
                  <span className={styles.shipmentBarWhen}>
                    {day.format(new Date(booking.created_at))}
                  </span>
                </span>
                <ChevronRightIcon size={20} className={styles.shipmentChevron} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.bookingsNew}>{newBooking}</p>

      {selected && (
        <HelpDialog
          open
          wide
          onClose={() => setOpenId(null)}
          title={`${p('title')} ${selected.shipping_number || `#${selected.id}`}`}
          closeLabel={p('close')}
          doneLabel={p('close')}
        >
          <BookingDetails
            booking={selected}
            onOrderUpdated={(order) =>
              setBookings((rows) =>
                rows.map((row) =>
                  row.id === selected.id
                    ? {
                        ...row,
                        orders: row.orders.map((item) => (item.id === order.id ? order : item)),
                      }
                    : row,
                ),
              )
            }
          />
        </HelpDialog>
      )}
    </>
  );
}
