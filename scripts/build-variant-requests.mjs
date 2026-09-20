#!/usr/bin/env node
// Turns the retailer/price research handoff into catalogue publication requests.
//
// The nesting decisions live here as an explicit table rather than being inferred from the
// research file, because "same cigar in another size" is a judgement the file deliberately
// leaves to a reader: it separates sizeVariants from relatedStandalone, and flags the cases
// where it wants the blend confirmed before anything is nested. Writing the table out makes
// each decision reviewable next to the rule it follows.
//
// Pricing follows the file's own rules: the best currently available Australian per-stick
// price, SmokingPipes excluded, a sold-out option never treated as available, and a broad
// min-max retailer range never read as one vitola's price.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd());
const research = JSON.parse(await readFile(
  resolve(repoRoot, 'docs/variant-retailer-price-research-2026-09-20.json'), 'utf8'));
const byKey = new Map(research.entries.map(entry => [entry.key, entry]));
const TODAY = '2026-09-20';

// Ring gauge decides the cadence band, so it is restated per size rather than inherited.
const cadence = ring => (ring <= 32 ? 'Sensitive Cadence' : ring <= 40 ? 'Lenient Cadence' : 'Forgiving Cadence');
const practical = (packageLabel, ring, cut = 'Uncut') =>
  [packageLabel, cut, 'Protected', cadence(ring)];

// A vitola priced only by a retailer's min-max range carries no price at all.
const unpriced = (id, label, extra = {}) => ({ id, label, ...extra });

/* Each entry names its sizes, the current one first, and says why anything the research
   file listed was left out. */
