// Build order from dependency.json (object → objects it depends on), in O(objects + dependencies).
// No vscode imports: this module is unit-tested in plain Node.


export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Dependency cycle: ${cycle.join(' → ')}`);
    this.name = 'DependencyCycleError';
  }
}


export interface BuildLevel {
  level: number;
  sources: string[];
}


export class DependencyGraph {

  /** object → objects that depend on it, in the order of dependency.json */
  private readonly dependents = new Map<string, string[]>();
  private readonly exists_cache = new Map<string, boolean>();

  /** `exists(source)`: dependents without source file are skipped (and not followed). Evaluated once per object. */
  constructor(private readonly depends_on: Record<string, string[]>, private readonly exists: (source: string) => boolean) {
    for (const [object, dependencies] of Object.entries(depends_on)) {
      for (const dependency of new Set(dependencies ?? [])) {
        const list = this.dependents.get(dependency);
        if (list)
          list.push(object);
        else
          this.dependents.set(dependency, [object]);
      }
    }
  }


  private source_exists(source: string): boolean {
    let exists = this.exists_cache.get(source);
    if (exists === undefined) {
      exists = this.exists(source);
      this.exists_cache.set(source, exists);
    }
    return exists;
  }


  /** All objects that (transitively) depend on one of the targets, without the targets, in discovery order */
  affected_by(targets: string[]): string[] {
    const target_set = new Set(targets);
    const seen = new Set<string>(targets);
    const result: string[] = [];
    const queue = [...target_set];

    for (let i = 0; i < queue.length; i++) {
      for (const dependent of this.dependents.get(queue[i]) ?? []) {
        if (seen.has(dependent) || !this.source_exists(dependent))
          continue;
        seen.add(dependent);
        queue.push(dependent);
        if (!target_set.has(dependent))
          result.push(dependent);
      }
    }
    return result;
  }


  /**
   * Targets and affected objects by build level: level = 1 + the longest dependency path from a target
   * (targets at least 1), so everything is built after what it depends on. Throws DependencyCycleError.
   */
  build_levels(targets: string[]): BuildLevel[] {
    const nodes = [...new Set([...targets, ...this.affected_by(targets)])];
    const in_build = new Set(nodes);

    // Edge p → x if x depends on p (both in the build)
    const predecessors = (x: string) => [...new Set(this.depends_on[x] ?? [])].filter(p => in_build.has(p));
    const remaining = new Map(nodes.map(x => [x, predecessors(x).length]));
    const level = new Map(nodes.map(x => [x, 1]));

    const queue = nodes.filter(x => remaining.get(x) === 0);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      remaining.delete(p);
      for (const x of this.dependents.get(p) ?? []) {
        if (!remaining.has(x))
          continue;
        level.set(x, Math.max(level.get(x) ?? 1, (level.get(p) ?? 1) + 1));
        const left = (remaining.get(x) ?? 1) - 1;
        remaining.set(x, left);
        if (left === 0)
          queue.push(x);
      }
    }

    if (remaining.size > 0)
      throw new DependencyCycleError(this.find_cycle([...remaining.keys()], predecessors));

    const levels = new Map<number, string[]>();
    for (const x of nodes) {
      const l = level.get(x) ?? 1;
      const list = levels.get(l);
      if (list)
        list.push(x);
      else
        levels.set(l, [x]);
    }
    return [...levels.entries()].sort(([a], [b]) => a - b).map(([l, sources]) => ({ level: l, sources }));
  }


  /** What the objects (transitively) depend on, e.g. the copybooks of a build; depth first, in dependency.json order */
  dependencies_of(objects: string[]): string[] {
    const seen = new Set<string>();
    const visit = (object: string) => {
      for (const dependency of this.depends_on[object] ?? []) {
        if (seen.has(dependency))
          continue;
        seen.add(dependency);
        visit(dependency);
      }
    };
    objects.forEach(visit);
    return [...seen];
  }


  /** A cycle among the nodes left over by the topological sort, e.g. [a, b, a] (a depends on b, b on a) */
  private find_cycle(nodes: string[], predecessors: (x: string) => string[]): string[] {
    const left = new Set(nodes);
    const start = nodes[0];
    const path: string[] = [start];
    const index = new Map([[start, 0]]);

    // Every leftover node has a leftover dependency, so following them must revisit a node
    for (let current = start; ;) {
      const next = predecessors(current).find(p => left.has(p));
      if (next === undefined)
        return path;
      const seen_at = index.get(next);
      if (seen_at !== undefined)
        return [...path.slice(seen_at), next];
      index.set(next, path.length);
      path.push(next);
      current = next;
    }
  }
}
