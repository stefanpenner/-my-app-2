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
      nodes[id].parent = node;
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
  this.parent = undefined;
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

Node.prototype.ancestor = function (match=(x => true)) {
  let node = this;

  while(node = node.parent) {
    if (match(node)) {
      return node;
    }
  }

  return null;
}

Node.prototype.descendant = function (match=(x => true)) {
  for (let desc of this.preOrderIterator()) {
    if (match(desc)) {
      return desc;
    }
  }
}

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

function addonNamesFor(iterator) {
  let addonsItr = map(iterator, x => x.ancestor(y => /Addon#treeFor/.test(y.id.name)));
  let addonNamesItr = map(addonsItr, node => {
    if (!node) {
      return '';
    }

    let match = /Addon#treeFor \((.*) - (\w*)\)/.exec(node.id.name);
    if (match) {
      return match[1];
    }

    match = /node_modules\/([^/]*)\/addon$/.exec(node.id.name);

    return match ? match[1] : '';
  });

  return _.uniq([...addonNamesItr]).join(', ');

  return result.join(', ');
}

function summarizeNodes(generator, more={}) {
  return Object.assign({
    selfTime:   formatNs(sumStat(generator(untilBroccoliNode), 'time.self')),
    totalTime:  formatNs(sumStat(generator(), 'time.self')),
    addon:      addonNamesFor(generator()),
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

function unformatNum(s) {
  return parseFloat(s.replace(',', ''));
}

function bySelfTime(a, b) {
  return unformatNum(b.selfTime) - unformatNum(a.selfTime);
}

function mostExpensive(items, options={}) {
  let from = 0;
  let cutoff = options.cutoff || 0.05;
  let totalTime = unformatNum(items[0].totalTime);
  items.sort(bySelfTime);
  let until = items.findIndex(x => (unformatNum(x.selfTime) / totalTime) < cutoff);

  return until > -1 ? items.slice(0, until) : items.slice(0, 10);
}

function computeBuildSummary(json, options) {
  let tree = toTree(json);
  let totalTimeNS = sumStat(tree.preOrderIterator(), 'time.self');
  let totalTime = formatNs(totalTimeNS);

  let plugins = [...map(allPlugins(tree.preOrderIterator()), summarizePlugin)];
  let pluginsByName = Object.values(mapValues(allPluginsGrouped(tree.preOrderIterator()), summarizePlugins));

  return {
    totalTime,
    CacheHit:   `N/A%`,
    build: {
      type: json.summary.build.type,
      count: json.summary.build.count,
      outputChangedFiles: json.summary.build.outputChangedFiles,
      inputChangedFiles: {
        primary: json.summary.build.primaryFile,
        changedFiles: json.summary.build.changedFiles,
        total: json.summary.build.changedFileCount,
      },
      steps: sumBy(tree.preOrderIterator(), function() { return 1; })
    },

    plugins: mostExpensive(plugins, options),
    pluginsByName: mostExpensive(pluginsByName, options),
  };
}

function printBuildSummary(json, options) {
  console.log(JSON.stringify(computeBuildSummary(json, options), null, 2));
}

module.exports = {
  computeBuildSummary,
}

// let json = JSON.parse(fs.readFileSync('./broccoli-viz.0.json', 'UTF8'));
// printBuildSummary(json);
