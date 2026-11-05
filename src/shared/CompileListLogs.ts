// Logs of the commands in compile-list.json (docs/features/compile-list-logs.md)


/** Fields of a command in the compile list that hold its output */
export const CMD_LOG_FIELDS = ['stdout', 'stderr', 'joblog'] as const;


type JsonObject = Record<string, unknown>;

function is_object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


/**
 * Copy of the compile list without the logs of its commands (`stdout`, `stderr`, `joblog`).
 * Everything else stays as it is; the given list is not changed.
 */
export function strip_cmd_logs(compile_list: JsonObject): JsonObject {

  const data: JsonObject = JSON.parse(JSON.stringify(compile_list));

  for (const level of Array.isArray(data['compiles']) ? data['compiles'] : []) {
    for (const source of is_object(level) && Array.isArray(level['sources']) ? level['sources'] : []) {
      for (const cmd of is_object(source) && Array.isArray(source['cmds']) ? source['cmds'] : []) {
        if (!is_object(cmd))
          continue;
        for (const field of CMD_LOG_FIELDS)
          delete cmd[field];
      }
    }
  }
  return data;
}
