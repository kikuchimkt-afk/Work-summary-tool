import * as XLSX from 'xlsx-js-style';

type WorkbookCell = XLSX.CellObject & {
    w?: string;
};

export interface TeacherWorkbookSummary {
    metricValues: string[];
    workDays: string;
    individualLessonCount: string;
}

const getCellText = (sheet: XLSX.WorkSheet, row: number, column: number): string => {
    const reference = XLSX.utils.encode_cell({ r: row, c: column });
    const cell = sheet[reference] as WorkbookCell | undefined;
    if (!cell) return '';
    if (cell.w !== undefined) return String(cell.w).trim();
    if (cell.v === undefined || cell.v === null) return '';
    return String(cell.v).trim();
};

const normalizeTeacherName = (value: string) => value
    .normalize('NFKC')
    .replace(/[\s\u3000]+/gu, '')
    .replace(/講師$/u, '');

export const readTeacherSummary = (
    summarySheet: XLSX.WorkSheet,
    teacherSheetName: string
): TeacherWorkbookSummary | null => {
    const range = XLSX.utils.decode_range(summarySheet['!ref'] ?? 'A1:A1');
    const targetName = normalizeTeacherName(teacherSheetName);

    for (let row = range.s.r; row <= range.e.r; row += 1) {
        if (normalizeTeacherName(getCellText(summarySheet, row, 0)) !== targetName) continue;

        return {
            metricValues: Array.from({ length: 6 }, (_, offset) => getCellText(summarySheet, row, offset + 1)),
            workDays: getCellText(summarySheet, row, 8),
            individualLessonCount: getCellText(summarySheet, row, 9)
        };
    }

    return null;
};
