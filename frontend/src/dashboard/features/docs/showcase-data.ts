/**
 * Example data for the demo: a fictional ERP for furniture and kitchen retail ("MOBIQ"),
 * its documentation in six kinds, one release worth of commits and the proposals neuraldoc
 * derives from them. Everything here is invented and labeled "Beispieldaten" on screen.
 * Numbers on screen are derived from this file by model.ts — never typed into a page.
 */

export const TODAY = '2026-10-01'

export const company = {
  name: 'Musterhaus Software GmbH',
  short: 'Musterhaus',
  product: 'MOBIQ',
  claim: 'ERP für den Möbel- und Küchenhandel',
}

export const release = { id: '26.4', freeze: '2026-10-09', ship: '2026-10-27' }

/* ---------- Kinds of documentation and who reads them ---------- */

export type DocTypeId = 'nutzer' | 'dialog' | 'parameter' | 'technik' | 'installation' | 'architektur'

/** What a change touches. A doc type is only checked when it reacts to one of these. */
export type ChangeKind = 'prozess' | 'feld' | 'label' | 'parameter' | 'schnittstelle' | 'datenbank' | 'betrieb' | 'intern'

export const changeKinds: Record<ChangeKind, { label: string; nature: Nature }> = {
  prozess: { label: 'Prozessschritt', nature: 'fachlich' },
  feld: { label: 'Feld oder Dialog', nature: 'fachlich' },
  label: { label: 'Umbenennung', nature: 'umbenennung' },
  parameter: { label: 'Parameter', nature: 'technisch' },
  schnittstelle: { label: 'Schnittstelle', nature: 'technisch' },
  datenbank: { label: 'Datenbank', nature: 'technisch' },
  betrieb: { label: 'Installation und Update', nature: 'technisch' },
  intern: { label: 'Intern (Umbau, Tests)', nature: 'intern' },
}

export type Nature = 'fachlich' | 'technisch' | 'umbenennung' | 'intern'

export const natures: Record<Nature, string> = {
  fachlich: 'Fachlich',
  technisch: 'Technisch',
  umbenennung: 'Umbenennung',
  intern: 'Intern',
}

export const docTypes: Record<DocTypeId, { label: string; plural: string; audience: string; reactsTo: ChangeKind[]; voice: string }> = {
  nutzer: {
    label: 'Nutzerhandbuch',
    plural: 'Nutzerhandbücher',
    audience: 'Verkauf, Disposition, Kasse und Buchhaltung im Möbelhaus',
    reactsTo: ['prozess', 'feld', 'label'],
    voice: 'Sie können einen Kaufvertrag jetzt in Teile aufteilen.',
  },
  dialog: {
    label: 'Dialogbeschreibung',
    plural: 'Dialogbeschreibungen',
    audience: 'Fachberatung, Support und Schulung',
    reactsTo: ['feld', 'label'],
    voice: 'Im Register Lieferung gibt es das neue Feld Teillieferung erlaubt.',
  },
  parameter: {
    label: 'Parametertabelle',
    plural: 'Parametertabellen',
    audience: 'Fachberatung bei der Einrichtung, Support',
    reactsTo: ['parameter'],
    voice: 'TEILLIEF_MAX_ANZAHL: zulässiger Wertebereich 2 bis 5.',
  },
  technik: {
    label: 'Technische Doku',
    plural: 'Technische Dokus',
    audience: 'Entwicklung, Support und Partner',
    reactsTo: ['schnittstelle', 'datenbank'],
    voice: 'Neue Tabelle lieferteil; Teilrechnungen werden mit Belegart TR exportiert.',
  },
  installation: {
    label: 'Installationsdoku',
    plural: 'Installationsdokus',
    audience: 'Administratoren beim Kunden und Cloud-Betrieb',
    reactsTo: ['betrieb'],
    voice: 'Nach dem Update müssen eigene Belegvorlagen einmal konvertiert werden.',
  },
  architektur: {
    label: 'Architekturbild',
    plural: 'Architekturbilder',
    audience: 'Architektur, Entwicklung und IT beim Kunden',
    reactsTo: ['schnittstelle'],
    voice: 'Neuer Datenfluss: Lieferteil → Teilrechnung → Fibu-Export.',
  },
}

export const docTypeOrder: DocTypeId[] = ['nutzer', 'dialog', 'parameter', 'technik', 'installation', 'architektur']

/* ---------- Product modules ---------- */

export type ModuleId = string

export const modules: Record<ModuleId, string> = {
  kaufvertrag: 'Kaufvertrag',
  kasse: 'Kasse',
  tour: 'Tourenplanung',
  fibu: 'Finanzbuchhaltung',
  druck: 'Druck und Belege',
  plattform: 'Plattform',
}

/* ---------- People ---------- */

export type PersonId = string

export const people: Record<PersonId, { name: string; role: string }> = {
  kroeger: { name: 'Sabine Kröger', role: 'Redaktion Nutzerdoku' },
  thelen: { name: 'Miriam Thelen', role: 'Fachberatung, Dialoge und Parameter' },
  albrecht: { name: 'Jonas Albrecht', role: 'Entwicklung Auftrag' },
  reuter: { name: 'Tobias Reuter', role: 'Architektur' },
  demir: { name: 'Elif Demir', role: 'Produkt Finanzbuchhaltung' },
  brenner: { name: 'Kai Brenner', role: 'Cloud-Betrieb' },
}

export const currentUser = { name: 'Produktmanagement', role: 'ERP & Finance', initials: 'PM' }

/* ---------- Documents ---------- */

export type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'figure'; caption: string }

export type Doc = {
  id: string
  title: string
  type: DocTypeId
  modules: ModuleId[]
  owner: PersonId
  version: string
  updated: string
  pages: number
  /** Not written yet — neuraldoc proposes the first version. */
  planned?: boolean
  blocks: Block[]
}

