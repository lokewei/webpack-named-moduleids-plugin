## webpack named moduleids plugin

to generate named webpack internal module name, now you can reuse lib between single components on one platform

## case

```javascript
  import { SketchPicker } from 'react-color'

  // output code

  var lib = __webpack_require__("/node_modules/react-color@2.x.x/lib/index.js");
  lib["SketchPicker"]

```