let summarize = require('../../summarize').computeBuildSummary;
let fs = require('fs');

module.exports = {
  name: 'summarize-build-info',

  isDevelopingAddon: function() {
    return true;
  },


  _buildAnalytics: function (vizInfo) {
    let summary = summarize(vizInfo);
    fs.writeFileSync('summary.json', JSON.stringify(summary, null, 2));
    console.log("I HAZ DA INFOOOOOO", JSON.stringify(summary, null, 2));
  }
};
