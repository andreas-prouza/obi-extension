# OBI README

Object builder for i (OBI) is an automatic build tool.

> Notice:
Currently only the Beta version is available.
Final release will be available soon.


## Features

* Individual source lists with source descriptions
  ![img](asserts/img/ext/source-list.png)
  
* Check for changes
  
  It checks all sources which have changed since last compilie.  
  The hash value of the source will be used to check if it has changed.
  
* Check for dependencies
  
  All objects which depend on the changed source will also be compiled (in correct order)

  E.g. if a table or view has changed, all objects which use them will be compiled too

  ![img](asserts/img/ext/show-changes.png)


* Compile in correct order
  
  Tables before programs etc. based on the dependency list


* See which objects has been compiled and their details  
  Each task has its own:
  
  * joblog
  * spool file
  * error output

  ![img](asserts/img/ext/build-summary.png)


## Requirements

* On IBM i SSH is necessary  
  https://github.com/andreas-prouza/ibm-i-build/blob/main/docs/pages/SSH.md
* You need to clone the OBI project on your IBM i:  
  https://github.com/andreas-prouza/obi


## Release Notes

### 0.1.4 Beta

Beta release of OBI


---

## Following steps you need to do

1. Get your Sources to IFS (to your project folder)
2. Take a look into the config (server, user, ifs locations, ...)
     ![img](asserts/img/ext/config.png)
     ![img](asserts/img/ext/config-compile.png)


If no OBI config could be found, you will see the welcome screen:

![img](asserts/img/ext/welcome.png)



## For more information

* [OBI: the build tool running on IBM i](https://github.com/andreas-prouza/obi)
* [OBI: detailed description](https://github.com/andreas-prouza/ibm-i-build-obi)
* [OBI: vscode extension](https://github.com/andreas-prouza/obi-extension)

**Happy ever after!**
