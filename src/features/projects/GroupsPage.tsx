import { useEffect, useMemo, useState } from 'react';

import type { Group } from '@/domain/entities';
import { createRepository } from '@/persistence/repository';

import { sortGroups } from './projectUtils';

type StatusFilter = 'all' | Group['status'];

const groupsRepository = createRepository('groups');

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();

  useEffect(() => {
    void loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);

    try {
      const loadedGroups = await groupsRepository.getAll();
      const sorted = sortGroups(loadedGroups);
      setGroups(sorted);
      setSelectedGroupId((currentId) => currentId ?? sorted[0]?.id);
    } finally {
      setLoading(false);
    }
  }

  const filteredGroups = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toUpperCase();

    return groups.filter((group) => {
      const matchesStatus = statusFilter === 'all' || group.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        group.code.includes(normalizedSearch) ||
        group.label.toUpperCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [groups, searchTerm, statusFilter]);

  const selectedGroup =
    filteredGroups.find((group) => group.id === selectedGroupId) ?? filteredGroups[0];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6" id="groups-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Groups</h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          Read-only imported grouping rows for non-conforming codes such as GIS#### or RUN####. They
          are displayed under the Projects area because they are project-adjacent but are never
          editable business projects.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(22rem,30rem)_1fr]">
        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <h2 className="text-xl font-semibold">Imported group list</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="group-search">
                Search groups
              </label>
              <input
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="group-search"
                placeholder="Search by code or label"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="group-status-filter">
                Status filter
              </label>
              <select
                className="w-full rounded-md border border-[var(--surf-divider)] bg-[var(--surf-600)] px-3 py-2"
                id="group-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p className="mt-4">Loading groups…</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <caption className="sr-only">Imported groups, read-only.</caption>
                <thead>
                  <tr className="border-b border-[var(--surf-divider)]">
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Code
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Label
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Status
                    </th>
                    <th className="px-3 py-2 font-semibold" scope="col">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-[var(--text-secondary)]" colSpan={4}>
                        No groups match the current filters.
                      </td>
                    </tr>
                  ) : null}

                  {filteredGroups.map((group) => (
                    <tr className="border-b border-[var(--surf-divider)]" key={group.id}>
                      <td className="px-3 py-3 font-medium">{group.code}</td>
                      <td className="px-3 py-3">{group.label}</td>
                      <td className="px-3 py-3">{group.status}</td>
                      <td className="px-3 py-3">
                        <button
                          className="rounded-md border border-[var(--surf-divider)] px-3 py-1.5"
                          onClick={() => setSelectedGroupId(group.id)}
                          type="button"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--surf-divider)] bg-[var(--surf-800)] p-5">
          <h2 className="text-xl font-semibold">Group details</h2>
          {selectedGroup ? (
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="font-medium text-[var(--text-secondary)]">Code</dt>
                <dd className="mt-1 text-lg font-semibold">{selectedGroup.code}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="font-medium text-[var(--text-secondary)]">Status</dt>
                <dd className="mt-1 text-lg font-semibold">{selectedGroup.status}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4 sm:col-span-2">
                <dt className="font-medium text-[var(--text-secondary)]">Label</dt>
                <dd className="mt-1">{selectedGroup.label}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="font-medium text-[var(--text-secondary)]">Created</dt>
                <dd className="mt-1">{selectedGroup.createdAt}</dd>
              </div>
              <div className="rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4">
                <dt className="font-medium text-[var(--text-secondary)]">Last updated</dt>
                <dd className="mt-1">{selectedGroup.updatedAt}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              Select a group to inspect its imported metadata.
            </p>
          )}

          <div className="mt-5 rounded-lg border border-[var(--surf-divider)] bg-[var(--surf-700)] p-4 text-sm text-[var(--text-secondary)]">
            This page is intentionally read-only: group codes come from imports and do not match the
            project code rule ^[EPR]\d{4}$.
          </div>
        </section>
      </section>
    </main>
  );
}
