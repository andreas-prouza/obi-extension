import * as vscode from 'vscode';
import * as path from 'path';
import { BuildPackageItem, BuildPackageSourceItem, BuildPackageTreeItem, BuildPackagesProvider, last_build_texts } from './BuildPackagesProvider';
import { PackageLastBuilds } from '../../extension/obi/PackageLastBuilds';
import { Constants } from '../../shared/Constants';
import { BuildPackageNameError, BuildPackageStore, PackageEntry } from '../../extension/obi/BuildPackageStore';
import { ExtensionSettings } from '../../extension/utilities/ExtensionSettings';
import { detect_base_branch, files_changed_since, is_valid_base_branch } from '../../extension/utilities/GitChanges';
import { BUILD_PACKAGE_DIR, BuildPackage, PackageNameProblem, invalid_source_names, is_valid_package_name, package_file_name, suggest_package_name, validate_package_name } from '../../shared/BuildPackage';
import { ConfigFileError } from '../../shared/Errors';
import { package_scope, unbuildable_sources } from '../../extension/obi/compile_list/BuildScope';
import { has_extension } from '../../extension/obi/compile_list/modules/source_hashes';
import { OBICommands } from '../../extension/obi/OBICommands';
import { OBITools } from '../../extension/utilities/OBITools';
import { AppConfig } from '../../extension/config/AppConfig';
import { DirTool } from '../../extension/utilities/DirTool';
import { GitInfo } from '../../extension/utilities/GitInfo';
import { Workspace } from '../../extension/utilities/Workspace';
import { logger } from '../../extension/utilities/Logger';
import { ask, show_error } from '../../extension/utilities/Notify';
import { register_command } from '../../extension/utilities/Registration';
import { pick_sources } from '../tools/SourcePick';
import { SourceListItem } from '../source_list/SourceListProvider';


/** Workspace state: the package used last by "Add to build package", offered first */
const LAST_PACKAGE_KEY = 'obi.build-packages.last';


/** Commands of the view "Build packages" and "Add to build package" (docs/features/build-packages.md) */
export class BuildPackageCommands {

  private constructor(private readonly context: vscode.ExtensionContext, private readonly provider: BuildPackagesProvider) { }


  public static register(context: vscode.ExtensionContext, provider: BuildPackagesProvider): void {
    const commands = new BuildPackageCommands(context, provider);
    const guarded = <A extends unknown[]>(id: string, handler: (...args: A) => Promise<unknown>) =>
      register_command(context, id, async (...args: A) => {
        try {
          await handler(...args);
        }
        catch (e: unknown) {
          commands.show_failure(e);
        }
        finally {
          provider.refresh();
        }
      });

    guarded('obi.build-package.refresh', async () => { });
    guarded('obi.build-package.create', () => commands.create());
    guarded('obi.build-package.add-sources', (item?: BuildPackageItem) => commands.add_sources(item));
    guarded('obi.build-package.add-changed-sources', (item?: BuildPackageItem) => commands.add_changed_sources(item));
    guarded('obi.build-package.add-to-package', (item?: vscode.Uri | SourceListItem, items?: (vscode.Uri | SourceListItem)[]) => commands.add_to_package(item, items));
    guarded('obi.build-package.remove-sources', (item?: BuildPackageTreeItem, items?: BuildPackageTreeItem[]) => commands.remove_sources(item, items));
    guarded('obi.build-package.rename', (item?: BuildPackageItem) => commands.rename(item));
    guarded('obi.build-package.edit-description', (item?: BuildPackageItem) => commands.edit_description(item));
    guarded('obi.build-package.open-file', (item?: BuildPackageItem) => commands.open_file(item));
    guarded('obi.build-package.delete', (item?: BuildPackageItem) => commands.delete(item));
    guarded('obi.build-package.show-build-list', (item?: BuildPackageItem) => commands.build(item, false));
    guarded('obi.build-package.run-build', (item?: BuildPackageItem) => commands.build(item, true));
    guarded('obi.build-package.add-branch-changes', (item?: BuildPackageItem) => commands.add_branch_changes(item));
    guarded('obi.build-package.archive', (item?: BuildPackageItem) => commands.set_archived(item, true));
    guarded('obi.build-package.unarchive', (item?: BuildPackageItem) => commands.set_archived(item, false));
    guarded('obi.build-package.filter', () => commands.filter());
    guarded('obi.build-package.clear-filter', async () => provider.set_filter(''));
    guarded('obi.build-package.show-archived', async () => provider.set_show_archived(true));
    guarded('obi.build-package.hide-archived', async () => provider.set_show_archived(false));
    guarded('obi.build-package.show-builds', (item?: BuildPackageItem) => commands.show_builds(item));
    // From the tooltip of a package: the name
    guarded('obi.build-package.open-last-build', (item?: BuildPackageItem | string) => commands.open_last_build(item));
  }


