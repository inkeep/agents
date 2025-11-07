import { Info } from 'lucide-react';
import type { FC, Ref, ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface BaseFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  description?: string;
  tooltip?: string;
  isRequired?: boolean;
  disabled?: boolean;
}

interface InputFieldProps extends BaseFieldProps {
  type?: 'text' | 'email' | 'password' | 'url';
  ref?: Ref<HTMLInputElement>;
}

interface TextareaFieldProps extends BaseFieldProps {
  maxHeight?: string;
  ref?: Ref<HTMLTextAreaElement>;
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
  isRequired = false,
  disabled = false,
  ref,
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(error && 'text-red-600', 'gap-1')}>
        {label}
        {isRequired && <span className="text-red-500">*</span>}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3 h-3 text-muted-foreground ml-1" />
            </TooltipTrigger>
            <TooltipContent className="break-words">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </Label>
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
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
};

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
  isRequired = false,
  disabled = false,
  ref,
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(error && 'text-red-600', 'gap-1')}>
        {label}
        {isRequired && <span className="text-red-500">*</span>}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3 h-3 text-muted-foreground ml-1" />
            </TooltipTrigger>
            <TooltipContent className="break-words">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </Label>
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
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
};
