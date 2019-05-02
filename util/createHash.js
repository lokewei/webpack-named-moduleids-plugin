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
  constructor(hash, enforeModules = []) {
    this.string = "";
    this.bulkHash = new BulkUpdateDecorator(hash);
    this.localRegex = /[\\/]node_modules[\\/]([^\\/]+)[\\/].*/i; // node_modules后面紧跟的一级目录
    this.foldRegex = /@([^@]+)@/g; // 匹配一级目录
    this.versionRegex = /@([\d\.]+)@/; // 匹配flatten中的版本号
    this.rootRegex = /@@([^@]+)/; // 匹配flatten中的scope名称
    this.scopeRegex = /@[^@\\/]+[\\/][^\\/]+[\\/]/; // 匹配非flatten的scope包名
    this.enforeModules = enforeModules;
  }

  update(data, inputEncoding) {
    let absContext = path.resolve(data);
    if (absContext.startsWith(globalDirs.npm.packages)) {
      this.string = absContext.replace(globalDirs.npm.packages, '@npm-global-dir');
      return this;
    }
    console.log(data);
    if (absContext.startsWith(projectDir)) {
      // const pkg = require(path.join(projectDir, 'package.json'));
      const matchs = this.localRegex.exec(absContext);
      if (matchs && matchs[1]) {
        let flattenName = matchs[1]; // _@xxxx@x.y.z@xxx or _@xxxx@x.y.z@@root
        // 忽略白名单的模块
        const ignore = this.enforeModules.some(emodule => {
          return flattenName.includes(emodule);
        });
        const rootRegexMatchs = this.rootRegex.exec(flattenName);
        if (!ignore) {
          const versionMatchs = this.versionRegex.exec(flattenName);
          let version = versionMatchs && versionMatchs[1];
          // 这里处理flatten格式的
          if (rootRegexMatchs && rootRegexMatchs[1]) {
            const rootName = rootRegexMatchs[1]
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
          const blurVersion = version.split('.').map((v, i) => i > 0 ? 'x' : v).join('.');
          const blurName = `${name}@${blurVersion}`;
          // const blurName = flattenName.replace(version, blurVersion);
          absContext = absContext.replace(this.localRegex, function(match, $1, offset, str) {
            return match.replace($1, blurName)
            // return match.replace($1, blurName);
          });
        }
      }
      this.string = absContext.replace(projectDir, '');
      return this;
    }
    return this.bulkHash.update(data, inputEncoding);
  }

  digest(encoding) {
    if (this.string.length) {
      return this.string;
    }
    return this.bulkHash.digest(encoding);
  }
}

/**
 * Creates a hash by name or function
 * @param {string | HashConstructor} algorithm the algorithm name or a constructor creating a hash
 * @returns {Hash} the hash
 */
module.exports = (algorithm, enforeModules) => {
  if (typeof algorithm === "function") {
    return new BulkUpdateDecorator(new algorithm());
  }
  switch (algorithm) {
    // TODO add non-cryptographic algorithm here
    case "debug":
      return new DebugHash();
    case "named":
      return new NamedHash(require("crypto").createHash('sha256'), enforeModules);
    default:
      return new BulkUpdateDecorator(require("crypto").createHash(algorithm));
  }
};