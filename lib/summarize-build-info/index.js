let summarize = require('../../summarize').computeBuildSummary;
let fs = require('fs');
let BUILD_INSTRUMENTATION = require('ember-cli/lib/features/build-instrumentation');

module.exports = {
  name: 'summarize-build-info',

  isDevelopingAddon: function() {
    return true;
  }
};

module.exports[BUILD_INSTRUMENTATION] = function(instrumentation) {
  let summary = summarize(instrumentation, {
    // 0.05 is the default
    cutoff: 0.05
  });
  fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
};
