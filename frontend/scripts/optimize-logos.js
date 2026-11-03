// Turns the shop logos in src/images into small WebP files for the shop
// cards on the home page.
//
//     npm run logos
//
// Run by hand, like `npm run images`, and the output is committed.
//
// The originals are large (up to 3840px and 130 KB) and several are a small
// logo in the middle of a wide white image. Each is:
//
//   * trimmed back to the mark itself, against whatever its own background
//     is - white for most, brand colour for the few that ship as a coloured
//     tile. Bol.com in particular is a small wordmark adrift in a large blue
//     square, and untrimmed it reads as a blue block rather than a logo.
//     Trimming leaves the mark still on its brand colour, because that colour
//     is the background it is drawn on, not a border around it.
//   * scaled to fit 400x400, which is sharp on the cards on a high-density
//     screen.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'src/images';
const OUTPUT = 'src/images/optimized/logos';
const SIZE = 400;
const QUALITY = 85;

// source file -> [output name, the background colour to trim away, and
// optionally how many pixels of that colour to put back round the mark, in
// the finished image]. The
// colour is the logo's own backdrop, sampled from its top-left corner; `null`
// means leave the borders alone, for a logo whose surrounding colour is part
// of the artwork rather than padding around it.
const LOGOS = {
  'IKEA-Image.png': ['ikea', '#ffffff'],
  'Bol.com-image.webp': ['bol', '#0100a4'],
  'autodoc-logo.png': ['autodoc', '#ffffff'],
  'coolblue-image.jpg': ['coolblue', '#1daaef'],
  'H&M logo.jpg': ['hm', '#ffffff'],
  'MediaMarkt.png': ['mediamarkt', '#ffffff'],
  'action-logo.png': ['action', '#ffffff'],
  'Zalando.png': ['zalando', '#ffffff'],
  // White letters on a black block with its bottom-left corner cut away.
  // The cut-out is transparent and is flattened to white, which is what it
  // is meant to show; trimming white leaves the block itself untouched.
  'Karwei-Logo.png': ['karwei', '#ffffff'],
  // A white-and-black wordmark adrift in a large pink square, like bol.com's.
  // Trimmed bare it is a thin strip with the letters touching the edges, so a
  // band of pink goes back round it to keep it reading as a tile.
  'babypark.jpg': ['babypark', '#ed008c', 20],
  'Swiss_logo.png': ['swisssense', '#ffffff'],
  // JYSK and Prenatal are a block of brand colour on white: trimming the white
  // leaves the block, which is the tile.
  'jysk.png': ['jysk', '#ffffff'],
  'prenatal-logo-png.png': ['prenatal', '#ffffff'],
  // Decathlon is the Babypark case again - a wordmark on a large blue field -
  // so it gets the same band of colour back round it.
  'Decathlon_logo.webp': ['decathlon', '#3743bc', 20],
  'Kraaywijn.nl.png': ['kraaywijn', '#ffffff'],
  'amazon.nl.webp': ['amazon', '#ffffff'],
  'hornbach.png': ['hornbach', '#ffffff'],
  // Bershka and HEMA are the Babypark case too: a wordmark on a large field.
  'Bershka.jpg': ['bershka', '#000000', 20],
  'Hema.png': ['hema', '#e81111', 20],
  // Zara, Pull&Bear and Zeeman are drawn on transparency, which flattens to
  // white and is trimmed like any white border.
  'Zara.png': ['zara', '#ffffff'],
  'Pull-Bear-.png': ['pullbear', '#ffffff'],
  'zeeman.png': ['zeeman', '#ffffff'],
  'Shein-Logo.png': ['shein', '#ffffff'],

  // The wide "long" logos, used by the services page only - the home page
  // cards are small and square-ish, which suits the compact marks above.
  // See `longLogo` in src/data/shops.js.
  'Bol.com-Long-Logo.png': ['bol-long', '#ffffff'],
  // Not trimmed: this one is the badge centred on a wide band of brand
  // colour, and trimming the band would hand back the square badge, which is
  // the opposite of what a long logo is for.
  'Coolblue-Long-Long.jpg': ['coolblue-long', null],
};

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  for (const [file, [name, background, padding = 0]] of Object.entries(LOGOS)) {
    const source = join(SOURCE, file);

    let image = sharp(source);

    if (background) {
      // Transparency becomes the logo's own backdrop rather than white, so a
      // mark on brand colour is not ringed in white once it is flattened.
      // This is finished into a buffer before the trim: in one pipeline sharp
      // trims first, and a transparent pixel can hide any colour underneath
      // (Zara's and Zeeman's are green), which never matches the background.
      // PNG so this in-between copy is lossless, not a second JPEG pass.
      const flat = await image.flatten({ background }).png().toBuffer();
      // A small threshold catches JPEG noise around the edge of the border.
      image = sharp(flat).trim({ background, threshold: 20 });
    }

    // Leave room for the padding inside SIZE, so a padded logo is no bigger
    // than the rest.
    const fit = SIZE - 2 * padding;
    image = image.resize(fit, fit, { fit: 'inside', withoutEnlargement: true });

    if (padding) {
      // sharp would otherwise pad before it trims, so finish the trim and
      // resize into a buffer first and pad that.
      image = sharp(await image.toBuffer()).extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background,
      });
    }

    const buffer = await image
      .webp({ quality: QUALITY })
      .toBuffer();

    const target = join(OUTPUT, `${name}.webp`);
    await writeFile(target, buffer);

    const before = (await stat(source)).size;
    console.log(`${file.padEnd(22)} ${kb(before).padStart(7)} -> ${name}.webp ${kb(buffer.length)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
