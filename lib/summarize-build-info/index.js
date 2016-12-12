let summarize = require('../../summarize').computeBuildSummary;
let fs = require('fs');

module.exports = {
  name: 'summarize-build-info',

  isDevelopingAddon: function() {
    return true;
  },


  _buildAnalytics: function (vizInfo) {
    let summary = summarize(vizInfo, {
      // 0.05 is the default
      cutoff: 0.05
    });
    fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  }
};
