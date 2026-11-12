// Every sentence of the "Factuur bekijken" panel exists in all three
// languages, with the same {placeholders}. Same check as
// invoiceTranslations.test.js.

import { describe, expect, it } from 'vitest';
import { orderOverviewTranslations } from './orderOverviewTranslations';

/** Every key path in a nested object: { a: { b: 'x' } } -> ['a.b']. */
function keys(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

/** The {placeholders} in a sentence, sorted. */
function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

function get(tree, path) {
  return path.split('.').reduce((value, key) => value?.[key], tree);
}

describe('order overview translations', () => {
  const dutch = keys(orderOverviewTranslations.nl);

  for (const language of ['en', 'pap']) {
    it(`${language} has every Dutch sentence, and no extra ones`, () => {
      expect(keys(orderOverviewTranslations[language]).sort()).toEqual([...dutch].sort());
    });

    it(`${language} keeps the same {placeholders} as Dutch`, () => {
      for (const path of dutch) {
        expect([path, placeholders(get(orderOverviewTranslations[language], path))]).toEqual([
          path,
          placeholders(get(orderOverviewTranslations.nl, path)),
        ]);
      }
    });
  }

  it('uses the exact Dutch wording that was asked for', () => {
    const nl = orderOverviewTranslations.nl;
    expect(nl.viewInvoice).toBe('Factuur bekijken');
    expect(nl.invoice.download).toBe('Factuur downloaden');
    expect(nl.invoice.notAvailable).toBe('Je factuur is nog niet beschikbaar.');
    expect(nl.products.title).toBe('Ontvangst in ons magazijn');
    expect(nl.status).toEqual({
      received: 'Ontvangen',
      partial: 'Gedeeltelijk ontvangen',
      not_received: 'Nog niet ontvangen',
      unknown: 'Ontvangststatus onbekend',
    });
  });
});
