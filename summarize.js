'use strict';

let fs = require('fs');
let _ = require('lodash');
let MatcherCollection = require('matcher-collection');


let fsReadPatterns = [
  'accessSync',
  'existsSync',
  'fstatSync',
  'lstat',
  'lstatSync',
  'mkdirSync',
  'openSync',
  'readFile',
  'readFileSync',
  'readSync',
  'readdirSync',
  'readlinkSync',
  'realpathSync',
  'statSync',
].map(x => `fs.${x}.time`);

let fsWritePatterns = [
  'chmod',
  'mkdir',
  'open',
  'rmdir',
  'rmdirSync',
  'symlinkSync',
  'unlinkSync',
  'write',
  'writeFile',
  'writeFileSync',
  'writeSync',
].map(x => `fs.${x}.time`);

let fsOtherPatterns = [
  'close',
  'closeSync',
].map(x => `fs.${x}.time`);




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

function* unionIterator(...iterators) {
  let seen = new WeakSet();
  let seenp = Object.create(null);

  for (let itr of iterators) {
    for (let item of itr) {
      if (typeof item === 'object') {
        if (seen.has(item)) { continue; }

        seen.add(item);
      } else {
        if (seenp[item]) { continue; }

        seenp[item] = true;
      }

      yield item;
    }
  }
}

function* keyIterator (obj, prefix='') {
  for (let key in obj) {
    let value = obj[key];

    if (typeof value === 'object') {
      yield* keyIterator(value, `${prefix}${key}.`);
    } else {
      yield `${prefix}${key}`;
    }
  }
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

Node.prototype.statsIterator = function* () {
  yield* keyIterator(this.stats);
}

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
  return sumStats(iterator, stat);
}

function sumStats(iterator, ...patterns) {
  let matcher = new MatcherCollection(patterns);

  return sumBy(iterator, function (node) {
    let matchingStats = filterBy(node.statsIterator(), x => matcher.match(x));
    return sumBy(matchingStats, function (stat) {
      let value = _.get(node, `stats.${stat}`);

      if (value) {
        return value;
      }

      return 0;
    })
  });
}

// find me all the unique names, that match { broccoliNode: true, name: <any> }
// all group by names
//

function allPlugins(iterator) {
  return filterBy(iterator, node => node.id.broccoliNode);
}

function allPluginsGrouped(iterator) {
  return groupBy(allPlugins(iterator), node => node.id.name);
}

function summarizeGroups(groups) {
  return Object.keys(groups).map(groupName => {
    return {
      name: groupName,
      summary: summarizePlugins(groups[groupName])
    };
  });
}

function untilBroccoliNode(child) {
  return child.id.broccoliNode;
}

function summarizePlugins(plugins) {
  let generator = (...args) => {
    return unionIterator(...plugins.map(x => x.preOrderIterator(...args)));
  }

  let name = plugins[0] && plugins[0].id.name || 'none';
  let count = plugins.length;
  let more = {
    name,
    count,
  }

  return summarizeNodes(generator, more);
}

function summarizePlugin(plugin) {
  let generator = plugin.preOrderIterator.bind(plugin);
  return summarizeNodes(generator, { name: plugin.id.name });
}

function summarizeNodes(generator, more={}) {
  return Object.assign({
    selfTime:   formatNs(sumStat(generator(untilBroccoliNode), 'time.self')),
    totalTime:  formatNs(sumStat(generator(), 'time.self')),
    io: {
      self: {
        ios:        formatNum(sumStats(generator(untilBroccoliNode), 'fs.*.count')),
        ioTime:     formatNs(sumStats(generator(untilBroccoliNode), 'fs.*.time')),

        readTime:   formatNs(sumStats(generator(untilBroccoliNode), ...fsReadPatterns)),
        writeTime:  formatNs(sumStats(generator(untilBroccoliNode), ...fsWritePatterns)),
        otherTime:  formatNs(sumStats(generator(untilBroccoliNode), ...fsOtherPatterns)),
      },
      total: {
        ios:        formatNum(sumStats(generator(), 'fs.*.count')),
        ioTime:     formatNs(sumStats(generator(), 'fs.*.time')),

        readTime:   formatNs(sumStats(generator(), ...fsReadPatterns)),
        writeTime:  formatNs(sumStats(generator(), ...fsWritePatterns)),
        otherTime:  formatNs(sumStats(generator(), ...fsOtherPatterns)),
      }
    }
  }, more);
}

function* map(iterator, fn) {
  for (let x of iterator) {
    yield fn(x);
  }
}

function mapValues(obj, fn) {
  let result = Object.create(null);

  for (let key in obj) {
    let value = obj[key];
    result[key] = fn(value);
  }

  return result;
}


function formatNs(ns) {
  return `${formatNum((ns/1e6).toFixed(2))}ms`;
}

function formatNum(x) {
 return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function _computeBuildSummary(tree) {
  let totalTimeNS = sumStat(tree.preOrderIterator(), 'time.self');
  let totalTime = formatNs(totalTimeNS);

  return {
    totalTime,
    CacheHit:   `N/A%`,
    build: {
      reason: {
        type: 'initial' // rebuild, which will include additional info like "watchman file info"
      },
      steps: sumBy(tree.preOrderIterator(), function() { return 1; })
    },

    plugins: [[...map(allPlugins(tree.preOrderIterator()), summarizePlugin)][0]],

    pluginsByName: mapValues(allPluginsGrouped(tree.preOrderIterator()), summarizePlugins),
  };
}

function printBuildSummary(tree) {
  console.log(JSON.stringify(computeBuildSummary(tree), null, 2));
}

function computeBuildSummary(json) {
  return _computeBuildSummary(toTree(json));
}

module.exports = {
  computeBuildSummary,
}

// let tree = loadTree('./broccoli-viz.0.json');
// printBuildSummary(tree);
