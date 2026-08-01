import type { AttendanceRecord, SpecialClassRule } from '../types';
import { INPUT_COL } from './parser';

const normalizeRuleValue = (value: unknown): string =>
    String(value ?? '').trim().replace(/\s+/gu, '').toLowerCase();

const matchesRuleValue = (recordValue: unknown, ruleValue: string): boolean => {
    const expected = normalizeRuleValue(ruleValue);
    return expected.length === 0 || normalizeRuleValue(recordValue).includes(expected);
};

export const findMatchingSpecialRule = (
    record: AttendanceRecord,
    rules: SpecialClassRule[]
): SpecialClassRule | undefined => rules.find(rule => {
    const hasCondition = [rule.student, rule.teacher, rule.subject]
        .some(value => normalizeRuleValue(value).length > 0);

    if (!hasCondition) return false;

    return matchesRuleValue(record[INPUT_COL.STUDENT_NAME], rule.student)
        && matchesRuleValue(record[INPUT_COL.TEACHER], rule.teacher)
        && matchesRuleValue(record[INPUT_COL.SUBJECT], rule.subject);
});

export interface SpecialRuleApplicationResult {
    records: AttendanceRecord[];
    matchedCount: number;
    changed: boolean;
}

export const applySpecialRules = (
    records: AttendanceRecord[],
    rules: SpecialClassRule[]
): SpecialRuleApplicationResult => {
    let matchedCount = 0;
    let changed = false;

    const updatedRecords = records.map(record => {
        const matchingRule = findMatchingSpecialRule(record, rules);

        // Manual解除 is an exception for the currently loaded CSV only. Fresh
        // CSV rows do not carry this flag, so saved rules apply again next time.
        if (record._specialRuleSuppressed) {
            if (record._specialRuleId || record._forceSpecial === true) {
                changed = true;
                const updated = { ...record, _forceSpecial: false };
                delete updated._specialRuleId;
                return updated;
            }
            return record;
        }

        if (matchingRule) {
            matchedCount += 1;

            // A manual special designation has no rule id. Preserve its origin so
            // deleting a rule never removes a manually confirmed designation.
            if (record._forceSpecial === true && !record._specialRuleId) {
                return record;
            }

            if (
                record._forceSpecial === true
                && record._specialConfirmed === true
                && record._specialRuleId === matchingRule.id
            ) {
                return record;
            }

            changed = true;
            return {
                ...record,
                _forceSpecial: true,
                _specialConfirmed: true,
                _specialRuleId: matchingRule.id
            };
        }

        if (record._specialRuleId) {
            changed = true;
            const updated = { ...record };
            delete updated._specialRuleId;
            updated._forceSpecial = false;
            updated._specialConfirmed = false;
            return updated;
        }

        return record;
    });

    return {
        records: changed ? updatedRecords : records,
        matchedCount,
        changed
    };
};
