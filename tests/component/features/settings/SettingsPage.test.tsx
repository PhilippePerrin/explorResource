import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsPage } from '@/features/settings';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

const appSettingsRepository = createRepository('appSettings');
const companiesRepository = createRepository('companies');
const resourceTypesRepository = createRepository('resourceTypes');

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read blob.'));
    };
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };

    reader.readAsText(blob);
  });
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await deletePlannerDb();
  });

  it('validates threshold ordering before saving', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByRole('heading', { name: /^Settings$/i });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save threshold settings/i })).toBeEnabled();
    });
    await user.clear(screen.getByLabelText(/Available below/i));
    await user.type(screen.getByLabelText(/Available below/i), '95');
    await user.clear(screen.getByLabelText(/Used up to/i));
    await user.type(screen.getByLabelText(/Used up to/i), '90');
    await user.click(screen.getByRole('button', { name: /Save threshold settings/i }));

    expect(
      await screen.findAllByText(/Used up to must be greater than or equal to available below/i),
    ).toHaveLength(2);
  });

  it('exports a backup and restores it through the UI', async () => {
    await appSettingsRepository.put({
      id: 'app-settings',
      displayPrecision: 1,
      visualThresholds: {
        availableBelow: 72,
        usedFrom: 72,
        usedTo: 96,
        overloadFrom: 96,
        overloadTo: 111,
        criticalAbove: 125,
      },
      numericTolerance: 1e-6,
      themePreference: 'system',
      backupFormatVersion: 1,
      schemaVersion: 1,
    });
    await companiesRepository.put({
      id: '2c35df10-1bd5-4bcf-814c-42287fd755d2',
      name: 'Backup Ready Company',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    const objectUrls: string[] = [];
    const backupTextByUrl = new Map<string, Promise<string>>();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      const url = `blob:settings-test-${objectUrls.length + 1}`;
      objectUrls.push(url);

      if (!(blob instanceof Blob)) {
        throw new Error('Expected exportBackup to create a Blob download.');
      }

      backupTextByUrl.set(url, readBlobAsText(blob));
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(<SettingsPage />);

    await screen.findByRole('heading', { name: /^Settings$/i });
    await user.click(screen.getByRole('button', { name: /Export backup as JSON/i }));

    await waitFor(() => {
      expect(objectUrls).toHaveLength(1);
    });

    const firstObjectUrl = objectUrls[0];
    expect(firstObjectUrl).toBeDefined();

    if (!firstObjectUrl) {
      throw new Error('Expected an exported object URL.');
    }

    const exportedTextPromise = backupTextByUrl.get(firstObjectUrl);

    if (!exportedTextPromise) {
      throw new Error('Expected the exported asset to contain readable text.');
    }

    await companiesRepository.clear();
    await appSettingsRepository.clear();

    const exportedText = await exportedTextPromise;
    const backupFile = new File([exportedText], 'planner-backup.json', {
      type: 'application/json',
    });

    const backupInput = screen.getByLabelText(/Backup file/i) as HTMLInputElement;
    await user.upload(backupInput, backupFile);
    await user.click(screen.getByRole('button', { name: /Validate and restore backup/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /Restore and replace data/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /Backup restored\. Existing data has been replaced atomically\./i,
      );
    });

    await waitFor(async () => {
      const [settings, companies] = await Promise.all([
        appSettingsRepository.getById('app-settings'),
        companiesRepository.getAll(),
      ]);

      expect(settings?.visualThresholds.availableBelow).toBe(72);
      expect(companies[0]?.name).toBe('Backup Ready Company');
    });
  });

  it('persists the selected theme preference and updates the document theme attribute', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByRole('heading', { name: /^Settings$/i });
    await user.click(screen.getByRole('tab', { name: 'Dark' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(async () => {
      const settings = await appSettingsRepository.getById('app-settings');
      expect(settings?.themePreference).toBe('dark');
    });
  });

  it('requires two confirmations before resetting app data', async () => {
    await companiesRepository.put({
      id: '4cd740d1-0ac8-4f75-b11f-8744843ed6b0',
      name: 'Reset Me',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });
    await resourceTypesRepository.put({
      id: '7b1641d0-7b80-4187-8c45-dfe950a0a146',
      label: 'Resettable Type',
      shortCode: 'RST',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByRole('heading', { name: /^Settings$/i });
    await user.click(screen.getByRole('button', { name: /Reset app data/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /Continue reset/i }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /Delete all app data/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /All application data has been reset\./i,
      );
    });

    await waitFor(async () => {
      const [companies, resourceTypes, settings] = await Promise.all([
        companiesRepository.getAll(),
        resourceTypesRepository.getAll(),
        appSettingsRepository.getById('app-settings'),
      ]);

      expect(companies).toHaveLength(0);
      expect(resourceTypes).toHaveLength(0);
      expect(settings).toBeUndefined();
    });
  });
});
