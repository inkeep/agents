declare module 'ssrf-req-filter' {
  import type { Agent } from 'http';
  function ssrfFilter(url: string): Agent;
  export = ssrfFilter;
}
