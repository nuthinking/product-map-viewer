---
id: complete-recurring-task
title: Complete a recurring task
features:
  - complete-task
  - scheduling
status: active
---

# Complete a recurring task

## Goal

Check off a task that repeats and have the next occurrence scheduled automatically, without losing the history of what was done.

## Flow

```mermaid
flowchart TD
    A[Check off a recurring task] --> B{Recurrence rule?}
    B -->|Fixed schedule| C[Next occurrence on the next rule date]
    B -->|After completion| D[Next occurrence counted from today]
    C --> E[Task reappears with the new date]
    D --> E
    E --> F{Undo within 5 seconds?}
    F -->|Yes| G([Original task restored])
    F -->|No| H([Completion logged, next occurrence active])
```

## Behavior details

#### Recurrence rule?

**Possible outcomes**
- "every monday" style rules keep their schedule even when completed late
- "every! 3 days" style rules restart from the completion day
- ⚠️ Behavior unclear from the current implementation. What happens when the next occurrence would fall in the past after a long gap is not covered by the UI or tests.

## Related features

- [Complete and restore tasks](../features.md#complete-and-restore-tasks)
- [Schedule and reschedule](../features.md#schedule-and-reschedule)

## Related flows

- [Plan the day](plan-the-day.md): where recurring tasks are usually completed.

## Implementation references

- Recurrence: `src/lib/recurrence.ts`
- Tests: `src/lib/recurrence.test.ts`
