/**
 * Doc types across all sources: who reads them, which kinds of change they react to, and where the
 * documents of that type live (Confluence pages and files in the SharePoint library).
 */
import data from '@dataset/dashboard.json'
import { Check, FileText, FileType2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { changeKinds, docTypes, type ChangeKind } from '../data'
import { blue } from './shared'

export const docTypeLabel: Record<string, string> = {
  anwenderhandbuch: 'Nutzerhandbuch',
  dialogbeschreibung: 'Dialogbeschreibung',
  parametertabelle: 'Parametertabelle',
  'technische-doku': 'Technische Doku',
  installation: 'Installationsdoku',
  architektur: 'Architekturbild',
  schulung: 'Schulungsunterlage',
  leistungsbeschreibung: 'Leistungsbeschreibung',
}

const key = { anwenderhandbuch: 'nutzer', dialogbeschreibung: 'dialog', parametertabelle: 'parameter', 'technische-doku': 'technik', installation: 'installation', architektur: 'architektur' } as const

/** Audience and triggers; the six classic types come from the rules in data.ts. */
export const typeInfo: Record<string, { audience: string; reactsTo: ChangeKind[] }> = {
  ...Object.fromEntries(Object.entries(key).map(([t, k]) => [t, { audience: docTypes[k].audience, reactsTo: docTypes[k].reactsTo }])),
  schulung: { audience: 'Verkauf und Kasse in Schulungen, neue Mitarbeitende', reactsTo: ['prozess', 'feld', 'label'] },
  leistungsbeschreibung: { audience: 'Kunden, Vertrieb, Vertragsgrundlage', reactsTo: ['prozess', 'parameter', 'schnittstelle'] },
}

export const typeOrder = Object.keys(docTypeLabel)

export function DocTypesView() {
  return (
    <div className='grid min-w-0 gap-6 [&>*]:min-w-0'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0'>
        {typeOrder.map((t) => {
          const pages = data.pages.filter((p) => p.docType === t)
          const files = data.files.filter((f) => f.docType === t)
          return (
            <Card key={t} className='gap-3'>
              <CardHeader>
                <CardTitle>{docTypeLabel[t]}</CardTitle>
                <CardDescription>Für {typeInfo[t].audience}</CardDescription>
              </CardHeader>
              <CardContent className='grid min-w-0 gap-3 [&>*]:min-w-0'>
                <div className='flex flex-wrap gap-1'>
                  {typeInfo[t].reactsTo.map((k) => (
                    <Badge key={k} variant='outline' className='font-normal'>
                      {changeKinds[k].label}
                    </Badge>
                  ))}
                </div>
                <ul className='grid gap-1 text-[13px] [&>li]:min-w-0'>
                  {pages.map((p) => (
                    <li key={p.id} className='flex items-center gap-1.5'>
                      <FileText className='size-3.5 shrink-0 text-muted-foreground' />
                      <span className='min-w-0 truncate'>{p.title}</span>
                    </li>
                  ))}
                  {files.map((f) => (
                    <li key={f.slug} className='flex items-center gap-1.5'>
                      <FileType2 className='size-3.5 shrink-0 text-brand-600' />
                      <span className='min-w-0 truncate'>{f.name}</span>
                    </li>
                  ))}
                </ul>
                <span className='text-xs text-muted-foreground'>
                  {pages.length} Confluence · {files.length} Dateien
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className='gap-0 py-0'>
        <CardHeader className='border-b py-5'>
          <CardTitle>Zielgruppen-Filter</CardTitle>
          <CardDescription>Welche Art von Änderung welche Doku-Art überhaupt prüfen lässt</CardDescription>
        </CardHeader>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='ps-6'>Was sich ändert</TableHead>
                {typeOrder.map((t) => (
                  <TableHead key={t} className='text-center whitespace-normal'>
                    {docTypeLabel[t]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(changeKinds) as ChangeKind[]).map((k) => (
                <TableRow key={k}>
                  <TableCell className='ps-6 font-medium'>{changeKinds[k].label}</TableCell>
                  {typeOrder.map((t) => (
                    <TableCell key={t} className={cn('text-center')}>
                      {typeInfo[t].reactsTo.includes(k) ? <Check className='mx-auto size-4 text-brand-600' aria-label='wird geprüft' /> : <span className='text-muted-foreground/40'>–</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className='flex items-center gap-2 text-xs text-muted-foreground'>
        <Badge variant='outline' className={cn('font-normal', blue)}>
          Beispiel
        </Badge>
        Kassenbelege partitionieren ist nur „Datenbank“: geprüft wird nur die technische Doku.
      </p>
    </div>
  )
}
