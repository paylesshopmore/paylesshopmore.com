// src/calculator/rates.js
//
// THE PRICES. The only file to edit when rates change.
//
// A price that is `null` means "we do not know it yet". The calculator never
// guesses: while a freight price for a destination is null, it still works
// out volume and chargeable weight, but shows "request a quote" instead of a
// total (see isPriced in calculate.js).
//
// Units used in this file:
//   - money is in euros
//   - percentages are whole numbers: 10.5 means 10.5%, NOT 0.105

// The islands the calculator offers. Only Curaçao for now: the customs
// tariff these rates come from is Curaçao's. To add an island, add its key
// here, a block in RATES and IMPORT_DUTY_PERCENT, and its name in
// ISLAND_NAMES (pages/Calculator/Calculator.jsx).
export const DESTINATIONS = ['curacao'];

// --- Freight, fees and local tax ---------------------------------------------
//
// Freight and fees are our own prices (from the office's price list). The
// island's tax rate is not set yet: it is not in the customs tariff that the
// duty table below comes from.
export const RATES = {
  curacao: {
    // Sea freight is charged by volume: EUR 180 per m³.
    sea: { perM3: 180, minimum: null },
    // Air freight is charged by chargeable weight: EUR 7 per kg. Chargeable
    // weight is the higher of the actual and the volumetric weight (see
    // calculate.js).
    air: { perKg: 7, minimum: null },
    // Fixed amounts per shipment, on top of the freight. The same for sea and
    // air. Each key needs a label in the translations:
    // calculator.result.fees.<key>.
    //
    // Handling is NOT here: it depends on the purchase value (EUR 50 up to
    // EUR 500, EUR 150 above) and lives on the server, in backend
    // invoicing/calculation.py HANDLING_FEE_RULES. The calculator page asks
    // for those rules (api/pricing.js) and passes them to calculate().
    fees: {
      administration: 25, // administratiekosten
      documentation: 30, // documentatiekosten
    },
    // The island's tax on imports, charged on goods value + freight + import
    // duty. (Curaçao: omzetbelasting / OB.)
    localTaxPercent: null,
  },
};

// --- Import duty (invoerrecht) -----------------------------------------------
//
// SOURCE: "Tarief van invoerrechten 2017", Douane Curaçao (618 pages).
//
// How that document works, in short: every kind of product has an 8-digit
// goods code (for example 6403.9100 = leather shoes), grouped in chapters
// ("hoofdstukken": the first 2 digits) and headings ("posten": the first 4
// digits). Next to each code is the import duty as a percentage of the value
// ("AD VAL" column).
//
// Customers do not know goods codes, so the calculator offers everyday
// categories instead. Each category below points at the heading(s) it was
// read from, so anyone can open the PDF and check the number. Where one
// heading has several rates, the comment says which line was taken.
//
// Almost every line in the tariff is 0, 5.5, 10.5, 13, 17, 22 or 27 percent.
// 10.5% is by far the most common one.
const CURACAO_DUTY_PERCENT = {
  // Clothing - chapters 61 (knitted) and 62 (not knitted): every line 10.5%. (p. 350-363)
  clothing: 10.5,
  // Shoes - chapter 64, headings 64.01 to 64.06: every line 13%. (p. 369-371)
  shoes: 13,
  // Bags, suitcases, wallets - heading 42.02: every line 13%. (p. 249-250)
  bags: 13,
  // Fashion jewellery (not gold or silver) - heading 71.17, body jewellery of
  // base metal: 13%. (p. 403)
  fashionJewellery: 13,
  // Gold and silver jewellery - heading 71.13, precious metal: 0%. (p. 402)
  preciousJewellery: 0,
  // Watches - chapter 91, heading 91.02 (wristwatches): 0%. (p. 587)
  watches: 0,
  // Make-up, skin care, hair care, toothpaste, deodorant - headings 33.04
  // to 33.07: every line 10.5%. (p. 193-194)
  cosmetics: 10.5,
  // Perfume and eau de toilette - heading 33.03: 0%. (p. 193)
  perfume: 0,
  // Laptops, computers, tablets, printers, keyboards - heading 84.71: 0%. (p. 511)
  computers: 0,
  // Mobile phones - heading 85.17, "telefoontoestellen voor cellulaire
  // netwerken": 10.5%. (p. 532)
  phones: 10.5,
  // TVs and computer monitors - heading 85.28: TVs (also LED TVs) and
  // monitors made for a computer are 0%. (p. 538)
  televisions: 0,
  // Headphones and earphones - heading 85.18, line 8518.3000: 10.5%. (p. 533)
  headphones: 10.5,
  // Speakers and amplifiers - heading 85.18, lines 8518.2100 to 8518.5000: 0%. (p. 533)
  speakers: 0,
  // Small electrical appliances: kitchen machines (85.09), shavers (85.10),
  // hair dryers, irons, kettles, coffee makers, toasters (85.16), vacuum
  // cleaners (85.08): 27%. (p. 528-532) Microwaves are left out: the PDF's
  // columns are misaligned on that line, so their rate can't be read reliably.
  smallAppliances: 27,
  // Tables, cabinets, beds, kitchen units - heading 94.03 - and mattresses -
  // heading 94.04: every line 22%. (p. 602-603)
  furniture: 22,
  // Chairs, sofas, office chairs - heading 94.01: every line 27%. (p. 600-601)
  seating: 27,
  // Lamps - heading 94.05: 27% for lamps of glass, metal, wood or plastic
  // (crystal and porcelain lamps are 0%, but are rare). (p. 603-604)
  lighting: 27,
  // Bed, table and kitchen linen - heading 63.02: mostly 10.5%. (p. 364)
  homeTextiles: 10.5,
  // Pans, pots and other kitchenware of steel - heading 73.23: 10.5%. (p. 430)
  kitchenware: 10.5,
  // Toys, dolls, puzzles, scale models - heading 95.03: 10.5%. (p. 607)
  toys: 10.5,
  // Game consoles - heading 95.04, line 9504.5000: 17%. (p. 608)
  gameConsoles: 17,
  // Sports equipment (balls, rackets, fitness, water sports) - heading 95.06:
  // 0%. (p. 608-609)
  sports: 0,
  // Books, newspapers, magazines - headings 49.01 and 49.02: 0%. (p. 290)
  books: 0,
  // Anything else: 10.5%, the tariff's most common rate. An estimate - the
  // real rate depends on the goods code.
  other: 10.5,
};

// The categories the form's dropdown offers, in this order. Each key needs a
// label in the translations: calculator.categories.<key>.
export const IMPORT_CATEGORIES = Object.keys(CURACAO_DUTY_PERCENT);

// Duty per island, per category.
export const IMPORT_DUTY_PERCENT = {
  curacao: CURACAO_DUTY_PERCENT,
};

// Air freight weighs a light, bulky box by its size: cm³ / 6000 = kg. Defined
// once, in utils/volumeWeight.js, and passed on from here.
export { VOLUMETRIC_DIVISOR } from '../utils/volumeWeight';
