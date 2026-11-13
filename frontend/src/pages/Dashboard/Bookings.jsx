// src/pages/Dashboard/Bookings.jsx
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/bookings
//   Who can open: office staff
//   Links to:     /dashboard/customers, /dashboard/packages
//   Linked from:  the dashboard sidebar, Overview
//   Backend:      api/staff.js

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import OrderList from '../../components/AttachmentList/OrderList';
import HelpDialog from '../../components/HelpDialog/HelpDialog';
import BookingReceivedProducts from './BookingReceivedProducts';
import BookingWarehouseMeasurements from './BookingWarehouseMeasurements';
import OrderPaperwork from './OrderPaperwork';
import ReceivedButton from './ReceivedButton';
import { bookingReference } from '../../utils/bookingReference';
import { useLanguage } from '../../i18n/useLanguage';
import { warehouseSummary } from './bookingMeasurements';
import { Chip, Field, Group, Progress } from './sheet';
import { BOOKING_STATUSES, listBookings, sendBookingToWarehouse, updateBooking } from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDate, formatDateTime, formatMoney } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  StatusSelect,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';
import { labelFor, translatedOptions, usePageText } from './usePageText';

const TONES = {
  new: 'attention',
  confirmed: 'progress',
  booked_in: 'progress',
  shipped: 'done',
  cancelled: 'off',
};

const PACKING_QUALITY = [
  { value: '', key: 'notChecked' },
  { value: 'good', key: 'good' },
  { value: 'poor', key: 'notGood' },
];

/**
 * "3 Dozen", or the unit alone when the sender left the count open - somebody
 * who ordered online cannot know how many parcels the shop will send.
 */
function describeQuantity(booking, d) {
  return booking.quantity == null
    ? d('countNotGiven', { unit: booking.unit_display })
    : `${booking.quantity} ${booking.unit_display}`;
}

/**
 * The office half of a booking form: what staff fill in at the counter.
 * What the sender declared is shown beside it and is not editable - except
 * the declared value: the booking form no longer asks for it, so the office
 * fills it in here from the customer's screenshots.
 */
