import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

// Brand mark: linked letterform shared with the landing page.
export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg' className={cn('size-6', className)} {...props}>
      <title>neuraldoc</title>
      <path d='M6 24V12a6 6 0 0 1 12 0v7a4 4 0 0 0 8 0V7' fill='none' stroke='currentColor' strokeWidth='4.5' strokeLinecap='round' />
      <circle cx='6' cy='25' r='2.7' fill='currentColor' />
      <circle cx='26' cy='6' r='2.7' fill='currentColor' />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-[-0.03em] text-foreground', className)}>
      <Logo className='size-[1em]' />
      neuraldoc
    </span>
  )
}
