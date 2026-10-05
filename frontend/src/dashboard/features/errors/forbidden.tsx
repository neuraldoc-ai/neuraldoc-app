import { ErrorScreen } from './general-error'

export function ForbiddenError() {
  return <ErrorScreen code='403' title='Kein Zugriff.' body='Für diese Seite fehlen dir die Rechte.' />
}
