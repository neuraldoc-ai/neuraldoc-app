/**
 * First start of the normal app: nothing imported yet. Leads to the own project, or to the fictional
 * MOBIQ example, which is cloned from GitHub and then treated like any other project.
 */
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, FlaskConical, KeyRound, LoaderCircle } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loadSetup } from '@/features/settings/api'
import { ProjectControls } from './project-controls'
import { importSample } from './project'

export function EmptyStart() {
  const setup = useQuery({ queryKey: ['setup'], queryFn: loadSetup })
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const ready = !!setup.data?.jev.configured && !!setup.data?.drafting.configured
  return (
    <>
      <AppHeader crumbs={[{ label: 'Start' }]} />
      <Main className='flex min-w-0 flex-col gap-6 pb-16'>
        <div className='grid gap-1.5'>
          <span className='text-xs text-muted-foreground'>Noch kein Projekt</span>
          <h1 className='text-[28px] leading-tight font-medium tracking-[-0.025em]'>Willkommen bei neuraldoc</h1>
          <p className='max-w-[64ch] text-sm text-muted-foreground'>neuraldoc vergleicht deine Doku mit deinem Code und zeigt, wo sie veraltet ist. Du prüfst jeden Vorschlag selbst.</p>
        </div>
        <div className='grid items-start gap-5 lg:grid-cols-2'>
          <Card className='border-brand-200 dark:border-brand-500/30'>
            <CardHeader>
              <CardTitle>Eigenes Projekt</CardTitle>
              <CardDescription>Repository und Doku hineinziehen oder eine GitHub-URL angeben. Deine Dateien bleiben unverändert.</CardDescription>
            </CardHeader>
            <CardContent><ProjectControls prominent /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'><FlaskConical className='size-4' />Beispielprojekt MOBIQ</CardTitle>
              <CardDescription>Ein erfundenes ERP mit Code aus Release 26.4 und Doku aus 26.3. Wird von GitHub geladen und danach wie ein eigenes Projekt geprüft.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-2'>
              <Button variant='outline' className='w-fit' disabled={pending} onClick={() => { setPending(true); setError(''); importSample().catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Laden fehlgeschlagen.'); setPending(false) }) }}>
                {pending ? <LoaderCircle className='animate-spin' /> : <ArrowRight />}{pending ? 'Wird von GitHub geladen …' : 'Beispielprojekt laden'}
              </Button>
              {error && <p role='alert' className='text-xs text-destructive'>{error}</p>}
            </CardContent>
          </Card>
        </div>
        <Card className='gap-3'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'><KeyRound className='size-4' />Für die Prüfung brauchst du eigene Keys</CardTitle>
            <CardDescription>Jev findet die veralteten Stellen, dein LLM formuliert die Korrekturen. Importieren geht auch ohne Keys.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap items-center gap-3'>
            <Badge variant='outline'>{setup.data?.jev.configured && <Check />}Jev · {setup.data?.jev.configured ? 'hinterlegt' : 'fehlt'}</Badge>
            <Badge variant='outline'>{setup.data?.drafting.configured && <Check />}LLM · {setup.data?.drafting.configured ? 'eingerichtet' : 'fehlt'}</Badge>
            {!ready && <Button asChild variant='link' size='sm' className='px-0'><Link to='/einstellungen'>Zu den Einstellungen <ArrowRight /></Link></Button>}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
