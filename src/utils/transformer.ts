import type { AttendanceRecord, GeneratedData, TeacherStats } from '../types';
import { INPUT_COL } from './parser';

export const DEFAULT_TEACHER_ORDER = [
    "吉川講師", "島田講師", "久保講師", "岸本講師", "岡講師", "三井講師", "長井講師",
    "千種講師", "田頭講師", "永岡講師", "山田講師", "大串講師", "高畠講師", "篠原講師"
];

// Helpers
export const formatDate = (d: string | undefined): string => {
    if (!d) return '';
    const dt = new Date(d);
    // Simple check if date is valid
    if (isNaN(dt.getTime())) return d;

    // Format: YYYY/M/D H:mm
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const date = dt.getDate();
    const hours = dt.getHours();
    const minutes = dt.getMinutes();
    const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

    return `${year}/${month}/${date} ${hours}:${minStr}`;
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const formatDateWithWeekday = (d: string | undefined): string => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const minutes = dt.getMinutes().toString().padStart(2, '0');
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}(${WEEKDAY_LABELS[dt.getDay()]}) ${dt.getHours()}:${minutes}`;
};

const parseDate = (value: string | undefined): Date | null => {
    if (!value?.trim()) return null;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const getEnteredDuration = (row: AttendanceRecord): number | null => {
    const value = Number.parseInt(row[INPUT_COL.DURATION], 10);
    return Number.isFinite(value) && value >= 10 && value <= 480 ? value : null;
};

const getTimestampDuration = (start: Date | null, end: Date | null): number | null => {
    if (!start || !end) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes >= 10 && minutes <= 480 ? minutes : null;
};

const isImplausibleLessonClock = (start: Date | null, end: Date | null) => {
    const isOutsideSchoolHours = (value: Date | null) => value !== null && value.getHours() < 7;
    return isOutsideSchoolHours(start) || isOutsideSchoolHours(end);
};

export const needsTimeInference = (row: AttendanceRecord): boolean => {
    const start = parseDate(row[INPUT_COL.START_TIME]);
    const end = parseDate(row[INPUT_COL.END_TIME]);
    const enteredDuration = getEnteredDuration(row);
    const timestampDuration = getTimestampDuration(start, end);

    if (!start || !end || isImplausibleLessonClock(start, end) || !timestampDuration) return true;
    return enteredDuration !== null && Math.abs(timestampDuration - enteredDuration) > 5;
};

interface LessonTimePattern {
    student: string;
    teacher: string;
    subject: string;
    weekday: number;
    startMinutes: number;
    endMinutes: number;
    duration: number;
    sourceIndex: number;
}

const normalizeText = (value: string | undefined) => (value ?? '').replace(/[\s\u3000]+/gu, '').trim();

const selectMostCommonPattern = (patterns: LessonTimePattern[]): LessonTimePattern | null => {
    if (patterns.length === 0) return null;
    const grouped = new Map<string, { pattern: LessonTimePattern; count: number }>();
    patterns.forEach(pattern => {
        const key = `${pattern.startMinutes}:${pattern.endMinutes}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.count += 1;
            if (pattern.sourceIndex > existing.pattern.sourceIndex) existing.pattern = pattern;
        } else {
            grouped.set(key, { pattern, count: 1 });
        }
    });
    return [...grouped.values()]
        .sort((a, b) => b.count - a.count || b.pattern.sourceIndex - a.pattern.sourceIndex)[0].pattern;
};

const findLessonTimePattern = (
    row: AttendanceRecord,
    baseDate: Date,
    patterns: LessonTimePattern[]
): LessonTimePattern | null => {
    const student = normalizeText(row[INPUT_COL.STUDENT_NAME]);
    const teacher = normalizeText(row[INPUT_COL.TEACHER]);
    const subject = normalizeText(row[INPUT_COL.SUBJECT]);
    const weekday = baseDate.getDay();
    const criteria: Array<(pattern: LessonTimePattern) => boolean> = [];

    if (subject) {
        criteria.push(pattern => pattern.student === student && pattern.teacher === teacher && pattern.subject === subject && pattern.weekday === weekday);
    }
    criteria.push(
        pattern => pattern.student === student && pattern.teacher === teacher && pattern.weekday === weekday,
        pattern => pattern.student === student && pattern.teacher === teacher,
    );
    if (subject) {
        criteria.push(pattern => pattern.student === student && pattern.subject === subject && pattern.weekday === weekday);
    }
    criteria.push(
        pattern => pattern.student === student && pattern.weekday === weekday,
        pattern => pattern.student === student,
    );

    for (const matches of criteria) {
        const selected = selectMostCommonPattern(patterns.filter(matches));
        if (selected) return selected;
    }
    return null;
};

