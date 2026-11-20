// The public routes, with the metadata each one should be served with.
//
// One list, three consumers: the prerenderer writes an HTML file per entry,
// the sitemap is generated from it, and a test checks it against the app's own
// route table so the two cannot drift apart silently.
//
// Plain data with no imports from src/. This module is loaded by the Vite
// config, which esbuild bundles on its own before any of the app's asset
// handling exists — an image import here would fail to resolve.
//
// Only pages a stranger can land on cold. Anything behind a login is left
// out, matching robots.txt.

export const SITE = {
  name: 'PayLesShopMore',
  url: 'https://paylesshopmore.com',
  // The card image used when a route does not name its own.
  image: 'https://paylesshopmore.com/og-image.jpg',
  imageAlt: 'A container ship loaded with freight in port',
  email: 'info@paylesshopmore.com',
};

export const DEFAULT_TITLE = `${SITE.name} — Shop and ship to the Caribbean`;

export const DEFAULT_DESCRIPTION =
  'Order from Dutch webshops and ship to the Caribbean. We gather your ' +
  'parcels in one place and you follow every shipment to your door — ' +
  'Aruba, Bonaire and Curaçao.';

// Mirrors src/data/destinations.js. Kept here as plain strings for the reason
// in the header comment; src/test/seo-routes.test.js fails if the two lists
// stop describing the same islands, so this is checked rather than trusted.
export const DESTINATIONS = [
  {
    slug: 'aruba',
    name: 'Aruba',
    port: 'Oranjestad',
    transitDays: 16,
  },
  {
    slug: 'bonaire',
    name: 'Bonaire',
    port: 'Kralendijk',
    transitDays: 18,
  },
  {
    slug: 'curacao',
    name: 'Curaçao',
    port: 'Willemstad',
    transitDays: 17,
  },
];

/**
 * A destination page's own card and search entry.
 *
 * The island name goes first in the title because that is the word someone
 * searched for, and a title that starts with the site name is the same eleven
 * characters repeated down a results page.
 */
function destinationRoute({ slug, name, port, transitDays }) {
  return {
    path: `/destinations/${slug}`,
    title: `Shipping to ${name}`,
    // "At sea" rather than "delivered in": customs clearance on the island
    // comes on top of the crossing, so the days are not a delivery date.
    description:
      `Ship your online orders from the Netherlands to ${name}. ` +
      `We collect your parcels, combine them into one shipment and ship ` +
      `them to ${port}: about ${transitDays} days at sea, or faster by air.`,
  };
}

export const PUBLIC_ROUTES = [
  {
    path: '/',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    // The homepage title already reads as a full sentence with the site name
    // in it, so it is used as written rather than having it appended.
    titleIsComplete: true,
  },
  {
    path: '/services',
    title: 'Our services',
    description:
      'Shop and ship, parcel forwarding, consolidation and door delivery ' +
      'across the Dutch Caribbean. What we do and how it works.',
  },
  {
    path: '/booking',
    title: 'Book a shipment',
    description:
      'Tell us what you have ordered and where it should go. We take it from ' +
      'the Dutch webshop to your address in the Caribbean.',
  },
  {
    path: '/contact',
    title: 'Contact us',
    description:
      'Questions about a shipment, a quote or how the service works? Send us ' +
      'a message and we will come back to you.',
  },
  {
    path: '/privacy',
    title: 'Privacy policy',
    description:
      'How Pay Less Shop More handles your personal data: what we collect, ' +
      'why, who we share it with and what your rights are.',
  },
  {
    path: '/calculator',
    title: 'Shipping cost calculator',
    description:
      'Work out an indication of shipping costs to Curaçao or Bonaire: ' +
      'volume, chargeable weight, freight and import duty.',
  },
  {
    path: '/faq',
    title: 'Frequently asked questions',
    description:
      'Answers to the questions we get most: shipping goods and cars, ' +
      'pick-up and delivery, packing, local costs, insurance and payment.',
  },
  {
    path: '/about-us',
    title: 'About us',
    description:
      'PayLesShopMore has been in business for 14 years: shopping from Dutch ' +
      'webshops and shipping to Aruba, Bonaire and Curaçao, without VAT.',
  },
  {
    path: '/terms',
    title: 'Terms and conditions',
    description:
      'The forwarding and warehousing conditions of Pay Less Shop More: the ' +
      'terms that apply to every shipment and to storage in our warehouse.',
  },
  {
    path: '/destinations',
    title: 'Where we ship',
    description:
      'The islands we serve, the ports we deliver to and how long each ' +
      'crossing takes: Aruba, Bonaire and Curaçao.',
  },
  {
    path: '/blog',
    title: 'Blog',
    description:
      'Tips and explanations about ordering from Dutch webshops and ' +
      'shipping to Aruba, Bonaire and Curaçao.',
  },
  ...DESTINATIONS.map(destinationRoute),
];

/** The full title as it should appear in the tab and in a link preview. */
export function fullTitle(route) {
  return route.titleIsComplete ? route.title : `${route.title} — ${SITE.name}`;
}

/**
 * Structured data for a route.
 *
 * Every page carries the organisation and the site, which is what lets a
 * search engine show a name, a logo and a sitelinks search box rather than
 * inferring them from the markup. Destination pages add the service itself,
 * with the area it covers — the fact this business actually competes on.
 *
 * Returned as objects and serialised at the end, so a value containing a
 * quote or an accent cannot break out of the script tag by hand-written
 * string concatenation.
 */
export function structuredData(route) {
  const organisation = {
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    url: `${SITE.url}/`,
    email: SITE.email,
    logo: `${SITE.url}/favicon-192.png`,
    description: DEFAULT_DESCRIPTION,
    areaServed: DESTINATIONS.map((destination) => ({
      '@type': 'Place',
      name: destination.name,
    })),
  };

  const website = {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: `${SITE.url}/`,
    name: SITE.name,
    publisher: { '@id': `${SITE.url}/#organization` },
    // The site is served in three languages from one set of URLs.
    inLanguage: ['nl', 'en', 'pap'],
  };

  const graph = [organisation, website];

  const destination = DESTINATIONS.find(
    (item) => route.path === `/destinations/${item.slug}`,
  );

  if (destination) {
    graph.push({
      '@type': 'Service',
      '@id': `${SITE.url}${route.path}#service`,
      name: `Shipping to ${destination.name}`,
      serviceType: 'Parcel forwarding and freight shipping',
      provider: { '@id': `${SITE.url}/#organization` },
      areaServed: { '@type': 'Place', name: destination.name },
      description: route.description,
      url: `${SITE.url}${route.path}`,
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

/** The sitemap, generated from the same list rather than kept by hand. */
export function sitemapXml() {
  const urls = PUBLIC_ROUTES.map(
    (route) => `  <url><loc>${SITE.url}${route.path}</loc></url>`,
  ).join('\n');

  // No lastmod, changefreq or priority: Google ignores the last two, and a
  // lastmod that is not genuinely maintained teaches a crawler to distrust
  // the field.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated at build time from scripts/routes.js. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
