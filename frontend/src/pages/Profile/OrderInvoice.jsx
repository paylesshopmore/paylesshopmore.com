// src/pages/Profile/OrderInvoice.jsx
//
// The panel behind "Factuur bekijken" on a shipment in "My shipments". It
// replaces the shipment's details inside the same pop-up (a "Back" button
// returns), so on a phone it fills the screen like a page of its own.
//
// Two parts, always in this order:
//
//   1. Factuur - the invoice: number, date, the money lines, the total and a
//      "Factuur downloaden" button when there is a PDF. Before the office has
//      sent it: "Je factuur is nog niet beschikbaar." Part 2 still shows.
//
//   2. Ontvangst in ons magazijn - every product the customer ordered, with
//      "5 besteld · 3 ontvangen · 2 nog verwacht" and a status.
//
// WHERE THE NUMBERS COME FROM: nothing is worked out in this file. One call,
// GET /api/packages/<id>/order-overview/ (api/profile.js getOrderOverview),
// returns the invoice and, per product, `ordered` (from the booking form),
// `received` (the warehouse's confirmed counts, added up over every
// delivery), `expected` (ordered - received) and `status`. The rules live
// on the server, in backend warehouse/receipts.py - one place, so this page
// and the warehouse can never disagree.
//
// The server checks the shipment is the signed-in customer's own; anybody
// else's gets a 404 and this panel shows its "could not be loaded" message.
//
// Loaded fresh every time the panel opens, and again with "Vernieuwen", so a
// count the warehouse corrected shows straight away.

import { useEffect, useState } from 'react';
import { getOrderOverview } from '../../api/profile';
import { ArrowLeftIcon, DownloadIcon, RestartIcon } from '../../components/Icons/icons';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// The server's status codes, each with the colour it gets in the CSS
// (.receiptStatus[data-status=...] in Profile.module.css).
const STATUSES = ['received', 'partial', 'not_received', 'unknown'];

/**
 * @param {object} props
 * @param {object} props.shipment   one row from /api/packages/ (needs `id`)
 * @param {() => void} props.onBack  back to the shipment's details
 */
export default function OrderInvoice({ shipment, onBack }) {
  const { t, language } = useLanguage();
  const o = (key, values) => fill(t(`orderOverview.${key}`), values);

  const [overview, setOverview] = useState(null);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');

  // Goes up by one for every "Vernieuwen" / "Opnieuw proberen", which makes
  // the effect below ask the server again (the same pattern as Shipments.jsx).
  const [attempt, setAttempt] = useState(0);

  // Ask the server when the panel opens, and again on every new attempt.
  useEffect(() => {
    // Stops a slow answer from landing after the panel was closed.
    let live = true;
    getOrderOverview(shipment.id)
      .then((data) => {
        if (!live) return;
        setOverview(data);
        setState('ready');
      })
      .catch(() => {
        if (live) setState('error');
      });
    return () => {
      live = false;
    };
  }, [shipment.id, attempt]);

  function load() {
    setState('loading');
    setAttempt((n) => n + 1);
  }

  const money = new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' });
  const day = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className={styles.shipmentDetails}>
      <div className={styles.orderActions}>
        <button type="button" className={styles.orderActionButton} onClick={onBack}>
          <ArrowLeftIcon size={18} />
          {o('back')}
        </button>
        <button
          type="button"
          className={styles.orderActionButton}
          onClick={() => load()}
          disabled={state === 'loading'}
        >
          <RestartIcon size={18} />
          {o('refresh')}
        </button>
      </div>

      {state === 'loading' && !overview && <p className={styles.invoiceMessage}>{o('loading')}</p>}

      {state === 'error' && (
        <p className={styles.failure} role="alert">
          {o('failed')}{' '}
          <button type="button" className={styles.linkButton} onClick={() => load()}>
            {o('retry')}
          </button>
        </p>
      )}

      {overview && state !== 'error' && (
        <>
          <InvoicePart invoice={overview.invoice} o={o} money={money} day={day} />
          <ProductsPart products={overview.products} o={o} />
        </>
      )}
    </div>
  );
}

