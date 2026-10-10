// Named HTML entities as Confluence writes them in storage format ("vollst&auml;ndig", "&bdquo;Gutschein&ldquo;",
// "ERP &rarr; Fibu"): all of Latin-1 and the typographic ones. Numeric entities are decoded where they are read.
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ')
const OTHER = { OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, circ: 710, tilde: 732, ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, dagger: 8224, bull: 8226, hellip: 8230, permil: 8240, lsaquo: 8249, rsaquo: 8250, euro: 8364, trade: 8482, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, lArr: 8656, rArr: 8658, hArr: 8660, minus: 8722, infin: 8734, asymp: 8776, ne: 8800, le: 8804, ge: 8805 }

/** name → character; nbsp is a plain space, as everywhere else in the import. */
export const NAMED_ENTITIES = Object.freeze({
  ...Object.fromEntries(LATIN1.map((name, i) => [name, String.fromCodePoint(160 + i)])),
  ...Object.fromEntries(Object.entries(OTHER).map(([name, code]) => [name, String.fromCodePoint(code)])),
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
})
