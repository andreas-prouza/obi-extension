import path from "path";
import { AppConfig } from "../config/AppConfig";
import { Workspace } from "../utilities/Workspace";
import { DirTool } from "../utilities/DirTool";
import { logger } from "../utilities/Logger";


export class Dependencies { 
  [key: string]: string[];
}


export class DependencyList {

  private static dependency_list: Dependencies|undefined = undefined;
  private static loadPromise: Promise<void> | undefined = undefined;



  public static async get_dependencies(): Promise<Dependencies> {
    if (!DependencyList.dependency_list) {
      await DependencyList.load_dependencies();
    }
    return DependencyList.dependency_list || {};
  }



  public static async load_dependencies(): Promise<void> {

    if (DependencyList.loadPromise) {
      await DependencyList.loadPromise;
      return;
    }

    DependencyList.loadPromise = (async () => {
      try {
        const config = AppConfig.get_app_config();
        DependencyList.dependency_list = DirTool.get_json(path.join(Workspace.get_workspace(), config.general['dependency-list'])) || {};
      } catch (error) {
        logger.error(`Error loading dependency list: ${error}`);
        DependencyList.dependency_list = {};
      } finally {
        DependencyList.loadPromise = undefined;
      }
    })();

    await DependencyList.loadPromise;
    // The loader runs synchronously: its finally ran before the promise was assigned above
    DependencyList.loadPromise = undefined;
  }




  public static save_dependency_list(dependency_list: Dependencies): void {

    const config = AppConfig.get_app_config();
    DirTool.update_json(path.join(Workspace.get_workspace(), config.general['dependency-list']), dependency_list);
    DependencyList.dependency_list = dependency_list;
  }



  
  public static async add_dependency(source: string, type: number, new_source: string): Promise<void> {

    let dependency_list: Dependencies = await DependencyList.get_dependencies();

    // Add dependency to current source
    if (type == 1) {
      if (!dependency_list[source])
        dependency_list[source] = [];
      dependency_list[source].push(new_source);
    }

    // Add current source as dependency to other source
    if (type == 2) {
      if (!dependency_list[new_source])
        dependency_list[new_source] = [];
      dependency_list[new_source].push(source);
    }

    DependencyList.save_dependency_list(dependency_list);
  }



  public static async delete_dependency(source: string, type: number, new_source: string): Promise<void> {
    let dependency_list: Dependencies = await DependencyList.get_dependencies();

    let key: string|undefined = undefined;
    let value: string|undefined = undefined;

    if (type == 1) {
      key = source;
      value = new_source;
    }

    if (type == 2) {
      key = new_source;
      value = source;
    }

    if (key && value && dependency_list[key]) {
      const i = dependency_list[key].indexOf(value);
      if (i > -1) {
        dependency_list[key].splice(i, 1);
      }
    }

    DependencyList.save_dependency_list(dependency_list);
  }


  /** Sources whose dependencies contain `source` */
  public static async dependents_of(source: string): Promise<string[]> {
    const dependency_list: Dependencies = await DependencyList.get_dependencies();
    return Object.entries(dependency_list).filter(([, dependencies]) => dependencies.includes(source)).map(([dependent]) => dependent);
  }


  /** A deleted source: its own entry and every reference to it are removed. Not written if it isn't in the list. */
  public static async remove_source(source: string): Promise<void> {
    const dependency_list: Dependencies = await DependencyList.get_dependencies();
    let changed = false;
    const updated: Dependencies = {};
    for (const [next_source, dependencies] of Object.entries(dependency_list)) {
      if (next_source === source) {
        changed = true;
        continue;
      }
      const remaining = dependencies.filter(dependency => dependency !== source);
      changed ||= remaining.length !== dependencies.length;
      updated[next_source] = remaining;
    }
    if (changed)
      DependencyList.save_dependency_list(updated);
  }


  public static async rename_source(old_source: string, new_source: string): Promise<void> {
    if (old_source === new_source) {
      return;
    }

    const dependency_list: Dependencies = await DependencyList.get_dependencies();
    const updated_dependency_list: Dependencies = {};

    for (const [source, dependencies] of Object.entries(dependency_list)) {
      const next_source = source === old_source ? new_source : source;
      const next_dependencies = dependencies.map((dep) => dep === old_source ? new_source : dep);

      if (!updated_dependency_list[next_source]) {
        updated_dependency_list[next_source] = [];
      }
      updated_dependency_list[next_source].push(...next_dependencies);
    }

    for (const source of Object.keys(updated_dependency_list)) {
      updated_dependency_list[source] = Array.from(new Set(updated_dependency_list[source]));
    }

    DependencyList.save_dependency_list(updated_dependency_list);
  }




}