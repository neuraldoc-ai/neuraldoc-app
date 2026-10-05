import { ErrorScreen } from './general-error'

export function UnauthorisedError() {
  return <ErrorScreen code='401' title='Bitte melde dich an.' body='Deine Sitzung ist abgelaufen.' />
}
