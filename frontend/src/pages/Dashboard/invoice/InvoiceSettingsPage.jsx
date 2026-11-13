// src/pages/Dashboard/invoice/InvoiceSettingsPage.jsx
//
// THE INVOICE SETTINGS PAGE: /dashboard/invoices/settings
//
// Where an admin configures everything about invoices that is a business
// decision rather than code:
//
//   Bedrijf       the company details printed on every invoice: name,
//                 address, KVK, BTW, IBAN, e-mail, website, phone
//   Nummering     how invoice numbers look (PLSM + 2026 + 0012)
//   BTW           the standard rate and the export rate
//   Verzekering   the premium rule (empty = typed by hand on each invoice)
//   Teksten       payment instructions, conditions, exclusions, small print
//   Havens        the Laadhaven / Loshaven lists
//   Kosten        the charges offered in the editor
//
// Everyone on staff can OPEN this page (to see the settings); only an admin
// can CHANGE anything. The server enforces that (staff/invoice_config.py) -
// the disabled inputs here are only so nobody types into a form that will be
// refused.
//
// Changes apply to invoices written from now on. Invoices already written
// keep the wording they were created with.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteChargeType,
  deletePort,
  getInvoiceConfig,
  saveChargeType,
  saveInvoiceSettings,
  savePort,
} from '../../../api/invoiceEditor';
import { BootstrapScope, Field } from './ui';
import { useInvoiceText } from './useInvoiceText';

// The configurable texts, in the order they appear on the invoice. Their
// labels are under settings.text.<name> in invoiceTranslations.js, and some
// have a hint under settings.textHint.<name>.
const TEXTS = [
  'payment_instructions',
  'terms_intro',
  'terms_items',
  'exclusions_title',
  'exclusions_items',
  'export_vat_note',
  'footer_text',
];
const TEXTS_WITH_HINT = ['payment_instructions', 'terms_intro', 'terms_items', 'export_vat_note'];

const FREIGHTS = ['sea', 'air', 'both'];

// The company details, in the order they are printed on the invoice. Labels
// are under settings.company.<name> in invoiceTranslations.js.
const COMPANY_FIELDS = ['name', 'street', 'postcode_city', 'kvk', 'vat', 'iban', 'email', 'website', 'phone'];

/** The server's error answer as one readable sentence. */
function explain(failure, tr) {
  const fields = failure?.fields;
  if (failure?.status === 403) return tr('settings.adminOnly');
  if (fields && typeof fields === 'object') {
    // Company errors come back one level deeper: { company: { iban: [...] } }.
    const flat = Object.entries(fields).flatMap(([name, message]) =>
      message && typeof message === 'object' && !Array.isArray(message)
        ? Object.entries(message).map(([inner, text]) => [inner, text])
        : [[name, message]],
    );
    return flat.map(([name, message]) => `${name}: ${[message].flat().join(' ')}`).join(' · ');
  }
  return tr('settings.saveFailed');
}

/**
 * A table of rows (ports or charge types) that an admin can edit in place.
 * Each row has its own Save and Delete buttons.
 */
