export const isMac = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('macintosh') || userAgent.includes('mac os x');
};
