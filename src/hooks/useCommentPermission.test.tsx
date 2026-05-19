import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TagSpecLibrary } from '../types/tagSpec';

let mockUserId: string | null = 'user-1';
let mockIsAuthenticated = true;
let mockIsAudit = false;
let mockLibraries: TagSpecLibrary[] = [];

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    userId: mockUserId,
    isAuthenticated: mockIsAuthenticated,
    isAudit: mockIsAudit,
  }),
}));

vi.mock('./useTagSpecs', () => ({
  useTagSpecs: () => ({ libraries: mockLibraries }),
}));

import { useCommentPermission } from './useCommentPermission';

function makeLib(overrides: Partial<TagSpecLibrary> = {}): TagSpecLibrary {
  return {
    Id: 'lib-1',
    ActiveTagSpecLibId: null,
    OperatorId: 'user-1',
    StatusTag: 'INPROGRESS',
    DataSetType: 'TRANSACTION',
    Version: 1,
    VersionDate: '2026-05-19T00:00:00Z',
    Context: [],
    TagSpecDefinitions: [],
    ...overrides,
  };
}

describe('useCommentPermission', () => {
  beforeEach(() => {
    mockUserId = 'user-1';
    mockIsAuthenticated = true;
    mockIsAudit = false;
    mockLibraries = [];
  });

  it('allows comment when user is operator and library is INPROGRESS', () => {
    mockLibraries = [makeLib()];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(true);
    expect(result.current.canReply).toBe(true);
  });

  it('denies comment but allows reply when user is not the operator', () => {
    mockLibraries = [makeLib({ OperatorId: 'someone-else' })];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(true);
    expect(result.current.reason).toMatch(/operator/i);
  });

  it('denies comment when library is not INPROGRESS', () => {
    mockLibraries = [makeLib({ StatusTag: 'ACTIVE' })];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(true);
  });

  it('denies both when user is not authenticated', () => {
    mockIsAuthenticated = false;
    mockLibraries = [makeLib()];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(false);
  });

  it('denies both for audit users', () => {
    mockIsAudit = true;
    mockLibraries = [makeLib()];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(false);
  });

  it('denies comment when library is not in the list', () => {
    mockLibraries = [];
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(true);
  });

  it('denies comment when no library id is provided', () => {
    const { result } = renderHook(() => useCommentPermission(null));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(true);
  });
});
