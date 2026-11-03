import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx-js-style';
import { strFromU8, unzipSync } from 'fflate';
import { buildExcelFile } from '../src/utils/exporter';
import { readTeacherSummary } from '../src/utils/workbookSummary';
import type { GeneratedData, TeacherStats } from '../src/types';

const teacher = "検証 O'Brien";
const record = (name: string, values: number[], date = '2026-10-06'): GeneratedData => ({
    '生徒氏名': '検証生徒', 'フリガナ': 'ケンショウ', '講師名': name, '学年': '中3', '年度': '2026',
    '授業開始時間': `${date}T17:30:00`, '授業終了時間': `${date}T18:50:00`,
    '１：２': values[0] || '', '１：２(特能)': values[1] || '', '１：１(特能）': values[2] || '',
    '集団指導': values[3] || '', '事務作業': values[4] || '', '英会話': values[5] || '',
    '教科': '数学', '週間日数': '', _isError: false, _isManuallyFixed: false
});
const stats = (days: string[]): TeacherStats => ({
    '1:2': 0, sp_12: 0, sp_11: 0, group: 0, office: 0, english: 0,
    days: new Set(days), count_individual: 0, count_special: 0
});
const records = [
    record(teacher, [80, 0, 0, 0, 10, 0]),
    record(teacher, [0, 80, 0, 0, 10, 0]),
    record(teacher, [0, 0, 80, 0, 10, 0], '2026-10-13'),
    record(teacher, [0, 0, 0, 50, 0, 60], '2026-10-13'),
    record('授業なし', [0, 0, 0, 0, 30, 0]),
    ...Array.from({ length: 1005 }, () => record('1000行超', [80, 0, 0, 0, 10, 0]))
];
const build = (data: GeneratedData[]) => buildExcelFile(data, {
    [teacher]: stats(['2026-10-06', '2026-10-13']),
    '授業なし': stats(['2026-10-06']),
    '1000行超': stats(['2026-10-06']),
    '記録なし': stats([])
}, [teacher, '授業なし', '1000行超', '記録なし'], 'modern', {});
const result = build(records);
const workbook = XLSX.read(result.bytes, { type: 'array', cellFormula: true });
assert.deepEqual(workbook.SheetNames, ['集計一覧', teacher, '授業なし', '1000行超']);
const detail = workbook.Sheets[teacher];
const summary = workbook.Sheets['集計一覧'];
assert.deepEqual(['H', 'I', 'J', 'K', 'L', 'M'].map(col => detail[`${col}4`]?.v), [80, 80, 80, 50, 30, 60]);
assert.equal(detail.H4.f, 'SUM(H11:H15)', 'weekly separator must be included in the range');
assert.equal(detail.C6.v, '3 回');
assert.equal(summary.H3.v, 2 / 3);
assert.equal(summary.H4.v, 0, 'no individual lessons must not divide by zero');
assert.equal(summary.B3.f, "'検証 O''Brien'!H4", 'apostrophes in sheet names must be escaped');
assert.deepEqual(readTeacherSummary(summary, teacher), {
    metricValues: ['80', '80', '80', '50', '30', '60'], workDays: '2 日', individualLessonCount: '3 回'
});
assert.equal(workbook.Sheets['1000行超'].H4.v, 80400);
assert.equal(workbook.Sheets['1000行超'].H4.f, 'SUM(H11:H1015)');
assert.equal(workbook.Sheets['1000行超'].C6.v, '1005 回');

const files = unzipSync(result.bytes);
assert.match(strFromU8(files['xl/workbook.xml']), /<calcPr[^>]*calcMode="auto"[^>]*fullCalcOnLoad="1"[^>]*forceFullCalc="1"/);
for (const [path, data] of Object.entries(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(data);
    for (const cell of xml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
        if (!cell[0].includes('<f>')) continue;
        assert.match(cell[0], /<v>[^<]+<\/v>/, `formula result missing: ${path} ${cell[0]}`);
    }
    assert.match(xml, /paperSize="9"[^>]*orientation="portrait"/, 'A4 print settings must survive');
}

// A new export after an input edit must carry new results, not old stats/caches.
const updated = XLSX.read(build([{ ...records[0], '１：２': 100 }, ...records.slice(1)]).bytes, { type: 'array' });
assert.equal(updated.Sheets[teacher].H4.v, 100);
assert.equal(updated.Sheets['集計一覧'].B3.v, 100);
if (process.argv[2]) writeFileSync(process.argv[2], result.bytes);
console.log('Excel export regression: formula caches, cross-sheet links, >1000 rows, empty categories, edits, and print settings OK');
