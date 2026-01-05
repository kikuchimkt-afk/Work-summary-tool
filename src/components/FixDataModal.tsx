import React, { useState, useEffect } from 'react';
import type { AttendanceRecord } from '../types';
import { INPUT_COL } from '../utils/parser';
import { addMin, subMin } from '../utils/transformer';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';

interface FixDataModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: AttendanceRecord[];
    errorIndices: number[];
    warnIndices: number[];
    onApply: (updatedData: AttendanceRecord[]) => void;
}

export const FixDataModal: React.FC<FixDataModalProps> = ({
    isOpen, onClose, data, errorIndices, warnIndices, onApply
}) => {
    const [activeTab, setActiveTab] = useState<'time' | 'office'>('time');
    const [localData, setLocalData] = useState<AttendanceRecord[]>([]);

    useEffect(() => {
        if (isOpen) {
            const newData = JSON.parse(JSON.stringify(data));

            // Auto-fill estimated times for errors
            errorIndices.forEach(idx => {
                const r = newData[idx];
                const d = parseInt(r[INPUT_COL.DURATION]) || 80;
                const s = r[INPUT_COL.START_TIME];
                const e = r[INPUT_COL.END_TIME];

                if (s && !e) {
                    newData[idx][INPUT_COL.END_TIME] = addMin(s, d);
                    newData[idx]._isManuallyFixed = true;
                } else if (!s && e) {
                    newData[idx][INPUT_COL.START_TIME] = subMin(e, d);
                    newData[idx]._isManuallyFixed = true;
                }
            });

            setLocalData(newData);

            if (errorIndices.length > 0) setActiveTab('time');
            else if (warnIndices.length > 0) setActiveTab('office');
        }
    }, [isOpen, data, errorIndices, warnIndices]);

    if (!isOpen) return null;
    // Prevent render if data hasn't been initialized yet
    if (localData.length === 0 && data.length > 0) return null;

    const handleTimeChange = (idx: number, field: string, value: string) => {
        const newData = [...localData];
        // @ts-ignore
        newData[idx][field] = value;
        newData[idx]._isManuallyFixed = true;
        setLocalData(newData);
    };

    const handleSubjectChange = (idx: number, value: string) => {
        const newData = [...localData];
        newData[idx][INPUT_COL.SUBJECT] = value;
        setLocalData(newData);
    };

    const handleTypeForce = (idx: number, value: 'office' | 'lesson' | '') => {
        const newData = [...localData];
        if (value) newData[idx]._forceType = value;
        else delete newData[idx]._forceType;
        newData[idx]._isManuallyFixed = true; // Mark as manually fixed
        setLocalData(newData);
    };

    const handleSaveOnly = () => {
        onApply(localData);
        // Do not close
    };

    const handleSaveAndClose = () => {
        onApply(localData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col relative z-10 animate-in slide-in-from-bottom-5 duration-300">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <AlertTriangle className="text-orange-500 w-5 h-5" /> データの確認と修正
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl hover:bg-gray-100 rounded-full p-1"><X className="w-6 h-6" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-6">
                    <button
                        onClick={() => setActiveTab('time')}
                        className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'time' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            } ${errorIndices.length === 0 ? 'opacity-50' : ''}`}
                    >
                        時間未入力エラー
                        {errorIndices.length > 0 && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs">{errorIndices.length}</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('office')}
                        className={`py-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'office' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            } ${warnIndices.length === 0 ? 'opacity-50' : ''}`}
                    >
                        事務/授業 判定チェック
                        {warnIndices.length > 0 && <span className="bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full text-xs">{warnIndices.length}</span>}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-y-auto p-0 bg-gray-50">
                    {/* Time Tab */}
                    {activeTab === 'time' && (
                        <div className="p-4">
                            {errorIndices.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                                    <CheckCircle className="w-12 h-12 mb-2 text-green-400" />
                                    時間エラーはありません
                                </div>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-200 bg-white shadow-sm rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">生徒名</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">講師名</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">推定時間</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">開始時間</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">終了時間</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 text-sm">
                                        {errorIndices.map(idx => {
                                            const r = localData[idx];
                                            const d = parseInt(r[INPUT_COL.DURATION]) || 80;
                                            // Suggest times
                                            let s = r[INPUT_COL.START_TIME] || '';
                                            let e = r[INPUT_COL.END_TIME] || '';
                                            if (s && !e) e = addMin(s, d);
                                            else if (!s && e) s = subMin(e, d);

                                            return (
                                                <tr key={idx}>
                                                    <td className="px-4 py-2">{r[INPUT_COL.STUDENT_NAME]}</td>
                                                    <td className="px-4 py-2">{r[INPUT_COL.TEACHER]}</td>
                                                    <td className="px-4 py-2 text-gray-500">{d}分(推測)</td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            className="border px-2 py-1 w-full rounded focus:ring-2 focus:ring-blue-200"
                                                            value={r[INPUT_COL.START_TIME]}
                                                            onChange={e => handleTimeChange(idx, INPUT_COL.START_TIME, e.target.value)}
                                                            placeholder={s} // Hint
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            className="border px-2 py-1 w-full rounded focus:ring-2 focus:ring-blue-200"
                                                            value={r[INPUT_COL.END_TIME]}
                                                            onChange={e => handleTimeChange(idx, INPUT_COL.END_TIME, e.target.value)}
                                                            placeholder={e} // Hint
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                            {errorIndices.length > 0 && (
                                <div className="mt-4 flex justify-end">
                                    <button onClick={handleSaveOnly} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold shadow-sm transition">
                                        時間修正を適用
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Office Tab */}
                    {activeTab === 'office' && (
                        <div className="p-4">
                            {warnIndices.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                                    <CheckCircle className="w-12 h-12 mb-2 text-green-400" />
                                    要確認データはありません
                                </div>
                            ) : (
                                <table className="min-w-full divide-y divide-gray-200 bg-white shadow-sm rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">講師名 / 生徒名</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500 w-1/3">科目名 (編集可)</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">時間</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">ステータス</th>
                                            <th className="px-4 py-2 text-left text-xs text-gray-500">強制指定</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 text-sm">
                                        {warnIndices.map(idx => {
                                            const r = localData[idx];
                                            return (
                                                <tr key={idx}>
                                                    <td className="px-4 py-2">
                                                        <div className="font-bold">{r[INPUT_COL.TEACHER]}</div>
                                                        <div className="text-xs text-gray-500">{r[INPUT_COL.STUDENT_NAME]}</div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            className="border px-2 py-1 w-full rounded"
                                                            value={r[INPUT_COL.SUBJECT]}
                                                            onChange={e => handleSubjectChange(idx, e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">{r[INPUT_COL.DURATION]}分</td>
                                                    <td className="px-4 py-2"><span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">要確認</span></td>
                                                    <td className="px-4 py-2">
                                                        <select
                                                            className="border px-2 py-1 text-xs rounded bg-white"
                                                            value={r._forceType || ''}
                                                            onChange={e => handleTypeForce(idx, e.target.value as any)}
                                                        >
                                                            <option value="">自動判定</option>
                                                            <option value="office">事務</option>
                                                            <option value="lesson">授業</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                            {warnIndices.length > 0 && (
                                <div className="mt-4 flex justify-end">
                                    <button onClick={handleSaveOnly} className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-bold shadow-sm transition">
                                        判定修正を適用
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm transition">キャンセル</button>
                    <button onClick={handleSaveAndClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-bold shadow-sm transition">
                        修正を適用して再集計
                    </button>
                </div>
            </div>
        </div>
    );
};