export const docs: Doc[] = [
  {
    id: 'nh-kaufvertrag',
    title: 'Nutzerhandbuch Kaufvertrag',
    type: 'nutzer',
    modules: ['kaufvertrag'],
    owner: 'kroeger',
    version: '26.3',
    updated: '2026-07-14',
    pages: 86,
    blocks: [
      { kind: 'h', text: '3 Lieferung und Montage' },
      { kind: 'p', text: 'Im Register „Lieferung“ legen Sie fest, wann und wie die Ware zum Kunden kommt. Die Disposition sieht den Kaufvertrag erst, wenn er auf „Lieferbereit“ steht und keine Liefersperre gesetzt ist.' },
      { kind: 'h', text: '3.1 Liefertermin vereinbaren' },
      { kind: 'p', text: 'Wählen Sie im Feld „Wunschtermin“ eine Kalenderwoche. MOBIQ prüft, ob alle Positionen bis dahin im Lager sein können, und zeigt den frühesten möglichen Termin an.' },
      { kind: 'h', text: '3.2 Lieferbereitschaft' },
      { kind: 'p', text: 'Ein Kaufvertrag wird immer vollständig ausgeliefert. Er steht erst auf „Lieferbereit“, wenn alle Positionen im Lager eingegangen sind.' },
      { kind: 'h', text: '3.3 Montage beauftragen' },
      { kind: 'p', text: 'Positionen mit Montageleistung werden automatisch an die Montageplanung übergeben. Die Monteure sehen den Auftrag in der Montage-App.' },
      { kind: 'h', text: '4 Anzahlung und Restzahlung' },
      { kind: 'p', text: 'Die Anzahlung wird bei Vertragsabschluss kassiert. Die Restzahlung ist bei Lieferung fällig, entweder vorab an der Kasse oder beim Fahrer.' },
    ],
  },
  {
    id: 'nh-tour',
    title: 'Nutzerhandbuch Tourenplanung',
    type: 'nutzer',
    modules: ['tour'],
    owner: 'kroeger',
    version: '26.2',
    updated: '2026-04-30',
    pages: 54,
    blocks: [
      { kind: 'h', text: '2 Touren planen' },
      { kind: 'p', text: 'Alle lieferbereiten Kaufverträge erscheinen in der Liste „Offene Lieferungen“. Ziehen Sie einen Auftrag auf eine Tour in der Karte, um ihn einzuplanen.' },
      { kind: 'p', text: 'Ein Kaufvertrag ist immer genau ein Stopp auf einer Tour.' },
      { kind: 'h', text: '2.3 Montage einplanen' },
      { kind: 'p', text: 'Enthält ein Stopp eine Montageposition, plant MOBIQ automatisch einen Monteur und die Montagezeit mit ein.' },
      { kind: 'h', text: '2.4 Ladevolumen' },
      { kind: 'p', text: 'MOBIQ summiert das Volumen aller Stopps einer Tour und zeigt es in der Kopfzeile der Tour an.' },
      { kind: 'h', text: '3 Lieferschein und Auslieferung' },
      { kind: 'p', text: 'Der Fahrer erhält die Lieferscheine in der Fahrer-App und kassiert offene Restzahlungen bar oder per Karte.' },
      { kind: 'p', text: 'Kaufverträge mit gesetzter Liefersperre erscheinen nicht in „Offene Lieferungen“.' },
    ],
  },
  {
    id: 'nh-fibu',
    title: 'Nutzerhandbuch Finanzbuchhaltung: Übergabe aus dem ERP',
    type: 'nutzer',
    modules: ['fibu'],
    owner: 'demir',
    version: '26.3',
    updated: '2026-07-02',
    pages: 38,
    blocks: [
      { kind: 'h', text: '5 Belege aus der Warenwirtschaft' },
      { kind: 'p', text: 'MOBIQ übergibt Rechnungen, Gutschriften und Anzahlungen jede Nacht an die Finanzbuchhaltung. Sie finden sie im Stapel „ERP-Import“.' },
      { kind: 'h', text: '5.2 Anzahlungen' },
      { kind: 'p', text: 'Erhaltene Anzahlungen werden auf das Anzahlungskonto gebucht (Parameter FIBU_KONTO_ANZAHLUNG).' },
      { kind: 'p', text: 'Die Schlussrechnung wird nach vollständiger Auslieferung erstellt. Mit ihr wird die gesamte Anzahlung verrechnet.' },
      { kind: 'h', text: '5.3 Erlöse' },
      { kind: 'p', text: 'Der Erlös wird mit dem Rechnungsdatum gebucht. Offene Posten werden über die Kaufvertragsnummer zugeordnet.' },
      { kind: 'h', text: '5.4 Gutscheine' },
      { kind: 'p', text: 'Verkaufte Gutscheine werden als Verbindlichkeit gebucht. Bei Einlösung wird die Verbindlichkeit vollständig aufgelöst.' },
    ],
  },
  {
    id: 'nh-kasse',
    title: 'Nutzerhandbuch Kasse',
    type: 'nutzer',
    modules: ['kasse'],
    owner: 'kroeger',
    version: '26.1',
    updated: '2026-02-11',
    pages: 47,
    blocks: [
      { kind: 'h', text: '6 Gutscheine' },
      { kind: 'p', text: 'Ein Gutschein kann nur vollständig eingelöst werden. Ist der Einkauf günstiger als der Gutschein, verfällt der Rest nicht, sondern wird als neuer Gutschein ausgegeben.' },
      { kind: 'p', text: 'Scannen Sie den Gutschein-Code oder geben Sie die Nummer im Feld „Gutschein“ ein.' },
      { kind: 'h', text: '7 Restzahlung bei Lieferung' },
      { kind: 'p', text: 'Restzahlungen, die der Fahrer kassiert, erscheinen am nächsten Morgen im Kassenbuch der Filiale.' },
    ],
  },
  {
    id: 'dlg-kaufvertrag',
    title: 'Dialogbeschreibung Kaufvertrag',
    type: 'dialog',
    modules: ['kaufvertrag'],
    owner: 'thelen',
    version: '26.3',
    updated: '2026-06-23',
    pages: 31,
    blocks: [
      { kind: 'h', text: 'Register „Lieferung“' },
      { kind: 'p', text: 'Aufruf über Kaufvertrag › Lieferung. Pflichtfelder sind fett markiert.' },
      {
        kind: 'table',
        head: ['Feld', 'Typ', 'Pflicht', 'Beschreibung'],
        rows: [
          ['Wunschtermin', 'KW-Auswahl', 'ja', 'Gewünschte Lieferwoche des Kunden'],
          ['Lieferadresse', 'Adresse', 'ja', 'Vorbelegt mit der Kundenadresse'],
          ['Etage / Aufzug', 'Auswahl', 'nein', 'Für die Tourenplanung'],
          ['Liefersperre', 'Checkbox', 'nein', 'Kaufvertrag wird nicht disponiert'],
          ['Montage', 'Checkbox', 'nein', 'Aus Positionen mit Montageleistung vorbelegt'],
        ],
      },
      { kind: 'p', text: 'Änderungen im Register „Lieferung“ werden sofort an die Disposition übertragen.' },
    ],
  },
  {
    id: 'dlg-fahrzeug',
    title: 'Dialogbeschreibung Fahrzeugstamm',
    type: 'dialog',
    modules: ['tour'],
    owner: 'thelen',
    version: '–',
    updated: TODAY,
    pages: 0,
    planned: true,
    blocks: [],
  },
  {
    id: 'par-auftrag',
    title: 'Parametertabelle Auftrag, Tour und Fibu',
    type: 'parameter',
    modules: ['kaufvertrag', 'tour', 'fibu'],
    owner: 'thelen',
    version: '26.3',
    updated: '2026-07-08',
    pages: 12,
    blocks: [
      { kind: 'h', text: 'Auftrag und Lieferung' },
      { kind: 'p', text: 'Parameter werden je Mandant unter Administration › Parameter gepflegt. Änderungen wirken ab der nächsten Anmeldung.' },
      {
        kind: 'table',
        head: ['Parameter', 'Bedeutung', 'Standard', 'Min', 'Max', 'Einheit'],
        rows: [
          ['LIEF_VORLAUF_TAGE', 'Vorlauf zwischen Wareneingang und frühestem Liefertermin', '3', '0', '14', 'Tage'],
          ['LIEF_AVIS_STUNDEN', 'Avisierung an den Kunden vor der Lieferung', '48', '12', '96', 'Stunden'],
          ['ANZ_MIN_PROZ', 'Mindestanzahlung bei Vertragsabschluss', '20', '0', '100', '%'],
          ['MONT_ZEIT_PUFFER', 'Zeitpuffer je Montage', '30', '0', '120', 'Minuten'],
        ],
      },
      { kind: 'h', text: 'Tourenplanung' },
      {
        kind: 'table',
        head: ['Parameter', 'Bedeutung', 'Standard', 'Min', 'Max', 'Einheit'],
        rows: [
          ['TOUR_MAX_STOPPS', 'Höchstzahl Stopps je Tour', '12', '1', '30', 'Stopps'],
          ['TOUR_START_ZEIT', 'Frühester Tourstart', '07:00', '05:00', '10:00', 'Uhrzeit'],
        ],
      },
      { kind: 'h', text: 'Finanzbuchhaltung' },
      {
        kind: 'table',
        head: ['Parameter', 'Bedeutung', 'Standard', 'Min', 'Max', 'Einheit'],
        rows: [
          ['FIBU_KONTO_ANZAHLUNG', 'Konto für erhaltene Anzahlungen', '1718', '–', '–', 'Konto (SKR03)'],
          ['FIBU_EXPORT_ZEIT', 'Uhrzeit der nächtlichen Übergabe', '02:00', '00:00', '05:00', 'Uhrzeit'],
        ],
      },
    ],
  },
  {
    id: 'td-fibu',
    title: 'Schnittstelle ERP → Finanzbuchhaltung',
    type: 'technik',
    modules: ['fibu', 'plattform'],
    owner: 'albrecht',
    version: '26.3',
    updated: '2026-06-30',
    pages: 22,
    blocks: [
      { kind: 'h', text: '2 Exportformat der Buchungssätze' },
      { kind: 'p', text: 'Der Export schreibt je Beleg einen Satz in die Tabelle fibu_export. Die Finanzbuchhaltung liest sie nachts über den Dienst fibu-import.' },
      {
        kind: 'table',
        head: ['Feld', 'Typ', 'Beschreibung'],
        rows: [
          ['belegart', 'char(2)', 'RE = Rechnung, GS = Gutschrift, AZ = Anzahlung'],
          ['belegnr', 'varchar(20)', 'Fortlaufend je Mandant'],
          ['kv_nr', 'varchar(12)', 'Kaufvertragsnummer, für die Zuordnung offener Posten'],
          ['betrag_brutto', 'numeric(12,2)', 'Bruttobetrag des Belegs'],
          ['steuerschluessel', 'smallint', 'Steuerschlüssel der Finanzbuchhaltung'],
        ],
      },
      { kind: 'h', text: '3 Verrechnung von Anzahlungen' },
      { kind: 'p', text: 'Mit der Schlussrechnung wird die Anzahlung vollständig verrechnet (Feld az_betrag des Kaufvertrags).' },
    ],
  },
  {
    id: 'td-datenmodell',
    title: 'Datenmodell und Migrationen',
    type: 'technik',
    modules: ['plattform'],
    owner: 'albrecht',
    version: '26.3',
    updated: '2026-07-10',
    pages: 64,
    blocks: [
      { kind: 'h', text: '4 Tabellen der Auftragsabwicklung' },
      {
        kind: 'table',
        head: ['Tabelle', 'Inhalt', 'Schlüssel'],
        rows: [
          ['kaufvertrag', 'Kopf des Kaufvertrags', 'kv_id'],
          ['kv_position', 'Positionen des Kaufvertrags', 'kvp_id, FK kv_id'],
          ['tour_stopp', 'Stopp einer Tour', 'stopp_id, FK kv_id'],
        ],
      },
      { kind: 'h', text: '5 Migrationen' },
      { kind: 'p', text: 'Migrationen liegen unter db/migration und laufen beim Update automatisch in Versionsreihenfolge.' },
      {
        kind: 'table',
        head: ['Version', 'Inhalt', 'Laufzeit bei 1 Mio. Positionen'],
        rows: [
          ['V26_3_004', 'Index auf kv_position.artikel_nr', 'ca. 2 min'],
          ['V26_3_009', 'Spalte kaufvertrag.finanzkauf', 'unter 1 min'],
        ],
      },
    ],
  },
  {
    id: 'inst-update',
    title: 'Installations- und Updatehandbuch',
    type: 'installation',
    modules: ['plattform'],
    owner: 'brenner',
    version: '26.3',
    updated: '2026-07-15',
    pages: 41,
    blocks: [
      { kind: 'h', text: '4 Update auf eine neue Version' },
      { kind: 'p', text: '1. Sichern Sie die Datenbank.\n2. Stoppen Sie die Dienste mobiq-app und mobiq-druck.\n3. Führen Sie das Update-Paket aus. Migrationen laufen automatisch.\n4. Starten Sie die Dienste und prüfen Sie das Protokoll.' },
      { kind: 'h', text: '4.2 Nach dem Update' },
      { kind: 'p', text: 'Prüfen Sie unter Administration › Systemstatus, ob alle Dienste laufen. In der Cloud übernimmt das der Betrieb.' },
      { kind: 'h', text: '5 Systemanforderungen' },
      { kind: 'p', text: 'Datenbank: PostgreSQL 15 oder neuer. Anwendungsserver: 4 Kerne und 16 GB Arbeitsspeicher je 50 gleichzeitige Anwender.' },
    ],
  },
  {
    id: 'arch-gesamt',
    title: 'Architekturbild Gesamtsystem',
    type: 'architektur',
    modules: ['plattform'],
    owner: 'reuter',
    version: '26.1',
    updated: '2026-01-20',
    pages: 3,
    blocks: [
      { kind: 'h', text: 'Gesamtsystem' },
      { kind: 'figure', caption: 'Abb. 1: Clients, Anwendungsserver, Dienste und Finanzbuchhaltung' },
      { kind: 'p', text: 'Rechnungen gelangen ausschließlich über den Dienst fibu-export in die Finanzbuchhaltung.' },
    ],
  },
  {
    id: 'td-kasse',
    title: 'Kasse: Belegdaten und Tagesabschluss',
    type: 'technik',
    modules: ['kasse', 'plattform'],
    owner: 'brenner',
    version: '26.2',
    updated: '2026-05-05',
    pages: 18,
    blocks: [
      { kind: 'h', text: '3 Tabelle kassenbeleg' },
      { kind: 'p', text: 'Jeder Bon ist ein Satz in kassenbeleg mit seinen Zahlungen in kassenzahlung. Der Tagesabschluss liest alle Belege des Tages je Filiale.' },
      { kind: 'h', text: '4 Aufbewahrung' },
      { kind: 'p', text: 'Kassenbelege werden nicht gelöscht. Ältere Jahrgänge können über die Archivfunktion ausgelagert werden.' },
    ],
  },
]

