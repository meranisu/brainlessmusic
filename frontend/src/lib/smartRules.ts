import type { SmartRule, SmartRules, SmartSort } from '../types/api';

/**
 * Smart playlist rules (A207) as the editor holds them: every box is text until it is checked, so a half-typed number
 * never reaches the server. The server checks the same rules again against its own fixed list.
 */

export type FieldKey = SmartRule['field'];

interface OpDef {
  op: string;
  label: string;
  /** Said after the value box: "60 [days ago]". */
  unit?: string;
  /** One line under the rule, for an op whose meaning isn't obvious. */
  hint?: string;
}

type ValueKind = 'count' | 'days' | 'year' | 'minutes' | 'text' | 'yesno' | 'none';

interface FieldDef {
  label: string;
  ops: OpDef[];
  value: ValueKind;
  /** For a yes/no field, how the rule reads in a sentence when the answer is yes and when it is no. */
  yes?: string;
  no?: string;
}

export const FIELDS: Record<FieldKey, FieldDef> = {
  lastPlayed: {
    label: 'I last played it',
    value: 'days',
    ops: [
      {
        op: 'olderThanDays',
        label: 'more than',
        unit: 'days ago',
        hint: 'Songs you have never played count too.',
      },
      { op: 'withinDays', label: 'within the last', unit: 'days' },
      { op: 'never', label: 'never' },
    ],
  },
  myPlays: {
    label: 'I played it',
    value: 'count',
    ops: [
      { op: 'lt', label: 'fewer than', unit: 'times' },
      { op: 'gt', label: 'more than', unit: 'times' },
      { op: 'eq', label: 'exactly', unit: 'times' },
    ],
  },
  liked: {
    label: 'I liked it',
    value: 'yesno',
    ops: [{ op: 'is', label: 'is' }],
    yes: 'I liked it',
    no: 'I have not liked it',
  },
  disliked: {
    label: 'I disliked it',
    value: 'yesno',
    ops: [{ op: 'is', label: 'is' }],
    yes: 'I disliked it',
    no: 'I have not disliked it',
  },
  dateAdded: {
    label: 'Added to the library',
    value: 'days',
    ops: [
      { op: 'olderThanDays', label: 'more than', unit: 'days ago' },
      { op: 'withinDays', label: 'within the last', unit: 'days' },
    ],
  },
  genre: {
    label: 'Genre',
    value: 'text',
    ops: [
      { op: 'is', label: 'is' },
      { op: 'isNot', label: 'is not' },
    ],
  },
  artist: {
    label: 'Artist',
    value: 'text',
    ops: [
      { op: 'is', label: 'is' },
      { op: 'contains', label: 'contains' },
    ],
  },
  year: {
    label: 'Album year',
    value: 'year',
    ops: [
      { op: 'lt', label: 'before' },
      { op: 'gt', label: 'after' },
      { op: 'eq', label: 'is' },
    ],
  },
  duration: {
    label: 'Length',
    value: 'minutes',
    ops: [
      { op: 'lt', label: 'shorter than', unit: 'minutes' },
      { op: 'gt', label: 'longer than', unit: 'minutes' },
    ],
  },
};

export const FIELD_ORDER = Object.keys(FIELDS) as FieldKey[];

export const SORTS: { value: SmartSort; label: string }[] = [
  { value: 'random', label: 'Random, new mix each day' },
  { value: 'lastPlayedAsc', label: 'Longest since I played it' },
  { value: 'myPlaysDesc', label: 'Most played by me' },
  { value: 'myPlaysAsc', label: 'Least played by me' },
  { value: 'dateAddedDesc', label: 'Newest in the library' },
  { value: 'title', label: 'Title' },
];

export const MAX_RULES = 10;
export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 100;

export interface RuleDraft {
  key: number;
  field: FieldKey;
  op: string;
  value: string;
}

export interface RulesDraft {
  match: 'all' | 'any';
  rows: RuleDraft[];
  sort: SmartSort;
  limit: string;
}

let nextKey = 1;

/** A fresh row for `field`, on its first op with an empty box (a yes/no starts on yes). */
export function newRow(field: FieldKey, patch: Partial<RuleDraft> = {}): RuleDraft {
  const def = FIELDS[field];
  return { key: nextKey++, field, op: def.ops[0].op, value: def.value === 'yesno' ? 'yes' : '', ...patch };
}

