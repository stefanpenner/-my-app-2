'use strict';

let fs = require('fs');
let _ = require('lodash');

module.exports.loadTree = loadTree
function loadTree(path) {
  const json = JSON.parse(fs.readFileSync(path, 'UTF8'));

  return toTree(json);
}


function toTree(data) {
  let root = null;
  let nodes = {};

  data.nodes.forEach(function (a) {
    let node = nodes[a._id] = new Node(a._id, a.id, a.stats, a.children);

    if (root === null) {
      root = node;
    }
  });

  Object.keys(nodes).forEach(function(id) {
    let node = nodes[id];
    node.children = node.children.map(function(id) {
      if (!nodes[id]) {
        throw new Error('uwot ' + id);
      }
      return nodes[id];
    });
  });

  return root;
}

function Node(_id, id, stats, children) {
  this._id = _id;
  this.id = id;
  this.stats = stats;
  this.children = children;
}

Node.prototype.preOrderIterator = function* (until) {
  yield this;

  for (let child of this.children) {
    if (until && until(child)) {
      continue;
    }

    for (let descendant of child.preOrderIterator()) {
      yield descendant;
    }
  }
};

Node.prototype.findDescendant = function(matcher) {
  for (const node of this.preOrderIterator()) {
    if(matcher(node.id)) {
      return node;
    }
  }
};

function sumBy(iterator, fn) {
  let result = 0;
  for (let x of iterator) {
    result += fn(x);
  }
  return result;
}

function* filterBy(iterator, fn) {
  for (let x of iterator) {
    if(fn(x)) { yield x; }
  }
}

function groupBy(iterator, fn) {
  let groups = Object.create(null);
  for (let x of iterator) {
    let key = fn(x);
    groups[key] = groups[key] || [];
    groups[key].push(x);
  }
  return groups;
}

function sumStat(iterator, stat) {
  return sumBy(iterator, function (node) {
    let value = _.get(node, `stats.${stat}`);

    if (value) {
      return value;
    }

    return 0;
  });
}
// find me all the unique names, that match { broccoliNode: true, name: <any> }
// all group by names
//

function allPlugins(iterator) {
  return groupBy(filterBy(iterator, node => node.id.broccoliNode), node => node.id.name);
}

function summarizeGroups(groups) {
  return Object.keys(groups).map(groupName => {
    return {
      name: groupName,
      summary: summarizePlugins(groups[groupName])
    };
  });
}

function summarizePlugins(plugins) {
}

function summarizePlugin(plugin) {
  return {
    name: plugin.id.name,
    selfTime:  formatNs(sumStat(plugin.preOrderIterator(child => child.id.broccoliNode), 'time.self')),
    totalTime: formatNs(sumStat(plugin.preOrderIterator(), 'time.self'))
  };
}

function formatNs(ns) {
  return `${(ns/1e6).toFixed(2)}ms`;
}

function printBuildSummary(tree) {
  let totalTimeNS = sumStat(tree.preOrderIterator(), 'time.self');
  let totalTime = formatNs(totalTimeNS);

  console.log(JSON.stringify({
    totalTime,
    CacheHit:   `N/A%`,
    build: {
      reason: {
        type: 'initial' // rebuild, which will include additional info like "watchman file info"
      },
      steps: sumBy(tree.preOrderIterator(), function() { return 1; })
    },

    // plugins: summarizeGroup(allPlugins(tree.preOrderIterator())),
    plugin: summarizePlugin(tree),

    pluginsByName: {

    }
  }, null, 2));
}

let tree = loadTree('./broccoli-viz.0.json');
printBuildSummary(tree);
