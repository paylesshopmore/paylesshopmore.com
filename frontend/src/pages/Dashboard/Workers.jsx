// src/pages/Dashboard/Workers.jsx
//
// The people who work here: admins, office staff, the warehouse floor and the
// drivers. The same User rows the Customers page lists, from the same
// endpoint — an account is one record whichever page it is opened from — but
// asked for by role, which is the one question that separates a colleague
// from a customer.
//
// Why by role and not by a flag: `is_staff` is the office and Django's own
// /admin/, `is_warehouse` is the floor. A driver carries neither, so a list
// built from the flags would quietly leave the drivers out. The role is the
// single word the two flags are set from, and it is what this page filters,
// groups and sorts by.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/workers
//   Who can open: office staff
//   Links to:     /dashboard/customers
//   Linked from:  the dashboard sidebar, Customers
//   Backend:      api/staff.js

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  WORKER_ROLES,
  createCustomer,
  issueWorkerPin,
  listWorkers,
  resetWorkerPin,
  resetWorkerTwoFactor,
  sendWarehouseSignInCode,
  setCustomerRole,
  setWorkerActive,
  signOutWorkerEverywhere,
  updateCustomer,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { useCollection } from './useCollection';
import { ContactFields, Field } from './PeopleFields';
import { initialsOf, whyRoleIsFixed } from './people';
import { formatDate } from './format';
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
import { translatedOptions, usePageText } from './usePageText';
import { canManageWarehouse, isManagerOnly } from './managerAccess';

/** An empty new-colleague form. Office worker is the common case. */
const BLANK_WORKER = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  role: 'office',
};

/**
 * Opening an account for a new colleague.
 *
 * As on the Customers page there is no password field, and its absence is the
 * feature: the account is created unusable and its owner is e-mailed a link
 * to choose their own, so nobody hands a colleague a password over a desk.
 *
 * Only an admin may hand out a staff role — the server refuses the rest — so
 * the form is not offered to anybody else rather than being offered and
 * refused.
 */
function NewWorkerFields({ onCreate, busy, errors, roles }) {
  const d = usePageText('workers');
  const c = usePageText('common');
  // A warehouse manager can open warehouse worker accounts only, so the form
  // starts on the one role it offers them.
  const blank = roles.some((role) => role.value === BLANK_WORKER.role)
    ? BLANK_WORKER
    : { ...BLANK_WORKER, role: roles[0].value };
  const [draft, setDraft] = useState(blank);

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <form
      className={styles.officeBox}
      onSubmit={(event) => {
        event.preventDefault();
        // Cleared only on success, which is the caller's business: a failed
        // save must not throw away what somebody just typed.
        onCreate(draft, () => setDraft(BLANK_WORKER));
      }}
    >
      <p className={styles.officeHead}>{d('newColleague')}</p>

      <div className={styles.officeGrid}>
        <Field
          label={c('firstName')}
          name="first_name"
          value={draft.first_name}
          onChange={(value) => set('first_name', value)}
          errors={errors}
        />
        <Field
          label={d('lastName')}
          name="last_name"
          value={draft.last_name}
          onChange={(value) => set('last_name', value)}
          errors={errors}
        />
        <Field
          label={c('email')}
          name="email"
          type="email"
          value={draft.email}
          onChange={(value) => set('email', value)}
          errors={errors}
        />
        <Field
          label={c('phone')}
          name="phone_number"
          type="tel"
          value={draft.phone_number}
          onChange={(value) => set('phone_number', value)}
          errors={errors}
        />
        <Field
          label={d('role')}
          name="role"
          value={draft.role}
          onChange={(value) => set('role', value)}
          options={roles}
          errors={errors}
        />
      </div>

      <p className={styles.officeNote}>
        {d(`reach.${draft.role}`)} {d('newNote')}
        {draft.role === 'warehouse' && d('newNoteWarehouse')}
      </p>

      <button type="submit" className={styles.rowButton} disabled={busy}>
        {busy ? d('creating') : d('create')}
      </button>
    </form>
  );
}

