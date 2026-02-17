# AGENTS.md

This file contains guidelines for agentic coding agents working in this password manager monorepo.

## Project Overview

This is a TypeScript monorepo for a password manager with:

- **Web**: React + Vite client with tRPC
- **Mobile**: React Native + Expo app
- **Server**: Fastify backend with tRPC + Redis
- **Packages**: Shared crypto, UI, types, and client utilities

Built with pnpm workspaces, Turborepo, and TypeScript.

## Development Commands

### Root Commands (run from project root)

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm build            # Build all packages and apps
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier
pnpm typecheck      # Type check all packages

# Individual apps
pnpm --filter web dev        # Web app only
pnpm --filter mobile start   # Mobile app only
pnpm --filter server dev     # Server app only
```

### App-Specific Commands

```bash
# Web (apps/web)
pnpm dev              # Start Vite dev server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm oxlint           # Run OXLint

# Mobile (apps/mobile)
pnpm start            # Start Expo development server
pnpm lint             # Run Expo ESLint

# Server (apps/server)
pnpm dev              # Start server with Bun watch
pnpm oxlint           # Run OXLint

# UI Package (packages/ui)
pnpm lint             # Run ESLint
pnpm build            # Build package
```

### Testing

**Note**: No testing framework is currently configured. When adding tests, check the specific app's package.json for the test command.

## Code Style Guidelines

### Import Organization

```typescript
// 1. React imports
import * as React from "react";
import { Suspense } from "react";

// 2. Third-party libraries
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

// 3. Internal workspace packages (use @repo/ prefix)
import { Button } from "@repo/ui";
import { clientSchema } from "@repo/client";

// 4. Local imports (use relative paths)
import { useTRPC } from "../utils/trpc";
import { Button } from "./components/Button";
```

### Component Patterns

```typescript
// Use forwardRef for components with refs
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = "Button";
```

### TypeScript Conventions

- Use interfaces for object shapes that might be extended
- Use types for unions, intersections, and computed types
- Enable `noUncheckedIndexedAccess` in tsconfig
- Prefer explicit return types for public APIs
- Use Zod for runtime validation and TypeScript inference

### Naming Conventions

- **Components**: PascalCase (`Button`, `PasswordEntry`)
- **Files**: kebab-case (`password-entry.tsx`, `button-group.tsx`)
- **Functions/Variables**: camelCase (`handleSubmit`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`UserProps`, `PasswordEntry`)

### Styling Guidelines

- Use Tailwind CSS v4 utility classes
- Combine conditional classes with `cn()` helper from `@repo/ui/theme`
- Follow design token naming: `primary-500`, `surface-3`, `text-primary`
- Avoid inline styles - use Tailwind classes instead

```typescript
import { cn } from "@repo/ui/theme";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white hover:bg-primary-700",
        secondary: "bg-surface-2 text-text-primary hover:bg-surface-3",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
```

### Error Handling

- Use tRPC error handling on the server with `onError` callbacks
- Validate all inputs with Zod schemas
- Use React Error Boundaries for component-level error handling
- Return consistent error shapes from API endpoints

```typescript
// Server tRPC error handling
export const appRouter = trpc.router({
  createEntry: trpc.procedure.input(createEntrySchema).mutation(async ({ input, ctx }) => {
    try {
      // Implementation
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create entry",
      });
    }
  }),
});
```

### File Organization

- Group files by feature/domain
- Use barrel exports (`index.ts`) for clean import paths
- Co-locate types with implementations
- Keep components focused and single-purpose

```
src/
├── components/
│   ├── ui/           # Reusable UI components
│   ├── forms/        # Form components
│   └── layout/       # Layout components
├── features/
│   ├── auth/         # Auth feature
│   ├── entries/      # Password entries feature
│   └── settings/     # Settings feature
├── utils/
├── types/
└── hooks/
```

## Linting and Formatting

This project uses:

- **OXLint**: Primary linter (run `oxlint --type-aware`)
- **ESLint**: Secondary linter for specific rules
- **Prettier**: Code formatting with Tailwind and import organization

Always run `pnpm lint` and `pnpm format` before committing changes.

## tRPC Patterns

- Define schemas with Zod for input validation
- Use procedures for mutations and queries
- Leverage React Query for caching and state management
- Keep procedures focused and single-purpose

```typescript
// Client usage
const trpc = useTRPC();
const { data, isLoading, error } = trpc.entries.getAll.useQuery();

// Server procedure definition
getAllEntries: trpc.procedure
  .query(async ({ ctx }) => {
    return await ctx.db.entries.findMany();
  }),
```

## Cross-Platform Considerations

- Shared UI components live in `packages/ui`
- Use platform-specific file extensions (`.web.tsx`, `.native.tsx`) when needed
- Keep business logic in shared packages
- Use conditional imports for platform-specific APIs

## Security Notes

This is a password manager - always:

- Never log or expose sensitive data
- Use proper encryption for stored passwords
- Validate all inputs on both client and server
- Follow security best practices for authentication
