# src/hooks/

This directory exposes the public hook entry points that feature code imports to tap into behavior such as update checks, phase reminders, and post-read nudges.

## Responsibility

It acts as a single entry point that re-exports the factory functions and option types for every hook implementation underneath `src/hooks/`, so other modules can `import { createAutoUpdateCheckerHook, AutoUpdateCheckerOptions } from 'src/hooks'` without needing to know the subpaths.

## Design

- Aggregator/re-export pattern: `index.ts` consolidates factories (`createAutoUpdateCheckerHook`, `createPhaseReminderHook`, `createPostReadNudgeHook`) and the shared `AutoUpdateCheckerOptions` type so the rest of the app depends only on this flat namespace.
- Each hook implementation underneath follows a factory-based design; callers receive a configured hook instance by passing structured options through the exported creator functions.

## Flow

Callers import a factory from `src/hooks`, supply any typed options (e.g., `AutoUpdateCheckerOptions`), and the factory wires together the hook’s internal checks/side-effects before returning the hook interface that the feature layer consumes.

## Integration

- Feature modules across the app import everything through `src/hooks/index.ts`; there are no direct relations to deeper hook files, keeping consumers ignorant of the implementation details.
- Option types such as `AutoUpdateCheckerOptions` are shared from this file so both the hook creator and its consumers agree on the configuration contract.
