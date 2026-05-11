import { CheckCircle2 } from 'lucide-react';

interface Props {
  /** When false the badge renders nothing. Lets callers wire it inline
   * without conditional logic at every site. */
  reviewed: boolean | null | undefined;
  /** Render variant. `chip` is the default — a small pill suitable for
   * card headers. `inline` is a single check icon for very tight spaces. */
  variant?: 'chip' | 'inline';
  className?: string;
}

/**
 * Visual indicator that this row descends from a source document a
 * content manager has marked as "reviewed". The same component renders
 * across diary events, MK expenses, and any future document-derived data.
 */
export function ReviewedBadge({ reviewed, variant = 'chip', className = '' }: Props) {
  if (!reviewed) return null;

  if (variant === 'inline') {
    return (
      <span title="תוכן זה אומת ע״י מנהל תוכן" className={className}>
        <CheckCircle2
          className="w-3.5 h-3.5 text-green-600"
          aria-label="נבדק"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 font-medium ${className}`}
      title="תוכן זה אומת ע״י מנהל תוכן"
    >
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
      נבדק
    </span>
  );
}
