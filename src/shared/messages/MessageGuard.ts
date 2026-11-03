// Validation of messages from webviews. A script in a webview must not be able to make the extension
// read files, write config or run commands with unchecked values.
// No vscode imports: this module is unit-tested in plain Node and its types are used by the webview scripts.

import * as path from 'path';
import { is_valid_source_path } from '../ShellQuote';


export type Guard<T> = (value: unknown) => value is T;

/** Guard of a field that may be missing (see optional()) */
export type OptionalGuard<T> = Guard<T | undefined> & { readonly optional: true };

/** Field name → guard of one message */
export type Shape = Record<string, Guard<unknown>>;

type GuardType<G> = G extends Guard<infer T> ? T : never;
type RequiredKeys<S> = { [K in keyof S]: S[K] extends { optional: true } ? never : K }[keyof S];
type OptionalKeys<S> = { [K in keyof S]: S[K] extends { optional: true } ? K : never }[keyof S];
type FieldsOf<S extends Shape> = { [K in RequiredKeys<S>]: GuardType<S[K]> } & { [K in OptionalKeys<S>]?: Exclude<GuardType<S[K]>, undefined> };

/** Union of all messages described by a table of shapes, e.g. { command: 'open_file', source: string } | … */
export type MessageOf<T extends Record<string, Shape>> = { [C in keyof T & string]: { command: C } & FieldsOf<T[C]> }[keyof T & string];


const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 32;


export const is_string: Guard<string> = (v): v is string => typeof v === 'string';
export const is_non_empty_string: Guard<string> = (v): v is string => typeof v === 'string' && v.length > 0;
export const is_number: Guard<number> = (v): v is number => typeof v === 'number' && Number.isFinite(v);
export const is_boolean: Guard<boolean> = (v): v is boolean => typeof v === 'boolean';
export const is_string_array: Guard<string[]> = (v): v is string[] => Array.isArray(v) && v.every(is_string);
export const is_unknown: Guard<unknown> = (v): v is unknown => true;


export function optional<T>(guard: Guard<T>): OptionalGuard<T> {
  return Object.assign((v: unknown): v is T | undefined => v === undefined || v === null || guard(v), { optional: true as const });
}


export function one_of<T extends string>(...values: T[]): Guard<T> {
  return (v): v is T => typeof v === 'string' && (values as string[]).includes(v);
}


export function matches(pattern: RegExp): Guard<string> {
  return (v): v is string => typeof v === 'string' && pattern.test(v);
}


/** JSON value (string, number, boolean, null, array, plain object) without prototype keys at any depth */
export function is_json_value(v: unknown, depth: number = 0): boolean {
  if (depth > MAX_DEPTH)
    return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean')
    return true;
  if (typeof v === 'number')
    return Number.isFinite(v);
  if (Array.isArray(v))
    return v.every(item => is_json_value(item, depth + 1));
  return is_plain_object_at(v, depth);
}


function is_plain_object_at(v: unknown, depth: number): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return false;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null)
    return false;
  return Object.keys(v).every(key => !FORBIDDEN_KEYS.has(key) && is_json_value((v as Record<string, unknown>)[key], depth + 1));
}


/** Plain JSON object; rejects __proto__ / constructor / prototype keys, also nested */
export const is_plain_object: Guard<Record<string, unknown>> = (v): v is Record<string, unknown> => is_plain_object_at(v, 0);


/** Index into a list */
export const is_index: Guard<number> = (v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1_000_000;


/** Key of a config table (variable, command, language, …): no prototype keys, not starting with "__" */
export const is_config_key: Guard<string> = (v): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && !FORBIDDEN_KEYS.has(v) && !v.startsWith('__');


/** JSON array without prototype keys */
export const is_json_array: Guard<unknown[]> = (v): v is unknown[] => Array.isArray(v) && is_json_value(v);


/** OBI source name (lib/file/member.ext): IBM i name characters, no ".." */
export const is_source_name: Guard<string> = (v): v is string => typeof v === 'string' && is_valid_source_path(v);


/** JSON value of at most `max_bytes` serialized */
export function json_value(max_bytes: number): Guard<unknown> {
  return (v): v is unknown => v !== undefined && is_json_value(v) && JSON.stringify(v).length <= max_bytes;
}


/** Record of string arrays, e.g. { "lib/f/a.pgm": ["cmd 1"] } */
export const is_string_array_record: Guard<Record<string, string[]>> = (v): v is Record<string, string[]> =>
  is_plain_object(v) && Object.values(v).every(is_string_array);


/** Record of strings or string lists (source settings) */
export const is_setting_record: Guard<Record<string, string | string[]>> = (v): v is Record<string, string | string[]> =>
  is_plain_object(v) && Object.values(v).every(value => is_string(value) || is_string_array(value));


/** Record of strings */
export const is_string_record: Guard<Record<string, string>> = (v): v is Record<string, string> =>
  is_plain_object(v) && Object.values(v).every(is_string);


/** Absolute path of `relative` if it stays inside `root` (no "..", no absolute paths), otherwise undefined */
export function inside(root: string, relative: string, p: typeof path = path): string | undefined {
  if (typeof relative !== 'string' || relative.length === 0 || p.isAbsolute(relative) || relative.includes('\0'))
    return undefined;
  const resolved = p.resolve(root, relative);
  const rel = p.relative(p.resolve(root), resolved);
  if (rel === '' || rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel))
    return undefined;
  return resolved;
}


/**
 * Returns the message typed, if its command is in `shapes` and every field passes its guard.
 * Otherwise calls `warn` and returns undefined: the handler ignores the message.
 */
export function parse_message<T extends Record<string, Shape>>(panel: string, message: unknown, shapes: T, warn: (text: string) => void): MessageOf<T> | undefined {
  if (!is_plain_object(message) || typeof message.command !== 'string') {
    warn(`${panel}: ignored message without command`);
    return undefined;
  }
  const command = message.command;
  if (!Object.prototype.hasOwnProperty.call(shapes, command)) {
    warn(`${panel}: ignored unknown message '${command.slice(0, 64)}'`);
    return undefined;
  }
  for (const [field, guard] of Object.entries(shapes[command])) {
    if (!guard(message[field])) {
      warn(`${panel}: ignored message '${command}' with invalid field '${field}'`);
      return undefined;
    }
  }
  return message as MessageOf<T>;
}
