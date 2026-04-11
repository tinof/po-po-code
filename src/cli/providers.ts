import { DEFAULT_AGENT_MCPS } from '../config/agent-mcps';
import { RECOMMENDED_SKILLS } from './skills';
import type { InstallConfig } from './types';

// Model mappings by provider - only 4 supported providers
export const MODEL_MAPPINGS = {
  openai: {
    orchestrator: { model: 'openai/gpt-5.4' },
    oracle: { model: 'openai/gpt-5.4', variant: 'high' },
    browser: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    ops: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    explorer: { model: 'openai/gpt-5.4-mini', variant: 'low' },
    designer: { model: 'openai/gpt-5.4-mini', variant: 'medium' },
  },
  kimi: {
    orchestrator: { model: 'kimi-for-coding/k2p5' },
    oracle: { model: 'kimi-for-coding/k2p5', variant: 'high' },
    browser: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    ops: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    explorer: { model: 'kimi-for-coding/k2p5', variant: 'low' },
    designer: { model: 'kimi-for-coding/k2p5', variant: 'medium' },
  },
  copilot: {
    orchestrator: {
      model: 'github-copilot/gpt-5.3-codex',
      temperature: 1,
      variant: 'medium',
    },
    oracle: {
      model: 'github-copilot/gemini-3.1-pro-preview',
      temperature: 1,
      variant: 'high',
    },
    browser: {
      model: 'github-copilot/gemini-3.1-pro-preview',
      temperature: 1,
      variant: 'low',
    },
    ops: {
      model: 'github-copilot/gpt-5.3-codex',
      temperature: 1,
      variant: 'medium',
    },
    explorer: {
      model: 'github-copilot/gemini-3-flash-preview',
      temperature: 1,
      variant: 'low',
    },
    designer: {
      model: 'github-copilot/gemini-3.1-pro-preview',
      temperature: 1,
      variant: 'high',
    },
  },
  'zai-plan': {
    orchestrator: { model: 'zai-coding-plan/glm-5' },
    oracle: { model: 'zai-coding-plan/glm-5', variant: 'high' },
    browser: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    ops: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    explorer: { model: 'zai-coding-plan/glm-5', variant: 'low' },
    designer: { model: 'zai-coding-plan/glm-5', variant: 'medium' },
  },
} as const;

export function generateLiteConfig(
  installConfig: InstallConfig,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    preset: installConfig.preset,
    presets: {},
  };

  const createAgentConfig = (
    agentName: string,
    modelInfo: { model: string; variant?: string; temperature?: number },
  ) => {
    const isOrchestrator = agentName === 'orchestrator';

    const skills = isOrchestrator
      ? ['!impeccable', '*']
      : RECOMMENDED_SKILLS.filter(
          (s) =>
            s.allowedAgents.includes('*') ||
            s.allowedAgents.includes(agentName),
        ).map((s) => s.skillName);

    if (agentName === 'browser' && !skills.includes('agent-browser')) {
      skills.push('agent-browser');
    }

    return {
      model: modelInfo.model,
      variant: modelInfo.variant,
      ...(modelInfo.temperature !== undefined && {
        temperature: modelInfo.temperature,
      }),
      skills,
      mcps:
        DEFAULT_AGENT_MCPS[agentName as keyof typeof DEFAULT_AGENT_MCPS] ?? [],
    };
  };

  const buildPreset = (mappingName: keyof typeof MODEL_MAPPINGS) => {
    const mapping = MODEL_MAPPINGS[mappingName];
    return Object.fromEntries(
      Object.entries(mapping).map(([agentName, modelInfo]) => [
        agentName,
        createAgentConfig(agentName, modelInfo),
      ]),
    );
  };

  // Build all provider presets; OpenAI is the default active preset
  const presets = config.presets as Record<string, unknown>;
  presets.openai = buildPreset('openai');
  presets.copilot = buildPreset('copilot');
  presets.kimi = buildPreset('kimi');
  presets['zai-plan'] = buildPreset('zai-plan');

  if (installConfig.hasTmux) {
    config.tmux = {
      enabled: true,
      layout: 'main-vertical',
      main_pane_size: 60,
    };
  }

  return config;
}
