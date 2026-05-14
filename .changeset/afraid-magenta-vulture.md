---
"@inkeep/agents-manage-ui": patch
---

Fix reCAPTCHA token generation in production by calling grecaptcha.execute directly. react-google-recaptcha-v3's first-mount initialization fails silently in production builds (no React Strict Mode double-mount safety net), leaving useGoogleReCaptcha's executeRecaptcha stuck at undefined. Removed the library entirely; the reCAPTCHA script is now injected via next/script and the executor calls window.grecaptcha.execute directly via grecaptcha.ready.
