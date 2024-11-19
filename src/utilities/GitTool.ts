import { simpleGit, SimpleGit, CleanOptions, BranchSummary } from 'simple-git';
import { Workspace } from './Workspace';


export class GitTool {


  public static async list_branches(): Promise<{}> {

    const git = simpleGit(Workspace.get_workspace());
    const branches = await git.branch();
    return branches.branches;
  }


  public static async get_commits(): Promise<{}> {

    const git = simpleGit(Workspace.get_workspace());
    const branch = (await git.branch()).current;
    const logs = await git.log();
    return branch;
  }


}