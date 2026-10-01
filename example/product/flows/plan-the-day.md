---
id: plan-the-day
title: Plan the day
features:
  - scheduling
  - complete-task
  - labels-filters
status: active
---

# Plan the day

## Goal

Start the day from the Today view, deal with anything overdue, and work through the list by completing or rescheduling tasks until Today is empty.

## Flow

```mermaid
flowchart TD
    A[Open Today] --> B{Overdue tasks?}
    B -->|Yes| C[Show overdue section with Reschedule]
    B -->|No| D[Show today's tasks]
    C --> E{Reschedule all?}
    E -->|Yes| F[Pick a new date for all overdue]
    E -->|No| D
    F --> D
    D --> G[Pick a task]
    G --> H{Done or move?}
    H -->|Complete| I[Check off task]
    H -->|Reschedule| J[Pick a new date]
    I --> K{Today empty?}
    J --> K
    K -->|No| G
    K -->|Yes| L([Today shows the all-done state])
```

## Behavior details

#### Show overdue section with Reschedule

**Result**
- Overdue tasks are listed first, grouped under an "Overdue" heading with a Reschedule action
- A saved filter can be applied to narrow the list to, for example, "today & p1"

#### Check off task

**Result**
- The task leaves Today with a short undo toast
- A recurring task is replaced by its next occurrence instead of disappearing (see [Complete a recurring task](complete-recurring-task.md))

## Related features

- [Schedule and reschedule](../features.md#schedule-and-reschedule)
- [Complete and restore tasks](../features.md#complete-and-restore-tasks)
- [Labels and filters](../features.md#labels-and-filters)

## Related flows

- [Add a task](add-task.md): where dated tasks come from.
- [Complete a recurring task](complete-recurring-task.md): the special case when a checked task repeats.

## Implementation references

- Today view: `src/features/today/TodayView.tsx`
- Bulk reschedule: `src/features/today/RescheduleOverdue.tsx`
