import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('@civora/ui', () => {
  it('merges conflicting tailwind classes deterministically', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});

