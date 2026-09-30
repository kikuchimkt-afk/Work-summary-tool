import assert from 'node:assert/strict';
import * as XLSX from 'xlsx-js-style';
import { readTeacherSummary } from '../src/utils/workbookSummary';

const summarySheet = XLSX.utils.aoa_to_sheet([
    ['9月勤務時間集計'],
    ['講師名', '1:2', '1:2(特能)', '1:1(特能)', '集団指導', '事務作業', '英会話', '特能率', '勤務日数', '個別授業回数'],
    ['永岡栄治', 640, 320, 0, 0, 120, 0, '33.3%', '4 日', '12 回']
]);

assert.deepEqual(readTeacherSummary(summarySheet, '永岡栄治'), {
    metricValues: ['640', '320', '0', '0', '120', '0'],
    workDays: '4 日',
    individualLessonCount: '12 回'
});

assert.deepEqual(readTeacherSummary(summarySheet, '永岡栄治講師'), {
    metricValues: ['640', '320', '0', '0', '120', '0'],
    workDays: '4 日',
    individualLessonCount: '12 回'
});

assert.equal(readTeacherSummary(summarySheet, '未登録講師'), null);

const workbookPath = process.argv[2];
if (workbookPath) {
    const workbook = XLSX.readFile(workbookPath, { cellFormula: true, cellDates: false });
    const [firstSheetName, ...teacherSheetNames] = workbook.SheetNames;
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    assert.ok(firstSheet, '先頭の集計シートが必要です');

    const matchedSummaries = teacherSheetNames.map(sheetName => readTeacherSummary(firstSheet, sheetName));
    assert.equal(
        matchedSummaries.filter(summary => summary === null).length,
        0,
        '先頭の集計シートに一致しない講師シートがあります'
    );
    assert.ok(
        matchedSummaries.some(summary => summary?.metricValues.some(value => Number(value) > 0)),
        '先頭の集計シートから勤務時間を取得できませんでした'
    );

    console.log(`real workbook summary: ${matchedSummaries.length} teachers matched`);
}

console.log('workbook summary regression: ok');
