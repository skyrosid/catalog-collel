import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'success' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium [&_svg]:size-3',
        tone === 'success'
          ? 'border-sage/15 bg-sage-light text-sage'
          : tone === 'warning'
            ? 'border-primary/15 bg-accent text-primary'
            : 'border-border bg-muted/50 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