const PLAN = [
  {
    key: 'liga-privada-no-9-petit-corona-oscuro',
    rank: 6,
    defaultVariantId: 'short-panatela',
    // Two live cards were the same cigar in two sizes. The Short Panatela was the older and
    // better-ranked of the pair, so it stays the size a reader sees first; the admin control
    // can move the default to any other size.
    consolidates: 'liga-privada-no-9-short-panatela',
    eyebrow: 'Best exact No. 9 taster',
    variants: [
      {
        id: 'short-panatela', label: 'Short Panatela', title: 'No. 9 Short Panatela Oscuro',
        eyebrow: 'Best exact No. 9 taster',
        length: 4.5, ring: 40, packagePrice: 37, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-short-panatela-oscuro/'],
        smokeTime: '35–50 min smoke', priceChecked: TODAY,
        imageUrl: '/api/catalogue-image/liga-privada-no-9-short-panatela',
        summaryHtml: '<strong>Espresso, dark cocoa, earth, white pepper and caramel</strong> come through with more wrapper concentration than the coronet while retaining the No. 9’s oily sweetness. The draw should carry measured resistance and the burn is normally disciplined, though the narrow ring punishes impatient puffing and can turn the final inch hot. Its aroma is dense, roasted and savoury-sweet. Mouthfeel is creamy, oily and chewy, followed by a long finish of cocoa, coffee, earth and pepper. The line began as Drew Estate’s <a href="https://drewestate.com/products/liga-privada/liga-privada-no-9/" rel="noopener noreferrer" target="_blank">private blend project</a>, built from unusually scarce tobaccos rather than a mass-market formula.',
        noteHtml: 'Exact taster for: Liga Privada No. 9 Coronets — Tin of 10.'
      },
      {
        id: 'petit-corona', label: 'Petit Corona', title: 'No. 9 Petit Corona Oscuro',
        eyebrow: 'Fullest-ring exact No. 9 short',
        length: 4.25, ring: 46, packagePrice: 44, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9-petit-corona-oscuro/'],
        smokeTime: '40–55 min smoke', priceChecked: TODAY,
        noteHtml: 'Cigar Hut lists the exact 4¼″ × 46 single at A$44 and has it in stock; the same page offers ten cigars or a box of 24.'
      },
      unpriced('robusto', 'Robusto', {
        title: 'No. 9 Robusto', length: 5, ring: 54, stock: 'out',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9/'],
        priceNote: 'Sold out at Cigar Hut; the page shows a 61-1339 range across every option.'
      }),
      unpriced('toro', 'Toro', {
        title: 'No. 9 Toro', length: 6, ring: 52,
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9/'],
        priceNote: 'Cigar Hut shows an 80-1799 range across every option on the page.'
      }),
      unpriced('corona-viva', 'Corona Viva', {
        title: 'No. 9 Corona Viva',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9/'],
        priceNote: 'Cigar Hut shows a 55-1199 range across every option on the page.'
      }),
      unpriced('corona-doble', 'Corona Doble', {
        title: 'No. 9 Corona Doble', length: 7, ring: 52,
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-no-9/'],
        priceNote: 'Cigar Hut shows an 85-1899 range across every option on the page.'
      })
    ],
    excluded: 'Belicoso Oscuro is a shape variant and Coronets a tinned compact format the research file asks to verify, so both stay standalone. Toro Tubo is the Toro in a tube, which is packaging, not a size.'
  },
  {
    key: 'liga-privada-t52-short-panatela',
    defaultVariantId: 'short-panatela',
    variants: [
      {
        id: 'short-panatela', label: 'Short Panatela', title: 'T52 Short Panatela',
        length: 4.5, ring: 46, packagePrice: 42, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52-short-panatela/'],
        smokeTime: '35–50 min smoke', priceChecked: TODAY,
        priceNote: 'Current Cigar Hut crawl shows A$42 for the single, not the A$47 previously displayed.'
      },
      unpriced('petit-corona', 'Petit Corona', {
        title: 'T52 Petit Corona',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52/'],
        priceNote: 'Cigar Hut shows a 52-1009 range across every option on the page.'
      }),
      unpriced('robusto', 'Robusto', {
        title: 'T52 Robusto',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52/'],
        priceNote: 'Cigar Hut shows a 67-1469 range across every option on the page.'
      }),
      unpriced('toro', 'Toro', {
        title: 'T52 Toro',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52/'],
        priceNote: 'Cigar Hut shows a 64-1469 range across every option on the page.'
      }),
      unpriced('corona-viva', 'Corona Viva', {
        title: 'T52 Corona Viva',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52/'],
        priceNote: 'Cigar Hut shows a 52-1149 range across every option on the page.'
      }),
      unpriced('corona-doble', 'Corona Doble', {
        title: 'T52 Corona Doble',
        retailerLinks: ['https://www.cigarhut.com.au/liga-privada-t52/'],
        priceNote: 'Cigar Hut shows an 85-1899 range across every option on the page.'
      })
    ],
    excluded: 'Belicoso and Flying Pig are shape variants, and Coronets is a tinned compact format the research file asks to verify, so all three stay standalone. Toro Tubo is packaging.'
  },
  {
    key: 'undercrown-10-corona-viva',
    defaultVariantId: 'corona-viva',
    variants: [
      {
        id: 'corona-viva', label: 'Corona Viva', title: 'Undercrown 10 Corona Viva',
        length: 5, ring: 43, packagePrice: 39, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/undercrown-10-corona-viva/',
          'https://www.smokingpipes.com/cigars/drew-estate/moreinfo.cfm?product_id=433680'],
        smokeTime: 'About 40–55 min smoke', priceChecked: TODAY
      },
      unpriced('robusto', 'Robusto', {
        title: 'Undercrown 10 Robusto',
        retailerLinks: ['https://www.cigarhut.com.au/undercrown-10-robusto/'],
        priceNote: 'Cigar Hut shows a 49-889 range across every option on the page.'
      }),
      unpriced('toro', 'Toro', {
        title: 'Undercrown 10 Toro', length: 6, ring: 52,
        retailerLinks: ['https://www.cigarhut.com.au/undercrown-10-toro/'],
        priceNote: 'Cigar Hut shows a 70-1319 range across every option on the page.'
      }),
      unpriced('corona-doble', 'Corona Doble', {
        title: 'Undercrown 10 Corona Doble', stock: 'out',
        retailerLinks: ['https://www.cigarhut.com.au/undercrown-10-corona-doble/'],
        priceNote: 'Sold out at Cigar Hut; the page shows a 78-1449 range.'
      })
    ],
    excluded: 'Undercrown Maduro and Undercrown Shade are separate blend lines, and Coronets is a tinned compact format the research file asks to verify.'
  },
  {
    key: 'foundation-charter-oak-maduro-rothschild',
    defaultVariantId: 'rothschild',
    variants: [
      {
        id: 'rothschild', label: 'Rothschild', title: 'Charter Oak Maduro Rothschild',
        length: 4.5, ring: 50, packagePrice: 34, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/charter-oak-maduro-rothschild/',
          'https://www.smokingpipes.com/cigars/foundation-cigar-company/moreinfo.cfm?product_id=333828'],
        smokeTime: 'About 35–45 min smoke', priceChecked: TODAY
      },
      unpriced('petite-corona', 'Petite Corona', {
        title: 'Charter Oak Maduro Petite Corona', length: 5.25, ring: 42,
        retailerLinks: ['https://www.cigarhut.com.au/charter-oak-maduro-petite-corona/'],
        priceNote: 'Cigar Hut shows a 37-679 range across every option on the page.'
      }),
      unpriced('lonsdale', 'Lonsdale', {
        title: 'Charter Oak Maduro Lonsdale',
        retailerLinks: ['https://www.cigarhut.com.au/charter-oak-maduro-lonsdale/'],
        priceNote: 'Cigar Hut shows a 54-989 range across every option on the page.'
      }),
      unpriced('toro', 'Toro', {
        title: 'Charter Oak Maduro Toro', stock: 'out',
        retailerLinks: ['https://www.cigarhut.com.au/charter-oak-maduro-toro/'],
        priceNote: 'Sold out at Cigar Hut; the page shows a 56-999 range.'
      }),
      unpriced('grande', 'Grande', {
        title: 'Charter Oak Maduro Grande', length: 6, ring: 60,
        retailerLinks: ['https://www.cigarhut.com.au/charter-oak-maduro-grande/'],
        priceNote: 'Cigar Hut shows a 55-1039 range across every option on the page.'
      })
    ],
    excluded: 'Charter Oak Shade and Charter Oak Habano are separate blend lines.'
  },
  {
    key: 'paradiso-elegancia-corona',
    defaultVariantId: 'corona',
    variants: [
      {
        id: 'corona', label: 'Corona', title: 'Elegancia Corona',
        length: 5.5, ring: 46, packagePrice: 37, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/paradiso-elegancia-corona/'],
        smokeTime: 'About 45–60 min smoke', priceChecked: TODAY
      },
      unpriced('robusto', 'Robusto', {
        title: 'Elegancia Robusto',
        retailerLinks: ['https://www.cigarhut.com.au/paradiso/'],
        priceNote: 'Found through the Paradiso family page rather than a verified product URL; the range shown is 47-1119.'
      }),
      unpriced('churchill', 'Churchill', {
        title: 'Elegancia Churchill',
        retailerLinks: ['https://www.cigarhut.com.au/paradiso-elegancia-churchill/'],
        priceNote: 'Cigar Hut shows a 54-1275 range across every option on the page.'
      })
    ]
  },
  {
    key: 'paradiso-quintessence-robusto',
    defaultVariantId: 'robusto',
    variants: [
      {
        id: 'robusto', label: 'Robusto', title: 'Quintessence Robusto',
        length: 5.5, ring: 50, packagePrice: 40, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/paradiso-quintessence-robusto/'],
        smokeTime: 'About 55–70 min smoke', priceChecked: TODAY
      },
      unpriced('majestic', 'Majestic', {
        title: 'Quintessence Majestic',
        retailerLinks: ['https://www.cigarhut.com.au/paradiso-quintessence-majestic/'],
        priceNote: 'Cigar Hut shows a 52-1169 range across every option on the page.'
      })
    ],
    excluded: 'Quintessence Belicoso is a shape variant and is out of stock, so it stays standalone.'
  },
  {
    key: 'ashton-vsg-enchantment',
    defaultVariantId: 'enchantment',
    variants: [
      {
        id: 'enchantment', label: 'Enchantment', title: 'VSG Enchantment',
        length: 4.375, ring: 60, packagePrice: 44, packageLabel: 'single cigar',
        retailerLinks: ['https://www.cigarhut.com.au/ashton-vsg-enchantment/',
          'https://www.smokingpipes.com/cigars/ashton/moreinfo.cfm?product_id=26572'],
        smokeTime: 'About 45–60 min smoke', priceChecked: TODAY
      },
      unpriced('tres-mystique', 'Tres Mystique', {
        title: 'VSG Tres Mystique', length: 4.375, stock: 'out',
        retailerLinks: ['https://www.cigarhut.com.au/ashton-vsg-tres-mystique/'],
        priceNote: 'Out of stock at Cigar Hut; the page shows a 39-849 range.'
      }),
      unpriced('robusto', 'Robusto', {
        title: 'VSG Robusto', length: 5.5, ring: 50,
        priceNote: 'Existence and dimensions are verified, but the research file asks for an exact standalone Australian price before any price data is added.'
      }),
      unpriced('eclipse', 'Eclipse', {
        title: 'VSG Eclipse', length: 6, ring: 52,
        retailerLinks: ['https://www.cigarhut.com.au/ashton-vsg-eclipse-tubo/'],
        priceNote: 'The verified Australian page is the tubo presentation, which is packaging; the range shown is 62-1419.'
      }),
      unpriced('sorcerer', 'Sorcerer', {
        title: 'VSG Sorcerer', length: 7, ring: 49,
        retailerLinks: ['https://www.cigarhut.com.au/ashton-vsg-sorcerer/'],
        priceNote: 'Cigar Hut shows a 67-1499 range across every option on the page.'
      }),
      unpriced('wizard', 'Wizard', {
        title: 'VSG Wizard', length: 6, ring: 56,
        retailerLinks: ['https://www.cigarhut.com.au/ashton-vsg-wizard/'],
        priceNote: 'Cigar Hut shows a 63-2099 range across every option on the page.'
      })
    ],
    excluded: 'Belicoso No. 1 and Torpedo are shape variants, so both stay standalone.'
  },
  {
    key: 'rocky-patel-sun-grown-juniors',
    defaultVariantId: 'juniors',
    variants: [
      {
        id: 'juniors', label: 'Juniors', title: 'Sun Grown Juniors',
        length: 4, ring: 38, packagePrice: 85, packageCount: 5, packageLabel: 'pack of 5',
        retailerLinks: ['https://www.cigarhut.com.au/rocky-patel-sun-grown-juniors-pack-of-5/',
          'https://cigarbox.com.au/products/rocky-pate-sun-grown-juniors-tin-of-5-4-x-38rg',
          'https://www.theindexcigars.com.au/products/rocky-patel-sun-grown-juniors'],
        smokeTime: '25–35 min smoke', priceChecked: TODAY,
        priceNote: 'Cigar Hut’s A$85 pack of five is A$17 a stick, below The Index’s A$92.40 tin of five at A$18.48 and its A$19.90 single.'
      },
      {
        id: 'robusto', label: 'Robusto', title: 'Sun Grown Robusto',
        length: 5.5, ring: 50, packagePrice: 47.3, packageLabel: 'single cigar',
        retailerLinks: ['https://www.theindexcigars.com.au/products/rocky-patel-sungrown-robusto'],
        smokeTime: 'About 50–65 min smoke', priceChecked: TODAY,
        priceNote: 'The Index box of 20 is sold out, so the A$47.30 single is the best currently available Australian price.'
      }
    ],
    excluded: 'Sun Grown Maduro Robusto is a blend variant and stays standalone.'
  },
  {
    key: 'nica-rustica-broadleaf-short-robusto',
    defaultVariantId: 'short-robusto',
    variants: [
      {
        id: 'short-robusto', label: 'Short Robusto', title: 'Broadleaf Short Robusto',
        length: 4.5, ring: 50, packagePrice: 929.5, packageCount: 25, packageLabel: 'box of 25',
        retailerLinks: ['https://www.theindexcigars.com.au/products/nica-rustica-broadleaf-short-robusto'],
        smokeTime: 'About 50 min smoke', priceChecked: TODAY,
        priceNote: 'The Index box of 25 at A$929.50 is A$37.18 a stick, below its A$39 single.'
      },
      unpriced('toro', 'Toro', {
        title: 'Broadleaf Toro',
        retailerLinks: ['https://www.cigarhut.com.au/drew-estate-cigars/'],
        priceNote: 'Found through the Drew Estate family page rather than a verified product URL; the range shown is 49-1149.'
      })
    ],
    excluded: 'Belly Belicoso is a shape variant and Nica Rustica Adobe a separate blend, so both stay standalone.'
  },
  {
    key: 'davidoff-winston-churchill-petite-panatela',
    defaultVariantId: 'petite-panatela',
    variants: [
      {
        id: 'petite-panatela', label: 'Petite Panatela', title: 'Winston Churchill Petite Panatela',
        length: 4, ring: 38, packagePrice: 105, packageCount: 5, packageLabel: 'tin of 5',
        retailerLinks: ['https://corporatecigar.com/product/davidoff-wsc-petit-panetela-5s/',
          'https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/winston-churchill/'],
        smokeTime: '20–30 min smoke', priceChecked: TODAY,
        priceNote: 'Corporate Cigar’s A$105 tin of five is A$21 a stick, below CigarWorld’s A$139 tin and A$28.95 single.'
      },
      {
        id: 'petit-corona', label: 'Petit Corona', title: 'Winston Churchill Petit Corona',
        length: 4.5, ring: 41, packagePrice: 959.12, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/products/davidoff-%252d-winston-churchill-%252d-petit-corona-%252d-box-of-20-%252d-%284-1%7B47%7D2-x-41%29.html'],
        smokeTime: 'About 35–45 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$959.12 is A$47.96 a stick, below its A$49.11 single.'
      },
      {
        id: 'robusto', label: 'Robusto', title: 'Winston Churchill Robusto',
        length: 5.5, ring: 52, packagePrice: 1326.47, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/winston-churchill/'],
        smokeTime: 'About 55–70 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$1326.47 is A$66.32 a stick, below its A$69.77 single.'
      },
      {
        id: 'churchill', label: 'Churchill', title: 'Winston Churchill Churchill',
        length: 6.875, ring: 47, packagePrice: 1503.84, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/categories/cigars/davidoff-%28dominican%29/winston-churchill/'],
        smokeTime: 'About 70–90 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$1503.84 is A$75.19 a stick, below its A$78.64 single.'
      }
    ],
    excluded: 'The Late Hour is a separate blend line and stays standalone.'
  },
  {
    key: 'aj-fernandez-new-world-oscuro',
    defaultVariantId: 'petit-corona',
    variants: [
      {
        id: 'petit-corona', label: 'Petit Corona', title: 'New World Oscuro',
        length: 4, ring: 36, packagePrice: 115.55, packageCount: 5, packageLabel: 'pack of 5',
        retailerLinks: ['https://www.cigarworld.com.au/aud/products/new-world-oscuro-pack-by-aj-fernandez-%252d-%284-x-36%29-%252d-pack-of-5.html'],
        smokeTime: '25–35 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld pack of five at A$115.55 is A$23.11 a stick, below its A$24.11 single.'
      },
      {
        id: 'toro', label: 'Toro', title: 'New World Oscuro Toro',
        length: 6.5, ring: 55, packagePrice: 1339.1, packageCount: 21, packageLabel: 'box of 21',
        retailerLinks: ['https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/new-world/'],
        smokeTime: 'About 70–90 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 21 at A$1339.10 is A$63.77 a stick, below its A$68.95 single.'
      }
    ],
    excluded: 'Oscuro Belicoso is a shape variant with no reliable standalone Australian price, and the Cameroon, Puro Especial, Dorado and Connecticut lines are separate blends.'
  },
  {
    key: 'aj-fernandez-new-world-cameroon-short-robusto',
    defaultVariantId: 'short-robusto',
    variants: [
      {
        id: 'short-robusto', label: 'Short Robusto', title: 'New World Cameroon Short Robusto',
        length: 4, ring: 48, packagePrice: 746.42, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/products/NEW-WORLD-%252d-Cameroon-Short-Robusto-%252d-%284%22-x-48%29-Single.html'],
        smokeTime: '40–55 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$746.42 is A$37.32 a stick, below its A$39.32 single.'
      },
      {
        id: 'double-robusto', label: 'Double Robusto', title: 'New World Cameroon Double Robusto',
        length: 5.5, ring: 54, packagePrice: 1054.92, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/new-world/'],
        smokeTime: 'About 60–75 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$1054.92 is A$52.75 a stick, below its A$54.75 single.'
      },
      {
        id: 'toro', label: 'Toro', title: 'New World Cameroon Toro',
        length: 6, ring: 50, packagePrice: 1140.9, packageCount: 20, packageLabel: 'box of 20',
        retailerLinks: ['https://www.cigarworld.com.au/aud/categories/cigars/aj-fernandez-%28nicaragua%29/new-world/'],
        smokeTime: 'About 65–80 min smoke', priceChecked: TODAY,
        priceNote: 'CigarWorld box of 20 at A$1140.90 is A$57.05 a stick, below its A$59.04 single.'
      }
    ],
    excluded: 'Cameroon Torpedo is a shape variant with no reliable standalone Australian price.'
  }
];

