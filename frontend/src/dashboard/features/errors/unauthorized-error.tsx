import { ErrorScreen } from './general-error'

export function UnauthorisedError() {
  return <ErrorScreen code='401' title='Bitte melden Sie sich an.' body='Ihre Sitzung ist abgelaufen.' />
}
