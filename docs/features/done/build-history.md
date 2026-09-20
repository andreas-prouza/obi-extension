
# New feature

## Switch tree view

As an user I want to switch the trees view.

One view is base on build timestamp (current situation).
Root is build date -> build time -> contained sources

New view is based on sources
Root is source -> build date -> build time

### Definition of done
* Add a new "switch" button to switch between source based tree or build date based view



## Search for object

### Definition of done

* Add a search button in the `view/title` area
* When click on search butten a list of sources will appear on top like when click on "add source" in `build summary`
* Choose the sources you want to filter
* Multiple sources can be selected
* Change the tree based on selected sources
* The filter should affect independend which view is activated (source base or date based)
* Preselect in the list of sources, items which are already in filter
* Replace current filter with the new one
* In list of sources, show also source description like in `obi.source-quick-search`
* Also show source description for each source element in tree