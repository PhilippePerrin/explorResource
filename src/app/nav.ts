export interface NavItem {
  to: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard' }],
  },
  {
    label: 'Planning',
    items: [
      { to: '/capacity', label: 'Capacity Command Center' },
      { to: '/demand-coverage', label: 'Demand Coverage Board' },
      { to: '/allocation-studio', label: 'Allocation Studio' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { to: '/projects', label: 'Projects' },
      { to: '/groups', label: 'Groups' },
      { to: '/releases', label: 'Releases' },
      { to: '/resources', label: 'Resources' },
      { to: '/companies', label: 'Companies' },
      { to: '/resource-types', label: 'Resource Types' },
    ],
  },
  {
    label: 'Calendars',
    items: [
      { to: '/working-days', label: 'Working Days' },
      { to: '/non-working-days', label: 'Non-working Days' },
    ],
  },
  {
    label: 'Imports',
    items: [{ to: '/imports', label: 'Imports' }],
  },
  {
    label: 'Settings',
    items: [{ to: '/settings', label: 'Settings' }],
  },
] as const;

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
