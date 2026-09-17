// Central sidebar brand registry.
//
// LOGO HOOK:
// 1. Put a small transparent PNG/WebP/SVG in public/brand-logos/.
// 2. Set that brand's logo to its public path, e.g.:
//      logo:'/brand-logos/davidoff.webp'
// 3. Leave logo:'' for a text-only button.
//
// The sidebar only renders brands that currently have at least one active (non-archived)
// catalogue card. Future unlisted brands are still auto-discovered; adding a brand here is
// only needed for a custom label, alias, or logo.

const brand = (id, label, names = [label], logo = '') =>
  Object.freeze({ id, label, kind:'brand', logo, brands:names });

export const BRAND_LINE_CONFIG = Object.freeze([
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
  brand('undercrown', 'Undercrown')
]);