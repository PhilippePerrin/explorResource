import { describe, expect, it } from 'vitest';

import {
  buildReleaseTimeline,
  countReleaseReferences,
  createReleaseFormSchema,
} from '@/features/releases';

describe('release utilities', () => {
  it('counts project references for a release', () => {
    expect(
      countReleaseReferences(
        [{ releaseId: 'release-a' }, { releaseId: 'release-a' }, { releaseId: 'release-b' }],
        'release-a',
      ),
    ).toBe(2);
  });

  it('rejects duplicate release names case-insensitively', () => {
    const schema = createReleaseFormSchema([
      {
        id: '82916e22-1fcf-4f27-a827-eb896d9128dc',
        name: 'Wave 1',
        goLiveDate: '2026-10-15',
        color: '#00427f',
        status: 'active',
        createdAt: '2026-09-08T08:00:00.000Z',
        updatedAt: '2026-09-08T08:00:00.000Z',
      },
    ]);

    const result = schema.safeParse({
      name: 'wave 1',
      goLiveDate: '2026-10-16',
      color: '#81b444',
      status: 'active',
      projectIds: [],
    });

    expect(result.success).toBe(false);
  });

  it('builds a month-grouped release timeline with linked projects', () => {
    const timeline = buildReleaseTimeline(
      [
        {
          id: 'release-a',
          name: 'Wave 1',
          goLiveDate: '2026-10-15',
          color: '#00427f',
          status: 'active',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      [
        {
          id: 'join-a',
          projectId: 'project-a',
          releaseId: 'release-a',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      [
        {
          id: 'project-a',
          code: 'E0100',
          name: 'Commercial Analytics',
          status: 'active',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
    );

    expect(timeline[0]?.monthLabel).toBe('October 2026');
    expect(timeline[0]?.entries[0]?.projectNames).toEqual(['E0100 — Commercial Analytics']);
  });
});