const combineDateAndMinutes = (baseDate: Date, minutes: number) => {
    const result = new Date(baseDate);
    result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return result;
};

export const inferLessonTimes = (data: AttendanceRecord[]): AttendanceRecord[] => {
    const patterns: LessonTimePattern[] = [];
    data.forEach((row, sourceIndex) => {
        if (needsTimeInference(row)) return;
        const start = parseDate(row[INPUT_COL.START_TIME]);
        const end = parseDate(row[INPUT_COL.END_TIME]);
        const duration = getTimestampDuration(start, end);
        if (!start || !end || !duration) return;
        patterns.push({
            student: normalizeText(row[INPUT_COL.STUDENT_NAME]),
            teacher: normalizeText(row[INPUT_COL.TEACHER]),
            subject: normalizeText(row[INPUT_COL.SUBJECT]),
            weekday: start.getDay(),
            startMinutes: start.getHours() * 60 + start.getMinutes(),
            endMinutes: end.getHours() * 60 + end.getMinutes(),
            duration,
            sourceIndex,
        });
    });

    return data.map(row => {
        if (!needsTimeInference(row)) return { ...row };

        const start = parseDate(row[INPUT_COL.START_TIME]);
        const end = parseDate(row[INPUT_COL.END_TIME]);
        const enteredDuration = getEnteredDuration(row);
        const implausibleClock = isImplausibleLessonClock(start, end);
        const usableStart = start && !implausibleClock ? start : null;
        const baseDate = start ?? end;
        let inferredStart: Date | null = null;
        let inferredEnd: Date | null = null;
        let inferredDuration: number | null = null;

        if (usableStart && !end && enteredDuration) {
            inferredStart = usableStart;
            inferredEnd = new Date(usableStart.getTime() + enteredDuration * 60000);
            inferredDuration = enteredDuration;
        } else if (!start && end && enteredDuration) {
            inferredStart = new Date(end.getTime() - enteredDuration * 60000);
            inferredEnd = end;
            inferredDuration = enteredDuration;
        } else if (baseDate) {
            const pattern = findLessonTimePattern(row, baseDate, patterns);
            if (pattern) {
                inferredStart = combineDateAndMinutes(baseDate, pattern.startMinutes);
                inferredEnd = combineDateAndMinutes(baseDate, pattern.endMinutes);
                inferredDuration = pattern.duration;
            } else if (usableStart && enteredDuration) {
                inferredStart = usableStart;
                inferredEnd = new Date(usableStart.getTime() + enteredDuration * 60000);
                inferredDuration = enteredDuration;
            }
        }

        if (!inferredStart || !inferredEnd || !inferredDuration) return { ...row };
        return {
            ...row,
            [INPUT_COL.START_TIME]: formatDate(inferredStart.toString()),
            [INPUT_COL.END_TIME]: formatDate(inferredEnd.toString()),
            [INPUT_COL.DURATION]: String(inferredDuration),
            _isTimeEstimated: true,
        };
    });
};

export const getWeekKey = (d: string | undefined): number | null => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    dt.setHours(0, 0, 0, 0);
    // Calculate start of week (Monday)
    // getDay() returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    // For Monday-Sunday week: Monday=0, Tuesday=1, ..., Sunday=6
    const dayOfWeek = dt.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday becomes 6, Monday becomes 0
    dt.setDate(dt.getDate() - daysFromMonday);
    return dt.getTime();
};

