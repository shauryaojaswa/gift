# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Google review assistant

The customer review helper and the in-store review QR code use
`VITE_GOOGLE_REVIEW_URL` when it is set. The supplied Shree Jewellers Google
reviews link is configured as its direct review-writing destination using the
Place ID from Google's own "Write a review" widget in
`.env.example` and the app, so reviews work before adding an environment
override. To replace it, update
`VITE_GOOGLE_REVIEW_URL` in the hosting environment (for Vercel:
**Project Settings → Environment Variables**) and redeploy.

The URL must use HTTPS and point to a Google review or Business Profile page.
The admin **Store Settings → Google Review URL** field is supported when the
environment variable is not set, and takes precedence over the built-in
destination. The environment variable takes precedence over both. Changing a
Vite environment variable requires a new production build.

The `/standee/:slug` page includes a separate QR code that points directly to
this official Google review link. Its existing Spin & Win QR code remains
unchanged.

The assistant copies the customer's optional, editable text and opens Google's
review page. Customers paste their text, choose their own rating, and submit
their review on Google; the app does not submit reviews or interact with
Google's form.