function OfficeFields({ booking, onSave, onSend, busy }) {
  const d = usePageText('bookings');
  const c = usePageText('common');
  const [draft, setDraft] = useState({
    shipping_number: booking.shipping_number ?? '',
    value_eur: booking.value_eur ?? '',
    volume_m3: booking.volume_m3 ?? '',
    weight_kg: booking.weight_kg ?? '',
    packing_quality: booking.packing_quality ?? '',
    office_notes: booking.office_notes ?? '',
  });

  const dirty = Object.entries(draft).some(
    ([field, value]) => String(booking[field] ?? '') !== String(value),
  );

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className={styles.officeBox}>
      <p className={styles.officeHead}>{d('office')}</p>

      <div className={styles.officeGrid}>
        <label className={styles.officeField}>
          <span className={styles.officeLabel}>{d('shippingNo')}</span>
          <input
            className={styles.officeInput}
            value={draft.shipping_number}
            onChange={(event) => set('shipping_number', event.target.value)}
            placeholder="PLSM-00001"
          />
          {/* Saving a number is what sends the booking to the warehouse
              (bookings/shipments.py send_to_warehouse). */}
          <span className={styles.mutedCell}>{d('numberSends')}</span>
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>{d('declaredValueEur')}</span>
          <input
            className={styles.officeInput}
            type="number"
            step="0.01"
            min="0"
            value={draft.value_eur}
            onChange={(event) => set('value_eur', event.target.value)}
            placeholder={d('fromScreenshots')}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>{d('volumeM3')}</span>
          <input
            className={styles.officeInput}
            type="number"
            step="0.001"
            min="0"
            value={draft.volume_m3}
            onChange={(event) => set('volume_m3', event.target.value)}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>{d('weightKg')}</span>
          <input
            className={styles.officeInput}
            type="number"
            step="0.01"
            min="0"
            value={draft.weight_kg}
            onChange={(event) => set('weight_kg', event.target.value)}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>{d('packing')}</span>
          <select
            className={styles.officeInput}
            value={draft.packing_quality}
            onChange={(event) => set('packing_quality', event.target.value)}
          >
            {PACKING_QUALITY.map((option) => (
              <option key={option.value} value={option.value}>
                {d(option.key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The counter's own note about the booking. Writable by the office and
          never shown to the sender, so it is the place for "rang, no answer"
          and "crate re-taped" — the things the four boxes above have no
          column for. */}
      <label className={styles.officeField}>
        <span className={styles.officeLabel}>{d('officeNotes')}</span>
        <textarea
          className={styles.officeInput}
          rows={3}
          value={draft.office_notes}
          onChange={(event) => set('office_notes', event.target.value)}
          placeholder={d('officeOnly')}
        />
      </label>

      <button
        type="button"
        className={styles.rowButton}
        disabled={!dirty || busy}
        onClick={() =>
          onSave({
            ...draft,
            // Empty means "not measured yet", which is null rather than 0.
            value_eur: draft.value_eur === '' ? null : draft.value_eur,
            volume_m3: draft.volume_m3 === '' ? null : draft.volume_m3,
            weight_kg: draft.weight_kg === '' ? null : draft.weight_kg,
          })
        }
      >
        {busy ? c('saving') : d('save')}
      </button>

      {/* Until it is at the warehouse: send it there. With no shipping number
          typed it gets the next PLSM-number; an intake sheet with the number
          on it is made for the workers. Anything typed is saved first. */}
      {!booking.shipment?.sent_to_warehouse_at &&
        booking.status !== 'cancelled' &&
        booking.shipment_blocked !== 'no_account' && (
          <button
            type="button"
            className={styles.intakeRelease}
            disabled={busy}
            onClick={() =>
              onSend(
                dirty
                  ? {
                      ...draft,
                      value_eur: draft.value_eur === '' ? null : draft.value_eur,
                      volume_m3: draft.volume_m3 === '' ? null : draft.volume_m3,
                      weight_kg: draft.weight_kg === '' ? null : draft.weight_kg,
                    }
                  : null,
              )
            }
          >
            {busy ? c('saving') : d('sendToWarehouse')}
          </button>
        )}
    </div>
  );
}

// The booking's journey, for the progress line in "The booking".
const JOURNEY = ['new', 'confirmed', 'booked_in', 'shipped'];

const PACKING_CHECK = {
  good: { tone: 'good', key: 'good' },
  poor: { tone: 'bad', key: 'notGood' },
};

/**
 * One booking, opened under the table: the office's own fields, then the
 * paper sheet in the order the form asks for it - the booking, who sends,
 * who receives, what is in it, and what they signed. Grouped rather than
 * one long grid: a sender's postcode and a recipient's postcode next to
 * each other in an unbroken run of fields is how they get confused for one
 * another. All in one colour.
 */
/**
 * Where the booking stands as a shipment:
 *   - made: its tracking number, linking to it under Packages;
 *   - can never be one: sent without an account, so there is nobody's
 *     "My shipments" to put it in;
 *   - not yet: say what will make it one.
 */
function ShipmentLink({ booking }) {
  const d = usePageText('bookings');
  const c = usePageText('common');
  if (booking.shipment) {
    return (
      <>
        <Link
          className={`${styles.link} ${styles.mono}`}
          to={`/dashboard/packages?search=${encodeURIComponent(booking.shipment.tracking_number)}`}
        >
          {booking.shipment.tracking_number}
        </Link>{' '}
        <Chip tone="good">
          {labelFor(c, 'packageStatus', booking.shipment.status, booking.shipment.status_display)}
        </Chip>
        <div className={styles.mutedCell}>{d('inMyShipments')}</div>
        <WarehouseState shipment={booking.shipment} />
      </>
    );
  }
  if (booking.shipment_blocked === 'no_account') {
    return (
      <span className={styles.mutedCell}>{d('noAccount')}</span>
    );
  }
  return (
    <span className={styles.mutedCell}>{d('notYet')}</span>
  );
}

/** Whether the warehouse has it yet, and where it is there. */
function WarehouseState({ shipment }) {
  const d = usePageText('bookings');
  const c = usePageText('common');
  const onFloor = shipment.sent_to_warehouse_at || shipment.status !== 'quoted';
  if (!onFloor) return <div className={styles.mutedCell}>{d('notAtWarehouse')}</div>;
  return (
    <div className={styles.mutedCell}>
      {d('atWarehouse', { stage: labelFor(c, 'warehouseStage', shipment.warehouse_stage, '') })}
    </div>
  );
}

/**
 * The invoice for this booking's shipment: the one it has, or - once the
 * warehouse has measured it - the button that makes it, in the invoice
 * editor with the shipment and the warehouse's measurements filled in.
 */
function InvoiceState({ shipment }) {
  const d = usePageText('bookings');
  const c = usePageText('common');
  if (!shipment) return <Chip tone="off">{d('invoiceNoShipment')}</Chip>;
  if (shipment.invoice?.editable) {
    // Open: fill it in and add its charges in the editor, then send it.
    return (
      <Link className={styles.bkAction} to={`/dashboard/invoices/${shipment.invoice.id}/edit`}>
        {d('editInvoice', { number: shipment.invoice.number })}
      </Link>
    );
  }
  if (shipment.invoice) {
    return (
      <Link
        className={styles.link}
        to={`/dashboard/invoices?status=all&search=${encodeURIComponent(shipment.tracking_number)}`}
      >
        {shipment.invoice.number || d('invoice')} ·{' '}
        {labelFor(c, 'invoiceStatus', shipment.invoice.status, shipment.invoice.status_display)}
      </Link>
    );
  }
  if (shipment.ready_to_invoice) {
    return (
      <Link className={styles.bkAction} to={`/dashboard/invoices/new?package=${shipment.id}`}>
        {d('makeInvoice')}
      </Link>
    );
  }
  return <Chip tone="off">{d('invoiceAfterMeasuring')}</Chip>;
}

function BookingSheet({ booking, busy, onSave, onSend, onBookingChanged }) {
  const d = usePageText('bookings');
  // For the kind of a document the customer added ("Factuur", ...): the
  // same words the customer chose it by on their profile page.
  const { t } = useLanguage();
  const c = usePageText('common');
  const freight = labelFor(c, 'freight', booking.freight, booking.freight_display);
  const packingCheck = PACKING_CHECK[booking.packing_quality];
  const screenshots = (booking.orders ?? []).filter((order) => order.screenshot).length;
  const destination = booking.destination_other || booking.destination_label;

  // The pop-up around it (Bookings, below) carries the title.
  return (
    <div>
      <OfficeFields booking={booking} busy={busy} onSave={onSave} onSend={onSend} />

      <Group title={d('theBooking')}>
        <Field label={d('reference')}>
          <span className={styles.mono}>{bookingReference(booking)}</span>
        </Field>
        <Field label={c('status')}>
          <StatusBadge tone={TONES[booking.status]}>
            {labelFor(c, 'bookingStatus', booking.status, booking.status_display)}
          </StatusBadge>
        </Field>
        <Field label={d('freight')}>{freight}</Field>
        {/* destination_other is what they typed when the list of islands did
            not have theirs, so it is the answer and not a footnote to one. */}
        <Field label={d('destination')}>{destination}</Field>
        <Field label={d('received')}>{formatDateTime(booking.created_at)}</Field>
        <Field label={d('lastChanged')}>{formatDateTime(booking.updated_at)}</Field>
        <Field label={d('filledInIn')}>
          {booking.language ? booking.language.toUpperCase() : '—'}
        </Field>
        {/* What the booking became: the shipment the customer now follows under
            "My shipments". Made by the server the first time the status is
            changed from New to Confirmed or further, and moved to In transit
            when the booking is marked Shipped (bookings/shipments.py). */}
        <Field label={d('shipment')} wide>
          <ShipmentLink booking={booking} />
        </Field>
        <Field label={d('invoice')} wide>
          <InvoiceState shipment={booking.shipment} />
        </Field>
        <Field label={c('progress')} wide>
          <Progress
            steps={JOURNEY.map((step) => [step, c(`bookingStatus.${step}`)])}
            status={booking.status}
            stopped={{ cancelled: d('cancelled') }}
          />
        </Field>
      </Group>

      <Group title={d('sender')}>
        <Field label={d('name')}>{booking.sender_name}</Field>
        <Field label={c('email')}>
          <a className={styles.link} href={`mailto:${booking.sender_email}`}>
            {booking.sender_email}
          </a>
        </Field>
        <Field label={c('phone')}>
          {/* tel:, because this is the number staff ring when something
              about the booking needs asking. */}
          <a className={styles.link} href={`tel:${booking.sender_phone}`}>
            {booking.sender_phone}
          </a>
        </Field>
        <Field label={d('address')}>
          {booking.sender_address}
          <br />
          {booking.sender_postal_code} {booking.sender_city}
        </Field>
        {/* The customer account it was sent from, if they were signed in. */}
        <Field label={d('account')}>
          {booking.account ? (
            <Link
              className={styles.link}
              to={`/dashboard/customers?search=${encodeURIComponent(booking.account.email)}`}
            >
              {booking.account.name}
            </Link>
          ) : (
            <Chip tone="off">{d('bookedWithoutAccount')}</Chip>
          )}
        </Field>
      </Group>

      <Group title={d('recipient')}>
        <Field label={d('name')}>{booking.recipient_name}</Field>
        <Field label={c('email')}>
          {/* Optional on the form: a recipient on an island often has no
              e-mail address to give. */}
          {booking.recipient_email ? (
            <a className={styles.link} href={`mailto:${booking.recipient_email}`}>
              {booking.recipient_email}
            </a>
          ) : (
            <Chip tone="off">{d('notGiven')}</Chip>
          )}
        </Field>
        <Field label={c('phone')}>
          <a className={styles.link} href={`tel:${booking.recipient_phone}`}>
            {booking.recipient_phone}
          </a>
        </Field>
        <Field label={d('address')}>
          {booking.recipient_address}
          <br />
          {booking.recipient_city}
        </Field>
        <Field label={d('crib')}>
          {booking.recipient_crib_number || <Chip tone="off">{d('notGiven')}</Chip>}
        </Field>
        <Field label={d('shipsTo')}>
          {destination} · {freight}
        </Field>
      </Group>

      <Group title={d('consignment')}>
        <Field label={d('quantity')}>{describeQuantity(booking, d)}</Field>
        <Field label={d('declaredValue')}>
          {booking.value_eur == null ? (
            <Chip tone="bad">{d('notFilledIn')}</Chip>
          ) : (
            <strong>{formatMoney(booking.value_eur)}</strong>
          )}
        </Field>
        {/* Worked out on the server from the purchase value (backend
            invoicing/calculation.py HANDLING_FEE_RULES): the same figure the
            calculator and the customer see. */}
        <Field label={d('handlingCosts')}>
          {booking.handling ? (
            <>
              <strong>{formatMoney(booking.handling.fee_eur)}</strong>{' '}
              <span className={styles.mutedCell}>
                {d(
                  booking.handling.value_source === 'products'
                    ? 'handlingFromProducts'
                    : 'handlingFromValue',
                  { value: formatMoney(booking.handling.purchase_value_eur) },
                )}
              </span>
            </>
          ) : (
            <Chip tone="off">{d('handlingNeedsValue')}</Chip>
          )}
        </Field>
        {/* How many suppliers (stores) the consignment has. The EUR 150 rate
            covers 2; more is flagged for the office, not charged - there is
            no approved price for it yet. */}
        <Field label={d('suppliers')}>
          {booking.supplier_count ?? 0}{' '}
          {booking.handling?.suppliers_included != null && (
            <span className={styles.mutedCell}>
              {d('suppliersIncluded', { count: booking.handling.suppliers_included })}
            </span>
          )}
          {booking.handling?.over_supplier_limit && (
            <Chip tone="bad">{d('suppliersOverLimit')}</Chip>
          )}
        </Field>
        <Field label={d('insured')}>
          {booking.insured ? (
            <Chip tone="good">{formatMoney(booking.insured_value_eur)}</Chip>
          ) : (
            <Chip tone="off">{d('no')}</Chip>
          )}
        </Field>
        <Field label={d('packingBy')}>{booking.packing_display}</Field>
        <Field label={d('packingCheck')}>
          {packingCheck ? (
            <Chip tone={packingCheck.tone}>{d(packingCheck.key)}</Chip>
          ) : (
            <Chip tone="off">{d('notChecked')}</Chip>
          )}
        </Field>
        <Field label={d('payment')}>{booking.payment_display}</Field>
        <Field label={d('vehicle')}>{booking.vehicle_display}</Field>
        <Field label={d('emigration')}>
          {booking.emigration ? (
            <span className={styles.bkChips}>
              <Chip tone={booking.id_present ? 'good' : 'off'}>{d('id')}</Chip>
              <Chip tone={booking.deregistered ? 'good' : 'off'}>{d('deregistered')}</Chip>
              <Chip tone={booking.deregistration_present ? 'good' : 'off'}>{d('proof')}</Chip>
            </span>
          ) : (
            <Chip tone="off">{d('no')}</Chip>
          )}
        </Field>
        {/* The office's own figures, repeated here as read-back: the boxes
            above are for typing them in, this is the line somebody checks
            against the crate. */}
        {/* The office's own figures when it typed them in; otherwise what the
            warehouse measured (see "Warehouse measurements" further down). */}
        <Field label={d('measured')}>
          {booking.volume_m3 || booking.weight_kg ? (
            [booking.volume_m3 && `${booking.volume_m3} m³`, booking.weight_kg && `${booking.weight_kg} kg`]
              .filter(Boolean)
              .join(' · ')
          ) : warehouseSummary(booking.warehouse) ? (
            <>
              {warehouseSummary(booking.warehouse)} <Chip tone="good">{d('warehouse')}</Chip>
            </>
          ) : (
            <Chip tone="off">{d('notMeasured')}</Chip>
          )}
        </Field>
        {booking.orders?.length > 0 && (
          <>
            <Field label={d('stores')}>{booking.orders.length}</Field>
            <Field label={d('screenshots')}>
              {screenshots || <Chip tone="off">{d('none')}</Chip>}
            </Field>
          </>
        )}
        {booking.orders?.length > 0 ? (
          <Field label={d('storesOrdered', { count: booking.orders.length })} wide>
            <OrderList
              orders={booking.orders}
              openLabel={(name) => d('open', { name })}
              productLabels={{
                link: d('productLink'),
                copy: d('copyLink'),
                copied: d('copied'),
                price: d('customerPrice'),
                quantity: d('quantity'),
                subtotal: d('subtotal'),
                total: d('storeTotal'),
                noLink: d('noLink'),
              }}
              // The documents the customer added to a store afterwards (order
              // confirmation, their invoice, ...), named in the page's language.
              kindLabel={(document) => {
                const key = `profile.bookings.documents.kinds.${document.kind}`;
                const word = t(key);
                return word === key ? document.kind_display : word;
              }}
              // "Product ontvangen": only this item has arrived.
              renderProductExtra={(product) => (
                <ReceivedButton
                  key={product.id}
                  kind="product"
                  bookingId={booking.id}
                  row={product}
                  onChanged={onBookingChanged}
                />
              )}
              // Under each store: its invoice (or a button to ask for it), the
              // webshop's order number and the track-and-trace - then
              // "Bestelling ontvangen": everything from this store has arrived.
              renderOrderExtra={(order) => (
                <>
                  <OrderPaperwork booking={booking} order={order} onChanged={onBookingChanged} />
                  <ReceivedButton
                    kind="order"
                    bookingId={booking.id}
                    row={order}
                    onChanged={onBookingChanged}
                  />
                </>
              )}
            />
          </Field>
        ) : (
          <Field label={d('contents')} wide>
            <div className={styles.bkQuote}>
              {booking.contents || '—'}
              {booking.contents_attached && <em>{d('packingListSeparate')}</em>}
            </div>
          </Field>
        )}
      </Group>

      {/* What the warehouse measured: intake sheets and scanner measurements. */}
      <BookingWarehouseMeasurements warehouse={booking.warehouse} />

      {/* Per ordered product: how many the warehouse has counted in. */}
      <BookingReceivedProducts products={booking.received_products} />

      <Group title={d('remarksAndSignature')}>
        <Field label={d('sendersRemarks')} wide>
          {booking.notes ? (
            <div className={styles.bkQuote}>{booking.notes}</div>
          ) : (
            <Chip tone="off">{d('noRemarks')}</Chip>
          )}
        </Field>
        <Field label={d('signed')} wide>
          <span className={styles.signed}>{booking.signature_name}</span>
          {' — '}
          {formatDate(booking.signed_at)}{' '}
          {booking.agreed_terms && <Chip tone="good">{d('termsAccepted')}</Chip>}
        </Field>
      </Group>
    </div>
  );
}

export default function Bookings() {
  const [params] = useSearchParams();
  const d = usePageText('bookings');
  const c = usePageText('common');
  const statuses = translatedOptions(BOOKING_STATUSES, c, 'bookingStatus');

  const list = useCollection(
    listBookings,
    { status: params.get('status') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  // ?booking=41 opens that booking straight away: the link in the "new
  // booking" e-mail (backend bookings/notify.py). New bookings are at the
  // top of the list, so it is on the first page.
  const [openId, setOpenId] = useState(() => Number(params.get('booking')) || null);
  const openBooking = list.rows.find((booking) => booking.id === openId) ?? null;

  /** "Send to warehouse": save what was typed, then number and send it. */
  async function send(booking, changes) {
    setSavingId(booking.id);
    setError('');
    setDone('');

    try {
      let current = booking;
      if (changes) {
        current = await updateBooking(booking.id, changes);
        list.replaceRow(current);
      }
      // Saving a typed number may already have sent it.
      const sent = current.shipment?.sent_to_warehouse_at
        ? current
        : await sendBookingToWarehouse(booking.id);
      list.replaceRow(sent);
      setDone(d('sentToWarehouse', { number: sent.shipping_number }));
    } catch (failure) {
      setError(failure?.fields?.detail ? String(failure.fields.detail) : c('changeFailed'));
    } finally {
      setSavingId(null);
    }
  }

  async function save(booking, changes) {
    setSavingId(booking.id);
    setError('');
    setDone('');

    try {
      const saved = await updateBooking(booking.id, changes);
      list.replaceRow(saved);
      // Giving it a number sends it to the warehouse: say so, once.
      if (saved.shipment?.sent_to_warehouse_at && !booking.shipment?.sent_to_warehouse_at) {
        setDone(d('sentToWarehouse', { number: saved.shipping_number }));
      } else if (changes.shipping_number && saved.shipment_blocked === 'no_account') {
        setError(d('cannotSendNoAccount'));
      }
    } catch {
      setError(c('changeFailed'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      {/* data-tour hooks: this page's tour ("dashboardBookings" in
          components/Tutorial/tutorialSteps.js) points at these. */}
      <header className={styles.head} data-tour="db-bookings-intro">
        <h1 className={styles.title}>{d('title')}</h1>
        <p className={styles.subtitle}>{d('subtitle')}</p>
      </header>

      <Toolbar tour="db-bookings-filters">
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={d('searchLabel')}
          placeholder={d('searchPlaceholder')}
        />
        <FilterSelect
          label={c('status')}
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={statuses}
          allLabel={c('anyStatus')}
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{done}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{d('noMatch')}</Empty>
        ) : (
          <div className={styles.tableWrap} data-tour="db-bookings-table">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{d('reference')}</th>
                  <th scope="col">{d('sender')}</th>
                  <th scope="col">{d('recipient')}</th>
                  <th scope="col">{d('colConsignment')}</th>
                  <th scope="col">{d('received')}</th>
                  <th scope="col">{c('status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((booking) => (
                  <tr
                    key={booking.id}
                    className={[
                      styles.rowOpens,
                      booking.status === 'new' ? styles.rowUnhandled : '',
                      openId === booking.id ? styles.rowOpen : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    // Anywhere on the row opens it, because the whole row is
                    // what somebody is looking at when they decide they want
                    // to see the rest of it. A click that landed on the
                    // mailto, the tel or the status select is that control's
                    // own, so those are let through rather than swallowed.
                    onClick={(event) => {
                      if (event.target.closest('a, button, select, input, label')) {
                        return;
                      }
                      setOpenId(booking.id);
                    }}
                  >
                    <td>
                      <div className={styles.primaryCell}>
                        {bookingReference(booking)}
                      </div>
                      <div className={styles.mutedCell}>
                        {labelFor(c, 'freight', booking.freight, booking.freight_display)} · {booking.destination_label}
                      </div>
                      {/* Kept, and not only as a label for the row: this is
                          the control somebody reaches on a keyboard, where
                          there is no row to click. */}
                      <button
                        type="button"
                        className={styles.linkButton}
                        aria-haspopup="dialog"
                        onClick={() => setOpenId(booking.id)}
                      >
                        {d('details')}
                      </button>
                    </td>

                    <td>
                      <div>{booking.sender_name}</div>
                      <div className={styles.mutedCell}>
                        <a className={styles.link} href={`mailto:${booking.sender_email}`}>
                          {booking.sender_email}
                        </a>
                      </div>
                      <div className={styles.mutedCell}>{booking.sender_phone}</div>
                    </td>

                    <td>
                      <div>{booking.recipient_name}</div>
                      <div className={styles.mutedCell}>
                        {booking.recipient_address}, {booking.recipient_city}
                      </div>
                      <div className={styles.mutedCell}>{booking.recipient_phone}</div>
                    </td>

                    <td className={styles.numberCell}>
                      <div>{describeQuantity(booking, d)}</div>
                      <div className={styles.mutedCell}>
                        {booking.value_eur == null
                          ? d('valueNotFilledIn')
                          : d('declared', { value: formatMoney(booking.value_eur) })}
                      </div>
                      {booking.insured && (
                        <div className={styles.mutedCell}>
                          {d('insuredValue', { value: formatMoney(booking.insured_value_eur) })}
                        </div>
                      )}
                    </td>

                    <td className={styles.dateCell}>{formatDate(booking.created_at)}</td>

                    <td>
                      <StatusSelect
                        label={d('statusFor', { id: booking.id })}
                        value={booking.status}
                        options={statuses}
                        busy={savingId === booking.id}
                        onChange={(status) => save(booking, { status })}
                      />
                      <div style={{ marginTop: '0.35rem' }}>
                        <StatusBadge tone={TONES[booking.status]}>
                          {labelFor(c, 'bookingStatus', booking.status, booking.status_display)}
                        </StatusBadge>
                      </div>
                      {/* The office's cue: measured by the warehouse, no
                          invoice yet. */}
                      {booking.shipment?.ready_to_invoice && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <StatusBadge tone="attention">{d('readyToInvoice')}</StatusBadge>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* The expanded booking, below the table rather than inside it: a form
          crammed into a table cell is unusable, and this form has the whole
          paper sheet behind it. */}
      {/* The opened booking, in a pop-up over the list: the whole paper
          sheet behind it is too much for a table cell, and a pop-up keeps
          the list where it was. Closed by ×, the button, Escape or a click
          beside it. Keyed by the booking, so opening another starts fresh. */}
      {openBooking && (
        <HelpDialog
          key={openBooking.id}
          open
          extraWide
          onClose={() => setOpenId(null)}
          title={bookingReference(openBooking)}
          closeLabel={c('close')}
          doneLabel={c('close')}
        >
          {/* Inside the pop-up too, so a save's answer is seen where it was made. */}
          <Banner tone="error">{error}</Banner>
          <Banner tone="success">{done}</Banner>
          <BookingSheet
            booking={openBooking}
            busy={savingId === openBooking.id}
            onSave={(changes) => save(openBooking, changes)}
            onSend={(changes) => send(openBooking, changes)}
            onBookingChanged={(updated) => list.replaceRow(updated)}
          />
        </HelpDialog>
      )}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
