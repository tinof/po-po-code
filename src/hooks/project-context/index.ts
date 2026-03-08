/**
 * Session-start project context injection.
 * Auto-detects and injects project context files (codemap.md, CLAUDE.md, etc.)
 * into the first user message, approximating Claude Code's CLAUDE.md behavior.
 *
 * Uses experimental.chat.messages.transform so it doesn't show in UI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTEXT_FILES = [
    'codemap.md',
    '.slim/codemap.md',
    'CLAUDE.md',
    '.opencode/context.md',
];

interface MessageInfo {
    role: string;
    agent?: string;
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

export function createProjectContextHook(projectDir: string) {
    return {
        'experimental.chat.messages.transform': async (
            _input: Record<string, never>,
            output: { messages: MessageWithParts[] },
        ): Promise<void> => {
            const { messages } = output;

            // Only inject on the first user message (session start)
            const userMessages = messages.filter((m) => m.info.role === 'user');
            if (userMessages.length !== 1) return;

            // Only inject for orchestrator
            const msg = userMessages[0];
            if (msg.info.agent && msg.info.agent !== 'orchestrator') return;

            // Find and inject project context
            let contextContent = '';
            for (const filename of CONTEXT_FILES) {
                const filepath = join(projectDir, filename);
                if (existsSync(filepath)) {
                    try {
                        const content = readFileSync(filepath, 'utf-8');
                        contextContent += `\n<project_context source="${filename}">\n${content}\n</project_context>\n`;
                    } catch {
                        // skip unreadable files
                    }
                }
            }

            if (!contextContent) return;

            const textPartIndex = msg.parts.findIndex(
                (p) => p.type === 'text' && p.text !== undefined,
            );
            if (textPartIndex === -1) return;

            const originalText = msg.parts[textPartIndex].text ?? '';
            msg.parts[textPartIndex].text =
                `${contextContent}\n\n---\n\n${originalText}`;
        },
    };
}
