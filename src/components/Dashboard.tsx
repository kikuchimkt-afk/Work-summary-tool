import React from 'react';
import type { GeneratedData, TeacherStats } from '../types';
import { Download } from 'lucide-react';

interface DashboardProps {
    generatedData: GeneratedData[];
    teacherStats: Record<string, TeacherStats>;
    teacherSortOrder: string[];
    onDownloadExcel: () => void;
    onDownloadCsv: () => void;
    onDownloadTemplate: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    generatedData, teacherStats, teacherSortOrder,
    onDownloadExcel, onDownloadCsv, onDownloadTemplate
}) => {

    // Sort logic for summary
    const sortedTeachers = Object.keys(teacherStats).sort((a, b) => {
        const getIdx = (name: string) => teacherSortOrder.findIndex(order => name.includes(order.replace('講師', '')) || order === name);
        const idxA = getIdx(a);
        const idxB = getIdx(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b, 'ja');
    });

    return (
        <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-[800px] w-full max-w-7xl mx-auto">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-gray-700 flex items-center gap-2">
                    集計結果プレビュー
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">更新済み</span>
                </h2>
                <div className="flex gap-2">
                    <button onClick={onDownloadTemplate} className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2 px-4 rounded shadow transition">
                        空のテンプレート
                    </button>
                    <button onClick={onDownloadCsv} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded shadow flex items-center gap-1 transition">
                        <Download className="w-4 h-4" /> CSV
                    </button>
                    <button onClick={onDownloadExcel} className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-4 rounded shadow flex items-center gap-1 transition">
                        <Download className="w-4 h-4" /> Excel保存
                    </button>
                </div>
            </div>

            <div className="flex-grow flex flex-col overflow-hidden">
                {/* Summary Section */}
                <div className="bg-gray-50 px-4 py-2 border-b font-bold text-xs text-gray-600">全体集計 (プレビュー)</div>
                <div className="overflow-auto h-1/3 border-b">
                    <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
                        <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">講師名</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">1:2</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">集団</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">事務</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">英会話</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">勤務日数</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">個別回数</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {sortedTeachers.map(t => {
                                const s = teacherStats[t];
                                return (
                                    <tr key={t}>
                                        <td className="px-3 py-1">{t}</td>
                                        <td className="px-3 py-1 text-right">{s['1:2']}</td>
                                        <td className="px-3 py-1 text-right">{s['group']}</td>
                                        <td className="px-3 py-1 text-right">{s['office']}</td>
                                        <td className="px-3 py-1 text-right">{s['english']}</td>
                                        <td className="px-3 py-1 text-right font-bold">{s.days.size}</td>
                                        <td className="px-3 py-1 text-right">{s.count_individual}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Details Section */}
                <div className="bg-gray-50 px-4 py-2 border-b font-bold text-xs text-gray-600">詳細データ (先頭50件)</div>
                <div className="overflow-auto flex-grow">
                    <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap relative">
                        <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">生徒氏名</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">講師名</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">日付</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">開始</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">１：２</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">集団</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">英会話</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">事務</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">教科</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {generatedData.slice(0, 50).map((r, i) => {
                                // Separator check
                                if (!r['講師名']) {
                                    return (
                                        <tr key={i}>
                                            <td colSpan={9} className="bg-gray-100 text-center text-xs text-gray-400 py-1">--- 区切り ---</td>
                                        </tr>
                                    );
                                }
                                const isErr = r._isError || r._isManuallyFixed;
                                const cellClass = `px-3 py-1 border-b ${isErr ? 'bg-red-50 text-red-700' : ''}`;
                                // Only show date part from StartTime for "Date" column to correspond to "日付"
                                const dateStr = r['授業開始時間'].split(' ')[0];
                                const timeStr = r['授業開始時間'].split(' ')[1];

                                return (
                                    <tr key={i}>
                                        <td className={cellClass}>{r['生徒氏名']}</td>
                                        <td className={cellClass}>{r['講師名']}</td>
                                        <td className={cellClass}>{dateStr}</td>
                                        <td className={cellClass}>{timeStr}</td>
                                        <td className={`${cellClass} text-right`}>{r['１：２']}</td>
                                        <td className={`${cellClass} text-right`}>{r['集団指導']}</td>
                                        <td className={`${cellClass} text-right`}>{r['英会話']}</td>
                                        <td className={`${cellClass} text-right`}>{r['事務作業']}</td>
                                        <td className={cellClass}>{r['教科']}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
