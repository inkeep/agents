declare namespace React {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}