/* ---------- Commits and the changes they form ---------- */

export type CommitKind = ChangeKind | 'fix' | 'test'

export const commitKinds: Record<CommitKind, string> = {
  ...Object.fromEntries(Object.entries(changeKinds).map(([k, v]) => [k, v.label])),
  fix: 'Fehlerbehebung',
  test: 'Tests',
} as Record<CommitKind, string>

export type Commit = {
  hash: string
  date: string
  author: string
  message: string
  kind: CommitKind
  files: string[]
  /** A later commit in the same change replaced this intermediate state. */
  supersededBy?: string
  note?: string
}

export type Step = { text: string; mark?: 'neu' | 'geändert' }

export type Aspect = { kind: ChangeKind; module: ModuleId; text: string; commits: string[] }

export type Bundle = {
  id: string
  title: string
  ticket: string
  epic?: string
  mr: string
  merged: string
  /** Where this change sits in the product, read from the existing documentation. */
  path: string[]
  alsoAffects?: string[]
  classifiedVia: string[]
  summary: string
  before?: Step[]
  after?: Step[]
  aspects: Aspect[]
  commits: Commit[]
  /** Nothing visible changes for readers — shown so it is clear the change was checked. */
  noDocsReason?: string
}

export const bundles: Bundle[] = [
  {
    id: 'teillieferung',
    title: 'Teillieferung im Kaufvertrag',
    ticket: 'MOB-4812',
    epic: 'Liefertreue erhöhen',
    mr: '!1287',
    merged: '2026-09-29',
    path: ['Auftragsabwicklung', 'Kaufvertrag', 'Lieferung und Montage', 'Teillieferung'],
    alsoAffects: ['Tourenplanung', 'Faktura', 'Finanzbuchhaltung'],
    classifiedVia: [
      'Ticket MOB-4812 im Epic „Liefertreue erhöhen“',
      'Nutzerhandbuch Kaufvertrag, Kapitel 3 „Lieferung und Montage“',
      'Geänderte Programmteile: Kaufvertrag, Tour, Faktura, Fibu-Export',
    ],
    summary:
      'Verkäufer können einen Kaufvertrag in bis zu drei Teile aufteilen (die Höchstzahl ist von zwei bis fünf einstellbar). Jeder Lieferteil erhält einen eigenen Tourstopp, eine eigene Teilrechnung und geht einzeln in die Finanzbuchhaltung. Die Stopps können auf derselben Tour liegen.',
    before: [
      { text: 'Kaufvertrag erfassen' },
      { text: 'Anzahlung kassieren' },
      { text: 'Warten, bis alle Positionen im Lager sind' },
      { text: 'Eine Tour planen' },
      { text: 'Ausliefern und montieren' },
      { text: 'Schlussrechnung, Anzahlung voll verrechnen' },
      { text: 'Übergabe an die Finanzbuchhaltung' },
    ],
    after: [
      { text: 'Kaufvertrag erfassen' },
      { text: 'Anzahlung kassieren' },
      { text: 'Lieferung in Teile aufteilen', mark: 'neu' },
      { text: 'Je Teil einen eigenen Tourstopp einplanen', mark: 'geändert' },
      { text: 'Je Teil ausliefern, Montage nur beim Teil mit Montageposition', mark: 'geändert' },
      { text: 'Je Teil eine Teilrechnung, Anzahlung anteilig verrechnen', mark: 'neu' },
      { text: 'Je Teil Übergabe an die Finanzbuchhaltung (Belegart TR)', mark: 'geändert' },
    ],
    aspects: [
      { kind: 'prozess', module: 'kaufvertrag', text: 'Kaufvertrag lässt sich in Teile aufteilen, nicht bei Finanzkauf', commits: ['5d9e2f7', 'e81b6aa'] },
      { kind: 'feld', module: 'kaufvertrag', text: 'Checkbox „Teillieferung erlaubt“ und Dialog „Lieferung aufteilen“', commits: ['c04e9a1', '5d9e2f7'] },
      { kind: 'parameter', module: 'kaufvertrag', text: 'Drei neue Parameter mit Grenzen', commits: ['7be21d4', 'e81b6aa'] },
      { kind: 'prozess', module: 'tour', text: 'Jeder Teil ist ein eigener Stopp', commits: ['92ac4d0'] },
      { kind: 'prozess', module: 'kasse', text: 'Fahrer kassiert nur den Anteil des gelieferten Teils', commits: ['3f7a1b8'] },
      { kind: 'prozess', module: 'fibu', text: 'Teilrechnung je Teil, Anzahlung anteilig verrechnet', commits: ['3f7a1b8', '0d4e8f3'] },
      { kind: 'parameter', module: 'fibu', text: 'Belegart für Teilrechnungen einstellbar', commits: ['b6c2d55'] },
      { kind: 'schnittstelle', module: 'fibu', text: 'Fibu-Export: Belegart TR, zwei neue Felder', commits: ['b6c2d55'] },
      { kind: 'datenbank', module: 'plattform', text: 'Neue Tabelle lieferteil', commits: ['a1f3c09'] },
    ],
    commits: [
      { hash: 'a1f3c09', date: '2026-09-08', author: 'J. Albrecht', message: 'MOB-4812 Datenmodell: Tabelle lieferteil, Spalte tour_stopp.lt_id', kind: 'datenbank', files: ['db/migration/V26_4_012__lieferteil.sql', 'server/auftrag/Lieferteil.java'] },
      { hash: '7be21d4', date: '2026-09-09', author: 'J. Albrecht', message: 'MOB-4812 Parameter TEILLIEF_ERLAUBT und TEILLIEF_MAX_ANZAHL (1 bis 10)', kind: 'parameter', files: ['config/parameter/auftrag.yaml'], supersededBy: 'e81b6aa', note: 'Wertebereich später auf 2 bis 5 geändert' },
      { hash: 'c04e9a1', date: '2026-09-11', author: 'M. Yilmaz', message: 'MOB-4812 Register Lieferung: Checkbox „Teillieferung erlaubt“', kind: 'feld', files: ['web/src/kaufvertrag/RegisterLieferung.tsx', 'desktop/kaufvertrag/FrmLieferung.pas'] },
      { hash: '5d9e2f7', date: '2026-09-15', author: 'M. Yilmaz', message: 'MOB-4812 Dialog „Lieferung aufteilen“, gesperrt bei Finanzkauf', kind: 'feld', files: ['web/src/kaufvertrag/LieferungAufteilen.tsx', 'server/auftrag/TeillieferungService.java'] },
      { hash: 'e81b6aa', date: '2026-09-17', author: 'J. Albrecht', message: 'MOB-4812 Mindestwarenwert je Teil prüfen; MAX_ANZAHL 2 bis 5, Standard 3', kind: 'parameter', files: ['server/auftrag/TeillieferungService.java', 'config/parameter/auftrag.yaml'] },
      { hash: '92ac4d0', date: '2026-09-19', author: 'P. Schuster', message: 'MOB-4812 Tourenplanung: Lieferteil als eigener Stopp (T1, T2 …)', kind: 'prozess', files: ['server/tour/StoppBuilder.java', 'web/src/tour/StoppKarte.tsx'] },
      { hash: '3f7a1b8', date: '2026-09-22', author: 'L. Hoffmann', message: 'MOB-4812 Faktura: Teilrechnung je Lieferteil, Anzahlung anteilig', kind: 'prozess', files: ['server/faktura/TeilrechnungService.java', 'server/faktura/AnzahlungVerrechnung.java', 'app/fahrer/Restzahlung.kt'] },
      { hash: 'b6c2d55', date: '2026-09-23', author: 'L. Hoffmann', message: 'MOB-4812 Fibu-Export: Belegart TR, Felder teillieferung_nr und az_verrechnet', kind: 'schnittstelle', files: ['server/fibu/export/Buchungssatz.java', 'config/parameter/fibu.yaml'] },
      { hash: '0d4e8f3', date: '2026-09-24', author: 'L. Hoffmann', message: 'MOB-4812 Fix: Rundungsdifferenz der Anzahlung mit dem letzten Teil ausgleichen', kind: 'fix', files: ['server/faktura/AnzahlungVerrechnung.java'] },
      { hash: '4a7e912', date: '2026-09-26', author: 'M. Yilmaz', message: 'MOB-4812 Review: Texte und Tab-Reihenfolge im Dialog', kind: 'intern', files: ['web/src/kaufvertrag/LieferungAufteilen.tsx'] },
    ],
  },
  {
    id: 'gutschein',
    title: 'Gutschein teilweise einlösen',
    ticket: 'MOB-4777',
    epic: 'Kasse 2026',
    mr: '!1244',
    merged: '2026-09-03',
    path: ['Kasse', 'Gutscheine', 'Einlösung'],
    alsoAffects: ['Finanzbuchhaltung'],
    classifiedVia: ['Ticket MOB-4777 im Epic „Kasse 2026“', 'Nutzerhandbuch Kasse, Kapitel 6 „Gutscheine“', 'Nutzerhandbuch Finanzbuchhaltung, Kapitel 5.4'],
    summary: 'Ein Gutschein kann jetzt teilweise eingelöst werden. Das Restguthaben bleibt auf dem Gutschein, und die Buchhaltung löst nur den eingelösten Betrag auf.',
    before: [{ text: 'Gutschein scannen' }, { text: 'Nur voll einlösbar, Rest als neuer Gutschein' }, { text: 'Verbindlichkeit vollständig auflösen' }],
    after: [
      { text: 'Gutschein scannen' },
      { text: 'Teilbetrag einlösen, Rest bleibt auf dem Gutschein', mark: 'geändert' },
      { text: 'Restguthaben auf dem Bon drucken', mark: 'neu' },
      { text: 'Verbindlichkeit nur in Höhe des Teilbetrags auflösen', mark: 'geändert' },
    ],
    aspects: [
      { kind: 'prozess', module: 'kasse', text: 'Teileinlösung mit Restguthaben', commits: ['3e8a5c1', '7d2f9b4'] },
      { kind: 'prozess', module: 'fibu', text: 'Verbindlichkeit nur anteilig auflösen', commits: ['e5a1c36'] },
    ],
    commits: [
      { hash: '3e8a5c1', date: '2026-08-27', author: 'A. Becker', message: 'MOB-4777 Kasse: Gutschein teilweise einlösen, Restguthaben speichern', kind: 'prozess', files: ['server/kasse/GutscheinService.java', 'web/src/kasse/Zahlung.tsx'] },
      { hash: '7d2f9b4', date: '2026-08-29', author: 'A. Becker', message: 'MOB-4777 Bon: Restguthaben drucken', kind: 'prozess', files: ['druck/vorlagen/bon.xml'] },
      { hash: 'e5a1c36', date: '2026-09-01', author: 'L. Hoffmann', message: 'MOB-4777 Fibu: Gutscheinverbindlichkeit nur in Höhe des Einlösebetrags auflösen', kind: 'prozess', files: ['server/fibu/export/GutscheinBuchung.java'] },
      { hash: 'b9d4e27', date: '2026-09-02', author: 'A. Becker', message: 'MOB-4777 Tests Teileinlösung', kind: 'test', files: ['server/kasse/GutscheinServiceTest.java'] },
    ],
  },
  {
    id: 'ladevolumen',
    title: 'Ladevolumen je Fahrzeug prüfen',
    ticket: 'MOB-4801',
    epic: 'Liefertreue erhöhen',
    mr: '!1251',
    merged: '2026-09-10',
    path: ['Auslieferung', 'Tourenplanung', 'Ladevolumen'],
    classifiedVia: ['Ticket MOB-4801 im Epic „Liefertreue erhöhen“', 'Nutzerhandbuch Tourenplanung, Kapitel 2.4 „Ladevolumen“'],
    summary: 'Jedes Fahrzeug hat jetzt ein Ladevolumen. Ist eine Tour zu voll, wird sie rot markiert und lässt sich nur nach Bestätigung speichern.',
    before: [{ text: 'Stopps auf die Tour ziehen' }, { text: 'Tour speichern' }],
    after: [
      { text: 'Stopps auf die Tour ziehen' },
      { text: 'Ladevolumen prüfen, bei Überladung rot markiert', mark: 'neu' },
      { text: 'Überladung bestätigen und speichern', mark: 'geändert' },
    ],
    aspects: [
      { kind: 'feld', module: 'tour', text: 'Feld „Ladevolumen“ im Fahrzeugstamm', commits: ['8c3d1f5'] },
      { kind: 'parameter', module: 'tour', text: 'Zwei neue Parameter', commits: ['a4e6b90'] },
      { kind: 'prozess', module: 'tour', text: 'Warnung bei Überladung', commits: ['1f9c7d2'] },
    ],
    commits: [
      { hash: '8c3d1f5', date: '2026-09-02', author: 'P. Schuster', message: 'MOB-4801 Fahrzeugstamm: Feld Ladevolumen (m³)', kind: 'feld', files: ['web/src/stamm/Fahrzeug.tsx', 'desktop/stamm/FrmFahrzeug.pas'] },
      { hash: 'a4e6b90', date: '2026-09-04', author: 'P. Schuster', message: 'MOB-4801 Parameter TOUR_MAX_LADEVOLUMEN_M3 und TOUR_UEBERLADUNG_ERLAUBT', kind: 'parameter', files: ['config/parameter/tour.yaml'] },
      { hash: '1f9c7d2', date: '2026-09-08', author: 'P. Schuster', message: 'MOB-4801 Tour rot markieren bei Überladung, Speichern mit Bestätigung', kind: 'prozess', files: ['web/src/tour/TourKopf.tsx', 'server/tour/TourPruefung.java'] },
      { hash: 'c5b2e83', date: '2026-09-09', author: 'P. Schuster', message: 'MOB-4801 Tests Volumenberechnung', kind: 'test', files: ['server/tour/TourPruefungTest.java'] },
    ],
  },
  {
    id: 'lieferstopp',
    title: '„Liefersperre“ heißt jetzt „Lieferstopp“',
    ticket: 'MOB-4835',
    mr: '!1290',
    merged: '2026-09-25',
    path: ['Auftragsabwicklung', 'Kaufvertrag', 'Lieferung und Montage'],
    alsoAffects: ['Tourenplanung'],
    classifiedVia: ['Ticket MOB-4835', 'Dialogbeschreibung Kaufvertrag, Register „Lieferung“'],
    summary: 'Nur ein neuer Name für dasselbe Feld. Der Ablauf bleibt gleich.',
    aspects: [
      { kind: 'label', module: 'kaufvertrag', text: 'Feldname geändert', commits: ['d71c5e8'] },
      { kind: 'label', module: 'tour', text: 'Feldname geändert', commits: ['d71c5e8'] },
    ],
    commits: [
      { hash: 'd71c5e8', date: '2026-09-24', author: 'M. Yilmaz', message: 'MOB-4835 „Liefersperre“ heißt jetzt „Lieferstopp“ (Web und Desktop)', kind: 'label', files: ['web/src/i18n/de.json', 'desktop/res/texte_de.rc'] },
      { hash: '2b8f6a1', date: '2026-09-24', author: 'M. Yilmaz', message: 'MOB-4835 Übersetzungen nachgezogen (nl, fr)', kind: 'label', files: ['web/src/i18n/nl.json', 'web/src/i18n/fr.json'] },
    ],
  },
  {
    id: 'kassenbelege',
    title: 'Kassenbelege nach Jahr partitionieren',
    ticket: 'MOB-4790',
    epic: 'Performance Tagesabschluss',
    mr: '!1262',
    merged: '2026-09-16',
    path: ['Kasse', 'Tagesabschluss und Belege', 'Datenhaltung'],
    classifiedVia: ['Ticket MOB-4790 im Epic „Performance Tagesabschluss“', 'Technische Doku Kasse, Kapitel 3 „Tabelle kassenbeleg“'],
    summary: 'Nur die Ablage in der Datenbank ändert sich. Kassierer und Buchhaltung merken davon nichts, außer dass der Tagesabschluss schneller läuft.',
    aspects: [{ kind: 'datenbank', module: 'kasse', text: 'Tabelle kassenbeleg nach Belegjahr aufgeteilt', commits: ['f2a9c71', '6c1d0e4'] }],
    commits: [
      { hash: 'f2a9c71', date: '2026-09-10', author: 'K. Brenner', message: 'MOB-4790 kassenbeleg nach Belegjahr partitionieren', kind: 'datenbank', files: ['db/migration/V26_4_015__kassenbeleg_partition.sql'] },
      { hash: '6c1d0e4', date: '2026-09-12', author: 'K. Brenner', message: 'MOB-4790 Sicht kassenbeleg_alle für jahresübergreifende Abfragen', kind: 'datenbank', files: ['db/migration/V26_4_016__kassenbeleg_alle.sql'] },
      { hash: '9e4b3a2', date: '2026-09-14', author: 'K. Brenner', message: 'MOB-4790 Lasttest Tagesabschluss', kind: 'test', files: ['test/last/Tagesabschluss.jmx'] },
    ],
  },
  {
    id: 'druckvorlagen',
    title: 'Neue Vorlagen-Technik im Druckmanagement',
    ticket: 'MOB-4760',
    epic: 'Technische Erneuerung',
    mr: '!1270',
    merged: '2026-09-18',
    path: ['Druck und Belege', 'Belegvorlagen'],
    classifiedVia: ['Ticket MOB-4760 im Epic „Technische Erneuerung“', 'Installations- und Updatehandbuch, Kapitel 4.2'],
    summary: 'Ein Umbau unter der Haube: Belege sehen gleich aus. Nur kundeneigene Vorlagen müssen nach dem Update einmal umgestellt werden.',
    aspects: [
      { kind: 'intern', module: 'druck', text: 'Druckausgabe über neue Vorlagen-Technik', commits: ['5a0b7c4', 'e3d9f12', '71c4a8b', 'c8e2d06', '0f6b3e9'] },
      { kind: 'betrieb', module: 'plattform', text: 'Eigene Vorlagen nach dem Update konvertieren', commits: ['9b1e4d7'] },
    ],
    commits: [
      { hash: '5a0b7c4', date: '2026-09-03', author: 'P. Schuster', message: 'MOB-4760 Druckausgabe über neue Vorlagen-Schicht', kind: 'intern', files: ['server/druck/VorlagenEngine.java'] },
      { hash: 'e3d9f12', date: '2026-09-07', author: 'A. Becker', message: 'MOB-4760 Rechnungsvorlage umgestellt', kind: 'intern', files: ['druck/vorlagen/rechnung.html'] },
      { hash: '71c4a8b', date: '2026-09-08', author: 'A. Becker', message: 'MOB-4760 Lieferscheinvorlage umgestellt', kind: 'intern', files: ['druck/vorlagen/lieferschein.html'] },
      { hash: 'c8e2d06', date: '2026-09-09', author: 'A. Becker', message: 'MOB-4760 Kaufvertragsvorlage umgestellt', kind: 'intern', files: ['druck/vorlagen/kaufvertrag.html'] },
      { hash: '9b1e4d7', date: '2026-09-11', author: 'P. Schuster', message: 'MOB-4760 Job „Vorlagen konvertieren“ für kundeneigene Vorlagen', kind: 'betrieb', files: ['server/admin/VorlagenKonvertieren.java'] },
      { hash: '0f6b3e9', date: '2026-09-15', author: 'P. Schuster', message: 'MOB-4760 Alte Druck-Engine entfernt', kind: 'intern', files: ['server/druck/legacy/'] },
      { hash: '2d7a5f1', date: '2026-09-16', author: 'A. Becker', message: 'MOB-4760 Tests Druckausgabe', kind: 'test', files: ['server/druck/VorlagenEngineTest.java'] },
    ],
  },
  {
    id: 'kasse-tests',
    title: 'Testabdeckung Kasse erhöht',
    ticket: 'MOB-4815',
    mr: '!1275',
    merged: '2026-09-21',
    path: ['Kasse', 'Qualitätssicherung'],
    classifiedVia: ['Ticket MOB-4815', 'Nur Testdateien geändert'],
    summary: 'Nur Tests. Für Anwender, Administratoren und Entwickler ändert sich nichts Sichtbares.',
    noDocsReason: 'Alle fünf Commits ändern nur Testcode. Kein Verhalten, keine Oberfläche, keine Daten.',
    aspects: [{ kind: 'intern', module: 'kasse', text: 'Nur Tests', commits: ['44b0e1a', 'a9c3f70', '13de8b5', '6e2a9c4', 'f0b8d31'] }],
    commits: [
      { hash: '44b0e1a', date: '2026-09-17', author: 'A. Becker', message: 'MOB-4815 Tests Tagesabschluss', kind: 'test', files: ['server/kasse/TagesabschlussTest.java'] },
      { hash: 'a9c3f70', date: '2026-09-17', author: 'A. Becker', message: 'MOB-4815 Tests Storno', kind: 'test', files: ['server/kasse/StornoTest.java'] },
      { hash: '13de8b5', date: '2026-09-18', author: 'A. Becker', message: 'MOB-4815 Tests Kartenzahlung', kind: 'test', files: ['server/kasse/KartenzahlungTest.java'] },
      { hash: '6e2a9c4', date: '2026-09-18', author: 'A. Becker', message: 'MOB-4815 Testdaten aufgeräumt', kind: 'test', files: ['test/daten/kasse/'] },
      { hash: 'f0b8d31', date: '2026-09-19', author: 'A. Becker', message: 'MOB-4815 Testlauf in der Pipeline', kind: 'test', files: ['.gitlab-ci.yml'] },
    ],
  },
]

