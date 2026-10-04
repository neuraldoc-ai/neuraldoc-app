/** Bounded parallel preparation; every completed target reports real progress. */
export async function prepareReview(targets, generate, progress) {
  let next = 0
  let completed = 0
  const issues = []
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (next < targets.length) {
      const target = targets[next++]
      try {
        const draft = await generate(target.id)
        if (draft.result.status === 'needs_context') issues.push({ id: target.id, title: target.title, message: draft.result.question })
      } catch (error) {
        issues.push({ id: target.id, title: target.title, message: error instanceof Error ? error.message : 'Texterstellung fehlgeschlagen.' })
      }
      progress(++completed, targets.length)
    }
  }))
  return issues
}
