// Settings API: status and stored values (/api/mcp/setup), saving (/api/mcp/settings).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { profileFromValues, useProfile } from './profile-store'

export type Secret = { set: boolean; source?: 'ui' | 'env'; hint?: string }
export type Setup = {
  drafting: { provider?: string; label?: string; model?: string; configured: boolean; error?: string }
  jev: { required: boolean; configured: boolean; model: string }
  credentials: Record<string, boolean>
  settings: { values: Record<string, string>; secrets: Record<string, Secret> }
  editable: boolean
}

/** Shared by every page under the query key ["setup"]. */
export async function loadSetup(): Promise<Setup> {
  const response = await fetch('/api/mcp/setup', { cache: 'no-store' })
  if (!response.ok) throw new Error('Einstellungen konnten nicht geladen werden.')
  return response.json() as Promise<Setup>
}

/** Saves fields; a string sets, null removes. Refreshes status, forms and the profile everywhere. */
export function useSaveSettings(onSaved?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, string | null>) => {
      const response = await fetch('/api/mcp/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await response.json().catch(() => ({}))) as Setup & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Einstellungen konnten nicht gespeichert werden.')
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['setup'], data)
      useProfile.getState().set(profileFromValues(data.settings.values))
      onSaved?.()
      toast.success('Einstellungen gespeichert')
    },
    onError: (e) => toast.error(e.message),
  })
}
