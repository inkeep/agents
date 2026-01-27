---
title: Prefer `<Context>` over `<Context.Provider>`
description:
---

In React 19, you can render `<Context>` as a provider instead of `<Context.Provider>`:

```jsx
const ThemeContext = createContext('');

function App({ children }) {
  return (
    <ThemeContext value="dark">
      {children}
    </ThemeContext>
  );  
}
```
