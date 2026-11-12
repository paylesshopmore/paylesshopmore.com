// src/pages/Profile/ShipmentDetails.jsx
//
// What opens under a shipment in "My shipments" when the customer clicks it:
//
//   1. How long it will still take - the expected arrival and the days left,
//      or when it was delivered, or (not shipped yet) the usual sailing time.
//   2. Where it is - a progress bar and the stage-by-stage timeline.
//   3. The facts - destination, dates, weight, value.
//   4. The invoice for this shipment, with a download link.
//   5. The "this shipment can no longer be changed" notice, when it applies.
//   6. Delivery or pickup: the customer chooses how they get it at the end.
//
// At the top, the order actions: "Factuur bekijken" swaps these details for
// the invoice and the "Ontvangst in ons magazijn" overview (OrderInvoice.jsx)
// inside the same pop-up; its Back button swaps them back.
//
// Every date and stage comes from the server (the same reading as Track &
// Trace, see backend accounts/public.py); nothing here guesses where a
// shipment is. The one estimate - the usual sailing time when there is no
// expected arrival yet - comes from src/data/destinations.js and says so.

import { useState } from 'react';
import PhotoGallery from '../../components/PhotoGallery/PhotoGallery';
import { InvoiceIcon } from '../../components/Icons/icons';
import OrderInvoice from './OrderInvoice';
import { setHandover } from '../../api/profile';
import { CONTACT } from '../../data/company';
import ShipmentTimeline from '../../components/ShipmentTimeline/ShipmentTimeline';
import { DESTINATIONS } from '../../data/destinations';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from today to a date ('2026-10-15'), negative when past. */
/** "21.00" -> "21", "0.0600" -> "0,06": Dutch-style decimals, no trailing zeros. */
function decimal(value) {
  return Number(value).toLocaleString('nl-NL', { maximumFractionDigits: 3 });
}

/**
 * The warehouse's measurement as one line: "21 kg · 50 × 40 × 30 cm · 0,06 m³".
 * The numbers and units read the same in every language, so no translation.
 */
function measurementLine(measurement) {
  const { weight_kg, length_cm, width_cm, height_cm, volume_m3 } = measurement;
  return `${decimal(weight_kg)} kg · ${decimal(length_cm)} × ${decimal(width_cm)} × ${decimal(height_cm)} cm · ${decimal(volume_m3)} m³`;
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  return Math.round((target - today) / DAY);
}

