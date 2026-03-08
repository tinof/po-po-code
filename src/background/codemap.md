# Background Module Codemap

## Responsibility

The `src/background/` module manages long-running AI agent tasks that execute asynchronously in isolated sessions. It enables fire-and-forget task execution, allowing users to continue working while background tasks complete independently. The module handles task lifecycle management, session creation, completion detection, and optional tmux pane integration for visual task tracking.

## Design

### Core Abstractions

#### BackgroundTask Interface
Represents a background task with complete lifecycle tracking:
- **id**: Unique task identifier (`bg_<random>`)
- **sessionId**: OpenCode session ID (set when starting)
- **description**: Human-readable task description
- **agent**: Agent name handling the task
- **status**: Task state (`pending` | `starting` | `running` | `completed` | `failed` | `cancelled`)
- **result**: Final output from agent (when completed)
- **error**: Error message (when failed)
- **config**: Task configuration
- **parentSessionId**: Parent session for notifications
- **startedAt**: Creation timestamp
- **completedAt**: Completion/failure timestamp
- **prompt**: Initial prompt sent to agent

#### LaunchOptions Interface
Configuration for launching new background tasks:
- **agent**: Agent to handle the task
- **prompt**: Initial prompt to send to the agent
- **description**: Human-readable task description
- **parentSessionId**: Parent session ID for task hierarchy

### Key Patterns

#### 1. Fire-and-Forget Launch Pattern
Two-phase task launch:
- **Phase A (sync)**: Creates task record and returns immediately with `pending` status
- **Phase B (async)**: Session creation and prompt sending happen in background

#### 2. Start Queue with Concurrency Control
- Tasks are queued for background start
- Configurable `maxConcurrentStarts` limit (default: 10)
- Queue processing ensures controlled resource usage
- Prevents overwhelming the system with simultaneous session starts

#### 3. Event-Driven Completion Detection
- Listens to `session.status` events instead of polling
- Detects idle status to mark tasks as completed
- Extracts final output from session messages
- Falls back to polling for reliability

#### 4. Dual-Index Task Tracking
- `tasks` Map: Task ID → BackgroundTask
- `tasksBySessionId` Map: Session ID → Task ID
- Enables bidirectional lookups for event handling

#### 5. Promise-Based Waiting
- `completionResolvers` Map stores pending wait promises
- `waitForCompletion()` returns promise that resolves on task completion
- Supports optional timeout parameter

#### 6. Race-Condition Safe Cancellation
- Marks status as `cancelled` before removing from queue
- Checks cancellation status in `startTask()` after incrementing `activeStarts`
- Uses type assertion to bypass TypeScript strictness during race handling

### Classes

#### BackgroundTaskManager
Main orchestrator for background task lifecycle:

**State:**
- `tasks`: Map of all tracked tasks
- `tasksBySessionId`: Session ID to task ID mapping
- `client`: OpenCode client API
- `directory`: Working directory for tasks
- `tmuxEnabled`: Whether tmux integration is active
- `config`: Plugin configuration
- `backgroundConfig`: Background task configuration
- `startQueue`: Queue of tasks waiting to start
- `activeStarts`: Count of currently starting tasks
- `maxConcurrentStarts`: Concurrency limit
- `completionResolvers`: Map of waiting promises

**Key Methods:**
- `launch(opts)`: Create and queue a new background task (sync)
- `handleSessionStatus(event)`: Process session.status events
- `getResult(taskId)`: Retrieve current task state
- `waitForCompletion(taskId, timeout)`: Wait for task completion
- `cancel(taskId?)`: Cancel one or all tasks
- `cleanup()`: Clean up all tasks

#### TmuxSessionManager
Manages tmux pane lifecycle for background sessions:

**State:**
- `client`: OpenCode client API
- `tmuxConfig`: Tmux configuration
- `serverUrl`: OpenCode server URL
- `sessions`: Map of tracked sessions
- `pollInterval`: Polling timer
- `enabled`: Whether tmux integration is active

**Key Methods:**
- `onSessionCreated(event)`: Spawn tmux pane for child sessions
- `onSessionStatus(event)`: Close pane when session becomes idle
- `pollSessions()`: Fallback polling for status updates
- `closeSession(sessionId)`: Close pane and remove tracking
- `cleanup()`: Close all panes and stop polling

### Interfaces

#### TrackedSession (TmuxSessionManager)
- `sessionId`: OpenCode session ID
- `paneId`: Tmux pane identifier
- `parentId`: Parent session ID
- `title`: Session title
- `createdAt`: Creation timestamp
- `lastSeenAt`: Last seen timestamp
- `missingSince`: When session went missing (optional)

#### SessionEvent
- `type`: Event type (`session.created`, `session.status`)
- `properties`: Event properties containing session info

## Flow

