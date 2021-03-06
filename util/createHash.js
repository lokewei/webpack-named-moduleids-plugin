/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author lokewei
*/
"use strict";

/** @typedef {{new(): Hash}} HashConstructor */
/**
 * @typedef {Object} Hash
 * @property {function(string|Buffer, string=): Hash} update
 * @property {function(string): string} digest
 */

const path = require('path');
const globalDirs = require('global-dirs');
const projectDir = process.cwd();
const MurmurHash3 = require('imurmurhash');
const projectPkgData = require(path.join(projectDir, 'package.json'));
// const projectBaseName = path.basename(projectDir);
// const projectNMS = path.join(projectDir, 'node_modules');

const BULK_SIZE = 1000;

/**
 * @implements {Hash}
 */
class BulkUpdateDecorator {
  constructor(hash) {
    this.hash = hash;
    this.buffer = "";
  }

  update(data, inputEncoding) {
    if (
      inputEncoding !== undefined ||
      typeof data !== "string" ||
      data.length > BULK_SIZE
    ) {
      if (this.buffer.length > 0) {
        this.hash.update(this.buffer);
        this.buffer = "";
      }
      this.hash.update(data, inputEncoding);
    } else {
      this.buffer += data;
      if (this.buffer.length > BULK_SIZE) {
        this.hash.update(this.buffer);
        this.buffer = "";
      }
    }
    return this;
  }

  digest(encoding) {
    if (this.buffer.length > 0) {
      this.hash.update(this.buffer);
    }
    var digestResult = this.hash.digest(encoding);
    return typeof digestResult === "string"
      ? digestResult
      : digestResult.toString();
  }
}

class MurmurHashDecorator {
  constructor() {
    this.string = "";
    this.hashState = new MurmurHash3();
  }

  update(data) {
    if (typeof data !== "string") data = data.toString("utf-8");
    this.hashState.hash(data);
    return this;
  }

  digest() {
    const result = this.hashState && this.hashState.result().toString(16);
    this.hashState = this.hashState && this.hashState.reset(); // reset
    return result;
  }
}

/* istanbul ignore next */
class DebugHash {
  constructor() {
    this.string = "";
  }

  update(data, inputEncoding) {
    if (typeof data !== "string") data = data.toString("utf-8");
    this.string += data;
    return this;
  }

  digest(encoding) {
    return this.string.replace(/[^a-z0-9]+/gi, m =>
      Buffer.from(m).toString("hex")
    );
  }
}

class NamedHash {
  constructor(enforeModules = [], addSourcePrefix) {
    this.string = "";
    this.hashDecorator = new MurmurHashDecorator();
    this.localRegex = /[\\/]node_modules[\\/]([^\\/]+)[\\/].*/i; // node_modules后面紧跟的一级目录
    this.foldRegex = /@([^@]+)@/g; // 匹配一级目录
    this.versionRegex = /@([\d\.]+)@/; // 匹配flatten中的版本号
    this.rootRegex = /@@([^@]+)/; // 匹配flatten中的scope名称
    this.scopeRegex = /@[^@\\/]+[\\/][^\\/]+[\\/]/; // 匹配非flatten的scope包名
    this.enforeModules = enforeModules;
    this.addSourcePrefix = addSourcePrefix;
  }

  update(data, inputEncoding) {
    let absContext = path.normalize(path.resolve(data));
    if (absContext.startsWith(globalDirs.npm.packages)) {
      this.string = absContext.replace(globalDirs.npm.packages, '@npm-global-dir');
      return this;
    }
    if (absContext.startsWith(projectDir)) {
      const matchs = this.localRegex.exec(absContext);
      if (matchs && matchs[1]) {
        let flattenName = matchs[1]; // _@xxxx@x.y.z@xxx or _@xxxx@x.y.z@@root
        // 忽略白名单的模块
        const ignore = this.enforeModules.some(emodule => {
          return flattenName.includes(emodule);
        });
        const rootRegexMatchs = this.rootRegex.exec(flattenName);
        const versionMatchs = this.versionRegex.exec(flattenName);
          let version = versionMatchs && versionMatchs[1];
          // 这里处理flatten格式的
          if (rootRegexMatchs && rootRegexMatchs[1]) {
            const rootName = rootRegexMatchs[1];
            const subFolds = [];
            let subFoldMatchs;
            while ((subFoldMatchs = this.foldRegex.exec(flattenName)) !== null) {
              const subFold = subFoldMatchs && subFoldMatchs[1];
              if (subFold && subFold !== version) {
                subFolds.unshift(subFold.replace(`${rootName}_`, ''));
              }
            }
            subFolds.unshift(`@${rootName}`);
            flattenName = subFolds.join('/');
          }
          // 这里处理未flatten，但是有scope的
          if (/^@/.test(flattenName)) {
            const scopeMatchs = this.scopeRegex.exec(absContext);
            if (scopeMatchs && scopeMatchs[0]) {
              flattenName = scopeMatchs[0].slice(0, -1);
            }
          }
          const pkgData = require(path.join(projectDir, 'node_modules', flattenName, 'package.json'));
          const { name } = pkgData;
          version = pkgData.version;
          let moduleFinalName = `${name}@${version}`;
          // 模糊化处理
          if (!ignore) {
            const blurVersion = version.split('.').map((v, i) => i > 0 ? 'x' : v).join('.');
            moduleFinalName = `${name}@${blurVersion}`;
          }
          // const blurName = flattenName.replace(version, blurVersion);
          absContext = absContext.replace(this.localRegex, function(match, $1, offset, str) {
            return match.replace($1, moduleFinalName);
            // return match.replace($1, blurName);
          });
      }
      this.string = absContext.replace(projectDir, '');
      // 这里处理项目本身的module
      if (!matchs && this.addSourcePrefix) {
        this.string = `${projectPkgData.name}${this.string}`;
      }
      // console.log(this.string);
      return this;
    }
    return this.hashDecorator.update(data, inputEncoding);
  }

  digest(encoding) {
    if (this.string.length) {
      return this.string;
    }
    return this.hashDecorator.digest(encoding);
  }
}

/**
 * Creates a hash by name or function
 * @param {string | HashConstructor} algorithm the algorithm name or a constructor creating a hash
 * @returns {Hash} the hash
 */
module.exports = (algorithm, enforeModules, addSourcePrefix) => {
  if (typeof algorithm === "function") {
    return new BulkUpdateDecorator(new algorithm());
  }
  switch (algorithm) {
    // TODO add non-cryptographic algorithm here
    case "debug":
      return new DebugHash();
    case "named":
      return new NamedHash(enforeModules, addSourcePrefix);
    case "murmur":
      return new MurmurHashDecorator();
    default:
      return new BulkUpdateDecorator(require("crypto").createHash(algorithm));
  }
};