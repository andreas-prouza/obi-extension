# Current situation

In the build summary the source which needs to be build and all it's dependencies were listed.

All informations for the current build is stored in `compile-list.json`.


# New feature

## Add new sources

As a user I want to add specific sources to the build summary.

### Definition of done
* Consider the dependencies and build order
* If sources already have status `success`, reset status if the source is affected due to dependencies
* Put the button under `Created at`
* Use a plus symbol for button
* Consider ESP (extended source processing) feature
* Consider if config `local-obi-dir` is set. In such case the python project will be called to generate `compile-list` otherwise the vscode extension can handle it.
* When using python obi, use `-a add_source -p . --source {source} --compile-list-dir {directory of compile-list.json}` parameter


## Modify build command

As a user I want to modify the build command in the build summary

### Definition of done
* In `compile-list.json` add new key `compiles[].sources[].cmds[].change-history[]` and add a history entry:
  ```json
  {
    "type": "cmd-change",
    "user": "ibm-i-user",
    "original": "previous cmd",
    "timestamp": "2026-08-14T19:48:46.664582"
  }
  ```
* If sources already have status `success`, reset status and also the status of all dependend sources
* If command already have status `success`, reset status
* Run build button should alsways run the current opened `compile-list.json`. Even if it's in `build-history` folder
* After build open the new results. Specially if an older build was rebuild.


## Add git branch name in compile-list

In `compile-list.json` add a new key:

```json
"git": {
  "branch": "{branchname}",
  "commit": "{commit-hash}"
}
```

### Definition of done
* If project is based on GIT, add the current branch name and commit hash
* If HEAD is detached (no branch, e.g. a tag/commit is checked out), omit `branch` and only add `commit`
* If project is not based on GIT, don't add the `git` key at all
* Refresh `git` on every compile-list write (unlike `timestamp`, which is set once at creation)