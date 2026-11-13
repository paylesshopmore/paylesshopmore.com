// src/pages/Warehouse/AssignCustomer.jsx
//
// "Whose goods are these?" - finding the customer for one intake sheet and
// putting the goods under them. Three steps, on one page:
//
//   1. SEARCH by customer number, full e-mail address, a tracking / booking /
//      shipment number off the label, or a name.
//   2. CHOOSE from what was found. Each result says how it was found, and a
//      match on name alone is marked "check carefully" - two customers can
//      share a name. Nothing is linked yet.
//   3. CHECK AND CONFIRM: the customer's details, which of their open
//      shipments or bookings the goods go with (or none), and - when
//      changing a customer that was already set - why. Only "Yes, these are
//      X's goods" links anything.
//
// The rules are the server's (backend warehouse/customers.py), so they hold
// whatever this page does: only EXISTING customers, never a new account; a
// shipment or booking must really be that customer's; changing a customer
// that was already set is for managers, with a reason; every assignment is
// recorded. Unsure? "Leave it in the queue" - never guess.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/assign/:sheetId
//   Who can open: everybody in the warehouse; changing an existing customer:
//                 managers and admins
//   Links to:     /warehouse/unassigned, /warehouse/intake?sheet=:id
//   Linked from:  the "Without a customer" queue, warehouse management
//   Backend:      api/staff.js getIntakeSheet, lookupCustomers, assignIntakeCustomer

import { useEffect, useState } from 'react';
import { bookingReference } from '../../utils/bookingReference';
import { Link, useParams } from 'react-router-dom';
import { assignIntakeCustomer, getIntakeSheet, lookupCustomers } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import Loading from '../../components/Loading/Loading';
import { canManageWarehouse } from '../Dashboard/managerAccess';
import { Banner, StatusBadge } from '../Dashboard/ui';
import { usePageText } from '../Dashboard/usePageText';
import styles from '../Dashboard/Dashboard.module.css';
import own from './Manager.module.css';

/** "Found by tracking number, name" in the page's language. */
function useHow() {
  const w = usePageText('warehouseCustomers');
  return (reasons) => reasons.map((reason) => w(`matched.${reason}`)).join(', ');
}

