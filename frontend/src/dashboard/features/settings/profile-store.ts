// Who uses this installation (Einstellungen → Profil). Loaded with the project, updated on save.
import { create } from 'zustand'

export type Profile = { name: string; company: string; role: string }
export const useProfile = create<{ profile: Profile | null; set: (profile: Profile | null) => void }>((set) => ({
  profile: null,
  set: (profile) => set({ profile }),
}))

export const profileFromValues = (values: Record<string, string>): Profile => ({
  name: values.NEURALDOC_USER_NAME?.trim() ?? '',
  company: values.NEURALDOC_USER_COMPANY?.trim() ?? '',
  role: values.NEURALDOC_USER_ROLE?.trim() ?? '',
})