/* Entries that legitimately end up with no nested sizes. Recorded so the reasoning is on
   file rather than implied by their absence. */
const NO_VARIANTS = {
  'liga-privada-unico-nasty-fritas': 'The research file found no verified same-cigar alternate vitola, and says not to collapse other Único formats into it.',
  'liga-privada-unico-papas-fritas': 'No alternate vitola; Nasty Fritas is a format relative, not a size.',
  'liga-privada-h99-papas-fritas': 'The H99 Robusto and Toro are flagged in the research file as needing the blend confirmed before nesting, so nothing is nested yet.',
  'la-flor-dominicana-double-ligero-chiselito-maduro': 'The 6 x 54 Chisel Maduro is flagged as needing the exact blend confirmed before nesting, and is sold out.',
  'la-flor-dominicana-la-nox-petit': 'No additional La Nox vitola with a reliable current Australian price was verified.',
  'la-flor-dominicana-reserva-especial-el-jocko-maduro': 'Only the Natural is listed alongside it, which is a blend variant.',
  'deadwood-leather-rose-petite-corona': 'The Torpedo is a materially different shape, which the research file says to keep standalone.',
  'alonso-menendez-axe-charutos': 'No verified same-blend alternate vitola.'
};

/* Price corrections the research file calls for on the size a reader currently sees. */
const CORRECTIONS = [
  {
    key: 'liga-privada-unico-papas-fritas',
    entry: {
      packagePrice: 104, packageLabel: 'tin of 4', price: 26, priceChecked: TODAY,
      retailerLinks: [
        'https://www.cigarhut.com.au/liga-privada-unico-serie-papas-fritas/',
        'https://www.theindexcigars.com.au/products/liga-privada-unico-serie-papas-fritas'
      ]
    },
    note: 'Correct the displayed price to the best currently available Australian per-stick figure. Cigar Hut’s A$104 tin of four is A$26 a stick, against the A$30.70 single from The Index that the card showed. Both retailers stay listed. Value stays automatically derived from price.'
  }
];