  private store(): BuildPackageStore {
    return this.provider.store();
  }


  private show_failure(e: unknown): void {
    if (e instanceof BuildPackageNameError)
      vscode.window.showErrorMessage(name_problem_text(e.problem));
    else if (e instanceof ConfigFileError)
      show_error(vscode.l10n.t('The build package file is not valid. Fix it and try again'), e, [{ title: vscode.l10n.t('Open as JSON'), run: () => this.open(e.file) }]);
    else
      show_error(vscode.l10n.t('Build package: the action failed'), e);
  }


  /** The package of a tree item, or the one the user picks (Command Palette). Throws if the file is not a valid package. */
  private async package_of(item: BuildPackageItem | undefined, title: string): Promise<BuildPackage | undefined> {
    const name = item?.name ?? await this.pick_package(title);
    return name ? this.store().get(name) : undefined;
  }


  /** Name of a package, picked from all (also invalid files, for rename, delete and open) */
  private async pick_package(title: string, with_new: boolean = false): Promise<string | undefined> {
    const entries = this.store().list();
    const last = this.context.workspaceState.get<string>(LAST_PACKAGE_KEY);
    // The last used first, archived ones last
    const rank = (entry: PackageEntry) => entry.name === last ? 0 : entry.pkg?.archived ? 2 : 1;
    entries.sort((a, b) => rank(a) - rank(b));

    if (entries.length === 0 && !with_new) {
      const create = vscode.l10n.t('Create build package');
      if (await vscode.window.showInformationMessage(vscode.l10n.t('There are no build packages yet.'), create) === create)
        await this.create();
      return undefined;
    }

    const NEW = '\0new';
    const items: (vscode.QuickPickItem & { name: string })[] = entries.map(entry => ({
      name: entry.name,
      label: `$(package) ${entry.name}`,
      description: !entry.pkg ? vscode.l10n.t('invalid file')
        : [...(entry.pkg.archived ? [vscode.l10n.t('archived')] : []), ...(entry.pkg.description ? [entry.pkg.description] : [])].join(' · ')
    }));
    if (with_new)
      items.push({ name: NEW, label: `$(add) ${vscode.l10n.t('New build package…')}` });

    const picked = await vscode.window.showQuickPick(items, { title, placeHolder: vscode.l10n.t('Build package'), matchOnDescription: true });
    if (!picked)
      return undefined;
    if (picked.name === NEW)
      return await this.create(undefined, false);
    return picked.name;
  }


  private remember(name: string): void {
    this.context.workspaceState.update(LAST_PACKAGE_KEY, name);
  }


  /** New package (name suggested from the git branch), with `sources`. Returns its name, undefined if cancelled. */
  public async create(sources: string[] = [], offer_add_sources: boolean = true): Promise<string | undefined> {
    const store = this.store();
    const existing = store.names();
    const title = vscode.l10n.t('New build package');

    const name = (await vscode.window.showInputBox({
      title,
      prompt: vscode.l10n.t('Name of the build package. It is the file name in {0}, shared via git.', BUILD_PACKAGE_DIR),
      value: suggest_package_name(GitInfo.get_git_info(Workspace.get_workspace())?.branch, existing),
      validateInput: value => { const problem = validate_package_name(value.trim(), existing); return problem ? name_problem_text(problem) : undefined; }
    }))?.trim();
    if (!name)
      return undefined;

    const description = await vscode.window.showInputBox({ title, prompt: vscode.l10n.t('Description (optional), e.g. the ticket') });
    if (description === undefined)
      return undefined;

    store.create(name, description, sources);
    logger.info(`Build package ${name} created with ${sources.length} source(s)`);
    this.remember(name);
    this.provider.refresh();
    await this.provider.reveal(name);

    if (offer_add_sources && sources.length === 0) {
      const add = vscode.l10n.t('Add sources');
      if (await vscode.window.showInformationMessage(vscode.l10n.t('Build package {0} created.', name), add) === add)
        await this.add_sources_to(this.store().get(name));
    }
    return name;
  }


