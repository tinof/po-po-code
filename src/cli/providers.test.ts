/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { generateLiteConfig, MODEL_MAPPINGS } from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS has exactly 4 providers', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys.sort()).toEqual(['copilot', 'kimi', 'openai', 'zai-plan']);
  });

  test('generateLiteConfig always generates openai preset', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
    });

    expect(config.preset).toBe('openai');
    const agents = (config.presets as any).openai;
    expect(agents).toBeDefined();
    expect(agents.orchestrator.model).toBe('openai/gpt-5.4');
    expect(agents.orchestrator.variant).toBeUndefined();
    expect(agents.ops.model).toBe('openai/gpt-5.4-mini');
    expect(agents.ops.variant).toBe('low');
  });

  test('generateLiteConfig uses correct OpenAI models', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.model).toBe(
      MODEL_MAPPINGS.openai.orchestrator.model,
    );
    expect(agents.oracle.model).toBe('openai/gpt-5.4');
    expect(agents.oracle.variant).toBe('high');
    expect(agents.browser.model).toBe('openai/gpt-5.4-mini');
    expect(agents.browser.variant).toBe('low');
    expect(agents.ops.model).toBe('openai/gpt-5.4-mini');
    expect(agents.ops.variant).toBe('low');
    expect(agents.explorer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.explorer.variant).toBe('low');
    expect(agents.designer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.designer.variant).toBe('medium');
  });

  test('generateLiteConfig enables tmux when requested', () => {
    const config = generateLiteConfig({
      hasTmux: true,
      installSkills: false,
      installCustomSkills: false,
    });

    expect(config.tmux).toBeDefined();
    expect((config.tmux as any).enabled).toBe(true);
    expect((config.tmux as any).layout).toBe('main-vertical');
  });

  test('generateLiteConfig includes default skills', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: true,
      installCustomSkills: false,
    });

    const agents = (config.presets as any).openai;
    // Orchestrator should always have '*'
    expect(agents.orchestrator.skills).toEqual(['*']);

    // Browser should have 'agent-browser'
    expect(agents.browser.skills).toContain('agent-browser');

    // Ops should have no skills by default
    expect(agents.ops.skills).toEqual([]);
  });

  test('generateLiteConfig includes mcps field', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.mcps).toBeDefined();
    expect(Array.isArray(agents.orchestrator.mcps)).toBe(true);
    expect(agents.explorer.mcps).toBeDefined();
    expect(Array.isArray(agents.explorer.mcps)).toBe(true);
  });

  test('generateLiteConfig openai includes correct mcps', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.mcps).toContain('*');
    expect(agents.explorer.mcps).toContain('context7');
    expect(agents.explorer.mcps).toContain('grep_app');
    expect(agents.browser.mcps).toContain('chrome-devtools');
    expect(agents.designer.mcps).toEqual([]);
  });
});
