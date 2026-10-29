# Taskly

A personal task tracker: users capture tasks, prioritise them, and track them to completion.

## Language

**Task**:
A single piece of work a user wants to track, with a title, optional description, priority and optional due date.
_Avoid_: Todo, item

**Priority**:
How important a task is: low, medium or high.
_Avoid_: Importance, urgency

**Due date**:
The calendar day (no time) by which a task should be finished.
_Avoid_: Deadline

**Status**:
Where a task is in its lifecycle: exactly one of Open, Doing or Done.
_Avoid_: State, completed flag

**Open**:
A task that has not been started yet.
_Avoid_: Todo, new, pending

**Doing**:
A task that is currently being worked on.
_Avoid_: In progress, started, active

**Done**:
A finished task.
_Avoid_: Completed, closed

**Active**:
A task that is not Done, meaning it is Open or Doing.

**Overdue**:
An active task whose due date is before today in the user's local calendar.

## Test agent

**Test agent**:
The custom agent that writes and updates unit tests for changed code.
_Avoid_: Bot, test generator

**PR run**:
A test agent run triggered by a pull request, covering the whole diff against the base branch.

**Backfill run**:
A manually dispatched test agent run that covers existing untested code in one scope (backend or frontend) and opens its own pull request.

**Test decision**:
The test agent's verdict for one changed source file: create, update or skip, always with a reason.

**Intentional behaviour change**:
A behaviour the pull request deliberately changed. This is the only justification for editing an existing test assertion.

**Suspected bug**:
A test that fails because the source code appears wrong rather than the test. It is reported on the pull request and never committed.
