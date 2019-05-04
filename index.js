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
  constructor(options) {
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
        namedToHash: false
      },
      options
    );
  }

  apply(compiler) {
    const options = this.options;
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
              // console.log(hashId, hash.constructor.name, realHash.constructor.name, options.namedToHash);
              if (realHash.constructor.name === 'NamedHash') {
                if (options.namedToHash) {
                  realHash.bulkHash.update(hashId);
                  hashId = realHash.bulkHash.digest('hex');
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
            }
          }
        }
      );
    });
  }
}

module.exports = NamedModuleIdsPlugin;