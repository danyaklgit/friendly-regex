import { describe, it, expect } from 'vitest';
import {
  getTargetLevel,
  targetKey,
  targetsEqual,
  groupCommentsByTarget,
  normaliseTarget,
} from './commentTarget';
import type { TagSpecComment } from '../types/comments';

const LIB = 'lib-1';
const DEF = 'def-1';
const RULE = 'rule-1';
const ATTR = 'Amount';

describe('getTargetLevel', () => {
  it('returns library when only the library id is set', () => {
    expect(getTargetLevel({ TagSpecLibraryId: LIB })).toBe('library');
  });
  it('returns definition when a definition id is set', () => {
    expect(getTargetLevel({ TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF })).toBe('definition');
  });
  it('returns rule when a rule expression id is set', () => {
    expect(
      getTargetLevel({
        TagSpecLibraryId: LIB,
        TagSpecDefinitionId: DEF,
        TagRuleExpressionId: RULE,
      }),
    ).toBe('rule');
  });
  it('returns attribute when an attribute tag is set', () => {
    expect(
      getTargetLevel({
        TagSpecLibraryId: LIB,
        TagSpecDefinitionId: DEF,
        AttributeTag: ATTR,
      }),
    ).toBe('attribute');
  });
});

describe('targetKey', () => {
  it('produces distinct keys for each level', () => {
    const lib = targetKey({ TagSpecLibraryId: LIB });
    const def = targetKey({ TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF });
    const rule = targetKey({
      TagSpecLibraryId: LIB,
      TagSpecDefinitionId: DEF,
      TagRuleExpressionId: RULE,
    });
    const attr = targetKey({
      TagSpecLibraryId: LIB,
      TagSpecDefinitionId: DEF,
      AttributeTag: ATTR,
    });
    expect(new Set([lib, def, rule, attr]).size).toBe(4);
    expect(lib).toBe(`lib:${LIB}`);
    expect(def).toBe(`lib:${LIB}:def:${DEF}`);
    expect(rule).toBe(`lib:${LIB}:def:${DEF}:rule:${RULE}`);
    expect(attr).toBe(`lib:${LIB}:def:${DEF}:attr:${ATTR}`);
  });

  it('treats null and undefined optional fields the same', () => {
    const a = targetKey({ TagSpecLibraryId: LIB, TagSpecDefinitionId: null });
    const b = targetKey({ TagSpecLibraryId: LIB });
    expect(a).toBe(b);
  });
});

describe('targetsEqual', () => {
  it('is true for matching targets', () => {
    expect(
      targetsEqual(
        { TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF },
        { TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF, TagRuleExpressionId: null },
      ),
    ).toBe(true);
  });
  it('is false when ids differ', () => {
    expect(
      targetsEqual(
        { TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF },
        { TagSpecLibraryId: LIB, TagSpecDefinitionId: 'def-2' },
      ),
    ).toBe(false);
  });
});

describe('groupCommentsByTarget', () => {
  const makeComment = (id: string, target: TagSpecComment['Target']): TagSpecComment => ({
    Id: id,
    Status: 'ACTIVE',
    Comment: id,
    ReportedByUserId: 'u1',
    Target: target,
  });

  it('groups comments by their stable key', () => {
    const comments: TagSpecComment[] = [
      makeComment('c1', { TagSpecLibraryId: LIB }),
      makeComment('c2', { TagSpecLibraryId: LIB }),
      makeComment('c3', { TagSpecLibraryId: LIB, TagSpecDefinitionId: DEF }),
    ];
    const grouped = groupCommentsByTarget(comments);
    expect(grouped.get(`lib:${LIB}`)).toHaveLength(2);
    expect(grouped.get(`lib:${LIB}:def:${DEF}`)).toHaveLength(1);
  });

  it('returns an empty map when given no comments', () => {
    expect(groupCommentsByTarget([]).size).toBe(0);
  });
});

describe('normaliseTarget', () => {
  it('fills missing optional fields with null', () => {
    expect(normaliseTarget({ TagSpecLibraryId: LIB })).toEqual({
      TagSpecLibraryId: LIB,
      TagSpecDefinitionId: null,
      TagRuleExpressionId: null,
      AttributeTag: null,
    });
  });
});
