# Feature Map

Tasko is a personal and team task manager: capture tasks fast, plan the day, share projects.

## Tasks

Everything about capturing, organizing and finishing work.

### Add a task
**ID:** `add-task`
**Description:** Add a task from anywhere with quick add. Dates, recurrence, project, labels and priority typed in plain language ("Pay rent every 1st #Finance p2") are recognized and shown as chips.
**Entry:** The + button, the `q` shortcut, or the empty "Add task" row inside any project.
**Flows:** [Add a task](flows/add-task.md), [Get started](flows/onboarding.md)
**Implementation:** `src/features/quick-add/`, `src/lib/parse-task-text.ts`

### Organize tasks in projects and sections
**ID:** `projects`
**Description:** Group tasks into projects and sections, nest sub-tasks, reorder by drag and drop, and archive finished projects. New tasks land in Inbox unless a project is chosen.
**Entry:** Sidebar → Projects, or `#project` in quick add.
**Flows:** [Add a task](flows/add-task.md), [Share a project](flows/share-project.md)

### Schedule and reschedule
**ID:** `scheduling`
**Description:** Give tasks a due date and optional time, make them recurring, and see them in Today and Upcoming. Overdue tasks can be rescheduled in bulk.
**Entry:** Date picker on any task, or Today → Reschedule.
**Flows:** [Add a task](flows/add-task.md), [Plan the day](flows/plan-the-day.md), [Complete a recurring task](flows/complete-recurring-task.md)

### Complete and restore tasks
**ID:** `complete-task`
**Description:** Check a task off; it disappears from active views and can be undone or found in the project's completed list. Completing a recurring task schedules its next occurrence instead.
**Flows:** [Plan the day](flows/plan-the-day.md), [Complete a recurring task](flows/complete-recurring-task.md)

### Labels and filters
**ID:** `labels-filters`
**Description:** Tag tasks with labels and build saved filters from queries like "today & p1". Free accounts get 3 filters; Pro is unlimited.
**Entry:** Sidebar → Filters & Labels, or `@label` in quick add.
**Flows:** [Plan the day](flows/plan-the-day.md), [Upgrade to Pro](flows/upgrade.md)

### Reminders
**ID:** `reminders`
**Description:** Get a push or email reminder at a set time or before a task's due time. Pro only; free users see the option with an upgrade prompt.
**Entry:** Task detail → Reminders.
**Flows:** [Upgrade to Pro](flows/upgrade.md)

## Collaboration

### Share a project
**ID:** `share-project`
**Description:** Invite people to a project by email. Members see and edit all its tasks. Invitees without an account are invited to create one. Free accounts can share with up to 5 people per project.
**Entry:** Project menu → Share.
**Flows:** [Share a project](flows/share-project.md)

### Assign and comment
**ID:** `assign-comment`
**Description:** Assign a task to a project member and discuss it in task comments with file attachments. Assignees are notified.
**Entry:** Task detail in any shared project.
**Flows:** [Share a project](flows/share-project.md)

## Account

### Sign up and log in
**ID:** `account-auth`
**Description:** Create an account with email or Google, log in, and reset a forgotten password by email.
**Entry:** `/login`, `/signup`, or any protected page when logged out.
**Flows:** [Get started](flows/onboarding.md)

### Manage subscription
**ID:** `subscription`
**Description:** See the current plan, upgrade from Free to Pro, update payment details, and cancel. Pro unlocks reminders, unlimited filters and larger uploads.
**Entry:** Settings → Subscription, or any upgrade prompt.
**Flows:** [Upgrade to Pro](flows/upgrade.md)

### Export data
**ID:** `export-data`
**Description:** Download all projects and tasks as CSV or JSON from settings.
**Entry:** Settings → Account → Export.
**Status:** planned
