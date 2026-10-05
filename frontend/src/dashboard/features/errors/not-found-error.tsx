import { ErrorScreen } from './general-error'

export function NotFoundError() {
  return <ErrorScreen code='404' title='Seite nicht gefunden.' body='Unter dieser Adresse gibt es keine Seite.' />
}