/** 1. The invoice, or the sentence saying it is not there yet. */
function InvoicePart({ invoice, o, money, day }) {
  return (
    <section aria-labelledby="order-invoice-title">
      <h3 id="order-invoice-title" className={styles.shipmentSectionTitle}>
        {o('invoice.title')}
      </h3>

      {!invoice ? (
        <p className={styles.invoiceMessage}>{o('invoice.notAvailable')}</p>
      ) : (
        <div className={styles.orderInvoiceCard}>
          <dl className={styles.shipmentFacts}>
            <div className={styles.shipmentFact}>
              <dt>{o('invoice.number')}</dt>
              <dd>{invoice.number}</dd>
            </div>
            {invoice.dated_on && (
              <div className={styles.shipmentFact}>
                <dt>{o('invoice.date')}</dt>
                {/* '2026-10-15' read as a local date, not UTC midnight. */}
                <dd>{day.format(new Date(`${invoice.dated_on}T00:00:00`))}</dd>
              </div>
            )}
          </dl>

          {/* The money lines of a composed invoice. Older invoices have
              none: then only the total. */}
          {invoice.lines?.length > 0 && (
            <ul className={styles.orderInvoiceLines}>
              {invoice.lines.map((line, index) => (
                <li key={index}>
                  <span>{line.description}</span>
                  <span>{money.format(Number(line.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          {invoice.value_eur != null && (
            <p className={styles.orderInvoiceTotal}>
              <span>{o('invoice.total')}</span>
              <span>{money.format(Number(invoice.value_eur))}</span>
            </p>
          )}

          {/* A plain link: the session cookie rides along and the server
              checks the invoice is this customer's before sending the PDF. */}
          {invoice.download_url ? (
            <a className={styles.invoiceDownload} href={invoice.download_url} download>
              <DownloadIcon size={16} /> {o('invoice.download')}
            </a>
          ) : (
            <p className={styles.invoiceMeta}>{o('invoice.noPdf')}</p>
          )}
        </div>
      )}
    </section>
  );
}

/** 2. "Ontvangst in ons magazijn": one row per ordered product. */
function ProductsPart({ products, o }) {
  return (
    <section aria-labelledby="order-products-title">
      <h3 id="order-products-title" className={styles.shipmentSectionTitle}>
        {o('products.title')}
      </h3>
      <p className={styles.docIntro}>{o('products.intro')}</p>

      {products.length === 0 ? (
        <p className={styles.invoiceMessage}>{o('products.empty')}</p>
      ) : (
        <ul className={styles.receiptList}>
          {products.map((product) => (
            <ProductRow key={product.id} product={product} o={o} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One product: its name (and store), the numbers, and the status.
 *
 * The numbers line only shows what is known:
 *   known:                 "5 besteld · 3 ontvangen · 2 nog verwacht"
 *   unknown, ordered known: "5 besteld"
 *   older order:           nothing - just the status and a note
 */
function ProductRow({ product, o }) {
  // An unexpected code from a newer server is shown as "unknown" rather
  // than as a blank label.
  const status = STATUSES.includes(product.status) ? product.status : 'unknown';

  const numbers = [];
  if (product.ordered != null) numbers.push(o('products.ordered', { count: product.ordered }));
  if (status !== 'unknown') {
    numbers.push(o('products.received', { count: product.received }));
    numbers.push(o('products.expected', { count: product.expected }));
  }

  return (
    <li className={styles.receiptRow}>
      <div className={styles.receiptMain}>
        <p className={styles.receiptName}>{product.name}</p>
        {product.store && <p className={styles.invoiceMeta}>{product.store}</p>}
        {numbers.length > 0 && <p className={styles.receiptNumbers}>{numbers.join(' · ')}</p>}
        {status === 'unknown' && <p className={styles.invoiceMeta}>{o('products.unknownNote')}</p>}
      </div>
      <span className={styles.receiptStatus} data-status={status}>
        {o(`status.${status}`)}
      </span>
    </li>
  );
}
