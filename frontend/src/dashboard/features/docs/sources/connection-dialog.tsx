/**
 * Adding or editing an own PostgreSQL connection: single fields or a connection URL, SSL, schema, a test before
 * saving. The password goes to the local server and never comes back.
 */
import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle, PlugZap, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { post } from '../project-sources'
import type { Connection } from './db/db'

type Form = { name: string; host: string; port: string; database: string; user: string; password: string; ssl: Connection['ssl']; schema: string; url: string }
type Tested = { ok: true; version: string; user: string; tables: number; ms: number }

const SSL_OPTIONS: { value: Connection['ssl']; label: string; hint: string }[] = [
  { value: 'prefer', label: 'Wenn möglich', hint: 'SSL, falls der Server es anbietet' },
  { value: 'require', label: 'Erforderlich', hint: 'Für Datenbanken im Internet' },
  { value: 'verify-full', label: 'Mit Zertifikatsprüfung', hint: 'Nur mit gültigem Zertifikat' },
  { value: 'disable', label: 'Aus', hint: 'Nur lokal' },
]

const empty: Form = { name: '', host: '', port: '5432', database: '', user: '', password: '', ssl: 'prefer', schema: 'public', url: '' }
const fromConnection = (c: Connection): Form => ({ name: c.name, host: c.host, port: String(c.port), database: c.database, user: c.user, password: '', ssl: c.ssl, schema: c.schema, url: '' })

