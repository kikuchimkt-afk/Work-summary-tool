import type { SpecialClassRule, ThemeType } from '../types';
import { DEFAULT_TEACHER_ORDER } from './transformer';

export const CAMPUS_SETTINGS_STORAGE_KEY = 'work-summary-campus-settings-v1';
const LEGACY_BACKUP_STORAGE_KEY = 'work-summary-legacy-settings-backup-v1';

export const CAMPUS_DEFINITIONS = [
    { id: 'aizumi', name: '藍住校', defaultComiruTenant: 'bestone-aizumi' },
    { id: 'kitajima_chuo', name: '北島中央校', defaultComiruTenant: '' }
] as const;

export type CampusId = typeof CAMPUS_DEFINITIONS[number]['id'];

export interface CampusSettings {
    sortOrder: string[];
    excludedTeachers: string[];
    specialRules: SpecialClassRule[];
    theme: ThemeType;
    sheetComments: Record<string, string>;
    comiruTenant: string;
}

export interface CampusProfile {
    id: CampusId;
    name: string;
    settings: CampusSettings;
}

export interface CampusSettingsStore {
    schemaVersion: 1;
    activeCampusId: CampusId;
    campuses: Record<CampusId, CampusProfile>;
}

export interface CampusSettingsBackup extends CampusSettingsStore {
    exportedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isCampusId = (value: unknown): value is CampusId =>
    CAMPUS_DEFINITIONS.some(campus => campus.id === value);

const asStringArray = (value: unknown, fallback: string[] = []): string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string')
        ? [...value]
        : [...fallback];

const asTheme = (value: unknown): ThemeType =>
    value === 'modern' || value === 'minimal' || value === 'standard' ? value : 'modern';

const asSpecialRules = (value: unknown): SpecialClassRule[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((rule): rule is SpecialClassRule =>
        isRecord(rule)
        && typeof rule.id === 'string'
        && typeof rule.student === 'string'
        && typeof rule.teacher === 'string'
        && typeof rule.subject === 'string'
        && Boolean(rule.student.trim() || rule.teacher.trim() || rule.subject.trim())
    ).map(rule => ({ ...rule }));
};

const asComments = (value: unknown): Record<string, string> => {
    if (!isRecord(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
};

const sanitizeTenant = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    return /^[a-z0-9-]{0,80}$/u.test(normalized) ? normalized : fallback;
};

export const createDefaultCampusSettings = (campusId: CampusId): CampusSettings => {
    const definition = CAMPUS_DEFINITIONS.find(campus => campus.id === campusId)!;
    return {
        sortOrder: campusId === 'aizumi' ? [...DEFAULT_TEACHER_ORDER] : [],
        excludedTeachers: [],
        specialRules: [],
        theme: 'modern',
        sheetComments: {},
        comiruTenant: definition.defaultComiruTenant
    };
};

const normalizeCampusSettings = (value: unknown, campusId: CampusId): CampusSettings => {
    const fallback = createDefaultCampusSettings(campusId);
    if (!isRecord(value)) return fallback;

    return {
        sortOrder: asStringArray(value.sortOrder, fallback.sortOrder),
        excludedTeachers: asStringArray(value.excludedTeachers),
        specialRules: asSpecialRules(value.specialRules),
        theme: asTheme(value.theme),
        sheetComments: asComments(value.sheetComments),
        comiruTenant: campusId === 'aizumi'
            ? fallback.comiruTenant
            : sanitizeTenant(value.comiruTenant, fallback.comiruTenant)
    };
};

export const createDefaultCampusStore = (): CampusSettingsStore => ({
    schemaVersion: 1,
    activeCampusId: 'aizumi',
    campuses: Object.fromEntries(CAMPUS_DEFINITIONS.map(definition => [
        definition.id,
        {
            id: definition.id,
            name: definition.name,
            settings: createDefaultCampusSettings(definition.id)
        }
    ])) as Record<CampusId, CampusProfile>
});

const normalizeCampusStore = (value: unknown): CampusSettingsStore => {
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.campuses)) {
        return createDefaultCampusStore();
    }

    const fallback = createDefaultCampusStore();
    const rawCampuses = value.campuses;
    const campuses = Object.fromEntries(CAMPUS_DEFINITIONS.map(definition => {
        const rawProfile = rawCampuses[definition.id];
        const rawSettings = isRecord(rawProfile) ? rawProfile.settings : undefined;
        return [definition.id, {
            id: definition.id,
            name: definition.name,
            settings: normalizeCampusSettings(rawSettings, definition.id)
        }];
    })) as Record<CampusId, CampusProfile>;