export const addMin = (d: string, m: number): string => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    dt.setMinutes(dt.getMinutes() + m);
    return formatDate(dt.toString()); // Note: formatting back to string for consistency? 
    // Actually the original used formatDate() on the date object. 
    // Let's make sure our formatDate accepts Date object too or we adjust here.
    // To match original implementation closely:
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const date = dt.getDate();
    const hours = dt.getHours();
    const minutes = dt.getMinutes();
    const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${year}/${month}/${date} ${hours}:${minStr}`;
};

export const subMin = (d: string, m: number): string => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    dt.setMinutes(dt.getMinutes() - m);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const date = dt.getDate();
    const hours = dt.getHours();
    const minutes = dt.getMinutes();
    const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${year}/${month}/${date} ${hours}:${minStr}`;
};

// Data Extraction Helpers
export const getSortedStudentNames = (data: AttendanceRecord[]): string[] => {
    // Map student to grade
    const studentGrades = new Map<string, string>();
    data.forEach(r => {
        const s = r[INPUT_COL.STUDENT_NAME];
        const g = r[INPUT_COL.GRADE];
        if (s && g) studentGrades.set(s, g);
    });

    const gradeOrder = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3'];
    const getGradeScore = (g: string) => {
        const idx = gradeOrder.indexOf(g);
        return idx !== -1 ? idx : 99;
    };

    return Array.from(studentGrades.keys()).sort((a, b) => {
        const ga = studentGrades.get(a) || '';
        const gb = studentGrades.get(b) || '';
        const sa = getGradeScore(ga);
        const sb = getGradeScore(gb);
        if (sa !== sb) return sa - sb;
        return a.localeCompare(b, 'ja');
    });
};

