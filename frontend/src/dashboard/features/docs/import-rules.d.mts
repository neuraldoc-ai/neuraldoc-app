export const LIMITS: { codeFiles: number; codeBytes: number; fileBytes: number; sections: number; sectionChars: number; uploadBytes: number }
export const DOC: RegExp
export function classify(path: string, role: 'repo' | 'docs'): 'code' | 'doc' | null
export function repoUrl(value: string): { url: string; name: string } | null
export function ignored(path: string): boolean
export function gitignore(files: Record<string, string>): (path: string) => boolean
