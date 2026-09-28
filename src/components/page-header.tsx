import { cn } from '@/lib/utils';

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
}

export function PageHeader({
  title,
  description,
  children,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center',
        className
      )}
      {...props}
    >
      <div className="grid gap-0.5">
        <h1 className="text-lg font-bold tracking-tight leading-none">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 gap-1.5">{children}</div>}
    </div>
  );
}