export const getUniqueSubjects = (data: AttendanceRecord[]): string[] => {
    const subjects = new Set<string>();
    data.forEach(r => {
        const s = r[INPUT_COL.SUBJECT];
        if (s) subjects.add(s);
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ja'));
};


// Sorting Logic
export const sortData = (data: AttendanceRecord[], teacherSortOrder: string[]): AttendanceRecord[] => {
    return [...data].sort((a, b) => {
        const tA = a[INPUT_COL.TEACHER] || '';
        const tB = b[INPUT_COL.TEACHER] || '';

        if (tA !== tB) {
            const getIdx = (name: string) => teacherSortOrder.findIndex(order => name.includes(order.replace('講師', '')) || order === name);
            const idxA = getIdx(tA);
            const idxB = getIdx(tB);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return tA.localeCompare(tB, 'ja');
        }

        const dA = a[INPUT_COL.START_TIME] ? new Date(a[INPUT_COL.START_TIME]).getTime() : 0;
        const dB = b[INPUT_COL.START_TIME] ? new Date(b[INPUT_COL.START_TIME]).getTime() : 0;
        return dA - dB;
    });
};

// Check Quality
export const checkDataQuality = (data: AttendanceRecord[]) => {
    const errorIndices: number[] = [];
    const warnIndices: number[] = [];

    data.forEach((row, i) => {
        if (needsTimeInference(row)) {
            errorIndices.push(i);
        }

        // Check for 'Office' ambiguity only if not forced
        if (!row._forceType) {
            const txt = ((row[INPUT_COL.SUBJECT] || '') + (row[INPUT_COL.CONTENT] || '') + (row[INPUT_COL.COMMENT] || '')).replace(/\s/g, '');
            if (txt.includes('事務')) {
                warnIndices.push(i);
            }
        }
    });

    return { errorIndices, warnIndices };
};

export type SessionWorkType = 'office' | 'group' | '1:2' | 'sp_12' | 'sp_11' | 'english';

export const determineSessionWorkType = (
    row: AttendanceRecord,
    duration: number,
    sessionCount: number,
    isSessionSpecial: boolean,
    isNonIndividualTeacher: boolean
): SessionWorkType => {
    const classificationText = [
        row[INPUT_COL.SUBJECT],
        row[INPUT_COL.TYPE],
        row[INPUT_COL.CONTENT],
        row[INPUT_COL.COMMENT],
    ].filter(Boolean).join(' ').replace(/[\s\u3000]+/gu, '');

    const isOffice = classificationText.includes('事務');
    const isEnglishConversation = classificationText.includes('英会話');
    const isGroupLesson = duration === 90 || classificationText.includes('集団') || classificationText.includes('グループ');
    const isDummyNonIndividualRecord =
        normalizeText(row[INPUT_COL.STUDENT_NAME]).includes('犬伏さん') ||
        normalizeText(row[INPUT_COL.GRADE]) === '0歳';

    if (row._forceType === 'office') return 'office';

    // Explicit lesson information always wins over the duration. This prevents
    // 80-minute conversation or group lessons from being counted as individual.
    if (isEnglishConversation) return 'english';
    if (isGroupLesson) return 'group';

    // Teachers registered here remain in the workbook, but never contribute to
    // the individual-instruction columns. Non-conversation lessons default to group.
    if (isNonIndividualTeacher || isDummyNonIndividualRecord) return isOffice ? 'office' : 'group';

    if (row._forceType === 'lesson') {
        if (isSessionSpecial) return sessionCount >= 2 ? 'sp_12' : 'sp_11';
        if (duration === 80 || duration === 60) return '1:2';
        return 'english';
    }

    if (isOffice) return 'office';
    if (isSessionSpecial) return sessionCount >= 2 ? 'sp_12' : 'sp_11';
    if (duration === 80 || duration === 60) return '1:2';
    return 'english';
};

// Main Transform
export const transformData = (
    sortedData: AttendanceRecord[],
    excludedTeachers: string[],
    teacherStats: Record<string, TeacherStats>
): GeneratedData[] => {

    const weeklyStats: Record<string, Record<string, Set<string>>> = {};
    const teachersWithData = new Set<string>();
    let currentSessionStudents = 0;
    let currentSessionIsSpecial = false;


    // First pass: Build stats
    sortedData.forEach(row => {
        const t = row[INPUT_COL.TEACHER];
        if (!t) return;
        teachersWithData.add(t);

        if (!teacherStats[t]) {
            teacherStats[t] = { '1:2': 0, 'group': 0, 'office': 0, 'english': 0, 'sp_12': 0, 'sp_11': 0, days: new Set(), count_individual: 0, count_special: 0 };
        }
        if (!weeklyStats[t]) weeklyStats[t] = {};

        const sTime = row[INPUT_COL.START_TIME];
        if (sTime) {
            const wk = getWeekKey(sTime);
            if (wk) {
                const day = formatDate(sTime).split(' ')[0];
                if (!weeklyStats[t][wk]) weeklyStats[t][wk] = new Set();
                weeklyStats[t][wk].add(day);
                teacherStats[t].days.add(day);
            }
        }
    });

    const generatedData: GeneratedData[] = [];

    for (let i = 0; i < sortedData.length; i++) {
        const row = sortedData[i];
        if (!row[INPUT_COL.TEACHER]) continue;
        currentSessionStudents++;

        const t = row[INPUT_COL.TEACHER];
        const sTime = formatDate(row[INPUT_COL.START_TIME]);
        const eTime = formatDate(row[INPUT_COL.END_TIME]);

        // Recalculate duration for manually fixed records, otherwise use original
        let dur = parseInt(row[INPUT_COL.DURATION]) || 0;
        if (row._isManuallyFixed && row[INPUT_COL.START_TIME] && row[INPUT_COL.END_TIME]) {
            const startDt = new Date(row[INPUT_COL.START_TIME]);
            const endDt = new Date(row[INPUT_COL.END_TIME]);
            dur = Math.round((endDt.getTime() - startDt.getTime()) / 60000); // Convert ms to minutes
        }
        let subj = row[INPUT_COL.SUBJECT] || '';

        const cont = row[INPUT_COL.CONTENT] || '';
        const comm = row[INPUT_COL.COMMENT] || '';
        const attendanceStatus = row[INPUT_COL.ATTENDANCE] || '';
        if (subj.includes('英会話レッスン')) {
            if (cont.trim()) subj = cont; else if (comm.trim()) subj = comm;
        }

        // Check if current row is special and update session flag
        if (row._forceSpecial === true || row[INPUT_COL.TYPE]?.includes('特能')) {
            currentSessionIsSpecial = true;
        }

        const nextRow = sortedData[i + 1];
        const nextT = nextRow ? nextRow[INPUT_COL.TEACHER] : null;
        const nextS = nextRow ? formatDate(nextRow[INPUT_COL.START_TIME]) : null;

        const isLastOfSession = (t !== nextT) || (sTime !== nextS);

        // Separator Logic (Empty row between different weeks or teachers)
        if (i > 0) {
            const prevRow = sortedData[i - 1];
            const prevT = prevRow[INPUT_COL.TEACHER];
            const prevW = getWeekKey(prevRow[INPUT_COL.START_TIME]);
            const currW = getWeekKey(row[INPUT_COL.START_TIME]);
            if (prevT !== t || (prevW && currW && prevW !== currW)) {
                // We add an empty object to represent a separator line
                // But GeneratedData type requires fields. We'll handle this by returning partials 
                // and handling in UI, or just push empty strings.
                // Re-checking types: fields are string | number.
                generatedData.push({} as GeneratedData);
            }
        }

        let v12: number | string = '';
        let vSp12: number | string = '';
        let vSp11: number | string = '';
        let vGr: number | string = '';
        let vEn: number | string = '';
        let vOf: number | string = '';

        if (isLastOfSession) {
            const sessionCount = currentSessionStudents;
            const isSessionSpecial = currentSessionIsSpecial;

            currentSessionStudents = 0; // Reset for next session
            currentSessionIsSpecial = false; // Reset

            const type = determineSessionWorkType(
                row,
                dur,
                sessionCount,
                isSessionSpecial,
                excludedTeachers.includes(t)
            );

            if (type === "office") {
                vOf = dur;
                teacherStats[t].office += dur;
            } else if (type === "group") {
                vGr = dur;
                teacherStats[t].group += dur;
            } else if (type === "1:2") {
                v12 = dur;
                teacherStats[t]['1:2'] += dur;
                teacherStats[t]['count_individual']++;
                const autoOf = 10;
                vOf = autoOf;
                teacherStats[t].office += autoOf;
            } else if (type === "sp_12") {
                vSp12 = dur;
                teacherStats[t]['sp_12'] += dur;
                teacherStats[t]['count_individual']++;
                teacherStats[t]['count_special']++;
                const autoOf = 10;
                vOf = autoOf;
                teacherStats[t].office += autoOf;
            } else if (type === "sp_11") {
                vSp11 = dur;
                teacherStats[t]['sp_11'] += dur;
                teacherStats[t]['count_individual']++;
                teacherStats[t]['count_special']++;
                const autoOf = 10;
                vOf = autoOf;
                teacherStats[t].office += autoOf;
            } else {
                vEn = dur;
                teacherStats[t].english += dur;
            }
        }

        let wCount: number | string = '';
        const wk = getWeekKey(row[INPUT_COL.START_TIME]);
        const nextWk = nextRow ? getWeekKey(nextRow[INPUT_COL.START_TIME]) : null;
        const isLastOfWeek = (t !== nextT) || (wk !== nextWk);

        if (isLastOfWeek && wk && weeklyStats[t][wk]) {
            wCount = weeklyStats[t][wk].size;
        }

        generatedData.push({
            '生徒氏名': row[INPUT_COL.STUDENT_NAME],
            'フリガナ': row[INPUT_COL.FURIGANA],
            '講師名': t,
            '学年': row[INPUT_COL.GRADE],
            '年度': row[INPUT_COL.YEAR],
            '授業開始時間': sTime,
            '授業終了時間': eTime,
            '１：２': v12,
            '１：２(特能)': vSp12,
            '１：１(特能）': vSp11,
            '集団指導': vGr,
            '事務作業': vOf,
            '英会話': vEn,
            '教科': subj,
            '週間日数': wCount,
            _isError: (!row[INPUT_COL.START_TIME] || !row[INPUT_COL.END_TIME]),
            _isManuallyFixed: row._isManuallyFixed || false,
            _isTimeEstimated: row._isTimeEstimated || false,
            _isAbsent: attendanceStatus.includes('欠席'),
            _classType: row[INPUT_COL.TYPE],
            _isSpecial: (row._forceSpecial === true || row[INPUT_COL.TYPE]?.includes('特能'))
        });
    }

    return generatedData;
};
