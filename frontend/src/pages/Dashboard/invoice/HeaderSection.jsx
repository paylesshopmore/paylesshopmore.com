// src/pages/Dashboard/invoice/HeaderSection.jsx
//
// STEP 2: THE INVOICE HEADER - number, date, and who it is for.
//
// THE INVOICE NUMBER
//   A NEW invoice starts with the number it will probably get (say
//   PLSM20260015). You may type another one - to carry on from invoices
//   written somewhere else. Left as suggested, the server hands out the next
//   number itself at the moment of saving (so two people can never get the
//   same number); a number you typed is checked for duplicates.
//   A SAVED invoice keeps its number: it is on the customer's document and in
//   the books, so it is shown but cannot be changed here.
//
// Props used by every section component in this folder:
//   form      the whole form object (see emptyForm in invoiceForm.js)
//   update    update({ field: value }) changes one or more fields
//   errors    { field: "message" } from validate(), shown under each field
//   disabled  true when the invoice can no longer be changed

import { Field } from './ui';
import { useInvoiceText } from './useInvoiceText';

export default function HeaderSection({ form, update, errors, disabled }) {
  const tr = useInvoiceText();
  return (
    <section aria-labelledby="header-title" className="mb-4">
      <h2 id="header-title" className="invoice-section-title">
        {tr('header.title')}
      </h2>

      <div className="row g-3">
        <div className="col-sm-6 col-lg-3">
          {form.invoiceId ? (
            <Field label={tr('header.number')}>
              {(props) => <input {...props} value={form.number || '—'} readOnly disabled />}
            </Field>
          ) : (
            <Field label={tr('header.number')} hint={tr('header.numberHintEditable')} error={errors.number}>
              {(props) => (
                <input
                  {...props}
                  value={form.number}
                  placeholder={form.suggestedNumber}
                  disabled={disabled}
                  maxLength={30}
                  autoComplete="off"
                  onChange={(event) => update({ number: event.target.value })}
                />
              )}
            </Field>
          )}
        </div>
        <div className="col-sm-6 col-lg-3">
          <Field label={tr('header.date')} error={errors.invoice_date}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={form.invoice_date}
                disabled={disabled}
                onChange={(event) => update({ invoice_date: event.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="col-sm-6 col-lg-3">
          <Field label={tr('header.shipmentNumber')}>
            {(props) => (
              <input
                {...props}
                value={form.shipment_number}
                disabled={disabled}
                maxLength={50}
                onChange={(event) => update({ shipment_number: event.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="col-sm-6 col-lg-3">
          <Field label={tr('header.relationNumber')}>
            {(props) => (
              <input
                {...props}
                value={form.relation_number}
                disabled={disabled}
                maxLength={50}
                onChange={(event) => update({ relation_number: event.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="col-md-8">
          <Field label={tr('header.billTo')}>
            {(props) => (
              <textarea
                {...props}
                rows={3}
                value={form.bill_to}
                disabled={disabled}
                maxLength={1000}
                onChange={(event) => update({ bill_to: event.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="col-md-4">
          <Field label={tr('header.phone')} hint={tr('header.phoneHint')}>
            {(props) => (
              <input
                {...props}
                type="tel"
                value={form.phone}
                disabled={disabled}
                maxLength={30}
                onChange={(event) => update({ phone: event.target.value })}
              />
            )}
          </Field>
        </div>
      </div>
    </section>
  );
}
