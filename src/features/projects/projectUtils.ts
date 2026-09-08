import { z } from 'zod';

import {
  activeArchivedStatusSchema,
  projectCodeSchema,
  type Allocation,
  type DemandSnapshot,
  type Group,
  type Project,
  type ProjectRelease,
  type Release,
} from '@/domain/entities';

export interface ProjectFormValues {
  code: string;
  name: string;
  status: Project['status'];
  releaseIds: string[];
}

export interface ProjectReferenceData {
  demandSnapshots: readonly Pick<DemandSnapshot, 'projectCode'>[];
  allocations: readonly Pick<Allocation, 'projectCode'>[];
}

export function countProjectReferences(
  referenceData: ProjectReferenceData,
  projectCode: Project['code'],
): number {
  const normalizedCode = projectCode.trim().toUpperCase();

  return (
    referenceData.demandSnapshots.filter((snapshot) => snapshot.projectCode === normalizedCode)
      .length +
    referenceData.allocations.filter((allocation) => allocation.projectCode === normalizedCode)
      .length
  );
}

export function sortProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.code.localeCompare(right.code, undefined, { sensitivity: 'base' });
  });
}

export function sortGroups(groups: readonly Group[]): Group[] {
  return [...groups].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.code.localeCompare(right.code, undefined, { sensitivity: 'base' });
  });
}

export function sortReleasesForSelection(releases: readonly Release[]): Release[] {
  return [...releases].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    if (left.goLiveDate !== right.goLiveDate) {
      return left.goLiveDate.localeCompare(right.goLiveDate);
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function getProjectReleaseIds(
  projectReleases: readonly Pick<ProjectRelease, 'projectId' | 'releaseId'>[],
  projectId?: Project['id'],
): string[] {
  if (!projectId) {
    return [];
  }

  return projectReleases
    .filter((projectRelease) => projectRelease.projectId === projectId)
    .map((projectRelease) => projectRelease.releaseId);
}

export function createProjectFormSchema(
  projects: readonly Project[],
  editingProjectId?: Project['id'],
) {
  return z.object({
    code: projectCodeSchema.refine(
      (value) =>
        !projects.some(
          (project) =>
            project.id !== editingProjectId &&
            project.code.localeCompare(value, undefined, { sensitivity: 'base' }) === 0,
        ),
      'Project code must be unique.',
    ),
    name: z.string().trim().min(1, 'Project name is required.'),
    status: activeArchivedStatusSchema,
    releaseIds: z.array(z.string().uuid()).default([]),
  });
}

export function createProjectDefaultValues(
  project?: Project,
  projectReleases: readonly Pick<ProjectRelease, 'projectId' | 'releaseId'>[] = [],
): ProjectFormValues {
  return {
    code: project?.code ?? '',
    name: project?.name ?? '',
    status: project?.status ?? 'active',
    releaseIds: getProjectReleaseIds(projectReleases, project?.id),
  };
}

export function buildProjectCodeMigrationPlan(
  project: Pick<Project, 'code'>,
  nextProjectCode: Project['code'],
  referenceData: {
    demandSnapshots: readonly DemandSnapshot[];
    allocations: readonly Allocation[];
  },
  timestamp: string,
): { demandSnapshots: DemandSnapshot[]; allocations: Allocation[] } {
  if (project.code === nextProjectCode) {
    return { demandSnapshots: [], allocations: [] };
  }

  return {
    demandSnapshots: referenceData.demandSnapshots
      .filter((snapshot) => snapshot.projectCode === project.code)
      .map((snapshot) => ({
        ...snapshot,
        projectCode: nextProjectCode,
        updatedAt: timestamp,
      })),
    allocations: referenceData.allocations
      .filter((allocation) => allocation.projectCode === project.code)
      .map((allocation) => ({
        ...allocation,
        projectCode: nextProjectCode,
        updatedAt: timestamp,
      })),
  };
}
