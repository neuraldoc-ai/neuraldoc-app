/**
 * "Über MOBIQ": the invented company, its modules and what changed in release 26.4, in one glance.
 */
import data from '@dataset/dashboard.json'
import { Info } from 'lucide-react'
import { type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { type Nature } from '../data'
import { NatureBadge } from '../ui'
import { PersonChip, blue } from './shared'

const modules: { name: string; what: string }[] = [
  { name: 'Kaufvertrag', what: 'Kunde, Positionen, Anzahlung und Finanzkauf erfassen' },
  { name: 'Lieferung und Montage', what: 'Wunschtermin, Lieferbereitschaft, Montage beauftragen' },
  { name: 'Tourenplanung', what: 'Lieferungen auf Touren und Fahrzeuge verteilen, Fahrer-App' },
  { name: 'Kasse', what: 'Bons, Gutscheine, Kartenzahlung, Tagesabschluss je Filiale' },
  { name: 'Faktura', what: 'Rechnungen schreiben, Anzahlung verrechnen' },
  { name: 'Finanzbuchhaltung', what: 'Nächtliche Übergabe der Belege an die Buchhaltung' },
  { name: 'Druck und Belege', what: 'Vorlagen für Rechnung, Lieferschein, Kaufvertrag, Bon' },
]

/** What each change of 26.4 means, in one line, and which modules it touches. */
const changeInfo: Record<string, { short: string; modules: string[] }> = {
  teillieferung: { short: 'Kaufvertrag in Teile aufteilen (Sofa jetzt, Küche später). Je Teil eigene Tour und Teilrechnung.', modules: ['Kaufvertrag', 'Lieferung und Montage', 'Tourenplanung', 'Faktura', 'Finanzbuchhaltung'] },
  gutschein: { short: 'Restguthaben bleibt auf dem Gutschein. Die Buchhaltung löst nur den eingelösten Betrag auf.', modules: ['Kasse', 'Finanzbuchhaltung'] },
  ladevolumen: { short: 'Fahrzeuge haben ein Ladevolumen. Zu volle Touren werden rot markiert.', modules: ['Tourenplanung'] },
  kassenbelege: { short: 'Kassenbelege nach Jahr abgelegt. Tagesabschluss wird schneller.', modules: ['Kasse'] },
  druckvorlagen: { short: 'Neue Technik für Belegvorlagen. Eigene Vorlagen einmal umstellen.', modules: ['Druck und Belege'] },
  'avis-standard': { short: 'Kunden werden 24 statt 48 Stunden vorher benachrichtigt. Ohne Ticket.', modules: ['Lieferung und Montage'] },
  'kasse-tests': { short: 'Nur zusätzliche Tests.', modules: ['Kasse'] },
  lieferstopp: { short: 'Nur ein neuer Name für dasselbe Feld.', modules: ['Kaufvertrag'] },
  'hotfix-tagesabschluss': { short: 'Fehler im Tagesabschluss behoben.', modules: ['Kasse'] },
}

const team = [
  ['Markus Engel', 'Product Owner'],
  ['Jonas Albrecht', 'Entwicklung'],
  ['Lena Hoffmann', 'Faktura und Fibu'],
  ['Sabine Kröger', 'Redaktion Handbuch'],
  ['Miriam Thelen', 'Fachberatung'],
]

export function AboutMobiq() {
  const commits = data.changes.reduce((n, c) => n + c.commits.length, 0)
  const countFor = (m: string) => data.changes.filter((c) => changeInfo[c.id]?.modules.includes(m)).length
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size='sm' variant='outline'>
          <Info /> Über MOBIQ
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[92svh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle className='text-xl'>MOBIQ auf einen Blick</DialogTitle>
          <DialogDescription>Erfundenes Beispiel, angelehnt an einen ERP-Hersteller für den Möbelhandel.</DialogDescription>
        </DialogHeader>

        <div className='grid gap-6'>
          <Section label='Firma'>
            <strong className='font-medium'>Musterhaus Software GmbH</strong> baut <strong className='font-medium'>MOBIQ</strong>, ein ERP für Möbel- und Küchenhäuser. Desktop, Web und eine Fahrer-App.
          </Section>

          <Section label='Module'>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {modules.map((m) => {
                const n = countFor(m.name)
                return (
                  <div key={m.name} className='grid content-start gap-1 rounded-lg border p-3'>
                    <span className='flex items-center justify-between gap-2'>
                      <span className='font-medium'>{m.name}</span>
                      {n > 0 && (
                        <Badge variant='outline' className={cn('font-normal', blue)}>
                          {n} in {data.release}
                        </Badge>
                      )}
                    </span>
                    <span className='text-[13px] text-muted-foreground'>{m.what}</span>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section label={`Release ${data.release}`}>
            <p className='mb-3'>
              {data.changes.length} Änderungen aus {commits} Commits, gemergt zwischen 3. und 29. September.
            </p>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Änderung</TableHead>
                    <TableHead>Art</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className='text-right'>Commits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.changes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className='max-w-[420px] align-top whitespace-normal'>
                        <span className='block font-medium'>{c.title}</span>
                        <span className='block text-[13px] text-muted-foreground'>{changeInfo[c.id]?.short}</span>
                        <span className='mt-1 flex flex-wrap gap-1'>
                          {changeInfo[c.id]?.modules.map((m) => (
                            <Badge key={m} variant='secondary' className='font-normal'>
                              {m}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className='align-top'>
                        <NatureBadge nature={c.nature as Nature} />
                      </TableCell>
                      <TableCell className='align-top font-mono text-xs'>{c.ticket ?? <span className='text-late-fg'>keins</span>}</TableCell>
                      <TableCell className='text-right align-top tabular-nums'>{c.commits.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section label='Wer'>
            <span className='flex flex-wrap gap-x-5 gap-y-2'>
              {team.map(([n, r]) => (
                <span key={n} className='grid gap-0.5'>
                  <PersonChip name={n} />
                  <span className='ps-8 text-xs text-muted-foreground'>{r}</span>
                </span>
              ))}
            </span>
          </Section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button size='sm'>Zu den Daten</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-2'>
      <span className='text-xs font-medium tracking-wide text-brand-600 uppercase'>{label}</span>
      <div className='min-w-0 text-sm leading-6'>{children}</div>
    </div>
  )
}
