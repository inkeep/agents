export const isMac = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const userAgent: string = window.navigator?.userAgent?.toLowerCase();
  return userAgent.includes('macintosh') || userAgent.includes('mac os x');
};
