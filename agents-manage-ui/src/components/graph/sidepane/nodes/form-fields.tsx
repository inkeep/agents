import { Info } from 'lucide-react';
import { forwardRef } from 'react';
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
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
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
}

interface TextareaFieldProps extends BaseFieldProps {
  maxHeight?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      id,
      name,
      label,
      value,
      onChange,
      placeholder,
      error,
      className = '',
      description,
      tooltip,
      type = 'text',
      isRequired = false,
      disabled = false,
    },
    ref
  ) => {
    return (
      <div className="space-y-2">
        <Label htmlFor={id} className={cn(error ? 'text-red-600' : '', 'gap-1')}>
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
          data-invalid={error ? '' : undefined}
          className={`w-full data-invalid:border-red-300 data-invalid:focus-visible:border-red-300 data-invalid:focus-visible:ring-red-300 ${className}`}
          disabled={disabled}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    );
  }
);

InputField.displayName = 'InputField';

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    {
      id,
      name,
      label,
      value,
      onChange,
      placeholder,
      error,
      className = '',
      description,
      maxHeight = 'max-h-96',
      disabled = false,
    },
    ref
  ) => {
    return (
      <div className="space-y-2">
        <Label htmlFor={id} className={error ? 'text-red-600' : ''}>
          {label}
        </Label>
        <Textarea
          ref={ref}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          data-invalid={error ? '' : undefined}
          className={`w-full ${maxHeight} data-invalid:border-red-300 data-invalid:focus-visible:border-red-300 data-invalid:focus-visible:ring-red-300 ${className}`}
          disabled={disabled}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    );
  }
);

TextareaField.displayName = 'TextareaField';
