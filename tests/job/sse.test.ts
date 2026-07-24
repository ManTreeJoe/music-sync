import { describe, it, expect } from 'vitest';
import { sseEvent, sseComment } from '../../src/lib/job/sse';

describe('SSE formatting', () => {
  it('formats a named event with a JSON data line and blank terminator', () => {
    expect(sseEvent('progress', { done: 3, total: 10 })).toBe(
      'event: progress\ndata: {"done":3,"total":10}\n\n',
    );
  });

  it('comments start with a colon and are ignored by clients', () => {
    expect(sseComment('timeout')).toBe(': timeout\n\n');
  });
});
