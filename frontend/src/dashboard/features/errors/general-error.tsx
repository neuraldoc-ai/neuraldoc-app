import { type ReactNode } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/** Shared layout of all error pages: code, one sentence, a way back. */
export function ErrorScreen({ code, title, body, actions = true, className }: { code?: string; title: string; body: ReactNode; actions?: boolean; className?: string }) {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2 px-4'>
        {code && <h1 className='display text-[7rem]'>{code}</h1>}
        <span className='font-medium'>{title}</span>
        <p className='max-w-md text-center text-muted-foreground'>{body}</p>
        {actions && (
          <div className='mt-6 flex gap-3'>
            <Button variant='outline' onClick={() => history.go(-1)}>
              Zurück
            </Button>
            <Button onClick={() => navigate({ to: '/' })}>Zur Übersicht</Button>
          </div>
        )}
      </div>
    </div>
  )
}

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
}

export function GeneralError({ className, minimal = false }: GeneralErrorProps) {
  return <ErrorScreen code={minimal ? undefined : '500'} title='Da ist etwas schiefgelaufen.' body='Versuch es gleich noch einmal.' actions={!minimal} className={className} />
}