### Task Launch Flow

```
User calls launch()
  ↓
Create BackgroundTask with status='pending'
  ↓
Store in tasks Map
  ↓
Enqueue in startQueue
  ↓
processQueue() checks concurrency limit
  ↓
startTask() executes (async)
  ↓
  ├─ Set status='starting'
  ├─ Increment activeStarts
  ├─ Check for cancellation (race condition)
  ├─ Create OpenCode session
  ├─ Store sessionId in tasksBySessionId
  ├─ Set status='running'
  ├─ Wait 500ms (if tmux enabled)
  ├─ Send prompt to session
  └─ Decrement activeStarts and processQueue()
```

### Completion Detection Flow

```
session.status event received
  ↓
handleSessionStatus() checks event type
  ↓
Lookup taskId from tasksBySessionId
  ↓
Verify task is running
  ↓
Check if status.type === 'idle'
  ↓
extractAndCompleteTask()
  ↓
  ├─ Fetch session messages
  ├─ Filter assistant messages
  ├─ Extract text/reasoning parts
  ├─ Join extracted content
  └─ completeTask()
      ↓
      ├─ Set status='completed'
      ├─ Set result or error
      ├─ Delete from tasksBySessionId
      ├─ Send notification to parent session
      ├─ Resolve completionResolvers
      └─ Log completion
```

### Cancellation Flow

```
User calls cancel(taskId?)
  ↓
Find task(s) with pending/starting/running status
  ↓
For each task:
  ↓
  ├─ Delete from completionResolvers
  ├─ Check if in startQueue (before marking cancelled)
  ├─ Set status='cancelled' (prevents race with startTask)
  ├─ Remove from startQueue if pending
  └─ completeTask() with 'cancelled' status
```

### Tmux Integration Flow

```
session.created event received
  ↓
onSessionCreated() checks enabled and parentID
  ↓
Skip if already tracking
  ↓
spawnTmuxPane() with session info
  ↓
  ├─ Create pane with title
  ├─ Connect to OpenCode server
  └─ Return paneId
  ↓
Store in sessions Map
  ↓
Start polling (if not already running)
```

```
session.status event received (idle)
  ↓
onSessionStatus() checks enabled
  ↓
closeSession()
  ↓
  ├─ closeTmuxPane()
  ├─ Delete from sessions Map
  └─ Stop polling if no sessions left
```

### Polling Fallback Flow (TmuxSessionManager)

```
pollSessions() runs on interval
  ↓
Fetch all session statuses
  ↓
For each tracked session:
  ↓
  ├─ Check if idle → close
  ├─ Update lastSeenAt if found
  ├─ Set missingSince if not found
  ├─ Check missingTooLong → close
  └─ Check timeout → close
```

## Integration

### Dependencies

#### Internal Dependencies
- `@opencode-ai/plugin`: PluginInput type, client API
- `../config`: BackgroundTaskConfig, PluginConfig, TmuxConfig, POLL_INTERVAL_BACKGROUND_MS
- `../utils`: applyAgentVariant, resolveAgentVariant, log, tmux utilities

#### External Dependencies
- None (uses only OpenCode SDK and standard Node.js APIs)

### Consumers

#### Direct Consumers
- Main plugin entry point (`src/index.ts`)
- Background task skill (`src/skills/background-task.ts`)

#### Integration Points

1. **Plugin Initialization**
   - BackgroundTaskManager instantiated with PluginInput, TmuxConfig, and PluginConfig
   - TmuxSessionManager instantiated with PluginInput and TmuxConfig

2. **Event Handling**
   - Both managers register as event handlers for session events
   - BackgroundTaskManager handles `session.status` for completion detection
   - TmuxSessionManager handles `session.created` and `session.status`

3. **Skill Integration**
   - Background task skill calls `launch()` to create tasks
   - Skill calls `getResult()` and `waitForCompletion()` to retrieve results
   - Skill calls `cancel()` to cancel tasks

4. **Cleanup**
   - Both managers provide `cleanup()` methods
   - Called during plugin shutdown to release resources

### Configuration

#### BackgroundTaskConfig
- `maxConcurrentStarts`: Maximum concurrent task starts (default: 10)

#### TmuxConfig
- `enabled`: Whether tmux integration is active
- Additional tmux-specific settings (see `../config/schema`)

### Error Handling

- Session creation failures mark tasks as `failed`
- Message extraction failures mark tasks as `failed`
- Tmux pane spawn failures are logged but don't fail the task
- Polling errors are logged but don't stop the manager
- Notification failures are logged but don't affect task completion

### Logging

All operations are logged with context:
- Task launch, start, completion, failure, cancellation
- Session creation and pane spawning
- Polling lifecycle
- Error conditions

Logs use the format `[component-name] message` with structured metadata.