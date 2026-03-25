import { describe, it, expect } from 'vitest';
import {
  regexify,
  regexifyExtraction,
  generateExpressionPrompt,
  generateExtractionPrompt,
  engregxify,
  decomposeRegex,
  decomposeExtractionRegex,
  evaluateRuleSet,
  extractAttributes,
  analyzeRow,
  exportTagLibraries,
  exportSingleDefinition,
  importTagLibraries,
  generateId,
  generateExpressionId,
  deriveFieldMeta,
} from './index';

describe('utils/index re-exports', () => {
  it('exports regexify functions', () => {
    expect(typeof regexify).toBe('function');
    expect(typeof regexifyExtraction).toBe('function');
    expect(typeof generateExpressionPrompt).toBe('function');
    expect(typeof generateExtractionPrompt).toBe('function');
  });

  it('exports engregxify functions', () => {
    expect(typeof engregxify).toBe('function');
    expect(typeof decomposeRegex).toBe('function');
    expect(typeof decomposeExtractionRegex).toBe('function');
  });

  it('exports evaluateRuleSet', () => {
    expect(typeof evaluateRuleSet).toBe('function');
  });

  it('exports extractAttributes', () => {
    expect(typeof extractAttributes).toBe('function');
  });

  it('exports analyzeRow', () => {
    expect(typeof analyzeRow).toBe('function');
  });

  it('exports persistence functions', () => {
    expect(typeof exportTagLibraries).toBe('function');
    expect(typeof exportSingleDefinition).toBe('function');
    expect(typeof importTagLibraries).toBe('function');
  });

  it('exports uuid functions', () => {
    expect(typeof generateId).toBe('function');
    expect(typeof generateExpressionId).toBe('function');
  });

  it('exports deriveFieldMeta', () => {
    expect(typeof deriveFieldMeta).toBe('function');
  });
});
