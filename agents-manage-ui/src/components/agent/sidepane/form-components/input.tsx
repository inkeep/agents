import type { FC, Ref } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FieldLabel } from './label';
import type { BaseFieldProps } from './types';

interface InputFieldProps extends BaseFieldProps {
  type?: 'text' | 'email' | 'password' | 'url';
  ref?: Ref<HTMLInputElement>;
}

export const InputField: FC<InputFieldProps> = ({
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
  type = 'text',
  isRequired,
  disabled,
  ref,
  readOnly,
}) => {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} label={label} isRequired={isRequired} tooltip={tooltip} error={error} />
      <Input
        ref={ref}
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        className={cn(
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
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