/* ---------- Proposals ---------- */

export type Size = 'satz' | 'absatz' | 'kapitel' | 'seite' | 'tabelle' | 'bild'

export const sizes: Record<Size, string> = {
  satz: 'Satz',
  absatz: 'Absatz',
  kapitel: 'Neues Kapitel',
  seite: 'Neue Seite',
  tabelle: 'Tabellenzeilen',
  bild: 'Bild',
}

export type Confidence = 'hoch' | 'mittel' | 'pruefen'

export const confidences: Record<Confidence, string> = { hoch: 'Sicher', mittel: 'Wahrscheinlich', pruefen: 'Kurz prüfen' }

/**
 * One proposed edit. `at` is the block it refers to (-1 = start of the document).
 * replace: swap `find` for `text` inside that block (in a table: in every cell).
 * insert:  new blocks after it. rows: new rows at the end of that table.
 * note:    a task for a person (e.g. redraw a picture), optionally with text to insert.
 */
export type Proposal = {
  id: string
  bundle: string
  doc: string
  at: number
  op: 'replace' | 'insert' | 'rows' | 'note'
  find?: string
  text?: string
  blocks?: Block[]
  rows?: string[][]
  size: Size
  title: string
  why: string
  confidence: Confidence
  commits: string[]
  /** A question to a person, when the code alone does not answer it. */
  question?: string
  /** What a person still has to do by hand. */
  task?: string
}