function EditableTable({ title, rows, columns, blank, onSave, onDelete, canEdit }) {
  const tr = useInvoiceText();
  const [drafts, setDrafts] = useState(rows);
  const [message, setMessage] = useState('');

  function change(index, field, value) {
    setDrafts((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function save(index) {
    setMessage('');
    try {
      const saved = await onSave(drafts[index]);
      setDrafts((current) => current.map((row, i) => (i === index ? saved : row)));
      setMessage(tr('settings.savedRow', { name: saved.name }));
    } catch (failure) {
      setMessage(explain(failure, tr));
    }
  }

  async function remove(index) {
    const row = drafts[index];
    setMessage('');
    try {
      if (row.id) await onDelete(row.id);
      setDrafts((current) => current.filter((_, i) => i !== index));
    } catch (failure) {
      setMessage(explain(failure, tr));
    }
  }

  // The column heading, in the chosen language.
  const heading = (column) => tr(`settings.column.${column.label}`);

  return (
    <section className="mb-5">
      <h2 className="invoice-section-title">{title}</h2>
      {message && <div className="alert alert-info py-2 small">{message}</div>}
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.field} scope="col" className="small">
                  {heading(column)}
                </th>
              ))}
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((row, index) => (
              <tr key={row.id ?? `new-${index}`}>
                {columns.map((column) => (
                  <td key={column.field}>
                    {column.type === 'checkbox' && (
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={`${heading(column)} ${row.name}`}
                        checked={Boolean(row[column.field])}
                        disabled={!canEdit}
                        onChange={(event) => change(index, column.field, event.target.checked)}
                      />
                    )}
                    {column.type === 'freight' && (
                      <select
                        className="form-select form-select-sm"
                        aria-label={`${heading(column)} ${row.name}`}
                        value={row[column.field]}
                        disabled={!canEdit}
                        onChange={(event) => change(index, column.field, event.target.value)}
                      >
                        {FREIGHTS.map((value) => (
                          <option key={value} value={value}>
                            {tr(`settings.freight.${value}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    {(column.type === 'text' || column.type === 'number') && (
                      <input
                        className="form-control form-control-sm"
                        aria-label={`${heading(column)} ${row.name}`}
                        inputMode={column.type === 'number' ? 'decimal' : undefined}
                        value={row[column.field] ?? ''}
                        disabled={!canEdit}
                        onChange={(event) =>
                          change(index, column.field, column.type === 'number' && event.target.value === '' ? null : event.target.value)
                        }
                      />
                    )}
                  </td>
                ))}
                <td className="text-end text-nowrap">
                  {canEdit && (
                    <>
                      <button type="button" className="btn btn-sm btn-primary me-1" onClick={() => save(index)}>
                        {tr('settings.save')}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(index)}>
                        {tr('settings.delete')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setDrafts([...drafts, { ...blank }])}>
          {tr('settings.add')}
        </button>
      )}
    </section>
  );
}

export default function InvoiceSettingsPage() {
  const tr = useInvoiceText();
  const [config, setConfig] = useState(null);
  const [settings, setSettings] = useState(null);
  const [company, setCompany] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [message, setMessage] = useState(null); // { kind, text }

  useEffect(() => {
    getInvoiceConfig()
      .then((loaded) => {
        setConfig(loaded);
        setSettings(loaded.settings);
        setCompany(loaded.company);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') {
    return (
      <BootstrapScope>
        <p className="text-muted">{tr('common.loading')}</p>
      </BootstrapScope>
    );
  }
  if (state === 'error') {
    return (
      <BootstrapScope>
        <div className="alert alert-danger">{tr('settings.loadFailed')}</div>
      </BootstrapScope>
    );
  }

  const canEdit = config.permissions.can_configure;
  const set = (field, value) => setSettings((current) => ({ ...current, [field]: value }));

  async function saveSettings(event) {
    event.preventDefault();
    setMessage(null);
    try {
      // Empty boxes for optional numbers are sent as null ("not set").
      // The company details travel with the rest; the server saves both, or
      // neither when something is wrong.
      const body = { ...settings, company };
      for (const field of ['insurance_rate_percent', 'insurance_minimum']) {
        if (body[field] === '') body[field] = null;
      }
      delete body.next_number;
      // The counter is sent ONLY when the admin changed it. The page sends the
      // whole form back, and an untouched counter could be out of date by now
      // (an invoice may have been saved while this page was open): sending it
      // would quietly move the numbering backwards.
      const typed = body.next_sequence;
      const untouched = Number(typed) === Number(config.settings.next_sequence);
      if (typed === '' || typed === null || typed === undefined || untouched) {
        delete body.next_sequence;
      } else {
        body.next_sequence = Number(typed);
      }
      const saved = await saveInvoiceSettings(body);
      setConfig(saved);
      setSettings(saved.settings);
      setCompany(saved.company);
      setMessage({ kind: 'success', text: tr('settings.saved') });
    } catch (failure) {
      setMessage({ kind: 'danger', text: explain(failure, tr) });
    }
  }

  const input = (field, extra = {}) => (props) => (
    <input
      {...props}
      value={settings[field] ?? ''}
      disabled={!canEdit}
      onChange={(event) => set(field, event.target.value)}
      {...extra}
    />
  );

  return (
    <BootstrapScope>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h3 mb-0">{tr('settings.title')}</h1>
        <Link className="btn btn-sm btn-outline-secondary" to="/dashboard/invoices">
          {tr('common.back')}
        </Link>
      </div>

      {!canEdit && (
        <div className="alert alert-info">{tr('settings.viewOnly')}</div>
      )}

      <form onSubmit={saveSettings} className="mb-5" style={{ maxWidth: '60rem' }}>
        <h2 className="invoice-section-title">{tr('settings.company.title')}</h2>
        <p className="small text-muted">{tr('settings.company.hint')}</p>
        <div className="row g-3 mb-2">
          {COMPANY_FIELDS.map((field) => (
            <div key={field} className={field === 'name' ? 'col-12' : 'col-sm-6 col-lg-4'}>
              <Field label={tr(`settings.company.${field}`)}>
                {(props) => (
                  <input
                    {...props}
                    type={field === 'email' ? 'email' : 'text'}
                    value={company[field] ?? ''}
                    disabled={!canEdit}
                    onChange={(event) => setCompany((current) => ({ ...current, [field]: event.target.value }))}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>

        <h2 className="invoice-section-title mt-4">{tr('settings.numbering')}</h2>
        <div className="row g-3">
          <div className="col-sm-4">
            <Field label={tr('settings.prefix')}>{input('number_prefix', { maxLength: 10 })}</Field>
          </div>
          <div className="col-sm-4">
            <Field label={tr('settings.digits')} hint={tr('settings.digitsHint')}>
              {input('number_digits', { type: 'number', min: 1, max: 8 })}
            </Field>
          </div>
          <div className="col-sm-4 d-flex align-items-center">
            <div className="form-check">
              <input
                id="include-year"
                type="checkbox"
                className="form-check-input"
                checked={settings.number_include_year}
                disabled={!canEdit}
                onChange={(event) => set('number_include_year', event.target.checked)}
              />
              <label className="form-check-label" htmlFor="include-year">
                {tr('settings.includeYear')}
              </label>
            </div>
          </div>
        </div>
        {/* Where the numbering carries on from. */}
        <div className="row g-3 mt-0">
          <div className="col-sm-6 col-lg-4">
            <Field label={tr('settings.nextSequence')} hint={tr('settings.nextSequenceHint')}>
              {input('next_sequence', { type: 'number', min: 1, max: 99999999, inputMode: 'numeric' })}
            </Field>
          </div>
        </div>
        <p className="small text-muted">
          {tr('settings.nextNumber')} <strong>{config.settings.next_number}</strong>. {tr('settings.counterHint')}
        </p>

        <h2 className="invoice-section-title mt-4">{tr('settings.vat')}</h2>
        <div className="row g-3">
          <div className="col-sm-6">
            <Field label={tr('settings.standardRate')} hint={tr('settings.standardRateHint')}>
              {input('standard_vat_rate', { inputMode: 'decimal' })}
            </Field>
          </div>
          <div className="col-sm-6">
            <Field label={tr('settings.exportRate')} hint={tr('settings.exportRateHint')}>
              {input('export_vat_rate', { inputMode: 'decimal' })}
            </Field>
          </div>
        </div>

        <h2 className="invoice-section-title mt-4">{tr('settings.insurance')}</h2>
        <div className="row g-3">
          <div className="col-sm-6">
            <Field label={tr('settings.rate')} hint={tr('settings.rateHint')}>
              {input('insurance_rate_percent', { inputMode: 'decimal' })}
            </Field>
          </div>
          <div className="col-sm-6">
            <Field label={tr('settings.minimum')}>{input('insurance_minimum', { inputMode: 'decimal' })}</Field>
          </div>
        </div>

        <h2 className="invoice-section-title mt-4">{tr('settings.texts')}</h2>
        <p className="small text-muted">{tr('settings.textsHint')}</p>
        {TEXTS.map((field) => (
          <Field
            key={field}
            label={tr(`settings.text.${field}`)}
            hint={TEXTS_WITH_HINT.includes(field) ? tr(`settings.textHint.${field}`) : undefined}
          >
            {(props) => (
              <textarea
                {...props}
                rows={field.endsWith('items') || field === 'footer_text' ? 4 : 2}
                value={settings[field] ?? ''}
                disabled={!canEdit}
                onChange={(event) => set(field, event.target.value)}
              />
            )}
          </Field>
        ))}

        {message && <div className={`alert alert-${message.kind}`}>{message.text}</div>}
        {canEdit && (
          <button type="submit" className="btn btn-primary">
            {tr('settings.saveSettings')}
          </button>
        )}
      </form>

      <EditableTable
        title={tr('settings.ports')}
        rows={config.ports}
        canEdit={canEdit}
        blank={{ name: '', freight: 'sea', for_loading: false, for_discharge: true, destination_code: '', is_default: false, position: 0, active: true }}
        columns={[
          // `label` is a key under settings.column in invoiceTranslations.js.
          { field: 'name', label: 'name', type: 'text' },
          { field: 'freight', label: 'freight', type: 'freight' },
          { field: 'for_loading', label: 'for_loading', type: 'checkbox' },
          { field: 'for_discharge', label: 'for_discharge', type: 'checkbox' },
          { field: 'destination_code', label: 'destination_code', type: 'text' },
          { field: 'is_default', label: 'is_default', type: 'checkbox' },
          { field: 'active', label: 'active', type: 'checkbox' },
        ]}
        onSave={savePort}
        onDelete={deletePort}
      />

      <EditableTable
        title={tr('settings.charges')}
        rows={config.charge_types}
        canEdit={canEdit}
        blank={{ name: '', freight: 'both', default_amount: null, position: 0, active: true }}
        columns={[
          { field: 'name', label: 'description', type: 'text' },
          { field: 'freight', label: 'freight', type: 'freight' },
          { field: 'default_amount', label: 'default_amount', type: 'number' },
          { field: 'position', label: 'position', type: 'number' },
          { field: 'active', label: 'active', type: 'checkbox' },
        ]}
        onSave={saveChargeType}
        onDelete={deleteChargeType}
      />
    </BootstrapScope>
  );
}
