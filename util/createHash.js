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
    this.localRegex = /[\\/]node_modules[\\/]([^\\/]*)[\\/].*/i;
    this.versionRegex = /@([^@]*)@/i;
    this.enforeModules = enforeModules;
  }

  update(data, inputEncoding) {
    let absContext = path.resolve(data);
    if (absContext.startsWith(globalDirs.npm.packages)) {
      this.string = absContext.replace(globalDirs.npm.packages, '@npm-global-dir');
      return this;
    }
    if (absContext.startsWith(projectDir)) {
      // const pkg = require(path.join(projectDir, 'package.json'));
      const matchs = this.localRegex.exec(absContext);
      if (matchs && matchs[1]) {
        const flattenName = matchs[1];
        // 忽略白名单的模块
        const ignore = this.enforeModules.some(emodule => {
          return flattenName.includes(emodule);
        });
        if (!ignore) {
          const versionMatchs = this.versionRegex.exec(flattenName)
          const version = versionMatchs && versionMatchs[1] || '';
          const blurVersion = version.split('.').map((v, i) => i > 0 ? 'x' : v).join('.');
          const blurName = flattenName.replace(version, blurVersion);
          absContext = absContext.replace(this.localRegex, function(match, $1, offset, str) {
            return match.replace($1, blurName);
          });
        }
        console.log(absContext);
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