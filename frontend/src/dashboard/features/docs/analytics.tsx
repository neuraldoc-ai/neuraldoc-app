import { useState } from 'react'
import { CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { analytics } from './model'
import { Frame, Stat } from './ui'
import { datasetMode } from './data'
import { projectState } from './project'
import { UsageSection } from './usage'

const chartConfig = {
  precision: { label: 'Präzision', color: 'var(--chart-1)' },
  recall: { label: 'Recall', color: 'var(--chart-2)' },
  f1: { label: 'F1-Score', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function AnalyticsPage() {
  const { total, history } = analytics()
  const [release, setRelease] = useState('all')
  const selected = history.find((row) => row.release === release) ?? total
  if (datasetMode === 'working') return <Frame title='Analytics' lead='Analyse deines importierten Projekts.'><div className='grid gap-4 sm:grid-cols-3'><Stat label='Code-Dateien' value={projectState.project?.files.length || 0} /><Stat label='Dokumente' value={projectState.project?.documents.length || 0} /><Stat label='Mit Jev geprüft' value={projectState.project?.mapping?.subjects || 0} /></div><Card><CardHeader><CardTitle>Noch keine Qualitätsmessung</CardTitle><CardDescription>Präzision und Recall brauchen manuell geprüfte Vergleichsdaten. Die MOBIQ-Benchmarkwerte werden nicht auf dein Projekt übertragen.</CardDescription></CardHeader></Card><UsageSection /></Frame>
  return (
    <Frame title='Analytics' lead='Wie gut neuraldoc in den ausgewerteten Releases lag.'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <Stat label='Präzision' value={`${total.precision} %`} hint='Anteil korrekter Vorschläge' />
        <Stat label='Recall' value={`${total.recall} %`} hint='Anteil erkannter nötiger Änderungen' />
        <Stat label='F1-Score' value={`${total.f1} %`} hint='Kombiniert Präzision und Recall' />
        <Stat label='Ausgewertete Releases' value={history.length} hint={`${history[0].release} bis ${history[history.length - 1].release}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Modellleistung im Zeitverlauf</CardTitle>
          <CardDescription>Präzision, Recall und F1-Score je Release, in Prozent.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className='h-[300px] w-full'>
            <LineChart accessibilityLayer data={history} margin={{ top: 30, right: 30, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey='release' tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} %`} width={48} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `Release ${label}`} formatter={(value, name) => <span>{chartConfig[name as keyof typeof chartConfig]?.label}: {value} %</span>} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type='linear' dataKey='precision' stroke='var(--color-precision)' strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}>
                <LabelList dataKey='precision' position='bottom' offset={12} className='fill-foreground text-[11px]' />
              </Line>
              <Line type='linear' dataKey='recall' stroke='var(--color-recall)' strokeWidth={2} strokeDasharray='6 4' dot={{ r: 4 }} isAnimationActive={false}>
                <LabelList dataKey='recall' position='top' offset={12} className='fill-foreground text-[11px]' />
              </Line>
              <Line type='linear' dataKey='f1' stroke='var(--color-f1)' strokeWidth={2} strokeDasharray='2 4' dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='flex flex-wrap items-start justify-between gap-4 sm:flex-row'>
          <div className='grid gap-1.5'>
            <CardTitle>Confusion Matrix</CardTitle>
            <CardDescription>Modellvorhersage im Vergleich zum tatsächlichen Änderungsbedarf.</CardDescription>
          </div>
          <Select value={release} onValueChange={setRelease}>
            <SelectTrigger className='w-[190px]' aria-label='Release für die Confusion Matrix'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Alle Releases</SelectItem>
              {history.map((row) => <SelectItem key={row.release} value={row.release}>Release {row.release}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='min-w-[150px]'>Vorhersage ↓ · Tatsächlich →</TableHead>
                <TableHead className='min-w-[160px] text-center'>Änderung nötig</TableHead>
                <TableHead className='min-w-[160px] text-center'>Keine Änderung nötig</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableHead scope='row'>Änderung vorgeschlagen</TableHead>
                <TableCell className='bg-muted/60 py-6 text-center'><strong className='block text-3xl font-medium tabular-nums'>{selected.found}</strong><span className='text-xs text-muted-foreground'>Treffer (TP)</span></TableCell>
                <TableCell className='py-6 text-center'><strong className='block text-3xl font-medium tabular-nums'>{selected.falseAlarms}</strong><span className='text-xs text-muted-foreground'>Fehlalarme (FP)</span></TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope='row'>Keine Änderung vorgeschlagen</TableHead>
                <TableCell className='bg-[var(--late)]/10 py-6 text-center'><strong className='block text-3xl font-medium tabular-nums'>{selected.missed}</strong><span className='text-xs text-muted-foreground'>Übersehen (FN)</span></TableCell>
                <TableCell className='bg-muted/60 py-6 text-center'><strong className='block text-lg font-medium'>Nicht erfasst</strong><span className='text-xs text-muted-foreground'>Korrekt ignoriert (TN)</span></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className='text-xs text-muted-foreground'>Korrekt ignorierte Änderungen sind im Backtest nicht erfasst. Daher werden Accuracy und Spezifität nicht berechnet.</p>
        </CardContent>
      </Card>
    </Frame>
  )
}
