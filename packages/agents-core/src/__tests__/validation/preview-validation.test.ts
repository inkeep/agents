import { describe, expect, it } from 'vitest';
import { validateRender } from '../../validation/render-validation';

describe('validateRender', () => {
  it('should validate valid preview code', () => {
    const preview = {
      component: `import { User } from 'lucide-react';

function MyComponent(props) {
  return (
    <div className="p-4">
      <User className="size-4" />
      <span>{props.name}</span>
    </div>
  );
}`,
      mockData: { name: 'Test User' },
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject code with dangerous eval pattern', () => {
    const preview = {
      component: `function MyComponent(props) {
  eval(props.code);
  return <div>Bad</div>;
}`,
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('dangerous pattern'))).toBe(true);
  });

  it('should reject code with dangerouslySetInnerHTML', () => {
    const preview = {
      component: `function MyComponent(props) {
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}`,
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('dangerous pattern'))).toBe(true);
  });

  it('should reject code with disallowed imports', () => {
    const preview = {
      component: `import axios from 'axios';

function MyComponent(props) {
  return <div>{props.name}</div>;
}`,
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not allowed'))).toBe(true);
  });

  it('should reject code exceeding size limit', () => {
    const preview = {
      component: 'a'.repeat(60000),
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('size exceeds'))).toBe(true);
  });

  it('should reject code without function declaration', () => {
    const preview = {
      component: `const MyComponent = <div>Hello</div>;`,
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('function declaration'))).toBe(true);
  });

  it('should reject code without return statement', () => {
    const preview = {
      component: `function MyComponent(props) {
  console.log(props.name);
}`,
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('return statement'))).toBe(true);
  });

  it('should reject missing or invalid code', () => {
    const preview = {
      component: '',
      mockData: {},
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'render.component')).toBe(true);
  });

  it('should reject missing or invalid data', () => {
    const preview = {
      component: `function MyComponent(props) {
  return <div>{props.name}</div>;
}`,
      mockData: null as any,
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'render.mockData')).toBe(true);
  });

  it('should accept valid code with lucide-react imports', () => {
    const preview = {
      component: `import { User, Mail, Calendar } from 'lucide-react';

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
      mockData: { name: 'Test' },
    };

    const result = validateRender(preview);
    expect(result.isValid).toBe(true);
  });
});
