# Password Manager

This is a full-stack, cross-platform password manager application built using a TypeScript monorepo. The project is structured using pnpm workspaces and managed with Turborepo for efficient builds and development.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

-   `apps/web`: A web-based client built with React and Vite.
-   `apps/mobile`: A mobile client built with React Native and Expo.
-   `apps/server`: The backend server powered by Fastify and tRPC.
-   `packages/crypto`: Shared cryptographic functions.
-   `packages/ui`: A stub React component library shared by the `web` and `mobile` applications.
-   `packages/typescript-config`: `tsconfig.json`s used throughout the monorepo.

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

-   [TypeScript](https://www.typescriptlang.org/) for static type checking
-   [ESLint](https://eslint.org/) for code linting
-   [Prettier](https://prettier.io) for code formatting

## Getting Started

First, install the dependencies:

```
pnpm install
```

### Build

To build all apps and packages, run the following command:

```
pnpm run build
```

### Develop

To develop all apps and packages, run the following command:

```
pnpm run dev
```

### Remote Caching

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup), then enter the following commands:

```
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your Vercel account.

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
pnpm exec turbo link
```
