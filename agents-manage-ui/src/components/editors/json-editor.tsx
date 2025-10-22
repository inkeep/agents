'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { MonacoEditor } from './monaco-editor';

interface JsonEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.json`;
}

export const JsonEditor: FC<JsonEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= `${id}.json`;
  return <MonacoEditor uri={uri} {...props} />;
};
