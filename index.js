/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author lokewei
*/
"use strict";
const createHash = require("./util/createHash");

const validateOptions = require("schema-utils");
const schema = require("./schema/NamedModuleIdsPlugin.json");

class NamedModuleIdsPlugin {
	/**
	 * @param {NamedModuleIdsPluginOptions=} options options object
	 */
  constructor(options, callback) {
    if (!options) options = {};

    validateOptions(schema, options, "Hashed Module Ids Plugin");

    /** @type {NamedModuleIdsPluginOptions} */
    this.options = Object.assign(
      {
        context: null,
        hashFunction: "md4",
        hashDigest: "base64",
        hashDigestLength: 4,
        enforeModules: [],
        namedToHash: false,
        callback: null
      },
      options
    );
    this.callback = callback;
  }

  apply(compiler) {
    const options = this.options;
    const namedModules = new Set();
    const namedModuleHashs = {};
    const callback = this.callback;
    compiler.hooks.compilation.tap("NamedModuleIdsPlugin", compilation => {
      const usedIds = new Set();
      compilation.hooks.beforeModuleIds.tap(
        "NamedModuleIdsPlugin",
        modules => {
          for (const module of modules) {
            if (module.id === null && module.libIdent) {
              const context = this.options.context || compiler.options.context;
              const id = module.libIdent({
                context
              });
              module.id = id;
              const hash = createHash(options.hashFunction, options.enforeModules);
              const realHash = hash.update(id);
              let hashId = hash.digest(options.hashDigest);
              let pureId; // 记录本次未hash的id
              if (realHash.constructor.name === 'NamedHash') {
                // 记录所有未hash的id
                if (/^[\/]node_module/.test(hashId)) {
                  namedModules.add(hashId);
                }
                if (options.namedToHash) {
                  pureId = hashId;
                  realHash.hashDecorator.update(hashId);
                  hashId = realHash.hashDecorator.digest();
                } else {
                  module.id = hashId;
                  usedIds.add(module.id);
                  continue;
                }
              }
              let len = options.hashDigestLength;
              // 这个是为了防止hash重复，+1操作
              while (usedIds.has(hashId.substr(0, len))) len++;
              module.id = hashId.substr(0, len);
              usedIds.add(module.id);
              // 记录hash之后的映射
              if (pureId) {
                namedModuleHashs[pureId] = module.id;
              }
            }
          }
        }
      );
    });
    if (callback && typeof callback === 'function') {
      compiler.hooks.done.tap('NamedModuleIdsPlugin', function() {
        callback(Array.from(namedModules), namedModuleHashs);
      });
    }
  }
}

module.exports = NamedModuleIdsPlugin;