  public async add_sources(item?: BuildPackageItem): Promise<void> {
    const pkg = await this.package_of(item, vscode.l10n.t('Add sources to build package'));
    if (pkg)
      await this.add_sources_to(pkg);
  }


  private async add_sources_to(pkg: BuildPackage): Promise<void> {
    const sources = await pick_sources({
      title: vscode.l10n.t('Add sources to {0}', pkg.name),
      placeholder: vscode.l10n.t('Select sources (search by name or description)'),
      exclude: new Set(pkg.sources)
    });
    this.add(pkg.name, sources);
  }


  /** Adds the new and changed sources (hash compare with the last build), all preselected */
  public async add_changed_sources(item?: BuildPackageItem): Promise<void> {
    const pkg = await this.package_of(item, vscode.l10n.t('Add changed sources to build package'));
    if (!pkg)
      return;

    const changed = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Get changed sources') },
      () => OBITools.get_changed_sources());
    const in_package = new Set(pkg.sources);
    const candidates = [...changed['new-objects'], ...changed['changed-sources']].filter(source => !in_package.has(source)).sort();
    if (candidates.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('There are no new or changed sources that are not in {0} yet.', pkg.name));
      return;
    }

    const sources = await pick_sources({
      title: vscode.l10n.t('Add changed sources to {0}', pkg.name),
      placeholder: vscode.l10n.t('New and changed sources since your last build'),
      only_preselected: candidates
    });
    this.add(pkg.name, sources);
  }


  /** Explorer (several files), editor tab, source filter member, or the active editor (Command Palette) */
  public async add_to_package(item?: vscode.Uri | SourceListItem, items?: (vscode.Uri | SourceListItem)[]): Promise<void> {

    let sources: string[];
    if (!item) {
      const active = OBICommands.get_current_active_source();
      if (!active)
        return;
      sources = [active];
    }
    else
      sources = this.sources_of(items && items.length > 0 ? items : [item]);
    if (sources.length === 0)
      return;

    const name = await this.pick_package(sources.length === 1 ? vscode.l10n.t('Add {0} to build package', sources[0]) : vscode.l10n.t('Add {0} sources to build package', sources.length), true);
    if (!name)
      return;
    this.add(name, sources);
  }


  /** OBI source names of explorer files or source filter members; others are reported and left out */
  private sources_of(items: (vscode.Uri | SourceListItem)[]): string[] {
    const types = AppConfig.get_app_config().general['supported-object-types'] || [];
    const sources: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const source = item instanceof SourceListItem
        ? (item.src_lib && item.src_file && item.src_member ? `${item.src_lib}/${item.src_file}/${item.src_member}` : undefined)
        : DirTool.to_obi_source(item.fsPath);
      if (source && has_extension(source, types) && invalid_source_names([source]).length === 0)
        sources.push(source);
      else
        skipped.push(source ?? (item instanceof SourceListItem ? String(item.label) : path.basename(item.fsPath)));
    }

    if (skipped.length > 0)
      vscode.window.showWarningMessage(vscode.l10n.t('Not added (not a supported source in the source folder): {0}', skipped.join(', ')));
    return [...new Set(sources)];
  }


  private add(name: string, sources: string[]): void {
    if (sources.length === 0)
      return;
    const added = this.store().add_sources(name, sources);
    this.remember(name);
    logger.info(`Build package ${name}: added ${added.join(', ') || 'nothing'}`);
    vscode.window.showInformationMessage(added.length === sources.length
      ? vscode.l10n.t('Added {0} source(s) to build package {1}.', added.length, name)
      : vscode.l10n.t('Added {0} source(s) to build package {1}; {2} were in it already.', added.length, name, sources.length - added.length));
  }


  /** Removes the selected sources (several, also of different packages) */
  public async remove_sources(item?: BuildPackageTreeItem, items?: BuildPackageTreeItem[]): Promise<void> {
    const selected = (items && items.length > 0 ? items : item ? [item] : this.provider.selection())
      .filter((entry): entry is BuildPackageSourceItem => entry instanceof BuildPackageSourceItem);

    const by_package = new Map<string, string[]>();
    for (const entry of selected)
      by_package.set(entry.package_name, [...(by_package.get(entry.package_name) ?? []), entry.source]);

    for (const [name, sources] of by_package) {
      const removed = this.store().remove_sources(name, sources);
      logger.info(`Build package ${name}: removed ${removed.join(', ')}`);
    }
  }


  public async rename(item?: BuildPackageItem): Promise<void> {
    const name = item?.name ?? await this.pick_package(vscode.l10n.t('Rename build package'));
    if (!name)
      return;
    const existing = this.store().names();

    const new_name = (await vscode.window.showInputBox({
      title: vscode.l10n.t('Rename build package {0}', name),
      value: name,
      validateInput: value => { const problem = validate_package_name(value.trim(), existing, name); return problem ? name_problem_text(problem) : undefined; }
    }))?.trim();
    if (!new_name || new_name === name)
      return;

    this.store().rename(name, new_name);
    logger.info(`Build package ${name} renamed to ${new_name}`);
    if (this.context.workspaceState.get<string>(LAST_PACKAGE_KEY) === name)
      this.remember(new_name);
  }


  public async edit_description(item?: BuildPackageItem): Promise<void> {
    const pkg = await this.package_of(item, vscode.l10n.t('Edit description of build package'));
    if (!pkg)
      return;
    const description = await vscode.window.showInputBox({ title: vscode.l10n.t('Description of build package {0}', pkg.name), value: pkg.description ?? '' });
    if (description !== undefined)
      this.store().set_description(pkg.name, description);
  }


  public async open_file(item?: BuildPackageItem): Promise<void> {
    const name = item?.name ?? await this.pick_package(vscode.l10n.t('Open build package as JSON'));
    if (name)
      await this.open(this.store().file(name));
  }


  private async open(file: string): Promise<void> {
    const relative = DirTool.to_workspace_relative(file) ?? path.join(BUILD_PACKAGE_DIR, path.basename(file));
    await vscode.commands.executeCommand('vscode.open', DirTool.get_file_URI(relative));
  }


  public async delete(item?: BuildPackageItem): Promise<void> {
    const name = item?.name ?? await this.pick_package(vscode.l10n.t('Delete build package'));
    if (!name)
      return;
    const remove = vscode.l10n.t('Delete');
    const detail = vscode.l10n.t('The file {0} is deleted. Commit the change to delete it for your team too.', `${BUILD_PACKAGE_DIR}/${package_file_name(name)}`);
    if (await ask(vscode.l10n.t('Delete build package {0}?', name), [remove], true, detail) !== remove)
      return;
    this.store().delete(name);
    logger.info(`Build package ${name} deleted`);
  }


  /**
   * Adds the sources changed on the current git branch since it left the base branch (setting obi.buildPackages.baseBranch,
   * otherwise detected): the same for every team member on the branch, unlike "Add changed sources" (hash compare).
   */
  public async add_branch_changes(item?: BuildPackageItem): Promise<void> {
    const pkg = await this.package_of(item, vscode.l10n.t('Add sources changed on this branch to build package'));
    if (!pkg)
      return;

    const ws = Workspace.get_workspace();
    let base = ExtensionSettings.build_packages_base_branch() || detect_base_branch(ws);
    if (!base) {
      base = (await vscode.window.showInputBox({
        title: vscode.l10n.t('Base branch'),
        prompt: vscode.l10n.t('Branch the current branch is compared with, e.g. main. Set it permanently in the setting obi.buildPackages.baseBranch.'),
        validateInput: value => is_valid_base_branch(value.trim()) ? undefined : vscode.l10n.t('Not a valid branch name')
      }))?.trim();
      if (!base)
        return;
    }
    if (!is_valid_base_branch(base))
      throw new Error(vscode.l10n.t('Not a valid branch name: {0} (setting obi.buildPackages.baseBranch)', base));

    const changes = files_changed_since(DirTool.get_local_source_dir(), base);
    const types = AppConfig.get_app_config().general['supported-object-types'] || [];
    const in_package = new Set(pkg.sources);
    const invalid = new Set(invalid_source_names(changes.files));
    const candidates = changes.files.filter(source => has_extension(source, types) && !invalid.has(source) && !in_package.has(source));
    logger.info(`Sources changed since ${base} (${changes.merge_base}): ${changes.files.length} files, ${candidates.length} new for ${pkg.name}`);
    if (candidates.length === 0) {
      vscode.window.showInformationMessage(vscode.l10n.t('There are no sources changed on this branch (since {0}) that are not in {1} yet.', base, pkg.name));
      return;
    }

    const sources = await pick_sources({
      title: vscode.l10n.t('Add sources changed on this branch to {0}', pkg.name),
      placeholder: vscode.l10n.t('Changed since the branch left {0} (committed, not committed and new files)', base),
      only_preselected: candidates
    });
    this.add(pkg.name, sources);
  }


  public async set_archived(item: BuildPackageItem | undefined, archived: boolean): Promise<void> {
    const pkg = await this.package_of(item, archived ? vscode.l10n.t('Archive build package') : vscode.l10n.t('Restore build package'));
    if (!pkg)
      return;
    this.store().set_archived(pkg.name, archived);
    logger.info(`Build package ${pkg.name} ${archived ? 'archived' : 'restored'}`);
    if (archived && !this.provider.is_showing_archived()) {
      const show = vscode.l10n.t('Show archived');
      if (await vscode.window.showInformationMessage(vscode.l10n.t('Build package {0} archived. Archived packages are hidden; commit the change to archive it for your team too.', pkg.name), show) === show)
        this.provider.set_show_archived(true);
    }
  }


  public async filter(): Promise<void> {
    const filter = await vscode.window.showInputBox({
      title: vscode.l10n.t('Filter build packages'),
      prompt: vscode.l10n.t('Text in the name, the description or a source of the package. Empty: all packages.'),
      value: this.provider.get_filter()
    });
    if (filter !== undefined)
      this.provider.set_filter(filter);
  }


  /** Build summary of the last build of the package on this computer */
  public async open_last_build(item?: BuildPackageItem | string): Promise<void> {
    const name = typeof item === 'string' ? item : item?.name ?? await this.pick_package(vscode.l10n.t('Open the last build of build package'));
    if (!name || !is_valid_package_name(name))
      return;

    const last_builds = new PackageLastBuilds(Workspace.get_workspace());
    const build = last_builds.get(name);
    if (!build) {
      vscode.window.showInformationMessage(vscode.l10n.t('Build package {0} wasn\'t built on this computer yet.', name));
      return;
    }
    if (!last_builds.summary_exists(build)) {
      vscode.window.showInformationMessage(vscode.l10n.t('The build summary of the last build of {0} ({1}) is no longer in the build history.', name, last_build_texts(build).short));
      return;
    }
    await vscode.commands.executeCommand('obi.open_build_summary', path.join(Constants.BUILD_HISTORY_DIR, build.history, 'compile-list.json'));
  }


  /** Build history filtered by the package */
  public async show_builds(item?: BuildPackageItem): Promise<void> {
    const name = item?.name ?? await this.pick_package(vscode.l10n.t('Show builds of build package'));
    if (name)
      await vscode.commands.executeCommand('obi.build-history.filter-package', name);
  }


  /** Build list (and build) of all sources of the package and their dependents */
  public async build(item: BuildPackageItem | undefined, run: boolean): Promise<void> {
    const pkg = await this.package_of(item, run ? vscode.l10n.t('Run build of build package') : vscode.l10n.t('Show build list of build package'));
    if (!pkg)
      return;

    if (pkg.sources.length === 0) {
      const add = vscode.l10n.t('Add sources');
      if (await vscode.window.showInformationMessage(vscode.l10n.t('Build package {0} has no sources.', pkg.name), add) === add)
        await this.add_sources_to(pkg);
      return;
    }

    // Also checked by the OBI backend; here with an action to fix it
    const source_dir = DirTool.get_local_source_dir();
    const problems = unbuildable_sources(pkg.sources, AppConfig.get_app_config().general['supported-object-types'] || [], source => DirTool.file_exists(path.join(source_dir, source)));
    const unbuildable = [...problems.missing, ...problems.unsupported];
    if (unbuildable.length > 0) {
      const remove = vscode.l10n.t('Remove from package');
      const message = vscode.l10n.t('Build package {0} contains sources that can\'t be built (missing, or type not in supported-object-types): {1}', pkg.name, unbuildable.join(', '));
      if (await vscode.window.showErrorMessage(message, remove) === remove) {
        this.store().remove_sources(pkg.name, unbuildable);
        this.provider.refresh();
      }
      return;
    }

    this.remember(pkg.name);
    if (run)
      await OBICommands.run_build(this.context, package_scope(pkg));
    else
      await OBICommands.show_changes(this.context, package_scope(pkg));
  }
}


function name_problem_text(problem: PackageNameProblem): string {
  return problem === 'exists'
    ? vscode.l10n.t('A build package with this name already exists (also with other upper/lower case).')
    : vscode.l10n.t('Use letters, digits, ".", "_" and "-" (start with a letter or digit, max. 100 characters).');
}
