import { describe, expect, it } from 'vitest';

import { countCompanyReferences, createCompanyFormSchema } from '@/features/companies';

describe('company utilities', () => {
  it('counts company references from resources', () => {
    expect(
      countCompanyReferences(
        [{ companyId: 'company-a' }, { companyId: 'company-a' }, { companyId: 'company-b' }, {}],
        'company-a',
      ),
    ).toBe(2);
  });

  it('rejects duplicate company names case-insensitively', () => {
    const schema = createCompanyFormSchema([
      {
        id: 'bc79a3b2-a95e-4eb9-b844-74933975f7bc',
        name: 'BioMérieux',
        status: 'active',
        createdAt: '2026-09-08T08:00:00.000Z',
        updatedAt: '2026-09-08T08:00:00.000Z',
      },
    ]);

    const result = schema.safeParse({ name: 'biomérieux' });
    expect(result.success).toBe(false);
  });
});