/** The facts on the sheet that help recognise the customer. */
function SheetFacts({ sheet }) {
  const w = usePageText('warehouseCustomers');
  const facts = [
    ['supplier', sheet.supplier],
    ['sender', sheet.sender],
    ['recipient', sheet.recipient],
    ['destination', sheet.destination],
    ['notes', sheet.notes],
  ].filter(([, value]) => value);
  if (facts.length === 0) return null;
  return (
    <section className={own.box} aria-labelledby="sheet-facts">
      <h2 id="sheet-facts" className={own.boxTitle}>
        {w('sheetFacts')} - {sheet.reference || `#${sheet.id}`}
      </h2>
      <dl className={own.facts}>
        {facts.map(([key, value]) => (
          <div key={key}>
            <dt>{w(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function AssignCustomer() {
  const { sheetId } = useParams();
  const { user } = useAuth();
  const w = usePageText('warehouseCustomers');
  const how = useHow();
  const isManager = canManageWarehouse(user);

  // The sheet: { key, sheet, failed } labelled with the id it is for.
  const [loaded, setLoaded] = useState({ key: null, sheet: null, failed: false });
  const sheet = loaded.key === sheetId ? loaded.sheet : null;

  const [query, setQuery] = useState('');
  // The last search: { q, results, tooMany } - or null before the first.
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState(null);
  // 'none' | 'package:<id>' | 'booking:<id>'
  const [link, setLink] = useState('none');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    let live = true;
    getIntakeSheet(Number(sheetId))
      .then((data) => live && setLoaded({ key: sheetId, sheet: data, failed: false }))
      .catch(() => live && setLoaded({ key: sheetId, sheet: null, failed: true }));
    return () => {
      live = false;
    };
  }, [sheetId]);

  if (loaded.key !== sheetId) return <Loading inline />;
  if (loaded.failed || !sheet) return <Banner tone="error">{w('loadFailed')}</Banner>;

  const current = sheet.customer;
  // Already under a customer, and this person may not change it.
  if (current && !isManager && !done) {
    return (
      <div className={own.area}>
        <header className={styles.head}>
          <h1 className={styles.title}>{w('assignTitle')}</h1>
        </header>
        <p className={own.muted}>{w('notAllowedChange', { name: current.name })}</p>
        <Link to="/warehouse/unassigned" className={own.button}>
          {w('queueTitle')}
        </Link>
      </div>
    );
  }

  async function search(event) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    setChosen(null);
    try {
      const result = await lookupCustomers(q);
      setFound({ q, results: result.results, tooMany: result.too_many });
    } catch {
      setError(w('searchFailed'));
    } finally {
      setSearching(false);
    }
  }

  function choose(customer) {
    setChosen(customer);
    setLink('none');
    setError('');
  }

  async function confirm() {
    const [kind, id] = link.split(':');
    setSaving(true);
    setError('');
    try {
      const updated = await assignIntakeCustomer(sheet.id, {
        customer: chosen.id,
        ...(kind === 'package' ? { package: Number(id) } : {}),
        ...(kind === 'booking' ? { booking: Number(id) } : {}),
        // How it was found, for the record: "tracking number: PLS-3001".
        matched_by: `${how(chosen.matched_by)}: ${found.q}`.slice(0, 200),
        ...(current ? { reason: reason.trim() } : {}),
      });
      setDone(updated.customer?.name ?? chosen.name);
    } catch (caught) {
      const fields = caught?.fields ?? {};
      const message = fields.reason ?? fields.customer ?? fields.package ?? fields.booking ?? fields.detail;
      if (caught?.status === 409) setError(w('released'));
      else if (caught?.status === 403) setError(w('notAllowedChange', { name: current?.name ?? '' }));
      else setError(message ? String(Array.isArray(message) ? message[0] : message) : w('failed'));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className={own.area}>
        <Banner tone="success">{w('done', { name: done })}</Banner>
        <p className={own.actions}>
          <Link to="/warehouse/unassigned" className={own.button}>
            {w('queueTitle')}
          </Link>
          <Link to={`/warehouse/intake?sheet=${sheet.id}`} className={own.button}>
            {sheet.reference || `#${sheet.id}`}
          </Link>
        </p>
      </div>
    );
  }

  const changing = Boolean(current);
  const canConfirm = chosen && !saving && (!changing || reason.trim().length > 0);

  return (
    <div className={own.area}>
      <header className={styles.head}>
        <h1 className={styles.title}>{w('assignTitle')}</h1>
        <p className={styles.subtitle}>
          {changing ? w('changeIntro', { name: current.name }) : w('assignIntro')}
        </p>
      </header>

      <SheetFacts sheet={sheet} />

      <Banner tone="error">{error}</Banner>

      {/* 1. Search */}
      <form className={own.searchRow} onSubmit={search} role="search">
        {/* The hint is outside the <label> on purpose: inside it, it would
            become part of the box's name, read out in full every time. */}
        <div className={own.field}>
          <label className={own.fieldLabel} htmlFor="customer-search">
            {w('searchLabel')}
          </label>
          <input
            id="customer-search"
            className={own.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            autoFocus
            aria-describedby="customer-search-hint"
          />
          <span className={own.muted} id="customer-search-hint">
            {w('searchHint')}
          </span>
        </div>
        <button type="submit" className={own.primaryButton} disabled={searching || query.trim().length === 0}>
          {searching ? w('searching') : w('search')}
        </button>
      </form>

      {/* 2. Choose */}
      {found && !chosen && (
        <>
          {found.results.length === 0 && <p className={own.muted}>{w('noResults', { q: found.q })}</p>}
          {found.tooMany && <p className={own.muted}>{w('tooMany')}</p>}
          <ul className={own.list} aria-label={w('searchLabel')}>
            {found.results.map((customer) => (
              <li key={customer.id} className={own.candidate}>
                <span className={own.itemMain}>
                  <span className={own.itemTitle}>
                    {customer.name} · {customer.customer_code}
                  </span>
                  <span className={own.itemNote}>
                    {[customer.email, customer.city].filter(Boolean).join(' · ')}
                  </span>
                  <span className={own.itemNote}>{w('matchedBy', { how: how(customer.matched_by) })}</span>
                </span>
                {customer.exact ? (
                  <StatusBadge tone="done">{w('exact')}</StatusBadge>
                ) : (
                  <StatusBadge tone="progress">{w('nameOnly')}</StatusBadge>
                )}
                <button type="button" className={own.button} onClick={() => choose(customer)}>
                  {w('choose')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 3. Check and confirm */}
      {chosen && (
        <section className={own.box} aria-labelledby="assign-review">
          <h2 id="assign-review" className={own.boxTitle}>
            {w('reviewTitle')}
          </h2>
          {!chosen.exact && <Banner tone="info">{w('nameOnly')}</Banner>}
          <dl className={own.facts}>
            <div>
              <dt>{w('recipient')}</dt>
              <dd>{chosen.name}</dd>
            </div>
            <div>
              <dt>{w('customerNumber')}</dt>
              <dd>{chosen.customer_code}</dd>
            </div>
            <div>
              <dt>{w('email')}</dt>
              <dd>{chosen.email}</dd>
            </div>
            {chosen.city && (
              <div>
                <dt>{w('town')}</dt>
                <dd>{chosen.city}</dd>
              </div>
            )}
          </dl>

          <fieldset className={own.choices}>
            <legend className={own.fieldLabel}>{w('linkTitle')}</legend>
            <label className={own.choice}>
              <input type="radio" name="link" value="none" checked={link === 'none'} onChange={() => setLink('none')} />
              {w('linkNothing')}
            </label>
            {chosen.open_shipments.map((shipment) => (
              <label key={`p${shipment.id}`} className={own.choice}>
                <input
                  type="radio"
                  name="link"
                  value={`package:${shipment.id}`}
                  checked={link === `package:${shipment.id}`}
                  onChange={() => setLink(`package:${shipment.id}`)}
                />
                {w('linkShipment', { number: shipment.tracking_number, stage: shipment.stage_display })}
              </label>
            ))}
            {chosen.open_bookings.map((booking) => (
              <label key={`b${booking.id}`} className={own.choice}>
                <input
                  type="radio"
                  name="link"
                  value={`booking:${booking.id}`}
                  checked={link === `booking:${booking.id}`}
                  onChange={() => setLink(`booking:${booking.id}`)}
                />
                {w('linkBooking', {
                  number: bookingReference(booking),
                  destination: booking.destination ? ` - ${booking.destination}` : '',
                })}
              </label>
            ))}
          </fieldset>

          {changing && (
            <label className={own.field}>
              <span className={own.fieldLabel}>{w('reason')}</span>
              <textarea
                className={own.input}
                value={reason}
                maxLength={500}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}

          <p className={own.actions}>
            <button type="button" className={own.primaryButton} disabled={!canConfirm} onClick={confirm}>
              {saving ? w('confirming') : w('confirm', { name: chosen.name })}
            </button>
            <button type="button" className={own.button} onClick={() => setChosen(null)}>
              {w('back')}
            </button>
          </p>
        </section>
      )}

      <p>
        <Link to="/warehouse/unassigned" className={styles.link}>
          {w('leave')}
        </Link>
      </p>
    </div>
  );
}