export const proposals: Proposal[] = [
  /* — Teillieferung: Nutzerhandbuch Kaufvertrag — */
  {
    id: 'p01',
    bundle: 'teillieferung',
    doc: 'nh-kaufvertrag',
    at: 5,
    op: 'replace',
    find: 'Ein Kaufvertrag wird immer vollständig ausgeliefert. Er steht erst auf „Lieferbereit“, wenn alle Positionen im Lager eingegangen sind.',
    text: 'Ein Kaufvertrag wird vollständig ausgeliefert, außer Sie vereinbaren eine Teillieferung (siehe 3.4). Ohne Teillieferung steht er erst auf „Lieferbereit“, wenn alle Positionen im Lager eingegangen sind.',
    size: 'satz',
    title: '„Immer vollständig ausgeliefert“ stimmt nicht mehr',
    why: 'Seit MOB-4812 lässt sich ein Kaufvertrag in Teile aufteilen.',
    confidence: 'hoch',
    commits: ['c04e9a1', '5d9e2f7'],
  },
  {
    id: 'p02',
    bundle: 'teillieferung',
    doc: 'nh-kaufvertrag',
    at: 7,
    op: 'insert',
    blocks: [
      { kind: 'h', text: '3.4 Teillieferung vereinbaren' },
      { kind: 'p', text: 'Ist ein Teil der Ware schon im Lager, können Sie den Kaufvertrag in mehrere Lieferungen aufteilen. Zum Beispiel: das Sofa jetzt, die Küche nach dem Wareneingang.' },
      { kind: 'p', text: '1. Setzen Sie im Register „Lieferung“ den Haken „Teillieferung erlaubt“.\n2. Klicken Sie auf „Lieferung aufteilen“ und ziehen Sie die Positionen auf Teil 1, Teil 2 und so weiter.\n3. Geben Sie für jeden Teil einen eigenen Wunschtermin an. Jeder Teil wird einzeln disponiert.' },
      { kind: 'p', text: 'Ein Teil muss mindestens 20 % des Warenwerts enthalten. Möglich sind höchstens 3 Teile. Beide Werte legt Ihr Administrator fest.' },
      { kind: 'p', text: 'Für jeden gelieferten Teil erstellt MOBIQ eine Teilrechnung. Die Anzahlung wird anteilig verrechnet.' },
    ],
    size: 'kapitel',
    title: 'Neues Kapitel 3.4 „Teillieferung vereinbaren“',
    why: 'Neuer Arbeitsschritt im Verkauf, bisher in keinem Dokument beschrieben.',
    confidence: 'hoch',
    commits: ['c04e9a1', '5d9e2f7', 'e81b6aa', '3f7a1b8'],
  },
  {
    id: 'p03',
    bundle: 'teillieferung',
    doc: 'nh-kaufvertrag',
    at: 7,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Bei einem Finanzkauf ist keine Teillieferung möglich.' }],
    size: 'satz',
    title: 'Rückfrage: Teillieferung bei Finanzkauf?',
    why: 'Im Code ist die Teillieferung bei Finanzkauf gesperrt. Kein Dokument und kein Ticket sagt, ob das so bleiben soll.',
    question: 'Soll das so ins Handbuch, oder ist die Sperre nur vorläufig?',
    confidence: 'pruefen',
    commits: ['5d9e2f7'],
  },
  {
    id: 'p04',
    bundle: 'teillieferung',
    doc: 'nh-kaufvertrag',
    at: 9,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Bei einer Teillieferung ist mit jedem Teil nur der Anteil der Restzahlung fällig, der auf die gelieferten Positionen entfällt.' }],
    size: 'satz',
    title: 'Restzahlung je Teil',
    why: 'Die Restzahlung wird jetzt je Lieferteil berechnet.',
    confidence: 'mittel',
    commits: ['3f7a1b8'],
  },
  /* — Teillieferung: Tourenplanung — */
  {
    id: 'p05',
    bundle: 'teillieferung',
    doc: 'nh-tour',
    at: 2,
    op: 'replace',
    find: 'Ein Kaufvertrag ist immer genau ein Stopp auf einer Tour.',
    text: 'Ein Kaufvertrag ist ein Stopp auf einer Tour. Bei einer Teillieferung ist jeder Teil ein eigener Stopp, erkennbar am Zusatz „T1“, „T2“ und so weiter.',
    size: 'satz',
    title: '„Immer genau ein Stopp“ stimmt nicht mehr',
    why: 'Lieferteile werden als eigene Stopps geplant.',
    confidence: 'hoch',
    commits: ['92ac4d0'],
  },
  {
    id: 'p06',
    bundle: 'teillieferung',
    doc: 'nh-tour',
    at: 4,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Bei einer Teillieferung plant MOBIQ die Montage nur für den Teil ein, der die Montageposition enthält.' }],
    size: 'satz',
    title: 'Montage nur beim passenden Teil',
    why: 'Der Stopp-Aufbau prüft jetzt je Teil, ob eine Montageposition dabei ist.',
    confidence: 'hoch',
    commits: ['92ac4d0'],
  },
  /* — Teillieferung: Kasse (unsicher) — */
  {
    id: 'p07',
    bundle: 'teillieferung',
    doc: 'nh-kasse',
    at: 4,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Bei einer Teillieferung kassiert der Fahrer nur den Anteil der Restzahlung, der auf den gelieferten Teil entfällt.' }],
    size: 'satz',
    title: 'Fahrer kassiert nur den Anteil',
    why: 'Die Fahrer-App zeigt den Betrag je Teil. Ob das Kassenbuch ihn auch so zeigt, ist im Code nicht eindeutig.',
    confidence: 'pruefen',
    commits: ['3f7a1b8'],
  },
  /* — Teillieferung: Finanzbuchhaltung — */
  {
    id: 'p08',
    bundle: 'teillieferung',
    doc: 'nh-fibu',
    at: 4,
    op: 'replace',
    find: 'Die Schlussrechnung wird nach vollständiger Auslieferung erstellt. Mit ihr wird die gesamte Anzahlung verrechnet.',
    text: 'Ohne Teillieferung wird die Schlussrechnung nach vollständiger Auslieferung erstellt und mit ihr die gesamte Anzahlung verrechnet. Bei einer Teillieferung entsteht je Teil eine Teilrechnung (Belegart „TR“). Die Anzahlung wird anteilig nach Warenwert verrechnet, eine Rundungsdifferenz mit dem letzten Teil.',
    size: 'absatz',
    title: 'Anzahlung wird nicht mehr nur mit der Schlussrechnung verrechnet',
    why: 'Teilrechnungen verrechnen die Anzahlung jetzt anteilig. Das betrifft die Buchhaltung beim Kunden direkt.',
    confidence: 'hoch',
    commits: ['3f7a1b8', '0d4e8f3', 'b6c2d55'],
  },
  {
    id: 'p09',
    bundle: 'teillieferung',
    doc: 'nh-fibu',
    at: 6,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Bei einer Teillieferung wird der Erlös mit dem Datum der jeweiligen Teilrechnung gebucht. Alle Teilrechnungen tragen dieselbe Kaufvertragsnummer, damit die Restzahlung richtig zugeordnet wird.' }],
    size: 'satz',
    title: 'Erlös je Teilrechnung',
    why: 'Jede Teilrechnung geht mit eigenem Datum, aber gleicher Kaufvertragsnummer in den Export.',
    confidence: 'mittel',
    commits: ['3f7a1b8', 'b6c2d55'],
  },
  /* — Teillieferung: Dialogbeschreibung — */
  {
    id: 'p10',
    bundle: 'teillieferung',
    doc: 'dlg-kaufvertrag',
    at: 2,
    op: 'rows',
    rows: [
      ['Teillieferung erlaubt', 'Checkbox', 'nein', 'Erlaubt das Aufteilen in mehrere Lieferungen. Nur sichtbar, wenn TEILLIEF_ERLAUBT = Ja; bei Finanzkauf gesperrt'],
      ['Lieferung aufteilen', 'Schaltfläche', '–', 'Öffnet den Dialog „Lieferung aufteilen“'],
    ],
    size: 'tabelle',
    title: 'Zwei neue Felder im Register „Lieferung“',
    why: 'Im Register gibt es eine neue Checkbox und eine neue Schaltfläche.',
    confidence: 'hoch',
    commits: ['c04e9a1', '5d9e2f7'],
  },
  {
    id: 'p11',
    bundle: 'teillieferung',
    doc: 'dlg-kaufvertrag',
    at: 3,
    op: 'insert',
    blocks: [
      { kind: 'h', text: 'Dialog „Lieferung aufteilen“' },
      { kind: 'p', text: 'Öffnet sich über die Schaltfläche „Lieferung aufteilen“. Speichern ist erst möglich, wenn jeder Teil den Mindestwarenwert erreicht.' },
      {
        kind: 'table',
        head: ['Feld', 'Typ', 'Pflicht', 'Beschreibung'],
        rows: [
          ['Teil', 'Liste', 'ja', 'Teil 1 bis höchstens TEILLIEF_MAX_ANZAHL'],
          ['Positionen', 'Ziehen und Ablegen', 'ja', 'Mindestens eine Position je Teil'],
          ['Warenwert', 'Anzeige', '–', 'Anteil am Gesamtwert; Warnung unter TEILLIEF_MIN_WARENWERT_PROZ'],
          ['Wunschtermin', 'KW-Auswahl', 'ja', 'Je Teil'],
        ],
      },
    ],
    size: 'kapitel',
    title: 'Neuer Abschnitt für den Dialog „Lieferung aufteilen“',
    why: 'Neuer Dialog mit vier Feldern, bisher nicht beschrieben.',
    confidence: 'hoch',
    commits: ['5d9e2f7', 'e81b6aa', '4a7e912'],
  },
  /* — Teillieferung: Parametertabelle — */
  {
    id: 'p12',
    bundle: 'teillieferung',
    doc: 'par-auftrag',
    at: 2,
    op: 'rows',
    rows: [
      ['TEILLIEF_ERLAUBT', 'Teillieferungen im Mandanten erlauben', 'Nein', '–', '–', 'Ja/Nein'],
      ['TEILLIEF_MAX_ANZAHL', 'Höchstzahl Teile je Kaufvertrag', '3', '2', '5', 'Teile'],
      ['TEILLIEF_MIN_WARENWERT_PROZ', 'Mindestanteil am Warenwert je Teil', '20', '10', '90', '%'],
    ],
    size: 'tabelle',
    title: 'Drei neue Parameter mit Min/Max',
    why: 'Neue Parameter im Endstand des Features. Der Zwischenstand „1 bis 10“ aus Commit 7be21d4 ist überholt.',
    confidence: 'hoch',
    commits: ['7be21d4', 'e81b6aa'],
  },
  {
    id: 'p13',
    bundle: 'teillieferung',
    doc: 'par-auftrag',
    at: 6,
    op: 'rows',
    rows: [['FIBU_BELEGART_TEILRECHNUNG', 'Belegart für Teilrechnungen im Export', 'TR', '–', '–', 'Kürzel']],
    size: 'tabelle',
    title: 'Neuer Parameter für die Belegart',
    why: 'Die Belegart der Teilrechnung ist einstellbar.',
    confidence: 'hoch',
    commits: ['b6c2d55'],
  },
  /* — Teillieferung: Technische Doku — */
  {
    id: 'p14',
    bundle: 'teillieferung',
    doc: 'td-fibu',
    at: 2,
    op: 'replace',
    find: 'AZ = Anzahlung',
    text: 'AZ = Anzahlung, TR = Teilrechnung',
    size: 'satz',
    title: 'Neue Belegart TR',
    why: 'Der Export kennt eine vierte Belegart.',
    confidence: 'hoch',
    commits: ['b6c2d55'],
  },
  {
    id: 'p15',
    bundle: 'teillieferung',
    doc: 'td-fibu',
    at: 2,
    op: 'rows',
    rows: [
      ['teillieferung_nr', 'smallint', 'Nummer des Lieferteils (1 bis 5), leer ohne Teillieferung'],
      ['az_verrechnet', 'numeric(12,2)', 'Mit diesem Beleg verrechneter Anteil der Anzahlung'],
    ],
    size: 'tabelle',
    title: 'Zwei neue Felder im Buchungssatz',
    why: 'Der Buchungssatz hat zwei neue Felder.',
    confidence: 'hoch',
    commits: ['b6c2d55'],
  },
  {
    id: 'p16',
    bundle: 'teillieferung',
    doc: 'td-fibu',
    at: 4,
    op: 'replace',
    find: 'Mit der Schlussrechnung wird die Anzahlung vollständig verrechnet (Feld az_betrag des Kaufvertrags).',
    text: 'Die Anzahlung wird anteilig nach dem Warenwert des Lieferteils verrechnet (Feld az_verrechnet). Rundungsdifferenzen gleicht der letzte Teil aus. Ohne Teillieferung verrechnet die Schlussrechnung den vollen Betrag.',
    size: 'absatz',
    title: 'Verrechnung der Anzahlung neu beschreiben',
    why: 'Anteilige Verrechnung und Rundungsregel aus der Fehlerbehebung 0d4e8f3.',
    confidence: 'hoch',
    commits: ['3f7a1b8', '0d4e8f3'],
  },
  {
    id: 'p17',
    bundle: 'teillieferung',
    doc: 'td-datenmodell',
    at: 1,
    op: 'rows',
    rows: [['lieferteil', 'Teil einer Teillieferung', 'lt_id, FK kv_id']],
    size: 'tabelle',
    title: 'Neue Tabelle lieferteil',
    why: 'Neue Tabelle aus Migration V26_4_012.',
    confidence: 'hoch',
    commits: ['a1f3c09'],
  },
  {
    id: 'p18',
    bundle: 'teillieferung',
    doc: 'td-datenmodell',
    at: 4,
    op: 'rows',
    rows: [['V26_4_012', 'Tabelle lieferteil, Spalte tour_stopp.lt_id', 'unter 1 min']],
    size: 'tabelle',
    title: 'Migration V26_4_012',
    why: 'Neue Migration im Release 26.4.',
    confidence: 'hoch',
    commits: ['a1f3c09'],
  },
  {
    id: 'p19',
    bundle: 'teillieferung',
    doc: 'arch-gesamt',
    at: 1,
    op: 'note',
    blocks: [{ kind: 'p', text: 'Ab Version 26.4 erzeugen Lieferteile eigene Teilrechnungen. Sie laufen wie alle Rechnungen über fibu-export.' }],
    task: 'Im Bild den Pfeil „Lieferteil → Teilrechnung → fibu-export“ ergänzen.',
    size: 'bild',
    title: 'Architekturbild: neuer Datenfluss',
    why: 'Ein neuer Weg vom Kaufvertrag in die Finanzbuchhaltung. Das Bild selbst zeichnet neuraldoc nicht um.',
    confidence: 'mittel',
    commits: ['3f7a1b8', 'b6c2d55'],
  },
  /* — Gutschein — */
  {
    id: 'p20',
    bundle: 'gutschein',
    doc: 'nh-kasse',
    at: 1,
    op: 'replace',
    find: 'Ein Gutschein kann nur vollständig eingelöst werden. Ist der Einkauf günstiger als der Gutschein, verfällt der Rest nicht, sondern wird als neuer Gutschein ausgegeben.',
    text: 'Ein Gutschein kann auch teilweise eingelöst werden. Das Restguthaben bleibt auf demselben Gutschein und wird auf dem Bon gedruckt.',
    size: 'absatz',
    title: 'Teileinlösung statt neuem Gutschein',
    why: 'Der Rest wird nicht mehr als neuer Gutschein ausgegeben, sondern bleibt auf dem alten.',
    confidence: 'hoch',
    commits: ['3e8a5c1', '7d2f9b4'],
  },
  {
    id: 'p21',
    bundle: 'gutschein',
    doc: 'nh-fibu',
    at: 8,
    op: 'replace',
    find: 'Bei Einlösung wird die Verbindlichkeit vollständig aufgelöst.',
    text: 'Bei Einlösung wird die Verbindlichkeit in Höhe des eingelösten Betrags aufgelöst. Ein Restguthaben bleibt als Verbindlichkeit stehen.',
    size: 'satz',
    title: 'Verbindlichkeit nur anteilig auflösen',
    why: 'Die Buchung löst jetzt nur den eingelösten Betrag auf.',
    confidence: 'hoch',
    commits: ['e5a1c36'],
  },
  /* — Ladevolumen — */
  {
    id: 'p22',
    bundle: 'ladevolumen',
    doc: 'nh-tour',
    at: 6,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Überschreitet eine Tour das Ladevolumen des Fahrzeugs, wird sie rot markiert. Sie können trotzdem speichern, müssen die Überladung aber bestätigen.' }],
    size: 'absatz',
    title: 'Warnung bei Überladung',
    why: 'Neue Prüfung beim Speichern einer Tour.',
    confidence: 'hoch',
    commits: ['1f9c7d2'],
  },
  {
    id: 'p23',
    bundle: 'ladevolumen',
    doc: 'par-auftrag',
    at: 4,
    op: 'rows',
    rows: [
      ['TOUR_MAX_LADEVOLUMEN_M3', 'Ladevolumen für neu angelegte Fahrzeuge', '38', '5', '60', 'm³'],
      ['TOUR_UEBERLADUNG_ERLAUBT', 'Speichern trotz Überladung (mit Bestätigung)', 'Ja', '–', '–', 'Ja/Nein'],
    ],
    size: 'tabelle',
    title: 'Zwei neue Tour-Parameter',
    why: 'Neue Parameter mit Grenzen aus tour.yaml.',
    confidence: 'hoch',
    commits: ['a4e6b90'],
  },
  {
    id: 'p24',
    bundle: 'ladevolumen',
    doc: 'dlg-fahrzeug',
    at: -1,
    op: 'insert',
    blocks: [
      { kind: 'h', text: 'Fahrzeugstamm' },
      { kind: 'p', text: 'Aufruf über Stammdaten › Fahrzeuge. Ein Fahrzeug kann auf beliebig vielen Touren eingesetzt werden.' },
      {
        kind: 'table',
        head: ['Feld', 'Typ', 'Pflicht', 'Beschreibung'],
        rows: [
          ['Kennzeichen', 'Text', 'ja', 'Amtliches Kennzeichen'],
          ['Ladevolumen', 'Zahl (m³)', 'ja', 'Vorbelegt mit TOUR_MAX_LADEVOLUMEN_M3; Grenze für die Überladungswarnung'],
          ['Zuladung', 'Zahl (kg)', 'nein', 'Nur zur Information, wird nicht geprüft'],
          ['Filiale', 'Auswahl', 'ja', 'Standort, an dem das Fahrzeug startet'],
        ],
      },
    ],
    size: 'seite',
    title: 'Neue Seite: Dialogbeschreibung Fahrzeugstamm',
    why: 'Für den Fahrzeugstamm gibt es noch keine Dialogbeschreibung. Das neue Pflichtfeld „Ladevolumen“ braucht eine.',
    confidence: 'mittel',
    commits: ['8c3d1f5'],
  },
  /* — Lieferstopp (Umbenennung) — */
  {
    id: 'p25',
    bundle: 'lieferstopp',
    doc: 'nh-kaufvertrag',
    at: 1,
    op: 'replace',
    find: 'keine Liefersperre gesetzt ist',
    text: 'kein Lieferstopp gesetzt ist',
    size: 'satz',
    title: 'Liefersperre → Lieferstopp',
    why: 'Neuer Feldname, Artikel angepasst („keine“ → „kein“).',
    confidence: 'hoch',
    commits: ['d71c5e8'],
  },
  {
    id: 'p26',
    bundle: 'lieferstopp',
    doc: 'nh-tour',
    at: 9,
    op: 'replace',
    find: 'gesetzter Liefersperre',
    text: 'gesetztem Lieferstopp',
    size: 'satz',
    title: 'Liefersperre → Lieferstopp',
    why: 'Neuer Feldname, Endung angepasst („gesetzter“ → „gesetztem“).',
    confidence: 'hoch',
    commits: ['d71c5e8'],
  },
  {
    id: 'p27',
    bundle: 'lieferstopp',
    doc: 'dlg-kaufvertrag',
    at: 2,
    op: 'replace',
    find: 'Liefersperre',
    text: 'Lieferstopp',
    size: 'satz',
    title: 'Liefersperre → Lieferstopp',
    why: 'Neuer Feldname in der Feldtabelle.',
    confidence: 'hoch',
    commits: ['d71c5e8'],
  },
  /* — Kassenbelege (nur Datenbank) — */
  {
    id: 'p28',
    bundle: 'kassenbelege',
    doc: 'td-datenmodell',
    at: 4,
    op: 'rows',
    rows: [
      ['V26_4_015', 'Tabelle kassenbeleg nach Belegjahr partitionieren', 'ca. 4 min'],
      ['V26_4_016', 'Sicht kassenbeleg_alle', 'unter 1 min'],
    ],
    size: 'tabelle',
    title: 'Migrationen V26_4_015 und V26_4_016',
    why: 'Zwei neue Migrationen im Release 26.4.',
    confidence: 'hoch',
    commits: ['f2a9c71', '6c1d0e4'],
  },
  {
    id: 'p29',
    bundle: 'kassenbelege',
    doc: 'td-kasse',
    at: 1,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Ab Version 26.4 ist kassenbeleg nach Belegjahr partitioniert. Abfragen über mehrere Jahre laufen über die Sicht kassenbeleg_alle.' }],
    size: 'absatz',
    title: 'Partitionierung beschreiben',
    why: 'Neue Ablage nach Jahr und neue Sicht für jahresübergreifende Abfragen.',
    confidence: 'hoch',
    commits: ['f2a9c71', '6c1d0e4'],
  },
  {
    id: 'p30',
    bundle: 'kassenbelege',
    doc: 'td-kasse',
    at: 3,
    op: 'replace',
    find: 'Ältere Jahrgänge können über die Archivfunktion ausgelagert werden.',
    text: 'Ältere Jahrgänge liegen in eigenen Partitionen und lassen sich ohne Sperre der Kasse auslagern.',
    size: 'satz',
    title: 'Auslagern ohne Sperre',
    why: 'Durch die Partitionen muss die Kasse beim Auslagern nicht mehr gesperrt werden.',
    confidence: 'mittel',
    commits: ['f2a9c71'],
  },
  /* — Druckvorlagen (Umbau mit einem Schritt für Admins) — */
  {
    id: 'p31',
    bundle: 'druckvorlagen',
    doc: 'inst-update',
    at: 3,
    op: 'insert',
    blocks: [{ kind: 'p', text: 'Ab Version 26.4: Stellen Sie eigene Belegvorlagen (Rechnung, Lieferschein, Kaufvertrag) einmal unter Administration › Vorlagen konvertieren um. Nicht umgestellte Vorlagen werden mit dem Standardlayout gedruckt.' }],
    size: 'absatz',
    title: 'Neuer Schritt nach dem Update',
    why: 'Sechs von sieben Commits sind reiner Umbau. Einer bringt einen Schritt, den Administratoren kennen müssen.',
    confidence: 'hoch',
    commits: ['9b1e4d7'],
  },
]

