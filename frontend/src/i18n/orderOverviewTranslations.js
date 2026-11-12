// src/i18n/orderOverviewTranslations.js
//
// The words of the "Factuur bekijken" panel on a shipment in "My shipments"
// (pages/Profile/OrderInvoice.jsx): the invoice, and "Ontvangst in ons
// magazijn" - which products have reached the warehouse.
//
// Merged into translations.js as `orderOverview`, so a component reads them
// as t('orderOverview.products.title').
//
// HOW TO ADD A SENTENCE: add the same key to all three blocks below. A test
// (orderOverviewTranslations.test.js) fails when one language misses a key
// or a {placeholder}.
//
// The four status words match the server's status codes one to one
// (backend warehouse/receipts.py): received, partial, not_received, unknown.
//
// NOTE: the Papiamentu needs review by a native speaker, like the rest of
// the site's Papiamentu.

export const orderOverviewTranslations = {
  nl: {
    receivedBadge: 'Ontvangen in ons magazijn',
    viewInvoice: 'Factuur bekijken',
    back: 'Terug naar de zending',
    loading: 'Laden…',
    failed: 'Dit overzicht kon niet worden geladen.',
    retry: 'Opnieuw proberen',
    refresh: 'Vernieuwen',
    invoice: {
      title: 'Factuur',
      number: 'Factuurnummer',
      date: 'Factuurdatum',
      total: 'Totaal',
      download: 'Factuur downloaden',
      notAvailable: 'Je factuur is nog niet beschikbaar.',
      noPdf: 'De pdf van deze factuur is nog niet beschikbaar.',
    },
    products: {
      title: 'Ontvangst in ons magazijn',
      intro: 'Per product: hoeveel u besteld heeft en hoeveel ons magazijn al heeft ontvangen.',
      empty: 'Er staan geen producten bij deze zending.',
      ordered: '{count} besteld',
      received: '{count} ontvangen',
      expected: '{count} nog verwacht',
      unknownNote:
        'Voor dit product hebben wij geen telling van het magazijn. Vragen? Neem contact met ons op.',
    },
    status: {
      received: 'Ontvangen',
      partial: 'Gedeeltelijk ontvangen',
      not_received: 'Nog niet ontvangen',
      unknown: 'Ontvangststatus onbekend',
    },
  },
  en: {
    receivedBadge: 'Received at our warehouse',
    viewInvoice: 'View invoice',
    back: 'Back to the shipment',
    loading: 'Loading…',
    failed: 'This overview could not be loaded.',
    retry: 'Try again',
    refresh: 'Refresh',
    invoice: {
      title: 'Invoice',
      number: 'Invoice number',
      date: 'Invoice date',
      total: 'Total',
      download: 'Download invoice',
      notAvailable: 'Your invoice is not available yet.',
      noPdf: 'The PDF of this invoice is not available yet.',
    },
    products: {
      title: 'Received at our warehouse',
      intro: 'Per product: how many you ordered and how many our warehouse has received so far.',
      empty: 'There are no products on this shipment.',
      ordered: '{count} ordered',
      received: '{count} received',
      expected: '{count} still expected',
      unknownNote:
        'We have no count from the warehouse for this product. Questions? Contact us.',
    },
    status: {
      received: 'Received',
      partial: 'Partially received',
      not_received: 'Not received yet',
      unknown: 'Receipt status unknown',
    },
  },
  pap: {
    receivedBadge: 'Risibí na nos warehouse',
    viewInvoice: 'Mira faktura',
    back: 'Bai bek na e enbio',
    loading: 'Kargando…',
    failed: 'No por a karga e resumen aki.',
    retry: 'Purba atrobe',
    refresh: 'Renobá',
    invoice: {
      title: 'Faktura',
      number: 'Number di faktura',
      date: 'Fecha di faktura',
      total: 'Total',
      download: 'Baha faktura',
      notAvailable: 'Bo faktura no ta disponibel ainda.',
      noPdf: 'E PDF di e faktura aki no ta disponibel ainda.',
    },
    products: {
      title: 'Risibí na nos warehouse',
      intro: 'Pa kada produkto: kuantu bo a ordená i kuantu nos warehouse a risibí kaba.',
      empty: 'No tin produkto na e enbio aki.',
      ordered: '{count} ordená',
      received: '{count} risibí',
      expected: '{count} ainda ta wordu sperá',
      unknownNote:
        'Nos no tin un konteo di warehouse pa e produkto aki. Pregunta? Tuma kontakto ku nos.',
    },
    status: {
      received: 'Risibí',
      partial: 'Risibí parsialmente',
      not_received: 'Ainda no risibí',
      unknown: 'Status di risibimentu deskonosí',
    },
  },
};
