# Onboarding

## Overview

First-run onboarding replaces the immediate post-signup jump into the dashboard overview. Eligible users now see a standalone onboarding gate before the signed-in shell.

The flow is intentionally short:

1. website
2. API base URL
3. auth mapping
4. agent script reveal

The first three setup steps are skippable. If onboarding is still incomplete, it appears again on a future sign-in and resumes at the first incomplete step.

## Eligibility

Onboarding is shown when either:

- the user has an in-progress onboarding record with no completion timestamp
- the user has no onboarding record and their account footprint is still pristine

Onboarding is not shown when either:

- the user already completed onboarding
- the user already has meaningful setup outside onboarding

“Meaningful setup” means any of:

- existing agent
- non-empty saved base URL
- session headers
- features
- knowledge base sources

This keeps existing configured accounts out of the new flow while still allowing empty legacy accounts to benefit from it.

## Storage Model

Onboarding does not introduce parallel config stores.

- Website entry creates a normal `knowledge_websites` record and enqueues the standard website ingest worker.
- API base URL writes through the existing config flow and saves to the `production` environment.
- Auth mapping writes through the existing config flow and saves a lowercase `authorization` session header.
- Finalization reuses normal agent creation and returns the same agent shape the Agent page uses.

The only new persistence is `user_onboarding_states`, keyed by `user_id`, with:

- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

## API

Endpoints:

- `GET /onboarding/state`
- `POST /onboarding/start`
- `POST /onboarding/website`
- `POST /onboarding/finalize`

`GET /onboarding/state` returns:

- `status`: `not_started | in_progress | completed | not_applicable`
- `shouldShow`
- `nextStep`: `website | baseUrl | auth | agent`

The signed-in frontend fetches this state before rendering `Shell`. If the query fails, the app fails open to the normal dashboard.

## Step Details

### Website

- Copy: `Welcome to Warpy, let's get started.`
- Accepts bare domains such as `your-product.com`
- Uses the same canonicalization, scope resolution, record creation, and ingest queue as the Knowledge Base website flow
- Allows exactly one onboarding website even when the normal KB source gate is exhausted, but only if the user has no existing KB sources
- Creates or reuses the agent and enables the knowledge base immediately so the ingested website starts grounding answers as soon as it is ready

### API base URL

- Accepts bare hosts such as `api.example.com`
- Normalizes to absolute URLs with `https://` before saving
- Preserves the existing `local` base URL and any other environments

### Auth mapping

- Auth type: `bearer | basic | none`
- Token source: `localStorage | sessionStorage | cookies`
- Token key is stored in the session header config as lowercase `authorization`
- Existing non-authorization headers are preserved

### Agent

- The final screen creates an agent when missing so the snippet can render immediately
- Finalization is idempotent and happens when the user leaves onboarding through `Continue to dashboard`
- The final screen does not show a `Skip` action
- The script tag is generated through the shared widget install utility used by the Agent page
- The saved production base URL is included as `data-base-url` when present

## Frontend Notes

- The onboarding surface is separate from the dashboard chrome
- The app keeps the dashboard from flashing behind onboarding by resolving onboarding state first
- Returning in-progress users resume on the first incomplete step using existing saved values as defaults

## Testing

Covered scenarios include:

- pristine user eligibility
- configured user exclusion
- onboarding start idempotence
- website ingest enqueue behavior
- first-source billing gate bypass
- finalize get-or-create behavior
- shell gating behavior
- base URL normalization
- lowercase authorization header writes
- shared script snippet rendering
