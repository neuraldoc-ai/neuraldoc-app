export function prepareReview(
  targets: { id: string; title: string }[],
  generate: (id: string) => Promise<{ result: { status: string; question: string } }>,
  progress: (completed: number, total: number) => void,
): Promise<{ id: string; title: string; message: string }[]>
