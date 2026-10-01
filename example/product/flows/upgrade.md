---
id: upgrade
title: Upgrade to Pro
features:
  - subscription
  - reminders
  - labels-filters
status: active
---

# Upgrade to Pro

## Goal

Move from the Free plan to Pro to unlock reminders, unlimited filters, more collaborators and larger uploads.

## Flow

```mermaid
flowchart TD
    A[Hit a Pro-only feature or open Settings] --> B[See the plan comparison]
    B --> C[Choose monthly or yearly]
    C --> D[Enter payment details]
    D --> E{Payment accepted?}
    E -->|Yes| F([Pro features unlocked immediately])
    E -->|No| G[/Show payment error/]
    G --> D
```

## Behavior details

#### Hit a Pro-only feature or open Settings

Entry points: the Reminders option on a task, creating a 4th filter, inviting a 6th member, or Settings → Subscription.

#### Payment accepted?

**Possible outcomes**
- Accepted: the account switches to Pro and the blocked action completes
- Declined: the error names the reason when the provider gives one, and the user can retry with another card

## Related features

- [Manage subscription](../features.md#manage-subscription)
- [Reminders](../features.md#reminders)
- [Labels and filters](../features.md#labels-and-filters)

## Related flows

- [Share a project](share-project.md): one of the places the upgrade prompt appears.

## Implementation references

- Billing: `src/features/billing/`, `src/server/billing.ts`