function buildVariant(variant) {
  const ring = variant.ring;
  const out = { ...variant };
  if (ring && variant.packageLabel && !variant.practicalLines) {
    out.practicalLines = practical(variant.packageLabel, ring);
  }
  return out;
}

const written = [];

for (const plan of PLAN) {
  const source = byKey.get(plan.key);
  const variants = plan.variants.map(buildVariant);
  const entry = { sizeVariants: variants, defaultVariantId: plan.defaultVariantId };
  if (plan.rank) entry.rank = plan.rank;
  if (plan.eyebrow) entry.eyebrow = plan.eyebrow;

  const priced = variants.filter(variant => variant.packagePrice > 0);
  const noteParts = [
    `Nest ${variants.length} size${variants.length === 1 ? '' : 's'} of the same cigar under one entry, defaulting to ${plan.defaultVariantId}.`,
    `${priced.length} of ${variants.length} have a verified current Australian price; the rest carry none, because a retailer min-max range spans every option on the page and says nothing about one vitola.`
  ];
  if (plan.consolidates) {
    noteParts.push(`Consolidates the separate ${plan.consolidates} card, whose title, dimensions, price, retailer link, image, summary, note and smoke time all move onto its size variant. That card is archived rather than deleted in a paired request.`);
  }
  if (plan.excluded) noteParts.push(plan.excluded);
  noteParts.push('Ratings are not stored per size: Size follows the selected ring gauge and Value stays automatically derived from the selected price.');
  if (source) noteParts.push('Retailer and price data comes from docs/variant-retailer-price-research-2026-09-20.json.');

  const id = `2026-09-20-variants-${plan.key}`;
  written.push({
    id,
    path: `catalogue-requests/${id}.json`,
    body: { id, operation: 'upsert-entry', key: plan.key, entry, note: noteParts.join(' ') }
  });
}