/**
 * "Send a warehouse sign-in code": type a worker's e-mail address, and they are
 * e-mailed a four-digit code to sign in with.
 *
 * Meant for a busy floor: no password to remember and no link to find, just
 * four digits read off one screen. It is for warehouse workers only - the
 * server refuses anybody else and says why, which shows under the field.
 * Admin only, like the rest of what hands out access.
 *
 * The code is never shown here. It goes to the worker's inbox, so that sending
 * one is not a way of signing in as them.
 */
function SignInCodeBox({ onSend, busy, errors }) {
  const d = usePageText('workers');
  const [email, setEmail] = useState('');

  return (
    <form
      className={styles.officeBox}
      onSubmit={(event) => {
        event.preventDefault();
        // Cleared only on success, so a refused address can be corrected
        // rather than retyped.
        onSend(email.trim(), () => setEmail(''));
      }}
    >
      <p className={styles.officeHead}>{d('codeHead')}</p>

      <div className={styles.officeGrid}>
        <Field
          label={d('codeEmail')}
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          errors={errors}
        />
      </div>

      <p className={styles.officeNote}>{d('codeNote')}</p>

      <button type="submit" className={styles.rowButton} disabled={busy || !email.trim()}>
        {busy ? d('sending') : d('sendCode')}
      </button>
    </form>
  );
}

/**
 * A sign-in code shown to the admin instead of e-mailed, because the site has
 * no e-mail set up yet (the server decides: signin_codes.code_goes_on_screen).
 * The admin reads it to the worker or hands it over in person.
 *
 * Shown once, until Done: it is a credential, and it should not sit on an
 * open screen longer than it takes to pass on. Once e-mail is set up on the
 * server, codes go by e-mail again and this never appears.
 */
function ShownCode({ email, code, minutes, onDone }) {
  const d = usePageText('workers');
  return (
    <section className={styles.officeBox} role="status" aria-label={d('shownLabel')}>
      <p className={styles.officeHead}>{d('shownHead', { email })}</p>
      <p className={styles.shownCode}>{code}</p>
      <p className={styles.officeNote}>{d('shownNote', { minutes })}</p>
      <button type="button" className={styles.rowButton} onClick={onDone}>
        {d('done')}
      </button>
    </section>
  );
}

/** What went wrong, in words an admin can act on. */
function codeFailureMessage(caught, d) {
  const reason = caught?.fields?.email ?? caught?.fields?.detail;
  if (reason) return String(Array.isArray(reason) ? reason[0] : reason);
  if (caught?.status === 403) return d('codeOnlyAdmin');
  if (caught?.status === 429) return d('codeTooMany');
  return d('codeFailed');
}

/**
 * A PIN just generated for a worker, shown ONCE (Generate PIN, below).
 *
 * The server keeps only a hash of it, so this box is the one place it ever
 * appears: once Done is pressed it is gone, from this screen and for good.
 * The handover steps are on the box itself, because the person reading them
 * is the manager standing next to the worker.
 */
function ShownPin({ name, pin, onDone }) {
  const d = usePageText('workers');
  return (
    <section className={styles.officeBox} role="status" aria-label={d('pinShownLabel')}>
      <p className={styles.officeHead}>{d('pinShownHead', { name })}</p>
      <p className={styles.shownCode}>{pin}</p>
      <ol className={styles.officeNote}>
        <li>{d('pinHandover1', { name })}</li>
        <li>{d('pinHandover2')}</li>
        <li>{d('pinHandover3')}</li>
      </ol>
      <button type="button" className={styles.rowButton} onClick={onDone}>
        {d('pinShownDone')}
      </button>
    </section>
  );
}

