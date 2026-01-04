import Papa from 'papaparse';
import type { AttendanceRecord } from '../types';

export const INPUT_COL = {
    STUDENT_NAME: '生徒氏名',
    FURIGANA: 'フリガナ',
    TEACHER: '書いた先生',
    GRADE: '学年',
    YEAR: '年度',
    START_TIME: '授業開始時間',
    END_TIME: '授業終了時間',
    DURATION: '授業時間(分)',
    SUBJECT: '科目',
    CONTENT: '授業内容',
    COMMENT: 'コメント',
    TYPE: '授業区分'
};

export const parseCSV = (file: File, encoding: string = 'auto'): Promise<AttendanceRecord[]> => {
    return new Promise((resolve, reject) => {
        const parse = (enc: string) => {
            Papa.parse<AttendanceRecord>(file, {
                header: true,
                skipEmptyLines: 'greedy',
                encoding: enc,
                complete: (results) => {
                    const fields = results.meta.fields;
                    if (!fields || !fields.includes(INPUT_COL.TEACHER)) {
                        if (encoding === 'auto' && enc === 'UTF-8') {
                            // Retry with Shift_JIS
                            console.log('UTF-8 parsing failed, retrying with Shift_JIS');
                            parse('Shift_JIS');
                            return;
                        }
                        reject(new Error('必須列が見つかりません。CSVの形式を確認してください。'));
                        return;
                    }
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        };

        parse(encoding === 'auto' ? 'UTF-8' : encoding);
    });
};
