// The MOBIQ showcase modules (core, draft-context, usage, build-brain) read the prepared example through
// data.ts, like the UI. data.ts starts empty, so they import this module first.
import { installShowcase } from '../frontend/src/dashboard/features/docs/data.ts'

await installShowcase()