/** What a new smart playlist starts as: the first example, so the preview shows something straight away. */
export function startingDraft(): RulesDraft {
  return {
    match: 'all',
    rows: [newRow('lastPlayed', { op: 'olderThanDays', value: '60' })],
    sort: 'random',
    limit: String(DEFAULT_LIMIT),
  };
}

export function opDef(field: FieldKey, op: string): OpDef {
  const def = FIELDS[field];
  return def.ops.find((o) => o.op === op) ?? def.ops[0];
}

/** Whether the rule has a box to fill: "never played" has none. */
export function hasValueBox(field: FieldKey, op: string): boolean {
  return !(field === 'lastPlayed' && op === 'never');
}

function wholeNumber(text: string, max: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

function rowToRule(row: RuleDraft): SmartRule | string {
  const kind = FIELDS[row.field].value;
  const op = row.op;
  switch (row.field) {
    case 'lastPlayed':
    case 'dateAdded': {
      if (row.field === 'lastPlayed' && op === 'never') return { field: 'lastPlayed', op: 'never' };
      const n = wholeNumber(row.value, 36500);
      return n === null ? 'Days must be a whole number' : ({ field: row.field, op, value: n } as SmartRule);
    }
    case 'myPlays':
    case 'year': {
      const n = wholeNumber(row.value, row.field === 'year' ? 3000 : 100000);
      return n === null ? 'Fill in a whole number' : ({ field: row.field, op, value: n } as SmartRule);
    }
    case 'liked':
    case 'disliked':
      return { field: row.field, op: 'is', value: row.value !== 'no' };
    case 'genre':
    case 'artist': {
      const text = row.value.trim();
      if (text === '') return `Fill in the ${kind === 'text' ? row.field : 'value'}`;
      return text.length > 100 ? 'Keep it under 100 characters' : ({ field: row.field, op, value: text } as SmartRule);
    }
    case 'duration': {
      const minutes = Number(row.value);
      if (row.value.trim() === '' || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
        return 'Length is minutes, up to 1440';
      }
      return { field: 'duration', op: op as 'lt' | 'gt', value: Math.round(minutes * 60) };
    }
  }
}

/** The draft as the server wants it, or what is still missing, in words fit to show. */
export function toSmartRules(draft: RulesDraft): { rules: SmartRules } | { error: string } {
  if (draft.rows.length === 0) return { error: 'Add at least one rule' };
  const rules: SmartRule[] = [];
  for (const row of draft.rows) {
    const rule = rowToRule(row);
    if (typeof rule === 'string') return { error: rule };
    rules.push(rule);
  }
  const limit = wholeNumber(draft.limit, MAX_LIMIT);
  if (limit === null || limit < 1) return { error: `Limit is a whole number from 1 to ${MAX_LIMIT}` };
  return { rules: { v: 1, match: draft.match, rules, sort: draft.sort, limit } };
}

/** Saved rules back into boxes, for editing. */
export function fromSmartRules(saved: SmartRules): RulesDraft {
  return {
    match: saved.match,
    sort: saved.sort,
    limit: String(saved.limit),
    rows: saved.rules.map((rule) => {
      if (rule.field === 'liked' || rule.field === 'disliked') {
        return newRow(rule.field, { value: rule.value ? 'yes' : 'no' });
      }
      if (rule.field === 'lastPlayed' && rule.op === 'never') return newRow('lastPlayed', { op: 'never' });
      const value = rule.field === 'duration' ? rule.value / 60 : (rule as { value: number | string }).value;
      return newRow(rule.field, { op: rule.op, value: String(value) });
    }),
  };
}

function ruleText(rule: SmartRule): string {
  const def = FIELDS[rule.field];
  if (rule.field === 'liked' || rule.field === 'disliked') return (rule.value ? def.yes : def.no) ?? def.label;
  const op = opDef(rule.field, rule.op);
  if (!('value' in rule)) return `${def.label} ${op.label}`;
  const value = rule.field === 'duration' ? rule.value / 60 : rule.value;
  return [def.label, op.label, value, op.unit].filter((part) => part !== undefined).join(' ');
}

/** The rules in one line, for the playlist page: "I last played it more than 60 days ago, and I liked it". */
export function describeRules(saved: SmartRules): string {
  const joiner = saved.match === 'all' ? ', and ' : ', or ';
  return saved.rules.map(ruleText).join(joiner);
}
