# Tell me whats slow

* source of the build
  * what inputFiles triggered watchman
  * what outputFiles changed
  * initial vs rebuild

  future:
   * How warm was this build or rebuild? E.g. cache hit rate
   * heimdall {async,sync}-disk-cache

* Summarize Pipeline
  - [x] totalTime:
  - [?] cache hit ratio:
  - [-] source of build:
  - [x] how many build steps:
  - [ ] summarize all FS

* Summarize Plugins
 * how much time is spent in a plugin type
 * how much time is spent in a plugin instance
   * how much time in "inputTree" reading
   * totalTime

* Summarize FS
 * Summary FS for each "Plugin Type"
 * Summary FS for each "Plugin"


future questions to ask:
 * how much time is: from node ember -> builder.build()
 * how much time is: builder.build().finally() -> "build completed"
