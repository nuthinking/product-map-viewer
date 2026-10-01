---
id: add-task
title: Add a task
features:
  - add-task
  - projects
  - scheduling
status: active
---

# Add a task

## Goal

Capture a task in a few seconds from anywhere in the app, with its date, project, labels and priority understood from plain text, so it shows up in the right place without extra clicks.

## Flow

```mermaid
flowchart TD
    A[Open quick add] --> B[Type task text]
    B --> C[Recognize dates, project, labels, priority]
    C --> D{Anything recognized?}
    D -->|Yes| E[Show as removable chips]
    D -->|No| F[Keep as plain text]
    E --> G[Save]
    F --> G
    G --> H{Online?}
    H -->|Yes| I[Task saved]
    H -->|No| J[Saved locally, sync queued]
    I --> K([Task appears in its project and Today or Upcoming])
    J --> K
```

## Behavior details

#### Recognize dates, project, labels, priority

Runs as the user types. Examples: "tomorrow 9am", "every monday", "#Work", "@email", "p1".

**Result**
- Recognized parts are highlighted inline and shown as chips below the field
- Removing a chip keeps the words as plain text and stops re-recognizing them for this task

**Possible outcomes**
- ⚠️ Behavior unclear from the current implementation. Whether recognition follows the account language or the device locale when they differ is not covered by the UI or tests.

#### Save

**Requires**
- Task text is not empty after chips are removed

**Result**
- Project defaults to Inbox when none was chosen
- Due date is left empty when none was recognized
- Quick add closes, or stays open with an empty field when "Add another" was toggled

#### Online?

**Possible outcomes**
- Online: task is saved and visible on other devices within a few seconds
- Offline: task is kept locally with an "offline" badge and synced when the connection returns; if the server rejects it on sync, the task stays local and an error banner offers Retry

## Related features

- [Add a task](../features.md#add-a-task)
- [Organize tasks in projects and sections](../features.md#organize-tasks-in-projects-and-sections)
- [Schedule and reschedule](../features.md#schedule-and-reschedule)

## Related flows

- [Get started](onboarding.md): new users are dropped into quick add after signup.
- [Plan the day](plan-the-day.md): where the task is seen next if it has a date.

## Implementation references

- Quick add UI: `src/features/quick-add/QuickAdd.tsx`
- Text recognition: `parseTaskText` in `src/lib/parse-task-text.ts`
- Offline queue: `src/sync/outbox.ts`
- Tests: `src/lib/parse-task-text.test.ts`, `e2e/quick-add.spec.ts`