export default function Workers() {
  const [params] = useSearchParams();
  // `user` for two things: wording the greyed-out role, and noticing when the
  // row being edited is the account this staff member is signed in as — the
  // header renders from the same copy and would otherwise go stale.
  const { user, refreshUser } = useAuth();
  const d = usePageText('workers');
  const c = usePageText('common');
  // A warehouse manager sees, opens and looks after warehouse workers only -
  // the server narrows the list the same way (staff/views.py CustomerViewSet).
  const managerOnly = isManagerOnly(user);
  const canRunFloor = canManageWarehouse(user);
  const workerRoles = translatedOptions(WORKER_ROLES, c, 'role').filter(
    (role) => !managerOnly || role.value === 'warehouse',
  );

  // `role` empty means every worker role; the filter narrows it to one.
  // listWorkers turns an empty value into the server's `worker` set, so a
  // customer never appears on this page whatever the URL says.
  const list = useCollection(
    listWorkers,
    { role: params.get('role') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [created, setCreated] = useState('');

  // Sending a warehouse worker a sign-in code. `codeBusy` is 'form' while the
  // box is sending, or the worker's id while that row's own button is, so the
  // right button says "Sending…" and the others stay usable.
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeBusy, setCodeBusy] = useState(null);
  const [codeErrors, setCodeErrors] = useState({});
  const [codeSent, setCodeSent] = useState('');
  // A code shown on screen rather than e-mailed, while the site has no mail
  // set up: { email, code, minutes }. See ShownCode below.
  const [shownCode, setShownCode] = useState(null);
  // A PIN just generated: { name, pin }, until Done. See ShownPin.
  const [shownPin, setShownPin] = useState(null);

  async function addWorker(draft, clear) {
    setCreatingBusy(true);
    setCreateErrors({});
    setCreated('');
    setError('');

    try {
      const row = await createCustomer(draft);

      clear();
      setCreating(false);
      setCreated(
        d('created', { name: row.name || row.email, role: c(`role.${row.role}`).toLowerCase(), email: row.email }),
      );
      // A new warehouse worker comes with their first PIN, in this one answer
      // only (the server never sends it again): shown once, to hand over.
      if (row.initial_pin) {
        setShownPin({ name: row.name || row.email, pin: row.initial_pin });
      }
      // Refetched rather than spliced in: the list is sorted and paged by the
      // server, and a row pushed onto the front of page three would sit
      // somewhere it does not belong.
      list.reload();
    } catch (caught) {
      if (caught?.fields) setCreateErrors(caught.fields);
      else if (caught?.status === 403)
        setError(d('createOnlyAdmin'));
      else setError(d('createFailed'));
    } finally {
      setCreatingBusy(false);
    }
  }

  async function sendCode(email, source, clear) {
    setCodeBusy(source);
    setCodeErrors({});
    setCodeSent('');
    setShownCode(null);
    setCreated('');
    setError('');

    try {
      const result = await sendWarehouseSignInCode(email);

      clear?.();
      if (result.delivery === 'screen') {
        setShownCode({
          email: result.sent_to,
          code: result.code,
          minutes: result.expires_in_minutes,
        });
      } else {
        setCodeSent(d('codeSent', { email: result.sent_to, minutes: result.expires_in_minutes }));
      }
    } catch (caught) {
      // The box has a field to put the reason under; a row's button does not,
      // so its refusal goes in the banner above the table.
      if (source === 'form' && caught?.fields?.email) setCodeErrors(caught.fields);
      else setError(codeFailureMessage(caught, d));
    } finally {
      setCodeBusy(null);
    }
  }

  // Takes a worker's floor PIN away at once - for one that is locked, or that
  // somebody else may have seen. They set a new one after an e-mailed code.
  async function resetPin(worker) {
    if (!window.confirm(d('resetConfirm', { name: worker.name }))) {
      return;
    }
    setCodeBusy(`pin-${worker.id}`);
    setError('');
    setCodeSent('');
    setCreated('');
    try {
      await resetWorkerPin(worker.id);
      setCodeSent(d('pinReset', { name: worker.name }));
      list.reload();
    } catch (caught) {
      setError(
        caught?.status === 403
          ? d('resetOnlyAdmin')
          : d('resetFailed'),
      );
    } finally {
      setCodeBusy(null);
    }
  }

  // Generates a new PIN and shows it once. Replaces any PIN they had, at once,
  // so it asks first when there is one (a working PIN is about to stop).
  async function generatePin(worker) {
    const replacing = worker.pin_status !== 'none';
    if (replacing && !window.confirm(d('generateConfirm', { name: worker.name }))) {
      return;
    }
    setCodeBusy(`issue-${worker.id}`);
    setError('');
    setCodeSent('');
    setCreated('');
    setShownCode(null);
    try {
      const result = await issueWorkerPin(worker.id);
      setShownPin({ name: worker.name, pin: result.pin });
      list.reload();
    } catch (caught) {
      const reason = caught?.fields?.detail;
      setError(reason ? String(reason) : d('generateFailed'));
    } finally {
      setCodeBusy(null);
    }
  }

  // Switching an account off ends every session it has, at once; on again
  // lets it sign in as before. Nothing about the account is deleted.
  async function setActive(worker, active) {
    if (!active && !window.confirm(d('deactivateConfirm', { name: worker.name }))) {
      return;
    }
    setCodeBusy(`active-${worker.id}`);
    setError('');
    setCodeSent('');
    setCreated('');
    try {
      list.replaceRow(await setWorkerActive(worker.id, active));
      setCodeSent(d(active ? 'activated' : 'deactivated', { name: worker.name }));
    } catch (caught) {
      setError(caught?.status === 403 ? d('activeRefused') : d('activeFailed'));
    } finally {
      setCodeBusy(null);
    }
  }

  // Ends every session the account has (a lost phone, a computer left signed
  // in). The account stays switched on; its owner simply signs in again.
  async function signOutEverywhere(worker) {
    if (!window.confirm(d('signOutConfirm', { name: worker.name }))) {
      return;
    }
    setCodeBusy(`out-${worker.id}`);
    setError('');
    setCodeSent('');
    setCreated('');
    try {
      list.replaceRow(await signOutWorkerEverywhere(worker.id));
      setCodeSent(d('signedOut', { name: worker.name }));
    } catch (caught) {
      setError(caught?.status === 403 ? d('activeRefused') : d('activeFailed'));
    } finally {
      setCodeBusy(null);
    }
  }

  // Removes a colleague's authenticator app (lost or new phone). Their next
  // sign-in asks them to set it up again. Admins only.
  async function resetTwoFactor(worker) {
    if (!window.confirm(d('resetTwoFactorConfirm', { name: worker.name }))) {
      return;
    }
    setCodeBusy(`2fa-${worker.id}`);
    setError('');
    setCodeSent('');
    setCreated('');
    try {
      await resetWorkerTwoFactor(worker.id);
      setCodeSent(d('twoFactorReset', { name: worker.name }));
      list.reload();
    } catch {
      setError(d('resetTwoFactorFailed'));
    } finally {
      setCodeBusy(null);
    }
  }

  async function changeRole(worker, role) {
    setSavingId(worker.id);
    setError('');

    try {
      const row = await setCustomerRole(worker.id, role);

      // Moving somebody to Customer takes them off this page altogether, so
      // the list is refetched rather than the row swapped in — leaving a
      // customer sitting in a table of colleagues is the one thing this page
      // exists to prevent.
      if (row.role === 'customer') list.reload();
      else list.replaceRow(row);
    } catch (caught) {
      setError(
        caught?.status === 403
          ? d('roleRefused')
          : d('saveFailed'),
      );
    } finally {
      setSavingId(null);
    }
  }

  /** Saves the contact details, and answers with the whole row. */
  async function save(worker, write) {
    setSavingId(worker.id);
    setError('');
    setFieldErrors({});

    try {
      list.replaceRow(await write());

      // Editing your own row means editing the account you are signed in as.
      if (user?.id === worker.id) await refreshUser();
    } catch (caught) {
      if (caught?.fields) setFieldErrors(caught.fields);

      setError(
        caught?.fields
          ? d('saveRefused')
          : d('saveFailed'),
      );
    } finally {
      setSavingId(null);
    }
  }

  function toggle(worker) {
    setFieldErrors({});
    setError('');
    setOpenId((current) => (current === worker.id ? null : worker.id));
  }

  const open = list.rows.find((worker) => worker.id === openId) ?? null;

  // The rows in role order, widest access first, with an empty role dropped
  // rather than left as a heading over nothing. The server pages the list, so
  // this groups the page it sent rather than the whole table — which is the
  // honest thing to show: a count here is a count of what is on screen.
  const groups = workerRoles.map((role) => ({
    ...role,
    rows: list.rows.filter((worker) => worker.role === role.value),
  })).filter((group) => group.rows.length > 0);

  return (
    <>
      {/* data-tour hooks: this page's tour ("dashboardWorkers" in
          components/Tutorial/tutorialSteps.js) points at these. */}
      <header className={styles.head} data-tour="db-workers-intro">
        <h1 className={styles.title}>{d('title')}</h1>
        {managerOnly ? (
          <p className={styles.subtitle}>{d('managerSubtitle')}</p>
        ) : (
          <p className={styles.subtitle}>
            {d('subtitleBefore')}{' '}
            <Link className={styles.link} to="/dashboard/customers">
              {d('customersLink')}
            </Link>
            {d('subtitleAfter')}
          </p>
        )}
      </header>

      <Toolbar tour="db-workers-filters">
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={d('searchLabel')}
          placeholder={d('searchPlaceholder')}
        />
        {!managerOnly && (
          <FilterSelect
            label={d('role')}
            value={list.filters.role}
            onChange={(value) => list.setFilter('role', value)}
            options={workerRoles}
            allLabel={d('allWorkers')}
          />
        )}
        {canRunFloor && (
          <button
            type="button"
            className={styles.newButton}
            data-tour="db-workers-new"
            onClick={() => {
              setCreating((isOpen) => !isOpen);
              setCreateErrors({});
              setCreated('');
            }}
          >
            {creating ? d('cancel') : d('newColleague')}
          </button>
        )}
        {canRunFloor && (
          <button
            type="button"
            className={styles.newButton}
            data-tour="db-workers-code"
            onClick={() => {
              setCodeOpen((isOpen) => !isOpen);
              setCodeErrors({});
              setCodeSent('');
            }}
          >
            {codeOpen ? d('cancel') : d('sendSignInCode')}
          </button>
        )}
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{created}</Banner>
      <Banner tone="success">{codeSent}</Banner>
      {shownCode && <ShownCode {...shownCode} onDone={() => setShownCode(null)} />}
      {shownPin && <ShownPin {...shownPin} onDone={() => setShownPin(null)} />}

      {creating && (
        <NewWorkerFields onCreate={addWorker} busy={creatingBusy} errors={createErrors} roles={workerRoles} />
      )}

      {codeOpen && canRunFloor && (
        <SignInCodeBox
          onSend={(email, clear) => sendCode(email, 'form', clear)}
          busy={codeBusy === 'form'}
          errors={codeErrors}
        />
      )}

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{d('noMatch')}</Empty>
        ) : (
          <div className={styles.tableWrap} data-tour="db-workers-table">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{d('colId')}</th>
                  <th scope="col">{d('colWorker')}</th>
                  <th scope="col">{d('colUsername')}</th>
                  <th scope="col">{d('colEmail')}</th>
                  <th scope="col">{d('colPhone')}</th>
                  <th scope="col">{d('colJoined')}</th>
                  <th scope="col">{d('colLastLogin')}</th>
                  <th scope="col">{d('colRole')}</th>
                </tr>
              </thead>

              {/* One tbody per role rather than one table per role: the
                  columns stay lined up down the whole page, which is what
                  makes four groups readable as one list. */}
              {groups.map((group) => (
                <tbody key={group.value}>
                  <tr className={styles.groupRow}>
                    <td colSpan={8}>
                      <span className={styles.groupLabel}>
                        {group.label}
                        <span className={styles.groupCount}>
                          {group.rows.length} — {d(`reach.${group.value}`)}
                        </span>
                      </span>
                    </td>
                  </tr>

                  {group.rows.map((worker) => (
                    <tr key={worker.id}>
                      {/* The database id: what the Django admin, the API and a
                          support conversation all refer to an account by. */}
                      <td className={styles.numberCell}>
                        <span className={styles.mono}>{worker.id}</span>
                      </td>

                      <td>
                        <div className={styles.person}>
                          <span className={styles.personAvatar} aria-hidden="true">
                            {initialsOf(worker.name)}
                          </span>
                          <div>
                            <div className={styles.primaryCell}>{worker.name}</div>
                            <div className={styles.tagRow}>
                              {worker.is_superuser && (
                                <StatusBadge tone="progress">{d('superuser')}</StatusBadge>
                              )}
                              {user?.id === worker.id && (
                                <StatusBadge tone="neutral">{d('you')}</StatusBadge>
                              )}
                              {worker.is_erased && <StatusBadge tone="off">{d('erased')}</StatusBadge>}
                              {/* The floor PIN: whether they can sign in on a
                                  shared device by name, and whether too many
                                  wrong tries have locked it. Never the PIN. */}
                              {worker.pin_status === 'set' && (
                                <StatusBadge tone="neutral">{d('pinSet')}</StatusBadge>
                              )}
                              {worker.pin_status === 'none' && (
                                <StatusBadge tone="progress">{d('noPin')}</StatusBadge>
                              )}
                              {worker.pin_status === 'locked' && (
                                <StatusBadge tone="off">{d('pinLocked')}</StatusBadge>
                              )}
                              {/* Generated by a manager; the worker has not yet
                                  chosen their own. */}
                              {worker.pin_status === 'issued' && (
                                <StatusBadge tone="progress">{d('pinIssued')}</StatusBadge>
                              )}
                              {/* Whether their authenticator app (two-factor
                                  sign-in) is set up. "Not set up" only while
                                  the admin has two-factor switched on at all,
                                  and only for admins and office staff - for a
                                  floor worker it would be noise. */}
                              {worker.two_factor === 'on' && (
                                <StatusBadge tone="done">{d('twoFactorOn')}</StatusBadge>
                              )}
                              {worker.two_factor === 'off' &&
                                user?.twoFactorMode !== 'disabled' &&
                                ['admin', 'office', 'manager'].includes(worker.role) && (
                                  <StatusBadge tone="progress">{d('twoFactorOff')}</StatusBadge>
                                )}
                              {/* An account that still holds a role but can no
                                  longer sign in. Worth saying out loud here:
                                  it looks like a working colleague in every
                                  other column. */}
                              {!worker.is_active && !worker.is_erased && (
                                <StatusBadge tone="off">{d('cannotSignIn')}</StatusBadge>
                              )}
                            </div>
                            {!worker.is_erased && (
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => toggle(worker)}
                              >
                                {openId === worker.id ? d('close') : d('editDetails')}
                              </button>
                            )}
                            {/* One click on a busy morning: the worker's own
                                address is already on the row. Only for a
                                warehouse account that can sign in - the same
                                rule the server applies - and only to an
                                admin or warehouse manager, the two it works for. */}
                            {canRunFloor &&
                              worker.role === 'warehouse' &&
                              worker.is_active &&
                              !worker.is_erased &&
                              worker.email && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  aria-label={d('sendCodeLabel', { name: worker.name })}
                                  disabled={codeBusy === worker.id}
                                  onClick={() => sendCode(worker.email, worker.id)}
                                >
                                  {codeBusy === worker.id ? d('sending') : d('sendSignInCode')}
                                </button>
                              )}
                            {canRunFloor &&
                              (worker.pin_status === 'set' || worker.pin_status === 'locked') && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  aria-label={d('resetLabel', { name: worker.name })}
                                  disabled={codeBusy === `pin-${worker.id}`}
                                  onClick={() => resetPin(worker)}
                                >
                                  {codeBusy === `pin-${worker.id}` ? d('resetting') : d('resetPin')}
                                </button>
                              )}
                            {/* A new PIN, shown once, to hand over in person.
                                Also how a locked, forgotten or seen PIN is
                                replaced. Warehouse workers only (the server
                                refuses everyone else). */}
                            {canRunFloor &&
                              worker.role === 'warehouse' &&
                              worker.is_active &&
                              !worker.is_erased && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  aria-label={d('generateLabel', { name: worker.name })}
                                  disabled={codeBusy === `issue-${worker.id}`}
                                  onClick={() => generatePin(worker)}
                                >
                                  {codeBusy === `issue-${worker.id}`
                                    ? d('generating')
                                    : worker.pin_status === 'none'
                                      ? d('generatePin')
                                      : d('generateNewPin')}
                                </button>
                              )}
                            {/* Switch off / on. An admin for anybody but
                                themselves and superusers; a manager for the
                                warehouse workers they see. The server checks
                                the same. */}
                            {(user?.isAdmin || managerOnly) &&
                              user?.id !== worker.id &&
                              !worker.is_superuser &&
                              !worker.is_erased && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  aria-label={d(worker.is_active ? 'deactivateLabel' : 'activateLabel', {
                                    name: worker.name,
                                  })}
                                  disabled={codeBusy === `active-${worker.id}`}
                                  onClick={() => setActive(worker, !worker.is_active)}
                                >
                                  {d(worker.is_active ? 'deactivate' : 'activate')}
                                </button>
                              )}
                            {/* Sign out everywhere: same people as the switch
                                above, while the account is on. */}
                            {(user?.isAdmin || managerOnly) &&
                              user?.id !== worker.id &&
                              !worker.is_superuser &&
                              !worker.is_erased &&
                              worker.is_active && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  aria-label={d('signOutLabel', { name: worker.name })}
                                  disabled={codeBusy === `out-${worker.id}`}
                                  onClick={() => signOutEverywhere(worker)}
                                >
                                  {d('signOutEverywhere')}
                                </button>
                              )}
                            {/* A colleague with a lost or new phone: their
                                next sign-in sets the app up again. Admins
                                only, never their own (the server agrees). */}
                            {user?.isAdmin && worker.two_factor === 'on' && user?.id !== worker.id && (
                              <button
                                type="button"
                                className={styles.linkButton}
                                aria-label={d('resetTwoFactorLabel', { name: worker.name })}
                                disabled={codeBusy === `2fa-${worker.id}`}
                                onClick={() => resetTwoFactor(worker)}
                              >
                                {codeBusy === `2fa-${worker.id}` ? d('resetting') : d('resetTwoFactor')}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className={styles.mutedCell}>
                        <span className={styles.mono}>{worker.username}</span>
                      </td>

                      <td className={styles.contactCell}>
                        {worker.email ? (
                          <a className={styles.link} href={`mailto:${worker.email}`}>
                            {worker.email}
                          </a>
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}
                      </td>

                      <td className={styles.contactCell}>
                        {worker.phone_number ? (
                          <a className={styles.link} href={`tel:${worker.phone_number}`}>
                            {worker.phone_number}
                          </a>
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}
                      </td>

                      <td className={styles.dateCell}>{formatDate(worker.date_joined)}</td>
                      <td className={styles.dateCell}>
                        {worker.last_login ? formatDate(worker.last_login) : d('neverSignedIn')}
                      </td>

                      <td>
                        {/* can_change_role comes from the server, which
                            refuses the same cases itself — your own account, a
                            superuser, an erased row, a caller who is not an
                            admin. Disabling the select is only so nobody
                            presses a control that was always going to be
                            refused. Moving somebody to Customer here is how
                            they leave this page. */}
                        {worker.can_change_role ? (
                          <StatusSelect
                            label={d('roleFor', { name: worker.name })}
                            value={worker.role}
                            options={[...workerRoles, { value: 'customer', label: c('role.customer') }]}
                            busy={savingId === worker.id}
                            onChange={(value) => changeRole(worker, value)}
                          />
                        ) : (
                          <div className={styles.mutedCell}>
                            <div>{c(`role.${worker.role}`)}</div>
                            <div className={styles.roleReason}>
                              {whyRoleIsFixed(worker, user?.id === worker.id, c)}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ))}

      {/* The edit form below the table rather than inside it: a form crammed
          into a table cell is unusable. Keyed by the worker, so switching rows
          rebuilds the draft instead of carrying one person's half-typed
          e-mail onto another's row.

          No address box here, unlike Customers: a colleague's delivery
          address is not something the office has any business editing from a
          staff list. If they also ship with us, that is their own profile. */}
      {open && (
        <section key={open.id} className={styles.detail}>
          <h2 className={styles.detailTitle}>
            {open.name}
            {user?.id === open.id && (
              <span className={styles.roleReason}>{d('ownAccount')}</span>
            )}
          </h2>

          {/* Keyed on the stored values, so a save the server tidied — a
              lowercased e-mail — leaves the form showing what was actually
              stored rather than what was typed. */}
          <ContactFields
            key={`${open.first_name}|${open.last_name}|${open.email}|${open.phone_number}`}
            customer={open}
            busy={savingId === open.id}
            errors={fieldErrors}
            onSave={(changes) => save(open, () => updateCustomer(open.id, changes))}
          />
        </section>
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
