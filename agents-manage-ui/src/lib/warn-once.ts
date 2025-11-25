function createWarnOnce() {
  const messages = new Set<string>();

  return (message: string): void => {
    if (messages.has(message)) {
      return;
    }
    messages.add(message);
    console.warn(message);
  };
}

export const warnOnce = createWarnOnce();
