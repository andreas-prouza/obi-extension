import * as vscode from 'vscode';
import { LocalSourceList } from '../../extension/utilities/LocalSourceList';


export interface SourcePickOptions {
  title?: string;
  placeholder: string;
  /** Sources not offered (e.g. already in the list) */
  exclude?: Set<string>;
  /** Only these sources are offered, all selected (e.g. the changed ones); default: all sources */
  only_preselected?: string[];
  /** Only these sources are offered, in this order, with `selected` selected (e.g. the sources of a build) */
  offered?: { sources: string[]; selected: Set<string> };
}


/**
 * Multi-select QuickPick of sources, searchable by name and description (source-infos). Returns the selected
 * sources, [] if nothing was selected or the pick was cancelled.
 */
export async function pick_sources(options: SourcePickOptions): Promise<string[]> {

  const infos = await LocalSourceList.get_source_info_list();
  const offered = options.only_preselected ?? options.offered?.sources ?? Object.keys(infos);
  const items: vscode.QuickPickItem[] = offered
    .filter(source => !options.exclude?.has(source))
    .map(source => ({ label: source, description: infos[source]?.description || '' }));

  if (items.length === 0)
    return [];

  const quick_pick = vscode.window.createQuickPick();
  quick_pick.title = options.title;
  quick_pick.placeholder = options.placeholder;
  quick_pick.canSelectMany = true;
  quick_pick.matchOnDescription = true;
  quick_pick.items = items;
  if (options.only_preselected)
    quick_pick.selectedItems = items;
  else if (options.offered)
    quick_pick.selectedItems = items.filter(item => options.offered!.selected.has(item.label));

  return await new Promise<string[]>(resolve => {
    quick_pick.onDidAccept(() => {
      resolve(quick_pick.selectedItems.map(item => item.label));
      quick_pick.hide();
    });
    quick_pick.onDidHide(() => {
      resolve([]);
      quick_pick.dispose();
    });
    quick_pick.show();
  });
}