/* ---------- Review of past releases (hit quality) ---------- */

/** What the editorial team actually had to change per release, and what neuraldoc would have proposed. */
export const backtest = [
  { release: '25.3', needed: 24, found: 23, falseAlarms: 4 },
  { release: '25.4', needed: 31, found: 29, falseAlarms: 5 },
  { release: '26.1', needed: 27, found: 26, falseAlarms: 3 },
  { release: '26.2', needed: 29, found: 28, falseAlarms: 2 },
  { release: '26.3', needed: 26, found: 25, falseAlarms: 3 },
]

export type Sensitivity = 'streng' | 'ausgewogen' | 'gruendlich'

export const sensitivities: Record<Sensitivity, { label: string; found: number; falseAlarms: number; text: string }> = {
  streng: { label: 'Streng', found: 119, falseAlarms: 6, text: 'Wenig Klicks, mehr bleibt liegen.' },
  ausgewogen: { label: 'Ausgewogen', found: 131, falseAlarms: 17, text: 'Unsicheres kommt als „Kurz prüfen“.' },
  gruendlich: { label: 'Gründlich', found: 135, falseAlarms: 41, text: 'Fast nichts bleibt liegen, doppelt so viele Fehlalarme.' },
}

export const missed = [
  { release: '25.4', what: 'Kasse: neues Bon-Layout, Screenshot im Handbuch veraltet', why: 'Nur ein Bild betroffen, kein Text', fix: 'Jetzt: betroffene Screenshots werden als „Bild prüfen“ markiert.' },
  { release: '26.1', what: 'Lager: Grenze für Inventurdifferenzen', why: 'Der Wert stand nur in einer Kundenkonfiguration, nicht im Produktcode', fix: 'Kundenkonfigurationen als eigene Quelle anbinden.' },
  { release: '25.3', what: 'Tour: Reihenfolge der Stopps', why: 'Geändert im Kartendienst eines Partners, nicht im eigenen Code', fix: 'Versionshinweise des Partners als Quelle anbinden.' },
  { release: '26.2', what: 'Fibu: Feldlänge im Export', why: 'Die technische Doku lag nicht im angebundenen Ordner', fix: 'Ordner ergänzt; die Abdeckung zeigt jetzt, was fehlt.' },
  { release: '25.4', what: 'Kaufvertrag: Telefonnummer wurde Pflichtfeld', why: 'Pflicht nur über eine Regel in der Datenbank, nicht im Dialogcode', fix: 'Jetzt: Regeln in der Datenbank werden mitgelesen.' },
  { release: '26.3', what: 'Kasse: Rundung bei Barzahlung in der Schweiz', why: 'Nur für Schweizer Mandanten; das Handbuch hat keinen Länderbezug', fix: 'Länder als Zielgruppe je Dokument hinterlegbar.' },
]

export const falseAlarmReasons = [
  { reason: 'Stand schon richtig, in einem anderen Kapitel', count: 7 },
  { reason: 'Betraf nur eine interne Admin-Funktion', count: 5 },
  { reason: 'Testcode als Verhalten gelesen', count: 3 },
  { reason: 'Nur eine Stilfrage', count: 2 },
]

/** What the filters removed before anyone saw it (same five releases). */
export const filtered = { perCommit: 412, withoutAudience: 209 }
