/**
 * Changes: commits grouped into one change per feature (ticket + merge request).
 * Proposals are made once, after the merge, from the final state — never per commit.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { datasetMode, release } from './data'
import { BundlePage } from './bundle'
import { docLabel, docOf, fmtDay, useBundles, useSummary } from './model'
import { ChangeBadge } from './own-change'
import { DocTypeBadge, Frame, NatureBadge, Path } from './ui'

export function BundlesPage() {
  const sum = useSummary()
  const items = useBundles()
  const navigate = useNavigate()
  // An imported project has exactly one change: its initial check.
  if (datasetMode === 'working' && items.length === 1) return <BundlePage id={items[0].id} />
  if (datasetMode === 'working') return <OwnChanges />
  return (
    <Frame title='Änderungen' lead='Jedes Feature mit den Doku-Änderungen, die es auslöst.'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Stat n={sum.open} label='Offen' hint={`von ${sum.total} Doku-Vorschlägen`} accent={sum.open > 0} />
        <Stat n={sum.done} label='Erledigt' hint={sum.total ? `${Math.round((sum.done / sum.total) * 100)} % abgearbeitet` : 'noch nichts vorgeschlagen'} />
        <Stat n={sum.withDocs} label='Änderungen mit Doku-Bezug' hint={`von ${sum.bundles} Änderungen, ${sum.bundles - sum.withDocs} ohne Doku-Änderung`} />
        <Stat n={sum.docsTouched} label='Dokumente betroffen' hint={`aus ${sum.commits} Commits in Release ${release.id}`} />
      </div>
      <Card className='py-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='ps-5'>Änderung</TableHead>
              <TableHead>Art</TableHead>
              <TableHead className='text-right'>Commits</TableHead>
              <TableHead>Betroffene Doku-Arten</TableHead>
              <TableHead className='text-right'>Offen</TableHead>
              <TableHead className='pe-5 text-right'>Gemergt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((b) => (
              <TableRow key={b.id} className='cursor-pointer' onClick={() => navigate({ to: '/aenderungen/$id', params: { id: b.id } })}>
                <TableCell className='max-w-[420px] py-3 ps-5 whitespace-normal'>
                  <Link to='/aenderungen/$id' params={{ id: b.id }} className='font-medium underline-offset-4 hover:underline' onClick={(e) => e.stopPropagation()}>
                    {b.title}
                  </Link>
                  <Path path={b.path.slice(-2)} className='mt-0.5 text-xs' />
                </TableCell>
                <TableCell>
                  <NatureBadge nature={b.nature} />
                </TableCell>
                <TableCell className='text-right tabular-nums'>{b.commits.length}</TableCell>
                <TableCell className='whitespace-normal'>
                  {b.types.length ? (
                    <span className='flex flex-wrap gap-1'>
                      {b.types.map((t) => (
                        <DocTypeBadge key={t} type={t} />
                      ))}
                    </span>
                  ) : (
                    <span className='text-sm text-muted-foreground'>keine</span>
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {b.proposals.length === 0 ? (
                    <span className='text-muted-foreground'>–</span>
                  ) : b.open === 0 ? (
                    <Badge variant='secondary' className='font-normal'>
                      erledigt
                    </Badge>
                  ) : (
                    `${b.open} / ${b.proposals.length}`
                  )}
                </TableCell>
                <TableCell className='pe-5 text-right text-sm text-muted-foreground tabular-nums'>
                  {fmtDay(b.merged)} · {b.mr}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Frame>
  )
}

/** Own project with Git history: every change in plain words, the ones that touch the documentation first. */
function OwnChanges() {
  const sum = useSummary()
  const items = useBundles()
  const navigate = useNavigate()
  const features = items.filter((b) => b.commits.length > 0)
  const rest = items.filter((b) => b.commits.length === 0)
  const sorted = [...features].sort((a, b) => b.proposals.length - a.proposals.length || b.merged.localeCompare(a.merged))
  const internal = features.filter((b) => b.nature === 'intern').length
  return (
    <Frame title='Änderungen' lead='Was sich seit dem letzten Release am Produkt geändert hat, und welche Dokumente deshalb nicht mehr stimmen.'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Stat n={sum.open} label='Offene Vorschläge' hint={`von ${sum.total} insgesamt`} accent={sum.open > 0} />
        <Stat n={sum.done} label='Entschieden' hint={sum.total ? `${Math.round((sum.done / sum.total) * 100)} % abgearbeitet` : 'noch nichts vorgeschlagen'} />
        <Stat n={features.filter((b) => b.proposals.length).length} label='Änderungen mit Doku-Folgen' hint={`von ${features.length}, davon ${internal} intern`} />
        <Stat n={sum.docsTouched} label='Dokumente betroffen' hint={`aus ${sum.commits} Commits`} />
      </div>
      <Card className='py-0'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='ps-5'>Änderung</TableHead>
              <TableHead>Art</TableHead>
              <TableHead>Betroffene Doku</TableHead>
              <TableHead className='text-right'>Offen</TableHead>
              <TableHead className='pe-5 text-right'>Datum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...sorted, ...rest].map((b) => (
              <TableRow key={b.id} className={cn('cursor-pointer', !b.proposals.length && 'text-muted-foreground')} onClick={() => navigate({ to: '/aenderungen/$id', params: { id: b.id } })}>
                <TableCell className='max-w-[560px] py-3 ps-5 whitespace-normal'>
                  <Link to='/aenderungen/$id' params={{ id: b.id }} className={cn('font-medium underline-offset-4 hover:underline', b.proposals.length && 'text-foreground')} onClick={(e) => e.stopPropagation()}>
                    {b.title}
                  </Link>
                  {b.summary && <p className='mt-0.5 line-clamp-1 text-xs text-muted-foreground'>{b.summary}</p>}
                </TableCell>
                <TableCell>
                  <ChangeBadge b={b} />
                </TableCell>
                <TableCell className='whitespace-normal'>
                  {b.docs.length ? (
                    <span className='flex flex-wrap gap-1'>
                      {b.docs.map((d) => (
                        <Badge key={d} variant='secondary' className='font-normal'>
                          {docLabel(docOf(d))}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className='text-sm text-muted-foreground'>keine</span>
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {b.proposals.length === 0 ? <span className='text-muted-foreground'>–</span> : b.open === 0 ? <Badge variant='secondary' className='font-normal'>erledigt</Badge> : `${b.open} / ${b.proposals.length}`}
                </TableCell>
                <TableCell className='pe-5 text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums'>{b.commits.length ? fmtDay(b.merged) : '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Frame>
  )
}

function Stat({ n, label, hint, accent }: { n: number; label: string; hint: string; accent?: boolean }) {
  return (
    <Card className='gap-2 py-5'>
      <CardContent className='grid gap-1'>
        <span className='text-sm text-muted-foreground'>{label}</span>
        <strong className={cn('text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums', accent && 'text-brand-600')}>{n}</strong>
        <span className='text-xs text-muted-foreground'>{hint}</span>
      </CardContent>
    </Card>
  )
}