for (const correction of CORRECTIONS) {
  const id = `2026-09-20-price-${correction.key}`;
  written.push({
    id,
    path: `catalogue-requests/${id}.json`,
    body: { id, operation: 'upsert-entry', key: correction.key, entry: correction.entry, note: correction.note }
  });
}

// The consolidated card is archived, never deleted, so its record and image stay recoverable.
for (const plan of PLAN.filter(item => item.consolidates)) {
  const id = `2026-09-20-consolidate-${plan.consolidates}`;
  written.push({
    id,
    path: `catalogue-requests/${id}.json`,
    body: {
      id,
      operation: 'archive-entry',
      key: plan.consolidates,
      note: `${plan.consolidates} is the same cigar as ${plan.key} in a different vitola, so it becomes that entry’s ${plan.defaultVariantId} size variant and stops being a card of its own. Archived rather than deleted: the record, its image and its ranking history stay recoverable, and nothing is lost because the variant carries its title, dimensions, price, retailer link, image, summary, note and smoke time.`
    }
  });
}

for (const file of written) {
  await writeFile(resolve(repoRoot, file.path), `${JSON.stringify(file.body, null, 2)}\n`);
  console.log(`wrote ${file.path}`);
}
console.log(`\n${written.length} request(s). Entries deliberately left without sizes:`);
for (const [key, reason] of Object.entries(NO_VARIANTS)) console.log(`  ${key}: ${reason}`);
