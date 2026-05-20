import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let mockUserId: string | null = 'user-1';
let mockIsAuthenticated = true;
let mockIsAudit = false;

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    userId: mockUserId,
    isAuthenticated: mockIsAuthenticated,
    isAudit: mockIsAudit,
  }),
}));

import { useCommentPermission } from './useCommentPermission';

describe('useCommentPermission', () => {
  beforeEach(() => {
    mockUserId = 'user-1';
    mockIsAuthenticated = true;
    mockIsAudit = false;
  });

  it('allows any authenticated non-audit user to comment and reply', () => {
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(true);
    expect(result.current.canReply).toBe(true);
  });

  it('allows commenting regardless of library context', () => {
    const { result } = renderHook(() => useCommentPermission(null));
    expect(result.current.canComment).toBe(true);
    expect(result.current.canReply).toBe(true);
  });

  it('denies both when user is not authenticated', () => {
    mockIsAuthenticated = false;
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(false);
  });

  it('denies both for audit users', () => {
    mockIsAudit = true;
    const { result } = renderHook(() => useCommentPermission('lib-1'));
    expect(result.current.canComment).toBe(false);
    expect(result.current.canReply).toBe(false);
    expect(result.current.reason).toMatch(/audit/i);
  });
});