/** "Curaçao" and "curacao" are the same island. */
function plain(text) {
  return String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The island's entry in destinations.js, matched on the destination name
 * the server sends (e.g. "Curaçao"), or undefined.
 */
function findIsland(destination) {
  if (!destination) return undefined;
  return DESTINATIONS.find(
    (island) => plain(island.slug) === plain(destination),
  );
}

/**
 * The "how long" box: one headline and, where there is one, a line under it.
 * Returns translation-ready strings.
 */
function useTiming(shipment, formatDay) {
  const { t } = useLanguage();
  const text = (key, values) =>
    fill(t(`profile.shipments.details.${key}`), values);

  if (shipment.status === 'cancelled') return null;

  if (shipment.delivered_at) {
    const delivered = new Date(shipment.delivered_at);
    const took = shipment.shipped_at
      ? Math.max(
          1,
          Math.round((delivered - new Date(shipment.shipped_at)) / DAY),
        )
      : null;
    return {
      // Past tense: it has arrived.
      label: 'howLongWas',
      headline: text('deliveredOn', { date: formatDay(delivered) }),
      line: took ? text('took', { days: took }) : null,
    };
  }

  // On the island, waiting to be handed over: the expected arrival has
  // been reached, so it is not "late" - the next step is the agent's call.
  if (shipment.status === 'arrived') {
    return { headline: text('arrived'), line: text('arrivedNext') };
  }

  if (shipment.estimated_arrival) {
    const days = daysUntil(shipment.estimated_arrival);
    const [y, m, d] = shipment.estimated_arrival.split('-').map(Number);
    const date = formatDay(new Date(y, m - 1, d));
    if (days > 1) {
      return {
        headline: text('arrivalOn', { date }),
        line: text('daysLeft', { days }),
      };
    }
    if (days === 1)
      return { headline: text('arrivalOn', { date }), line: text('tomorrow') };
    if (days === 0)
      return { headline: text('arrivalOn', { date }), line: text('today') };
    // Past the expected date and not delivered: said honestly, not hidden.
    return { headline: text('arrivalOn', { date }), line: text('late') };
  }

  // No expected arrival yet. If the island is known, the usual sailing time
  // as an indication - clearly labelled as one.
  const island = findIsland(shipment.destination);
  return {
    headline: text('notShipped'),
    line: island
      ? text('typical', { island: t(island.nameKey), days: island.transitDays })
      : null,
  };
}

/**
 * @param {object} props
 * @param {object} props.shipment   one row from /api/packages/
 * @param {object[]} props.invoices the customer's invoices (any shipment)
 * @param {Intl.DateTimeFormat} props.dateFormat  date and time
 * @param {{ title: string, body: string } | null} props.lock  see Shipments
 * @param {(shipment: object) => void} [props.onUpdated]  called with the
 *   shipment as the server returns it after the customer changes something
 */
export default function ShipmentDetails({
  shipment,
  invoices,
  dateFormat,
  lock,
  onUpdated,
}) {
  const { t, language } = useLanguage();
  const dayFormat = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
  });
  const label = (key) => t(`profile.shipments.details.${key}`);

  const timing = useTiming(shipment, (date) => dayFormat.format(date));
  // true while the "Factuur bekijken" panel is shown instead of the details.
  const [showInvoice, setShowInvoice] = useState(false);
  const ownInvoices = invoices.filter(
    (invoice) => invoice.trackingNumber === shipment.tracking_number,
  );

  // The timeline's stage names in the page's language; the server's English
  // name stays the fallback for a stage this page does not know yet.
  const stages = (shipment.stages ?? []).map((stage) => {
    const key = `profile.shipments.stages.${stage.value}`;
    const translated = t(key);
    return {
      value: stage.value,
      label: translated === key ? stage.label : translated,
    };
  });

  const facts = [
    [label('destination'), shipment.destination || label('unknown')],
    [label('registered'), dateFormat.format(new Date(shipment.created_at))],
    [
      label('shipped'),
      shipment.shipped_at
        ? dateFormat.format(new Date(shipment.shipped_at))
        : label('notYet'),
    ],
    shipment.delivered_at
      ? [label('delivered'), dateFormat.format(new Date(shipment.delivered_at))]
      : null,
    shipment.weight_kg
      ? [label('weight'), `${Number(shipment.weight_kg)} kg`]
      : null,
    // What the warehouse measured when the parcel came in: weight, size and
    // volume, e.g. "21 kg · 50 × 40 × 30 cm · 0,06 m³". Shown next to the
    // warehouse's photos below, so the customer sees what arrived.
    shipment.measurement
      ? [label('measured'), measurementLine(shipment.measurement)]
      : null,
    shipment.value_eur
      ? [label('value'), money.format(Number(shipment.value_eur))]
      : null,
  ].filter(Boolean);

  // "Factuur bekijken" was pressed: the invoice and the product overview
  // take the place of the details, in the same pop-up.
  if (showInvoice) {
    return <OrderInvoice shipment={shipment} onBack={() => setShowInvoice(false)} />;
  }

  return (
    <div className={styles.shipmentDetails}>
      {/* The order actions. */}
      <div className={styles.orderActions}>
        <button
          type="button"
          className={styles.orderActionButton}
          onClick={() => setShowInvoice(true)}
        >
          <InvoiceIcon size={18} />
          {t('orderOverview.viewInvoice')}
        </button>
      </div>

      {/* 1. How long it will still take - the question the customer
          opened this for, so it comes first. */}
      {timing && (
        <div className={styles.shipmentTiming}>
          <p className={styles.shipmentTimingLabel}>
            {label(timing.label ?? 'howLong')}
          </p>
          <p className={styles.shipmentTimingHeadline}>{timing.headline}</p>
          {timing.line && (
            <p className={styles.shipmentTimingLine}>{timing.line}</p>
          )}
        </div>
      )}

      {/* 2. Where it is. Not for a cancelled shipment: it is not anywhere. */}
      {shipment.status !== 'cancelled' && stages.length > 0 && (
        <div className={styles.shipmentJourney}>
          <p className={styles.shipmentSectionTitle}>{label('journey')}</p>
          <div
            className={styles.shipmentProgress}
            role="progressbar"
            aria-label={label('progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shipment.progress ?? 0}
          >
            <div
              className={styles.shipmentProgressBar}
              style={{ width: `${shipment.progress ?? 0}%` }}
            />
          </div>
          <ShipmentTimeline
            stages={stages}
            currentIndex={shipment.stage_index ?? -1}
            compact
          />
        </div>
      )}

      {/* 3. The facts. */}
      <dl className={styles.shipmentFacts}>
        {facts.map(([term, value]) => (
          <div key={term} className={styles.shipmentFact}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {/* Delivery or pickup. */}
      <HandoverChoice shipment={shipment} onUpdated={onUpdated} />

      {/* Photos the warehouse took of the package (backend warehouse
          PackagePhoto): a grid, and a big viewer with previous / next,
          download and the date (components/PhotoGallery). */}
      {shipment.photos?.length > 0 && <PhotoGallery photos={shipment.photos} title={label('photos')} />}

      {/* 4. This shipment's invoice(s). */}
      <div>
        <p className={styles.shipmentSectionTitle}>{label('invoice')}</p>
        {ownInvoices.length === 0 ? (
          <p className={styles.invoiceMeta}>{label('noInvoice')}</p>
        ) : (
          <ul className={styles.shipmentInvoices}>
            {ownInvoices.map((invoice) => (
              <li key={invoice.id} className={styles.shipmentInvoice}>
                <span className={styles.invoiceNumber}>{invoice.number}</span>
                {invoice.valueEur != null && (
                  <span className={styles.invoiceMeta}>
                    {money.format(Number(invoice.valueEur))}
                  </span>
                )}
                {/* A plain link: the session cookie rides along, and the
                    server sends the PDF as a download. */}
                <a
                  className={styles.invoiceDownload}
                  href={invoice.downloadUrl}
                  download
                >
                  {t('profile.invoices.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. The read-only notice. Stated on the shipment itself rather than
          left to be inferred from the absence of buttons: what the customer
          needs to know is that their next purchase travels on its own
          shipment. */}
      {lock && (
        <div className={styles.shipmentLocked}>
          <p className={styles.shipmentLockedTitle}>{t(lock.title)}</p>
          <p className={styles.invoiceMeta}>{t(lock.body)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * "How do you want to receive it?" - two buttons, Bezorgen and Zelf ophalen.
 *
 * The customer chooses only once: after a "are you sure?" question the
 * choice is saved and locked (handover_chosen_at is set). To change it later
 * they e-mail the office, which can still change it from the staff side.
 * The timeline's last step follows the choice: "Delivered" or "Picked up".
 * Once the shipment is delivered or cancelled nothing can be chosen at all.
 * The server enforces both rules too (accounts/views.py PackageViewSet.handover).
 */
function HandoverChoice({ shipment, onUpdated }) {
  const { t } = useLanguage();
  const h = (key) => t(`profile.shipments.handover.${key}`);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const current = shipment.handover ?? 'delivery';
  const finished = ['delivered', 'cancelled'].includes(shipment.status);
  // Already chosen once: the buttons only show the choice from now on.
  const chosen = Boolean(shipment.handover_chosen_at);
  // The line under the buttons: what happens next, that the customer gets
  // one choice, or that it is over.
  let note = current === 'pickup' ? 'pickupNote' : 'deliveryNote';
  if (!chosen) note = 'chooseOnce';
  if (finished) note = 'finished';

  async function choose(value) {
    if (chosen || saving) return;
    // One click locks it, so ask first.
    if (!window.confirm(fill(h('confirm'), { choice: h(value) }))) return;
    setSaving(true);
    setFailed(false);
    try {
      onUpdated?.(await setHandover(shipment.id, value));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className={styles.shipmentSectionTitle} id={`handover-${shipment.id}`}>
        {h('title')}
      </p>
      {/* aria-pressed: each button says whether it is the chosen one. */}
      <div className={styles.handoverChoice} role="group" aria-labelledby={`handover-${shipment.id}`}>
        {['delivery', 'pickup'].map((value) => (
          <button
            key={value}
            type="button"
            className={styles.handoverOption}
            // Before the choice nothing is pressed (the default is not a
            // choice), unless the shipment is over: then show how it went.
            aria-pressed={(chosen || finished) && current === value}
            disabled={finished || chosen || saving}
            onClick={() => choose(value)}
          >
            {h(value)}
          </button>
        ))}
      </div>
      <p className={styles.docIntro}>{h(note)}</p>
      {/* Chosen and not finished yet: a change goes by e-mail. The subject
          already names the shipment, so the office knows which one. */}
      {chosen && !finished && (
        <p className={styles.docIntro}>
          {h('changeByMail')}{' '}
          <a
            href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(
              `${h('mailSubject')} ${shipment.tracking_number}`,
            )}`}
          >
            {CONTACT.email}
          </a>
        </p>
      )}
      {failed && (
        <p className={styles.failure} role="alert">
          {h('failed')}
        </p>
      )}
    </div>
  );
}