    return {
        schemaVersion: 1,
        activeCampusId: isCampusId(value.activeCampusId) ? value.activeCampusId : fallback.activeCampusId,
        campuses
    };
};

const getBrowserStorage = (): Storage | null => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
};

const parseLegacyJson = (storage: Storage, key: string): unknown => {
    const value = storage.getItem(key);
    if (value === null) return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
};

const migrateLegacySettings = (storage: Storage): CampusSettingsStore => {
    const store = createDefaultCampusStore();
    if (storage.getItem(LEGACY_BACKUP_STORAGE_KEY) !== null) {
        return store;
    }

    const legacyValues = {
        schedule_sort_v2: storage.getItem('schedule_sort_v2'),
        schedule_excluded: storage.getItem('schedule_excluded'),
        schedule_special_rules: storage.getItem('schedule_special_rules'),
        schedule_theme: storage.getItem('schedule_theme'),
        schedule_comments: storage.getItem('schedule_comments')
    };
    const hasLegacySettings = Object.values(legacyValues).some(value => value !== null);

    if (hasLegacySettings) {
        const legacySettings = {
            sortOrder: parseLegacyJson(storage, 'schedule_sort_v2'),
            excludedTeachers: parseLegacyJson(storage, 'schedule_excluded'),
            specialRules: parseLegacyJson(storage, 'schedule_special_rules'),
            theme: storage.getItem('schedule_theme'),
            sheetComments: parseLegacyJson(storage, 'schedule_comments'),
            comiruTenant: 'bestone-aizumi'
        };
        store.campuses.aizumi.settings = normalizeCampusSettings(legacySettings, 'aizumi');

        if (storage.getItem(LEGACY_BACKUP_STORAGE_KEY) === null) {
            try {
                storage.setItem(LEGACY_BACKUP_STORAGE_KEY, JSON.stringify({
                    backedUpAt: new Date().toISOString(),
                    values: legacyValues
                }));
            } catch {
                // Continue with the migrated settings in memory. The app will
                // surface a persistence warning when the main store is saved.
            }
        }
    }

    return store;
};

export const loadInitialCampusStore = (): CampusSettingsStore => {
    const storage = getBrowserStorage();
    if (!storage) return createDefaultCampusStore();

    const saved = storage.getItem(CAMPUS_SETTINGS_STORAGE_KEY);
    if (saved !== null) {
        try {
            return normalizeCampusStore(JSON.parse(saved));
        } catch {
            return createDefaultCampusStore();
        }
    }

    const migrated = migrateLegacySettings(storage);
    try {
        storage.setItem(CAMPUS_SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
    } catch {
        // The caller can still use/export the in-memory settings.
    }
    return migrated;
};

export const saveCampusStore = (store: CampusSettingsStore): boolean => {
    const storage = getBrowserStorage();
    if (!storage) return false;
    try {
        storage.setItem(CAMPUS_SETTINGS_STORAGE_KEY, JSON.stringify(store));
        return true;
    } catch {
        return false;
    }
};

export const createCampusSettingsBackup = (store: CampusSettingsStore): CampusSettingsBackup => ({
    ...normalizeCampusStore(store),
    exportedAt: new Date().toISOString()
});

export const parseCampusSettingsBackup = (text: string): CampusSettingsStore => {
    if (text.length > 2 * 1024 * 1024) {
        throw new Error('設定ファイルが大きすぎます。2MB以下のJSONファイルを選択してください。');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('設定ファイルを読み取れませんでした。JSON形式を確認してください。');
    }

    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.campuses)) {
        throw new Error('勤務時間集計アプリの設定ファイルではありません。');
    }

    const rawCampuses = parsed.campuses;
    if (!CAMPUS_DEFINITIONS.every(campus => {
        const profile = rawCampuses[campus.id];
        return isRecord(profile) && isRecord(profile.settings);
    })) {
        throw new Error('勤務時間集計アプリの設定ファイルではありません。');
    }

    return normalizeCampusStore(parsed);
};

export const getCampusName = (campusId: CampusId): string =>
    CAMPUS_DEFINITIONS.find(campus => campus.id === campusId)?.name ?? campusId;
