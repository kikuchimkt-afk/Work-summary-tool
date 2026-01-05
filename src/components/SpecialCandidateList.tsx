import React, { useState, useEffect } from 'react';
import { CheckSquare, ArrowUpDown } from 'lucide-react';
import type { AttendanceRecord } from '../types';
import { formatDate } from '../utils/transformer';
import { INPUT_COL } from '../utils/parser';

export interface SpecialCandidate {
    record: AttendanceRecord;
    index: number;
    rule: string;
}

interface SpecialCandidateListProps {
    candidates: SpecialCandidate[];
    onConfirm: (results: { index: number, isSpecial: boolean }[]) => void;
    onDismissAll: () => void;
}

type SortField = 'date' | 'student' | 'teacher';
type SortDirection = 'asc' | 'desc';

export const SpecialCandidateList: React.FC<SpecialCandidateListProps> = ({
    candidates, onConfirm, onDismissAll
}) => {
    // Selection state: Set of indices that are CHECKED (to be applied as special)
    // Default: All checked
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    useEffect(() => {
        // Initialize all as selected when candidates change
        setSelectedIndices(new Set(candidates.map(c => c.index)));
    }, [candidates]);

    if (candidates.length === 0) return null;

    // Sorting Logic
    const sortedCandidates = [...candidates].sort((a, b) => {
        let valA = '';
        let valB = '';

        if (sortField === 'date') {
            valA = a.record[INPUT_COL.START_TIME] || '';
            valB = b.record[INPUT_COL.START_TIME] || '';
        } else if (sortField === 'student') {
            valA = a.record[INPUT_COL.STUDENT_NAME] || '';
            valB = b.record[INPUT_COL.STUDENT_NAME] || '';
        } else if (sortField === 'teacher') {
            valA = a.record[INPUT_COL.TEACHER] || '';
            valB = b.record[INPUT_COL.TEACHER] || '';
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const toggleSelection = (index: number) => {
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedIndices(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIndices.size === candidates.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(candidates.map(c => c.index)));
        }
    };

    const handleApply = () => {
        const results = candidates.map(c => ({
            index: c.index,
            isSpecial: selectedIndices.has(c.index)
        }));

        const countSpecial = results.filter(r => r.isSpecial).length;
        const countIgnore = results.length - countSpecial;

        if (window.confirm(`${countSpecial}件を特能授業として適用し、${countIgnore}件を通常授業(除外)として処理しますか？`)) {
            onConfirm(results);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-lg border border-purple-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-purple-100 px-4 py-3 border-b border-purple-200 flex justify-between items-center">
                <h3 className="font-bold text-purple-800 flex items-center gap-2">
                    <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">{candidates.length}</span>
                    特能授業 候補リスト
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={onDismissAll}
                        className="text-xs text-gray-500 hover:text-gray-700 underline px-2"
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleApply}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 font-bold shadow-sm"
                    >
                        <CheckSquare className="w-3 h-3" /> 決定 (一括処理)
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-2 w-10 text-center">
                                <input
                                    type="checkbox"
                                    checked={selectedIndices.size === candidates.length && candidates.length > 0}
                                    onChange={toggleSelectAll}
                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                            </th>
                            <th
                                className="px-4 py-2 cursor-pointer hover:bg-gray-100 group select-none"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center gap-1">
                                    日付
                                    <ArrowUpDown className={`w-3 h-3 ${sortField === 'date' ? 'text-purple-600' : 'text-gray-300 group-hover:text-gray-500'}`} />
                                </div>
                            </th>
                            <th
                                className="px-4 py-2 cursor-pointer hover:bg-gray-100 group select-none"
                                onClick={() => handleSort('student')}
                            >
                                <div className="flex items-center gap-1">
                                    生徒名
                                    <ArrowUpDown className={`w-3 h-3 ${sortField === 'student' ? 'text-purple-600' : 'text-gray-300 group-hover:text-gray-500'}`} />
                                </div>
                            </th>
                            <th
                                className="px-4 py-2 cursor-pointer hover:bg-gray-100 group select-none"
                                onClick={() => handleSort('teacher')}
                            >
                                <div className="flex items-center gap-1">
                                    講師名
                                    <ArrowUpDown className={`w-3 h-3 ${sortField === 'teacher' ? 'text-purple-600' : 'text-gray-300 group-hover:text-gray-500'}`} />
                                </div>
                            </th>
                            <th className="px-4 py-2">教科</th>
                            <th className="px-4 py-2">一致ルール</th>
                            <th className="px-4 py-2 text-center w-20">状態</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCandidates.map((c) => {
                            const isSelected = selectedIndices.has(c.index);
                            return (
                                <tr
                                    key={c.index}
                                    className={`border-b transition-colors cursor-pointer ${isSelected ? 'bg-purple-50 hover:bg-purple-100' : 'bg-white hover:bg-gray-50 text-gray-400'}`}
                                    onClick={() => toggleSelection(c.index)}
                                >
                                    <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelection(c.index)}
                                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(c.record[INPUT_COL.START_TIME])}</td>
                                    <td className="px-4 py-2 font-bold">{c.record[INPUT_COL.STUDENT_NAME]}</td>
                                    <td className="px-4 py-2">{c.record[INPUT_COL.TEACHER]}</td>
                                    <td className="px-4 py-2">{c.record[INPUT_COL.SUBJECT]}</td>
                                    <td className="px-4 py-2 text-xs opacity-75 max-w-[150px] truncate" title={c.rule}>{c.rule}</td>
                                    <td className="px-4 py-2 text-center font-bold text-xs">
                                        {isSelected ? <span className="text-purple-600">特能</span> : <span className="text-gray-400">除外</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
