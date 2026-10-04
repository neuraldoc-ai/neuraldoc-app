import { ErrorScreen } from './general-error'

export function NotFoundError() {
  return <ErrorScreen code='404' title='Seite nicht gefunden.' body='Diese Seite gibt es in der Demo nicht.' />
}
