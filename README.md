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

The customer review helper uses `VITE_GOOGLE_REVIEW_URL` when it is set. Copy
`.env.example` to `.env.local` and replace `YOUR_PLACE_ID` with the business's
Google review URL, or add `VITE_GOOGLE_REVIEW_URL` to the deployment
environment (for Vercel: **Project Settings → Environment Variables**) and
redeploy. The URL must use HTTPS and point to a Google review or Business
Profile page.

The admin **Store Settings → Google Review URL** field is also supported when
the environment variable is not set. The environment variable takes precedence.
Changing a Vite environment variable requires a new production build.

The assistant only copies the customer's optional, editable text and opens
Google's review page. Customers choose their own rating and submit their review
on Google; the app does not submit reviews or interact with Google's form.
