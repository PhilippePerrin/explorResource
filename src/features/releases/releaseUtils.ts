import { z } from 'zod';

import {
  activeArchivedStatusSchema,
  type Project,
  type ProjectRelease,
  type Release,
} from '@/domain/entities';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface ReleaseFormValues {
  name: string;
  goLiveDate: string;
  color: string;
  status: Release['status'];
  projectIds: string[];
}

export interface ReleaseTimelineEntry {
  releaseId: Release['id'];
  releaseName: Release['name'];
  goLiveDate: Release['goLiveDate'];
  color?: Release['color'];
  status: Release['status'];
  projectNames: string[];
}

export interface ReleaseTimelineGroup {
  monthKey: string;
  monthLabel: string;
  entries: ReleaseTimelineEntry[];
}

export function sortReleases(releases: readonly Release[]): Release[] {
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

export function sortProjectsForSelection(projects: readonly Project[]): Project[] {
  return [...projects].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'active' ? -1 : 1;
    }

    return left.code.localeCompare(right.code, undefined, { sensitivity: 'base' });
  });
}

export function countReleaseReferences(
  projectReleases: readonly Pick<ProjectRelease, 'releaseId'>[],
  releaseId: Release['id'],
): number {
  return projectReleases.filter((projectRelease) => projectRelease.releaseId === releaseId).length;
}

export function getReleaseProjectIds(
  projectReleases: readonly Pick<ProjectRelease, 'projectId' | 'releaseId'>[],
  releaseId?: Release['id'],
): string[] {
  if (!releaseId) {
    return [];
  }

  return projectReleases
    .filter((projectRelease) => projectRelease.releaseId === releaseId)
    .map((projectRelease) => projectRelease.projectId);
}

export function createReleaseFormSchema(
  releases: readonly Release[],
  editingReleaseId?: Release['id'],
) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Release name is required.')
      .refine(
        (value) =>
          !releases.some(
            (release) =>
              release.id !== editingReleaseId &&
              release.name.localeCompare(value, undefined, { sensitivity: 'base' }) === 0,
          ),
        'Release name must be unique.',
      ),
    goLiveDate: z
      .string()
      .trim()
      .min(1, 'Go-live date is required.')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Go-live date must use the YYYY-MM-DD format.'),
    color: z.string().trim().min(1, 'Color is required.'),
    status: activeArchivedStatusSchema,
    projectIds: z.array(z.string().uuid()).default([]),
  });
}

export function createReleaseDefaultValues(
  release?: Release,
  projectReleases: readonly Pick<ProjectRelease, 'projectId' | 'releaseId'>[] = [],
): ReleaseFormValues {
  return {
    name: release?.name ?? '',
    goLiveDate: release?.goLiveDate ?? '',
    color: release?.color ?? '#00427f',
    status: release?.status ?? 'active',
    projectIds: getReleaseProjectIds(projectReleases, release?.id),
  };
}

export function formatIsoDateLabel(isoDate: string): string {
  const [yearToken, monthToken, dayToken] = isoDate.split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  const day = Number(dayToken);
  const monthName = MONTH_NAMES[month - 1] ?? monthToken;

  return `${monthName} ${day}, ${year}`;
}

export function buildReleaseTimeline(
  releases: readonly Release[],
  projectReleases: readonly ProjectRelease[],
  projects: readonly Project[],
): ReleaseTimelineGroup[] {
  const projectLookup = new Map(projects.map((project) => [project.id, project]));
  const sorted = sortReleases(releases);
  const groups = new Map<string, ReleaseTimelineGroup>();

  for (const release of sorted) {
    const monthKey = release.goLiveDate.slice(0, 7);
    const monthLabel = `${MONTH_NAMES[Number(release.goLiveDate.slice(5, 7)) - 1]} ${release.goLiveDate.slice(0, 4)}`;
    const projectNames = getReleaseProjectIds(projectReleases, release.id)
      .map((projectId) => projectLookup.get(projectId))
      .filter((project): project is Project => Boolean(project))
      .map((project) => `${project.code} — ${project.name}`);

    const timelineGroup = groups.get(monthKey) ?? {
      monthKey,
      monthLabel,
      entries: [],
    };

    timelineGroup.entries.push({
      releaseId: release.id,
      releaseName: release.name,
      goLiveDate: release.goLiveDate,
      color: release.color,
      status: release.status,
      projectNames,
    });
    groups.set(monthKey, timelineGroup);
  }

  return [...groups.values()];
}
