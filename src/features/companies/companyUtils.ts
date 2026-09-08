import { z } from 'zod';

import type { Company, Resource } from '@/domain/entities';

export interface CompanyFormValues {
  name: string;
}

export function countCompanyReferences(
  resources: readonly Pick<Resource, 'companyId'>[],
  companyId: Company['id'],
): number {
  return resources.filter((resource) => resource.companyId === companyId).length;
}

export function sortCompanies(companies: readonly Company[]): Company[] {
  return [...companies].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function createCompanyFormSchema(
  companies: readonly Company[],
  editingCompanyId?: Company['id'],
) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Company name is required.')
      .refine(
        (value) =>
          !companies.some(
            (company) =>
              company.id !== editingCompanyId &&
              company.name.localeCompare(value, undefined, { sensitivity: 'base' }) === 0,
          ),
        'Company name must be unique.',
      ),
  });
}

export function createCompanyDefaultValues(company?: Company): CompanyFormValues {
  return {
    name: company?.name ?? '',
  };
}
