// Central sidebar brand/line registry.
//
// LOGO HOOK:
// 1. Put a small transparent PNG/WebP/SVG in public/brand-logos/.
// 2. Set that entry's logo to its public path, e.g.:
//      logo:'/brand-logos/davidoff.webp'
// 3. Leave logo:'' for a text-only button.
//
// Brand entries use the catalogue's rendered brand metadata. Line entries use stable
// catalogue keys so their matching is independent of headings, prose, ranking, or price.

const brand = (id, label, names = [label], logo = '') =>
  Object.freeze({ id, label, kind:'brand', logo, brands:names });

const line = (id, label, match = {}, logo = '') =>
  Object.freeze({ id, label, kind:'line', logo, ...match });

export const BRAND_LINE_CONFIG = Object.freeze([
  // Brands currently represented in the catalogue. Any future unlisted brand is still
  // auto-discovered by the sidebar; adding it here is only needed for a custom logo/label.
  brand('aj-fernandez', 'AJ Fernandez'),
  brand('alonso-menendez', 'Alonso Menendez'),
  brand('arturo-fuente', 'Arturo Fuente'),
  brand('ashton', 'Ashton'),
  brand('cao', 'CAO'),
  brand('cohiba', 'Cohiba'),
  brand('curivari', 'Curivari'),
  brand('daniel-marshall', 'Daniel Marshall'),
  brand('davidoff', 'Davidoff'),
  brand('don-pepin-garcia', 'Don Pepin Garcia'),
  brand('drew-estate', 'Drew Estate'),
  brand('el-rey-del-mundo', 'El Rey del Mundo'),
  brand('foundation', 'Foundation'),
  brand('hoyo-de-monterrey', 'Hoyo de Monterrey'),
  brand('joya-de-nicaragua', 'Joya de Nicaragua'),
  brand('la-flor-dominicana', 'La Flor Dominicana'),
  brand('liga-privada', 'Liga Privada'),
  brand('montecristo', 'Montecristo'),
  brand('my-father', 'My Father'),
  brand('oliva', 'Oliva'),
  brand('paradiso', 'Paradiso'),
  brand('partagas', 'Partagás', ['Partagás', 'Partagas']),
  brand('rocky-patel', 'Rocky Patel'),
  brand('romeo-y-julieta', 'Romeo y Julieta'),
  brand('tatiana', 'Tatiana'),
  brand('toscano', 'Toscano'),
  brand('undercrown', 'Undercrown'),

  // Named lines/families represented by catalogue cards.
  line('aj-fernandez-new-world', 'AJ Fernandez — New World', { keyPrefixes:['aj-fernandez-new-world-'] }),
  line('aj-fernandez-last-call', 'AJ Fernandez — Last Call', { keyPrefixes:['aj-fernandez-last-call-'] }),
  line('arturo-fuente-hemingway', 'Arturo Fuente — Hemingway', { keyPrefixes:['arturo-fuente-hemingway-'] }),
  line('ashton-aged-maduro', 'Ashton — Aged Maduro', { keyPrefixes:['ashton-aged-maduro-'] }),
  line('ashton-vsg', 'Ashton — VSG', { keyPrefixes:['ashton-vsg-'] }),
  line('cao-bella-vanilla', 'CAO — Bella Vanilla', { keyPrefixes:['cao-bella-vanilla'] }),
  line('cao-brazilia', 'CAO — Brazilia', { keyPrefixes:['cao-brazilia-'] }),
  line('cao-eileens-dream', 'CAO — Eileen’s Dream', { keyPrefixes:['cao-eileens-dream-'] }),
  line('cao-flathead', 'CAO — Flathead', { keyPrefixes:['cao-flathead-'] }),
  line('cao-moontrance', 'CAO — Moontrance', { keyPrefixes:['cao-moontrance'] }),
  line('curivari-fuerte', 'Curivari — Fuerte', { keyPrefixes:['curivari-fuerte-'] }),
  line('daniel-marshall-red-label', 'Daniel Marshall — Red Label', { keyPrefixes:['daniel-marshall-red-label-'] }),
  line('davidoff-escurio', 'Davidoff — Escurio', { keyIncludes:['davidoff-escurio', 'davidoff-primeros-escurio'] }),
  line('davidoff-nicaragua', 'Davidoff — Nicaragua', { keyIncludes:['davidoff-nicaragua', 'davidoff-primeros-nicaragua'] }),
  line('davidoff-winston-churchill', 'Davidoff — Winston Churchill', { keyPrefixes:['davidoff-winston-churchill-'] }),
  line('drew-estate-acid', 'Drew Estate — ACID', { keyIncludes:['acid-'] }),
  line('drew-estate-blackened', 'Drew Estate — BLACKENED', { keyIncludes:['blackened-'] }),
  line('drew-estate-factory-smokes', 'Drew Estate — Factory Smokes', { keyIncludes:['factory-smokes-'] }),
  line('drew-estate-isla-del-sol', 'Drew Estate — Isla del Sol', { keyIncludes:['isla-del-sol-'] }),
  line('drew-estate-java', 'Drew Estate — Java', { keyIncludes:['java-'] }),
  line('drew-estate-kentucky-fire-cured', 'Drew Estate — Kentucky Fire Cured', { keyIncludes:['kfc-'] }),
  line('drew-estate-nica-rustica', 'Drew Estate — Nica Rustica', { keyIncludes:['nica-rustica-'] }),
  line('drew-estate-tabak-especial', 'Drew Estate — Tabak Especial', { keyIncludes:['tabak-especial-'] }),
  line('foundation-charter-oak', 'Foundation — Charter Oak', { keyPrefixes:['foundation-charter-oak-'] }),
  line('foundation-tabernacle', 'Foundation — The Tabernacle', { keyIncludes:['tabernacle-'] }),
  line('foundation-wise-man-maduro', 'Foundation — The Wise Man Maduro', { keyPrefixes:['foundation-wise-man-maduro-'] }),
  line('hoyo-de-monterrey-le-hoyo', 'Hoyo de Monterrey — Le Hoyo', { keyPrefixes:['hoyo-de-monterrey-le-hoyo-'] }),
  line('joya-antano-1970', 'Joya de Nicaragua — Antaño 1970', { keyPrefixes:['joya-antano-1970-'] }),
  line('joya-black', 'Joya de Nicaragua — Joya Black', { keyPrefixes:['joya-black-'] }),
  line('la-flor-dominicana-double-ligero', 'La Flor Dominicana — Double Ligero', { keyPrefixes:['la-flor-dominicana-double-ligero-'] }),
  line('la-flor-dominicana-la-nox', 'La Flor Dominicana — La Nox', { keyIncludes:['lfd-la-nox-'] }),
  line('la-flor-dominicana-reserva-especial', 'La Flor Dominicana — Reserva Especial', { keyIncludes:['lfd-reserva-especial-'] }),
  line('liga-privada-no-9', 'Liga Privada — No. 9', { keyIncludes:['liga-privada-no-9-'] }),
  line('liga-privada-t52', 'Liga Privada — T52', { keyIncludes:['liga-privada-t52-', 'liga-t52-'] }),
  line('liga-privada-h99', 'Liga Privada — H99', { keyIncludes:['liga-privada-h99-'] }),
  line('liga-privada-unico', 'Liga Privada — Único', { keyIncludes:['liga-privada-unico-'] }),
  line('liga-privada-10-seleccion-de-mercado', 'Liga Privada — 10 Selección de Mercado', { keyIncludes:['liga-privada-10-seleccion-de-mercado-'] }),
  line('my-father-la-gran-oferta', 'My Father — La Gran Oferta', { keyPrefixes:['my-father-la-gran-oferta-'] }),
  line('my-father-le-bijou', 'My Father — Le Bijou', { keyPrefixes:['my-father-le-bijou-'] }),
  line('my-father-no-4', 'My Father — No. 4', { keyPrefixes:['my-father-no-4-'] }),
  line('oliva-serie-g', 'Oliva — Serie G', { keyPrefixes:['oliva-serie-g'] }),
  line('oliva-serie-o', 'Oliva — Serie O', { keyPrefixes:['oliva-serie-o'] }),
  line('oliva-serie-v', 'Oliva — Serie V', { keyPrefixes:['oliva-serie-v'] }),
  line('oliva-serie-v-melanio', 'Oliva — Serie V Melanio', { keyPrefixes:['oliva-serie-v-melanio-'] }),
  line('paradiso-elegancia', 'Paradiso — Elegancia', { keyPrefixes:['paradiso-elegancia-'] }),
  line('paradiso-quintessence', 'Paradiso — Quintessence', { keyPrefixes:['paradiso-quintessence-'] }),
  line('rocky-patel-disciple', 'Rocky Patel — Disciple', { keyPrefixes:['rocky-patel-disciple-'] }),
  line('rocky-patel-sun-grown', 'Rocky Patel — Sun Grown', { keyIncludes:['rocky-patel-sun-grown-'] }),
  line('rocky-patel-sun-grown-maduro', 'Rocky Patel — Sun Grown Maduro', { keyPrefixes:['rocky-patel-sun-grown-maduro-'] }),
  line('tatiana-classic', 'Tatiana — Classic', { keyPrefixes:['tatiana-classic-'] }),
  line('tatiana-dolce', 'Tatiana — Dolce', { keyPrefixes:['tatiana-dolce-'] }),
  line('tatiana-mini', 'Tatiana — Mini', { keyPrefixes:['tatiana-mini-'] }),
  line('toscano-antico', 'Toscano — Antico', { keyPrefixes:['toscano-antico-'] }),
  line('toscano-toscanello-nero', 'Toscano — Toscanello Nero', { keyIncludes:['toscanello-nero-'] }),
  line('undercrown-10', 'Undercrown — 10', { keyPrefixes:['undercrown-10-'] }),
  line('undercrown-maduro', 'Undercrown — Maduro', { keyPrefixes:['undercrown-maduro-'] })
]);
