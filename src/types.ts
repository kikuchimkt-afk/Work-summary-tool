export interface AttendanceRecord {
    '生徒氏名': string;
    'フリガナ': string;
    '書いた先生': string;
    '学年': string;
    '年度': string;
    '授業開始時間': string;
    '授業終了時間': string;
    '授業時間(分)': string;
    '科目': string;
    '授業内容': string;
    'コメント': string;
    '授業区分'?: string;

    // Internal fields (generated during processing or fixing)
    _isError?: boolean;
    _isManuallyFixed?: boolean;
    _forceType?: 'office' | 'lesson';

    [key: string]: any;
}

export interface TeacherStats {
    '1:2': number;
    'group': number;
    'office': number;
    'english': number;
    days: Set<string>;
    count_individual: number;
}

export interface GeneratedData {
    '生徒氏名': string;
    'フリガナ': string;
    '講師名': string;
    '学年': string;
    '年度': string;
    '授業開始時間': string;
    '授業終了時間': string;
    '１：２': number | string;
    '集団指導': number | string;
    '事務作業': number | string;
    '英会話': number | string;
    '教科': string;
    '週間日数': number | string;

    _isError: boolean;
    _isManuallyFixed: boolean;
    _classType?: string;
}

export type ThemeType = 'modern' | 'minimal' | 'standard';
