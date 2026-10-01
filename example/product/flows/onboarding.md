---
id: onboarding
title: Get started
features:
  - account-auth
  - add-task
status: active
---

# Get started

## Goal

Create an account, or log in to an existing one, and land in the app ready to add a first task.

## Flow

```mermaid
flowchart TD
    A[Open Tasko logged out] --> B{Have an account?}
    B -->|No| C[Sign up with email or Google]
    B -->|Yes| D[Log in]
    D --> E{Forgot password?}
    E -->|Yes| F[Request reset email]
    F --> D
    E -->|No| G[Inbox opens]
    C --> H[Quick add opens with a hint]
    H --> I([First task added])
    G --> I
```

## Behavior details

#### Sign up with email or Google

**Possible outcomes**
- Email already registered: the form offers to log in instead
- Google sign-in cancelled: the user stays on the sign-up page

#### Request reset email

**Result**
- A reset link valid for 1 hour is emailed; the page always says "check your email" whether or not the address exists

## Related features

- [Sign up and log in](../features.md#sign-up-and-log-in)
- [Add a task](../features.md#add-a-task)

## Related flows

- [Add a task](add-task.md): continues from the quick add hint.
- [Share a project](share-project.md): invitees without an account arrive here.

## Implementation references

- Auth pages: `src/app/(auth)/`
- Session: `src/server/auth.ts`
