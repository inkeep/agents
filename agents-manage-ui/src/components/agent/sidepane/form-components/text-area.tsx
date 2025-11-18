import type { FC, Ref } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { FieldLabel } from './label';
import type { BaseFieldProps } from './types';

interface TextareaFieldProps extends BaseFieldProps {
  maxHeight?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export const TextareaField: FC<TextareaFieldProps> = ({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  error,
  className,
  description,
  tooltip,
  maxHeight = 'max-h-96',
  isRequired,
  disabled,
  ref,
  readOnly,
}) => {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} label={label} isRequired={isRequired} tooltip={tooltip} error={error} />
      <Textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        className={cn(
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          maxHeight,
          className
        )}
        disabled={disabled}
        readOnly={readOnly}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
};
