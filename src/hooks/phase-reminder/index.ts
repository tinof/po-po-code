/**
 * Context-aware phase reminder injection.
 * Classifies the user message and injects the appropriate reminder:
 * - ARCHITECTURAL: Forces @explorer delegation for structural questions
 * - CORRECTION: Re-exploration when user challenges analysis
 * - BASE: Standard workflow reminder
 *
 * Uses experimental.chat.messages.transform so it doesn't show in UI.
 */

const BASE_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.
If delegating, launch the specialist in the same turn you mention it.</reminder>`;

const ARCHITECTURAL_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.
If delegating, launch the specialist in the same turn you mention it.

ANTI-BIAS PROTOCOL ACTIVE: This query appears to be about code architecture or execution flow.
- You MUST delegate to @explorer for structural tracing.
- Do NOT answer based on file names, log output, or keyword assumptions.
- @explorer will use WarpGrep + Serena LSP to trace the ACTUAL execution path.
- Wait for @explorer's structural map before forming your answer.</reminder>`;

const CORRECTION_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.

CORRECTION DETECTED: The user appears to be correcting or challenging your previous analysis.
- Re-examine your assumptions. Your prior understanding may be incomplete.
- Delegate to @explorer with broader scope to re-trace the execution path.
- If the issue persists after re-exploration, escalate to @oracle for deep architectural review.
- Do NOT defend your previous analysis without fresh structural evidence.</reminder>`;

// Architectural question detection patterns
const ARCHITECTURAL_PATTERNS = [
  /how does .+ work/i,
  /trace .+ (flow|path|execution)/i,
  /explain .+ (architecture|pipeline|system|codebase|module)/i,
  /what happens when/i,
  /walk .+ through/i,
  /data flow/i,
  /execution path/i,
  /can you explain/i,
  /api level/i,
  /under the hood/i,
];

// Correction detection patterns
const CORRECTION_PATTERNS = [
  /that'?s (not|wrong|incorrect)/i,
  /you('re| are) (wrong|missing|incorrect)/i,
  /actually,? (it|the|that)/i,
  /no,? (it|the|that) (doesn'?t|isn'?t|does not)/i,
  /you missed/i,
  /you forgot/i,
  /not how it works/i,
];

type MessageType = 'architectural' | 'correction' | 'normal';

function classifyMessage(text: string): MessageType {
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(text)) return 'correction';
  }
  for (const pattern of ARCHITECTURAL_PATTERNS) {
    if (pattern.test(text)) return 'architectural';
  }
  return 'normal';
}

interface MessageInfo {
  role: string;
  agent?: string;
  sessionID?: string;
}

interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

/**
 * Creates the experimental.chat.messages.transform hook for context-aware
 * phase reminder injection. Classifies the user's message and selects the
 * appropriate reminder (architectural / correction / base).
 * Only injects for the orchestrator agent.
 */
export function createPhaseReminderHook() {
  return {
    'experimental.chat.messages.transform': async (
      _input: Record<string, never>,
      output: { messages: MessageWithParts[] },
    ): Promise<void> => {
      const { messages } = output;

      if (messages.length === 0) {
        return;
      }

      // Find the last user message
      let lastUserMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex === -1) {
        return;
      }

      const lastUserMessage = messages[lastUserMessageIndex];

      // Only inject for orchestrator (or if no agent specified = main session)
      const agent = lastUserMessage.info.agent;
      if (agent && agent !== 'orchestrator') {
        return;
      }

      // Find the first text part
      const textPartIndex = lastUserMessage.parts.findIndex(
        (p) => p.type === 'text' && p.text !== undefined,
      );

      if (textPartIndex === -1) {
        return;
      }

      // Classify and select the appropriate reminder
      const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
      const messageType = classifyMessage(originalText);

      let reminder: string;
      switch (messageType) {
        case 'architectural':
          reminder = ARCHITECTURAL_REMINDER;
          break;
        case 'correction':
          reminder = CORRECTION_REMINDER;
          break;
        default:
          reminder = BASE_REMINDER;
      }

      // Prepend the reminder to the existing text
      lastUserMessage.parts[textPartIndex].text =
        `${reminder}\n\n---\n\n${originalText}`;
    },
  };
}

export { classifyMessage };
export type { MessageType };
