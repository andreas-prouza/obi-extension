export type Debounced = (() => void) & { cancel(): void };


/** Runs `fn` once, `ms` after the last of a burst of calls */
export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (() => {
    if (timer)
      clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  }) as Debounced;

  debounced.cancel = () => {
    if (timer)
      clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