export function ConnectionDialog({ open, onOpenChange, connection, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; connection?: Connection; onSaved?: (c: Connection) => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>(() => (connection ? fromConnection(connection) : empty))
  const [mode, setMode] = useState<'fields' | 'url'>('fields')
  const [pending, setPending] = useState<'' | 'test' | 'save' | 'delete'>('')
  const [tested, setTested] = useState<Tested | null>(null)
  const [error, setError] = useState('')
  const set = (key: keyof Form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setTested(null); setError('') }
  const body = () => ({ id: connection?.id, ...(mode === 'url' ? { url: form.url, name: form.name, schema: form.schema } : { ...form, url: undefined, port: Number(form.port) || 5432 }) })
  const complete = mode === 'url' ? !!form.url.trim() : !!(form.host.trim() && form.database.trim() && form.user.trim())

  async function act(kind: 'test' | 'save' | 'delete') {
    setPending(kind); setError('')
    try {
      if (kind === 'test') setTested(await post<Tested>('/api/mcp/db/test', body(), 'Der Test ist fehlgeschlagen.'))
      if (kind === 'save') {
        const saved = await post<Connection>('/api/mcp/db/connections', body(), 'Die Verbindung konnte nicht gespeichert werden.')
        await queryClient.invalidateQueries({ queryKey: ['db', 'connections'] })
        toast.success(`Verbindung „${saved.name}“ gespeichert`)
        onSaved?.(saved); onOpenChange(false)
      }
      if (kind === 'delete' && connection) {
        await post('/api/mcp/db/connections/delete', { id: connection.id }, 'Die Verbindung konnte nicht gelöscht werden.')
        await queryClient.invalidateQueries({ queryKey: ['db', 'connections'] })
        toast.success(`Verbindung „${connection.name}“ gelöscht`)
        onOpenChange(false)
      }
    } catch (cause) {
      setTested(null)
      setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt.')
    } finally { setPending('') }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending) onOpenChange(value) }}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{connection ? 'Verbindung bearbeiten' : 'Datenbank verbinden'}</DialogTitle>
          <DialogDescription>PostgreSQL auf deinem Rechner oder unter einer Internetadresse. neuraldoc liest nur und ändert nichts.</DialogDescription>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={(e) => { e.preventDefault(); if (complete) void act('save') }}>
          <Field id='db-name' label='Name' optional>
            <Input id='db-name' value={form.name} onChange={(e) => set('name', e.target.value)} placeholder='z. B. Produktion (nur lesen)' maxLength={80} />
          </Field>
          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'fields' | 'url'); setTested(null); setError('') }}>
            <TabsList>
              <TabsTrigger value='fields'>Einzelne Angaben</TabsTrigger>
              <TabsTrigger value='url'>Verbindungs-URL</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === 'url' ? (
            <Field id='db-url' label='Verbindungs-URL' hint='Das Passwort darf in der URL stehen. Es wird nur auf dem Server gespeichert.'>
              <Input id='db-url' value={form.url} onChange={(e) => set('url', e.target.value)} placeholder='postgres://benutzer:passwort@host:5432/datenbank?sslmode=require' autoComplete='off' spellCheck={false} />
            </Field>
          ) : (
            <>
              <div className='grid gap-4 sm:grid-cols-[1fr_96px]'>
                <Field id='db-host' label='Host' hint='Läuft die Datenbank auf deinem Rechner, heißt er im Container host.docker.internal.'>
                  <Input id='db-host' value={form.host} onChange={(e) => set('host', e.target.value)} placeholder='host.docker.internal oder db.example.com' autoComplete='off' spellCheck={false} />
                </Field>
                <Field id='db-port' label='Port'>
                  <Input id='db-port' value={form.port} onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))} inputMode='numeric' maxLength={5} />
                </Field>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field id='db-database' label='Datenbank'>
                  <Input id='db-database' value={form.database} onChange={(e) => set('database', e.target.value)} placeholder='postgres' autoComplete='off' spellCheck={false} />
                </Field>
                <Field id='db-user' label='Benutzer'>
                  <Input id='db-user' value={form.user} onChange={(e) => set('user', e.target.value)} placeholder='readonly' autoComplete='off' spellCheck={false} />
                </Field>
              </div>
              <Field id='db-password' label='Passwort'>
                <Input id='db-password' type='password' value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={connection?.passwordSet ? 'Gespeichert. Leer lassen, um es zu behalten' : ''} autoComplete='new-password' />
              </Field>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field id='db-ssl' label='SSL' hint={SSL_OPTIONS.find((o) => o.value === form.ssl)?.hint}>
                  <Select value={form.ssl} onValueChange={(v) => set('ssl', v)}>
                    <SelectTrigger id='db-ssl' className='w-full'><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SSL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id='db-schema' label='Schema'>
                  <Input id='db-schema' value={form.schema} onChange={(e) => set('schema', e.target.value)} placeholder='public' autoComplete='off' spellCheck={false} />
                </Field>
              </div>
            </>
          )}
          <p className='text-xs text-muted-foreground'>Am besten mit einem Benutzer, der nur lesen darf. Jede Abfrage läuft schreibgeschützt, höchstens 15 Sekunden und liefert bis zu 1.000 Zeilen.</p>
          {tested && (
            <p role='status' className='flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'>
              <Check className='size-4 shrink-0' /> Verbunden mit {tested.version} als {tested.user} · {tested.tables} Tabellen · {tested.ms} ms
            </p>
          )}
          {error && <p role='alert' className='rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>{error}</p>}
          <DialogFooter className='gap-2 sm:justify-between'>
            {connection ? (
              <Button type='button' variant='ghost' className='text-destructive' disabled={!!pending} onClick={() => void act('delete')}>
                {pending === 'delete' ? <LoaderCircle className='animate-spin' /> : <Trash2 />} Löschen
              </Button>
            ) : <span />}
            <span className='flex gap-2'>
              <Button type='button' variant='outline' disabled={!complete || !!pending} onClick={() => void act('test')}>
                {pending === 'test' ? <LoaderCircle className='animate-spin' /> : <PlugZap />} Testen
              </Button>
              <Button type='submit' disabled={!complete || !!pending}>
                {pending === 'save' && <LoaderCircle className='animate-spin' />} Speichern
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ id, label, optional, hint, children }: { id: string; label: string; optional?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className='grid content-start gap-2'>
      <Label htmlFor={id}>
        {label}
        {optional && <span className='font-normal text-muted-foreground'>· optional</span>}
      </Label>
      {children}
      {hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
    </div>
  )
}
