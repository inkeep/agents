import { describe, expect, it } from 'vitest';
import { validatePreview } from '../../validation/preview-validation';

describe('validatePreview', () => {
  it('should validate valid preview code', () => {
    const preview = {
      code: `import { User } from 'lucide-react';

function MyComponent(props) {
  return (
    <div className="p-4">
      <User className="size-4" />
      <span>{props.name}</span>
    </div>
  );
}`,
      data: { name: 'Test User' },
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject code with dangerous eval pattern', () => {
    const preview = {
      code: `function MyComponent(props) {
  eval(props.code);
  return <div>Bad</div>;
}`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('dangerous pattern'))).toBe(true);
  });

  it('should reject code with dangerouslySetInnerHTML', () => {
    const preview = {
      code: `function MyComponent(props) {
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('dangerous pattern'))).toBe(true);
  });

  it('should reject code with disallowed imports', () => {
    const preview = {
      code: `import axios from 'axios';

function MyComponent(props) {
  return <div>{props.name}</div>;
}`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not allowed'))).toBe(true);
  });

  it('should reject code with export statements', () => {
    const preview = {
      code: `function MyComponent(props) {
  return <div>{props.name}</div>;
}

export default MyComponent;`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('export'))).toBe(true);
  });

  it('should reject code exceeding size limit', () => {
    const preview = {
      code: 'a'.repeat(60000),
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('size exceeds'))).toBe(true);
  });

  it('should reject code without function declaration', () => {
    const preview = {
      code: `const MyComponent = <div>Hello</div>;`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('function declaration'))).toBe(true);
  });

  it('should reject code without return statement', () => {
    const preview = {
      code: `function MyComponent(props) {
  console.log(props.name);
}`,
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('return statement'))).toBe(true);
  });

  it('should reject missing or invalid code', () => {
    const preview = {
      code: '',
      data: {},
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'preview.code')).toBe(true);
  });

  it('should reject missing or invalid data', () => {
    const preview = {
      code: `function MyComponent(props) {
  return <div>{props.name}</div>;
}`,
      data: null as any,
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'preview.data')).toBe(true);
  });

  it('should accept valid code with lucide-react imports', () => {
    const preview = {
      code: `import { User, Mail, Calendar } from 'lucide-react';

function MyComponent(props) {
  return (
    <div>
      <User />
      <Mail />
      <Calendar />
      {props.name}
    </div>
  );
}`,
      data: { name: 'Test' },
    };

    const result = validatePreview(preview);
    expect(result.isValid).toBe(true);
  });
});
