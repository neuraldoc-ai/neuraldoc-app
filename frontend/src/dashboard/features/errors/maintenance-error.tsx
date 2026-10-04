import { ErrorScreen } from './general-error'

export function MaintenanceError() {
  return <ErrorScreen code='503' title='Wartung.' body='neuraldoc ist gleich wieder erreichbar.' actions={false} />
}
