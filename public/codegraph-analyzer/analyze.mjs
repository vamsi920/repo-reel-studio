import { createRequire as __codegraphCreateRequire } from "node:module";
const require = __codegraphCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ignore/index.js
var require_ignore = __commonJS({
  "node_modules/ignore/index.js"(exports, module) {
    function makeArray(subject) {
      return Array.isArray(subject) ? subject : [subject];
    }
    var UNDEFINED = void 0;
    var EMPTY = "";
    var SPACE = " ";
    var ESCAPE = "\\";
    var REGEX_TEST_BLANK_LINE = /^\s+$/;
    var REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
    var REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
    var REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
    var REGEX_SPLITALL_CRLF = /\r?\n/g;
    var REGEX_TEST_INVALID_PATH = /^\.{0,2}\/|^\.{1,2}$/;
    var REGEX_TEST_TRAILING_SLASH = /\/$/;
    var SLASH = "/";
    var TMP_KEY_IGNORE = "node-ignore";
    if (typeof Symbol !== "undefined") {
      TMP_KEY_IGNORE = /* @__PURE__ */ Symbol.for("node-ignore");
    }
    var KEY_IGNORE = TMP_KEY_IGNORE;
    var define = (object2, key, value) => {
      Object.defineProperty(object2, key, { value });
      return value;
    };
    var REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
    var RETURN_FALSE = () => false;
    var sanitizeRange = (range) => range.replace(
      REGEX_REGEXP_RANGE,
      (match, from, to) => from.charCodeAt(0) <= to.charCodeAt(0) ? match : EMPTY
    );
    var negateRange = (range) => range.startsWith("!") || range.startsWith("\\^") ? `^${range.slice(range[0] === "!" ? 1 : 2)}` : range;
    var cleanRangeBackSlash = (slashes) => {
      const { length } = slashes;
      return slashes.slice(0, length - length % 2);
    };
    var REPLACERS = [
      [
        // Remove BOM
        // TODO:
        // Other similar zero-width characters?
        /^\uFEFF/,
        () => EMPTY
      ],
      // > Trailing spaces are ignored unless they are quoted with backslash ("\")
      [
        // (a\ ) -> (a )
        // (a  ) -> (a)
        // (a ) -> (a)
        // (a \ ) -> (a  )
        /((?:\\\\)*?)(\\?\s+)$/,
        (_, m1, m2) => m1 + (m2.indexOf("\\") === 0 ? SPACE : EMPTY)
      ],
      // Replace (\ ) with ' '
      // (\ ) -> ' '
      // (\\ ) -> '\\ '
      // (\\\ ) -> '\\ '
      [
        /(\\+?)\s/g,
        (_, m1) => {
          const { length } = m1;
          return m1.slice(0, length - length % 2) + SPACE;
        }
      ],
      // Escape metacharacters
      // which is written down by users but means special for regular expressions.
      // > There are 12 characters with special meanings:
      // > - the backslash \,
      // > - the caret ^,
      // > - the dollar sign $,
      // > - the period or dot .,
      // > - the vertical bar or pipe symbol |,
      // > - the question mark ?,
      // > - the asterisk or star *,
      // > - the plus sign +,
      // > - the opening parenthesis (,
      // > - the closing parenthesis ),
      // > - and the opening square bracket [,
      // > - the opening curly brace {,
      // > These special characters are often called "metacharacters".
      [
        /[\\$.|*+(){^]/g,
        (match) => `\\${match}`
      ],
      [
        // > a question mark (?) matches a single character
        /(?!\\)\?/g,
        () => "[^/]"
      ],
      // leading slash
      [
        // > A leading slash matches the beginning of the pathname.
        // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
        // A leading slash matches the beginning of the pathname
        /^\//,
        () => "^"
      ],
      // replace special metacharacter slash after the leading slash
      [
        /\//g,
        () => "\\/"
      ],
      [
        // > A leading "**" followed by a slash means match in all directories.
        // > For example, "**/foo" matches file or directory "foo" anywhere,
        // > the same as pattern "foo".
        // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
        // >   under directory "foo".
        // Notice that the '*'s have been replaced as '\\*'
        /^\^*(?:\\\*\\\*\\\/)+/,
        // '**/foo' <-> 'foo'
        () => "^(?:.*\\/)?"
      ],
      // starting
      [
        // there will be no leading '/'
        //   (which has been replaced by section "leading slash")
        // If starts with '**', adding a '^' to the regular expression also works
        /^(?=[^^])/,
        function startingReplacer() {
          return !/\/(?!$)/.test(this) ? "(?:^|\\/)" : "^";
        }
      ],
      // two globstars
      [
        // Use lookahead assertions so that we could match more than one `'/**'`
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        // Zero, one or several directories
        // should not use '*', or it will be replaced by the next replacer
        // Check if it is not the last `'/**'`
        (_, index, str) => index + 6 < str.length ? "(?:\\/[^\\/]+)*" : "\\/.+"
      ],
      // normal intermediate wildcards
      [
        // Never replace escaped '*'
        // ignore rule '\*' will match the path '*'
        // 'abc.*/' -> go
        // 'abc.*'  -> skip this rule,
        //    coz trailing single wildcard will be handed by [trailing wildcard]
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        // '*.js' matches '.js'
        // '*.js' doesn't match 'abc'
        (_, p1, p2) => {
          const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
          return p1 + unescaped;
        }
      ],
      [
        // unescape, revert step 3 except for back slash
        // For example, if a user escape a '\\*',
        // after step 3, the result will be '\\\\\\*'
        /\\\\\\(?=[$.|*+(){^])/g,
        () => ESCAPE
      ],
      [
        // '\\\\' -> '\\'
        /\\\\/g,
        () => ESCAPE
      ],
      [
        // > The range notation, e.g. [a-zA-Z],
        // > can be used to match one of the characters in a range.
        // `\` is escaped by step 3
        /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
        (match, leadEscape, range, endEscape, close) => leadEscape === ESCAPE ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}` : close === "]" ? endEscape.length % 2 === 0 ? `[${negateRange(sanitizeRange(range))}${endEscape}]` : "[]" : "[]"
      ],
      // ending
      [
        // 'js' will not match 'js.'
        // 'ab' will not match 'abc'
        /(?:[^*])$/,
        // WTF!
        // https://git-scm.com/docs/gitignore
        // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
        // which re-fixes #24, #38
        // > If there is a separator at the end of the pattern then the pattern
        // > will only match directories, otherwise the pattern can match both
        // > files and directories.
        // 'js*' will not match 'a.js'
        // 'js/' will not match 'a.js'
        // 'js' will match 'a.js' and 'a.js/'
        (match) => /\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`
      ]
    ];
    var REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\\\*$/;
    var MODE_IGNORE = "regex";
    var MODE_CHECK_IGNORE = "checkRegex";
    var UNDERSCORE = "_";
    var TRAILING_WILD_CARD_REPLACERS = {
      [MODE_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]+` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      },
      [MODE_CHECK_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]*` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      }
    };
    var makeRegexPrefix = (pattern) => REPLACERS.reduce(
      (prev, [matcher, replacer]) => prev.replace(matcher, replacer.bind(pattern)),
      pattern
    );
    var isString = (subject) => typeof subject === "string";
    var checkPattern = (pattern) => pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && pattern.indexOf("#") !== 0;
    var splitPattern = (pattern) => pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);
    var IgnoreRule = class {
      constructor(pattern, mark, body, ignoreCase, negative, prefix) {
        this.pattern = pattern;
        this.mark = mark;
        this.negative = negative;
        define(this, "body", body);
        define(this, "ignoreCase", ignoreCase);
        define(this, "regexPrefix", prefix);
      }
      get regex() {
        const key = UNDERSCORE + MODE_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_IGNORE, key);
      }
      get checkRegex() {
        const key = UNDERSCORE + MODE_CHECK_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_CHECK_IGNORE, key);
      }
      _make(mode, key) {
        const str = this.regexPrefix.replace(
          REGEX_REPLACE_TRAILING_WILDCARD,
          // It does not need to bind pattern
          TRAILING_WILD_CARD_REPLACERS[mode]
        );
        const regex = this.ignoreCase ? new RegExp(str, "i") : new RegExp(str);
        return define(this, key, regex);
      }
    };
    var createRule = ({
      pattern,
      mark
    }, ignoreCase) => {
      let negative = false;
      let body = pattern;
      if (body.indexOf("!") === 0) {
        negative = true;
        body = body.substr(1);
      }
      body = body.replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!").replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
      const regexPrefix = makeRegexPrefix(body);
      return new IgnoreRule(
        pattern,
        mark,
        body,
        ignoreCase,
        negative,
        regexPrefix
      );
    };
    var RuleManager = class {
      constructor(ignoreCase) {
        this._ignoreCase = ignoreCase;
        this._rules = [];
      }
      _add(pattern) {
        if (pattern && pattern[KEY_IGNORE]) {
          this._rules = this._rules.concat(pattern._rules._rules);
          this._added = true;
          return;
        }
        if (isString(pattern)) {
          pattern = {
            pattern
          };
        }
        if (checkPattern(pattern.pattern)) {
          const rule = createRule(pattern, this._ignoreCase);
          this._added = true;
          this._rules.push(rule);
        }
      }
      // @param {Array<string> | string | Ignore} pattern
      add(pattern) {
        this._added = false;
        makeArray(
          isString(pattern) ? splitPattern(pattern) : pattern
        ).forEach(this._add, this);
        return this._added;
      }
      // Test one single path without recursively checking parent directories
      //
      // - checkUnignored `boolean` whether should check if the path is unignored,
      //   setting `checkUnignored` to `false` could reduce additional
      //   path matching.
      // - check `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`
      // @returns {TestResult} true if a file is ignored
      test(path, checkUnignored, mode) {
        let ignored = false;
        let unignored = false;
        let matchedRule;
        this._rules.forEach((rule) => {
          const { negative } = rule;
          if (unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored) {
            return;
          }
          const matched = rule[mode].test(path);
          if (!matched) {
            return;
          }
          ignored = !negative;
          unignored = negative;
          matchedRule = negative ? UNDEFINED : rule;
        });
        const ret = {
          ignored,
          unignored
        };
        if (matchedRule) {
          ret.rule = matchedRule;
        }
        return ret;
      }
    };
    var throwError = (message, Ctor) => {
      throw new Ctor(message);
    };
    var checkPath = (path, originalPath, doThrow) => {
      if (!isString(path)) {
        return doThrow(
          `path must be a string, but got \`${originalPath}\``,
          TypeError
        );
      }
      if (!path) {
        return doThrow(`path must not be empty`, TypeError);
      }
      if (checkPath.isNotRelative(path)) {
        const r = "`path.relative()`d";
        return doThrow(
          `path should be a ${r} string, but got "${originalPath}"`,
          RangeError
        );
      }
      return true;
    };
    var isNotRelative = (path) => REGEX_TEST_INVALID_PATH.test(path);
    checkPath.isNotRelative = isNotRelative;
    checkPath.convert = (p) => p;
    var Ignore = class {
      constructor({
        ignorecase = true,
        ignoreCase = ignorecase,
        allowRelativePaths = false
      } = {}) {
        define(this, KEY_IGNORE, true);
        this._rules = new RuleManager(ignoreCase);
        this._strictPathCheck = !allowRelativePaths;
        this._initCache();
      }
      _initCache() {
        this._ignoreCache = /* @__PURE__ */ Object.create(null);
        this._testCache = /* @__PURE__ */ Object.create(null);
      }
      add(pattern) {
        if (this._rules.add(pattern)) {
          this._initCache();
        }
        return this;
      }
      // legacy
      addPattern(pattern) {
        return this.add(pattern);
      }
      // @returns {TestResult}
      _test(originalPath, cache, checkUnignored, slices) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(
          path,
          originalPath,
          this._strictPathCheck ? throwError : RETURN_FALSE
        );
        return this._t(path, cache, checkUnignored, slices);
      }
      checkIgnore(path) {
        if (!REGEX_TEST_TRAILING_SLASH.test(path)) {
          return this.test(path);
        }
        const slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        if (slices.length) {
          const parent = this._t(
            slices.join(SLASH) + SLASH,
            this._testCache,
            true,
            slices
          );
          if (parent.ignored) {
            return parent;
          }
        }
        return this._rules.test(path, false, MODE_CHECK_IGNORE);
      }
      _t(path, cache, checkUnignored, slices) {
        if (path in cache) {
          return cache[path];
        }
        if (!slices) {
          slices = path.split(SLASH).filter(Boolean);
        }
        slices.pop();
        if (!slices.length) {
          return cache[path] = this._rules.test(path, checkUnignored, MODE_IGNORE);
        }
        const parent = this._t(
          slices.join(SLASH) + SLASH,
          cache,
          checkUnignored,
          slices
        );
        return cache[path] = parent.ignored ? parent : this._rules.test(path, checkUnignored, MODE_IGNORE);
      }
      ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
      }
      createFilter() {
        return (path) => !this.ignores(path);
      }
      filter(paths) {
        return makeArray(paths).filter(this.createFilter());
      }
      // @returns {TestResult}
      test(path) {
        return this._test(path, this._testCache, true);
      }
    };
    var factory = (options) => new Ignore(options);
    var isPathValid = (path) => checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
    var setupWindows = () => {
      const makePosix = (str) => /^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str) ? str : str.replace(/\\/g, "/");
      checkPath.convert = makePosix;
      const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
      checkPath.isNotRelative = (path) => REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
    };
    if (
      // Detect `process` so that it can run in browsers.
      typeof process !== "undefined" && process.platform === "win32"
    ) {
      setupWindows();
    }
    module.exports = factory;
    factory.default = factory;
    module.exports.isPathValid = isPathValid;
    define(module.exports, /* @__PURE__ */ Symbol.for("setupWindows"), setupWindows);
  }
});

// node_modules/obliterator/iterator.js
var require_iterator = __commonJS({
  "node_modules/obliterator/iterator.js"(exports, module) {
    function Iterator(next) {
      if (typeof next !== "function")
        throw new Error("obliterator/iterator: expecting a function!");
      this.next = next;
    }
    if (typeof Symbol !== "undefined")
      Iterator.prototype[Symbol.iterator] = function() {
        return this;
      };
    Iterator.of = function() {
      var args = arguments, l = args.length, i = 0;
      return new Iterator(function() {
        if (i >= l) return { done: true };
        return { done: false, value: args[i++] };
      });
    };
    Iterator.empty = function() {
      var iterator = new Iterator(function() {
        return { done: true };
      });
      return iterator;
    };
    Iterator.fromSequence = function(sequence) {
      var i = 0, l = sequence.length;
      return new Iterator(function() {
        if (i >= l) return { done: true };
        return { done: false, value: sequence[i++] };
      });
    };
    Iterator.is = function(value) {
      if (value instanceof Iterator) return true;
      return typeof value === "object" && value !== null && typeof value.next === "function";
    };
    module.exports = Iterator;
  }
});

// node_modules/obliterator/support.js
var require_support = __commonJS({
  "node_modules/obliterator/support.js"(exports) {
    exports.ARRAY_BUFFER_SUPPORT = typeof ArrayBuffer !== "undefined";
    exports.SYMBOL_SUPPORT = typeof Symbol !== "undefined";
  }
});

// node_modules/obliterator/iter.js
var require_iter = __commonJS({
  "node_modules/obliterator/iter.js"(exports, module) {
    var Iterator = require_iterator();
    var support = require_support();
    var ARRAY_BUFFER_SUPPORT = support.ARRAY_BUFFER_SUPPORT;
    var SYMBOL_SUPPORT = support.SYMBOL_SUPPORT;
    function iterOrNull(target) {
      if (typeof target === "string" || Array.isArray(target) || ARRAY_BUFFER_SUPPORT && ArrayBuffer.isView(target))
        return Iterator.fromSequence(target);
      if (typeof target !== "object" || target === null) return null;
      if (SYMBOL_SUPPORT && typeof target[Symbol.iterator] === "function")
        return target[Symbol.iterator]();
      if (typeof target.next === "function") return target;
      return null;
    }
    module.exports = function iter(target) {
      var iterator = iterOrNull(target);
      if (!iterator)
        throw new Error(
          "obliterator: target is not iterable nor a valid iterator."
        );
      return iterator;
    };
  }
});

// node_modules/obliterator/take.js
var require_take = __commonJS({
  "node_modules/obliterator/take.js"(exports, module) {
    var iter = require_iter();
    module.exports = function take(iterable, n) {
      var l = arguments.length > 1 ? n : Infinity, array2 = l !== Infinity ? new Array(l) : [], step, i = 0;
      var iterator = iter(iterable);
      while (true) {
        if (i === l) return array2;
        step = iterator.next();
        if (step.done) {
          if (i !== n) array2.length = i;
          return array2;
        }
        array2[i++] = step.value;
      }
    };
  }
});

// node_modules/obliterator/chain.js
var require_chain = __commonJS({
  "node_modules/obliterator/chain.js"(exports, module) {
    var Iterator = require_iterator();
    var iter = require_iter();
    module.exports = function chain() {
      var iterables = arguments;
      var current = null;
      var i = -1;
      return new Iterator(function next() {
        var step = null;
        do {
          if (current === null) {
            i++;
            if (i >= iterables.length) return { done: true };
            current = iter(iterables[i]);
          }
          step = current.next();
          if (step.done === true) {
            current = null;
            continue;
          }
          break;
        } while (true);
        return step;
      });
    };
  }
});

// node_modules/graphology/dist/graphology.cjs.js
var require_graphology_cjs = __commonJS({
  "node_modules/graphology/dist/graphology.cjs.js"(exports, module) {
    "use strict";
    var events = __require("events");
    var Iterator = require_iterator();
    var take = require_take();
    var chain = require_chain();
    function _interopDefaultLegacy(e) {
      return e && typeof e === "object" && "default" in e ? e : { "default": e };
    }
    var Iterator__default = /* @__PURE__ */ _interopDefaultLegacy(Iterator);
    var take__default = /* @__PURE__ */ _interopDefaultLegacy(take);
    var chain__default = /* @__PURE__ */ _interopDefaultLegacy(chain);
    function _typeof(obj) {
      "@babel/helpers - typeof";
      return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(obj2) {
        return typeof obj2;
      } : function(obj2) {
        return obj2 && "function" == typeof Symbol && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
      }, _typeof(obj);
    }
    function _inheritsLoose(subClass, superClass) {
      subClass.prototype = Object.create(superClass.prototype);
      subClass.prototype.constructor = subClass;
      _setPrototypeOf(subClass, superClass);
    }
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2);
      };
      return _getPrototypeOf(o);
    }
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2;
        return o2;
      };
      return _setPrototypeOf(o, p);
    }
    function _isNativeReflectConstruct() {
      if (typeof Reflect === "undefined" || !Reflect.construct) return false;
      if (Reflect.construct.sham) return false;
      if (typeof Proxy === "function") return true;
      try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
        }));
        return true;
      } catch (e) {
        return false;
      }
    }
    function _construct(Parent, args, Class2) {
      if (_isNativeReflectConstruct()) {
        _construct = Reflect.construct.bind();
      } else {
        _construct = function _construct2(Parent2, args2, Class3) {
          var a = [null];
          a.push.apply(a, args2);
          var Constructor = Function.bind.apply(Parent2, a);
          var instance = new Constructor();
          if (Class3) _setPrototypeOf(instance, Class3.prototype);
          return instance;
        };
      }
      return _construct.apply(null, arguments);
    }
    function _isNativeFunction(fn) {
      return Function.toString.call(fn).indexOf("[native code]") !== -1;
    }
    function _wrapNativeSuper(Class2) {
      var _cache = typeof Map === "function" ? /* @__PURE__ */ new Map() : void 0;
      _wrapNativeSuper = function _wrapNativeSuper2(Class3) {
        if (Class3 === null || !_isNativeFunction(Class3)) return Class3;
        if (typeof Class3 !== "function") {
          throw new TypeError("Super expression must either be null or a function");
        }
        if (typeof _cache !== "undefined") {
          if (_cache.has(Class3)) return _cache.get(Class3);
          _cache.set(Class3, Wrapper);
        }
        function Wrapper() {
          return _construct(Class3, arguments, _getPrototypeOf(this).constructor);
        }
        Wrapper.prototype = Object.create(Class3.prototype, {
          constructor: {
            value: Wrapper,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
        return _setPrototypeOf(Wrapper, Class3);
      };
      return _wrapNativeSuper(Class2);
    }
    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return self;
    }
    function assignPolyfill() {
      var target = arguments[0];
      for (var i = 1, l = arguments.length; i < l; i++) {
        if (!arguments[i]) continue;
        for (var k in arguments[i]) {
          target[k] = arguments[i][k];
        }
      }
      return target;
    }
    var assign = assignPolyfill;
    if (typeof Object.assign === "function") assign = Object.assign;
    function getMatchingEdge(graph, source, target, type) {
      var sourceData = graph._nodes.get(source);
      var edge = null;
      if (!sourceData) return edge;
      if (type === "mixed") {
        edge = sourceData.out && sourceData.out[target] || sourceData.undirected && sourceData.undirected[target];
      } else if (type === "directed") {
        edge = sourceData.out && sourceData.out[target];
      } else {
        edge = sourceData.undirected && sourceData.undirected[target];
      }
      return edge;
    }
    function isPlainObject2(value) {
      return _typeof(value) === "object" && value !== null;
    }
    function isEmpty(o) {
      var k;
      for (k in o) {
        return false;
      }
      return true;
    }
    function privateProperty(target, name, value) {
      Object.defineProperty(target, name, {
        enumerable: false,
        configurable: false,
        writable: true,
        value
      });
    }
    function readOnlyProperty(target, name, value) {
      var descriptor = {
        enumerable: true,
        configurable: true
      };
      if (typeof value === "function") {
        descriptor.get = value;
      } else {
        descriptor.value = value;
        descriptor.writable = false;
      }
      Object.defineProperty(target, name, descriptor);
    }
    function validateHints(hints) {
      if (!isPlainObject2(hints)) return false;
      if (hints.attributes && !Array.isArray(hints.attributes)) return false;
      return true;
    }
    function incrementalIdStartingFromRandomByte() {
      var i = Math.floor(Math.random() * 256) & 255;
      return function() {
        return i++;
      };
    }
    var GraphError = /* @__PURE__ */ (function(_Error) {
      _inheritsLoose(GraphError2, _Error);
      function GraphError2(message) {
        var _this;
        _this = _Error.call(this) || this;
        _this.name = "GraphError";
        _this.message = message;
        return _this;
      }
      return GraphError2;
    })(/* @__PURE__ */ _wrapNativeSuper(Error));
    var InvalidArgumentsGraphError = /* @__PURE__ */ (function(_GraphError) {
      _inheritsLoose(InvalidArgumentsGraphError2, _GraphError);
      function InvalidArgumentsGraphError2(message) {
        var _this2;
        _this2 = _GraphError.call(this, message) || this;
        _this2.name = "InvalidArgumentsGraphError";
        if (typeof Error.captureStackTrace === "function") Error.captureStackTrace(_assertThisInitialized(_this2), InvalidArgumentsGraphError2.prototype.constructor);
        return _this2;
      }
      return InvalidArgumentsGraphError2;
    })(GraphError);
    var NotFoundGraphError = /* @__PURE__ */ (function(_GraphError2) {
      _inheritsLoose(NotFoundGraphError2, _GraphError2);
      function NotFoundGraphError2(message) {
        var _this3;
        _this3 = _GraphError2.call(this, message) || this;
        _this3.name = "NotFoundGraphError";
        if (typeof Error.captureStackTrace === "function") Error.captureStackTrace(_assertThisInitialized(_this3), NotFoundGraphError2.prototype.constructor);
        return _this3;
      }
      return NotFoundGraphError2;
    })(GraphError);
    var UsageGraphError = /* @__PURE__ */ (function(_GraphError3) {
      _inheritsLoose(UsageGraphError2, _GraphError3);
      function UsageGraphError2(message) {
        var _this4;
        _this4 = _GraphError3.call(this, message) || this;
        _this4.name = "UsageGraphError";
        if (typeof Error.captureStackTrace === "function") Error.captureStackTrace(_assertThisInitialized(_this4), UsageGraphError2.prototype.constructor);
        return _this4;
      }
      return UsageGraphError2;
    })(GraphError);
    function MixedNodeData(key, attributes) {
      this.key = key;
      this.attributes = attributes;
      this.clear();
    }
    MixedNodeData.prototype.clear = function() {
      this.inDegree = 0;
      this.outDegree = 0;
      this.undirectedDegree = 0;
      this.undirectedLoops = 0;
      this.directedLoops = 0;
      this["in"] = {};
      this.out = {};
      this.undirected = {};
    };
    function DirectedNodeData(key, attributes) {
      this.key = key;
      this.attributes = attributes;
      this.clear();
    }
    DirectedNodeData.prototype.clear = function() {
      this.inDegree = 0;
      this.outDegree = 0;
      this.directedLoops = 0;
      this["in"] = {};
      this.out = {};
    };
    function UndirectedNodeData(key, attributes) {
      this.key = key;
      this.attributes = attributes;
      this.clear();
    }
    UndirectedNodeData.prototype.clear = function() {
      this.undirectedDegree = 0;
      this.undirectedLoops = 0;
      this.undirected = {};
    };
    function EdgeData(undirected, key, source, target, attributes) {
      this.key = key;
      this.attributes = attributes;
      this.undirected = undirected;
      this.source = source;
      this.target = target;
    }
    EdgeData.prototype.attach = function() {
      var outKey = "out";
      var inKey = "in";
      if (this.undirected) outKey = inKey = "undirected";
      var source = this.source.key;
      var target = this.target.key;
      this.source[outKey][target] = this;
      if (this.undirected && source === target) return;
      this.target[inKey][source] = this;
    };
    EdgeData.prototype.attachMulti = function() {
      var outKey = "out";
      var inKey = "in";
      var source = this.source.key;
      var target = this.target.key;
      if (this.undirected) outKey = inKey = "undirected";
      var adj = this.source[outKey];
      var head = adj[target];
      if (typeof head === "undefined") {
        adj[target] = this;
        if (!(this.undirected && source === target)) {
          this.target[inKey][source] = this;
        }
        return;
      }
      head.previous = this;
      this.next = head;
      adj[target] = this;
      this.target[inKey][source] = this;
    };
    EdgeData.prototype.detach = function() {
      var source = this.source.key;
      var target = this.target.key;
      var outKey = "out";
      var inKey = "in";
      if (this.undirected) outKey = inKey = "undirected";
      delete this.source[outKey][target];
      delete this.target[inKey][source];
    };
    EdgeData.prototype.detachMulti = function() {
      var source = this.source.key;
      var target = this.target.key;
      var outKey = "out";
      var inKey = "in";
      if (this.undirected) outKey = inKey = "undirected";
      if (this.previous === void 0) {
        if (this.next === void 0) {
          delete this.source[outKey][target];
          delete this.target[inKey][source];
        } else {
          this.next.previous = void 0;
          this.source[outKey][target] = this.next;
          this.target[inKey][source] = this.next;
        }
      } else {
        this.previous.next = this.next;
        if (this.next !== void 0) {
          this.next.previous = this.previous;
        }
      }
    };
    var NODE = 0;
    var SOURCE = 1;
    var TARGET = 2;
    var OPPOSITE = 3;
    function findRelevantNodeData(graph, method, mode, nodeOrEdge, nameOrEdge, add1, add2) {
      var nodeData, edgeData, arg1, arg2;
      nodeOrEdge = "" + nodeOrEdge;
      if (mode === NODE) {
        nodeData = graph._nodes.get(nodeOrEdge);
        if (!nodeData) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(nodeOrEdge, '" node in the graph.'));
        arg1 = nameOrEdge;
        arg2 = add1;
      } else if (mode === OPPOSITE) {
        nameOrEdge = "" + nameOrEdge;
        edgeData = graph._edges.get(nameOrEdge);
        if (!edgeData) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(nameOrEdge, '" edge in the graph.'));
        var source = edgeData.source.key;
        var target = edgeData.target.key;
        if (nodeOrEdge === source) {
          nodeData = edgeData.target;
        } else if (nodeOrEdge === target) {
          nodeData = edgeData.source;
        } else {
          throw new NotFoundGraphError("Graph.".concat(method, ': the "').concat(nodeOrEdge, '" node is not attached to the "').concat(nameOrEdge, '" edge (').concat(source, ", ").concat(target, ")."));
        }
        arg1 = add1;
        arg2 = add2;
      } else {
        edgeData = graph._edges.get(nodeOrEdge);
        if (!edgeData) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(nodeOrEdge, '" edge in the graph.'));
        if (mode === SOURCE) {
          nodeData = edgeData.source;
        } else {
          nodeData = edgeData.target;
        }
        arg1 = nameOrEdge;
        arg2 = add1;
      }
      return [nodeData, arg1, arg2];
    }
    function attachNodeAttributeGetter(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData[0], name = _findRelevantNodeData[1];
        return data.attributes[name];
      };
    }
    function attachNodeAttributesGetter(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge) {
        var _findRelevantNodeData2 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge), data = _findRelevantNodeData2[0];
        return data.attributes;
      };
    }
    function attachNodeAttributeChecker(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData3 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData3[0], name = _findRelevantNodeData3[1];
        return data.attributes.hasOwnProperty(name);
      };
    }
    function attachNodeAttributeSetter(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1, add2) {
        var _findRelevantNodeData4 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1, add2), data = _findRelevantNodeData4[0], name = _findRelevantNodeData4[1], value = _findRelevantNodeData4[2];
        data.attributes[name] = value;
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "set",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachNodeAttributeUpdater(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1, add2) {
        var _findRelevantNodeData5 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1, add2), data = _findRelevantNodeData5[0], name = _findRelevantNodeData5[1], updater = _findRelevantNodeData5[2];
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.".concat(method, ": updater should be a function."));
        var attributes = data.attributes;
        var value = updater(attributes[name]);
        attributes[name] = value;
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "set",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachNodeAttributeRemover(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData6 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData6[0], name = _findRelevantNodeData6[1];
        delete data.attributes[name];
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "remove",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachNodeAttributesReplacer(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData7 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData7[0], attributes = _findRelevantNodeData7[1];
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided attributes are not a plain object."));
        data.attributes = attributes;
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "replace",
          attributes: data.attributes
        });
        return this;
      };
    }
    function attachNodeAttributesMerger(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData8 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData8[0], attributes = _findRelevantNodeData8[1];
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided attributes are not a plain object."));
        assign(data.attributes, attributes);
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "merge",
          attributes: data.attributes,
          data: attributes
        });
        return this;
      };
    }
    function attachNodeAttributesUpdater(Class2, method, mode) {
      Class2.prototype[method] = function(nodeOrEdge, nameOrEdge, add1) {
        var _findRelevantNodeData9 = findRelevantNodeData(this, method, mode, nodeOrEdge, nameOrEdge, add1), data = _findRelevantNodeData9[0], updater = _findRelevantNodeData9[1];
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided updater is not a function."));
        data.attributes = updater(data.attributes);
        this.emit("nodeAttributesUpdated", {
          key: data.key,
          type: "update",
          attributes: data.attributes
        });
        return this;
      };
    }
    var NODE_ATTRIBUTES_METHODS = [{
      name: function name(element) {
        return "get".concat(element, "Attribute");
      },
      attacher: attachNodeAttributeGetter
    }, {
      name: function name(element) {
        return "get".concat(element, "Attributes");
      },
      attacher: attachNodeAttributesGetter
    }, {
      name: function name(element) {
        return "has".concat(element, "Attribute");
      },
      attacher: attachNodeAttributeChecker
    }, {
      name: function name(element) {
        return "set".concat(element, "Attribute");
      },
      attacher: attachNodeAttributeSetter
    }, {
      name: function name(element) {
        return "update".concat(element, "Attribute");
      },
      attacher: attachNodeAttributeUpdater
    }, {
      name: function name(element) {
        return "remove".concat(element, "Attribute");
      },
      attacher: attachNodeAttributeRemover
    }, {
      name: function name(element) {
        return "replace".concat(element, "Attributes");
      },
      attacher: attachNodeAttributesReplacer
    }, {
      name: function name(element) {
        return "merge".concat(element, "Attributes");
      },
      attacher: attachNodeAttributesMerger
    }, {
      name: function name(element) {
        return "update".concat(element, "Attributes");
      },
      attacher: attachNodeAttributesUpdater
    }];
    function attachNodeAttributesMethods(Graph3) {
      NODE_ATTRIBUTES_METHODS.forEach(function(_ref) {
        var name = _ref.name, attacher = _ref.attacher;
        attacher(Graph3, name("Node"), NODE);
        attacher(Graph3, name("Source"), SOURCE);
        attacher(Graph3, name("Target"), TARGET);
        attacher(Graph3, name("Opposite"), OPPOSITE);
      });
    }
    function attachEdgeAttributeGetter(Class2, method, type) {
      Class2.prototype[method] = function(element, name) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element;
          var target = "" + name;
          name = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        return data.attributes[name];
      };
    }
    function attachEdgeAttributesGetter(Class2, method, type) {
      Class2.prototype[method] = function(element) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 1) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element, target = "" + arguments[1];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        return data.attributes;
      };
    }
    function attachEdgeAttributeChecker(Class2, method, type) {
      Class2.prototype[method] = function(element, name) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element;
          var target = "" + name;
          name = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        return data.attributes.hasOwnProperty(name);
      };
    }
    function attachEdgeAttributeSetter(Class2, method, type) {
      Class2.prototype[method] = function(element, name, value) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 3) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element;
          var target = "" + name;
          name = arguments[2];
          value = arguments[3];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        data.attributes[name] = value;
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "set",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachEdgeAttributeUpdater(Class2, method, type) {
      Class2.prototype[method] = function(element, name, updater) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 3) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element;
          var target = "" + name;
          name = arguments[2];
          updater = arguments[3];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.".concat(method, ": updater should be a function."));
        data.attributes[name] = updater(data.attributes[name]);
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "set",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachEdgeAttributeRemover(Class2, method, type) {
      Class2.prototype[method] = function(element, name) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element;
          var target = "" + name;
          name = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        delete data.attributes[name];
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "remove",
          attributes: data.attributes,
          name
        });
        return this;
      };
    }
    function attachEdgeAttributesReplacer(Class2, method, type) {
      Class2.prototype[method] = function(element, attributes) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element, target = "" + attributes;
          attributes = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided attributes are not a plain object."));
        data.attributes = attributes;
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "replace",
          attributes: data.attributes
        });
        return this;
      };
    }
    function attachEdgeAttributesMerger(Class2, method, type) {
      Class2.prototype[method] = function(element, attributes) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element, target = "" + attributes;
          attributes = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided attributes are not a plain object."));
        assign(data.attributes, attributes);
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "merge",
          attributes: data.attributes,
          data: attributes
        });
        return this;
      };
    }
    function attachEdgeAttributesUpdater(Class2, method, type) {
      Class2.prototype[method] = function(element, updater) {
        var data;
        if (this.type !== "mixed" && type !== "mixed" && type !== this.type) throw new UsageGraphError("Graph.".concat(method, ": cannot find this type of edges in your ").concat(this.type, " graph."));
        if (arguments.length > 2) {
          if (this.multi) throw new UsageGraphError("Graph.".concat(method, ": cannot use a {source,target} combo when asking about an edge's attributes in a MultiGraph since we cannot infer the one you want information about."));
          var source = "" + element, target = "" + updater;
          updater = arguments[2];
          data = getMatchingEdge(this, source, target, type);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find an edge for the given path ("').concat(source, '" - "').concat(target, '").'));
        } else {
          if (type !== "mixed") throw new UsageGraphError("Graph.".concat(method, ": calling this method with only a key (vs. a source and target) does not make sense since an edge with this key could have the other type."));
          element = "" + element;
          data = this._edges.get(element);
          if (!data) throw new NotFoundGraphError("Graph.".concat(method, ': could not find the "').concat(element, '" edge in the graph.'));
        }
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.".concat(method, ": provided updater is not a function."));
        data.attributes = updater(data.attributes);
        this.emit("edgeAttributesUpdated", {
          key: data.key,
          type: "update",
          attributes: data.attributes
        });
        return this;
      };
    }
    var EDGE_ATTRIBUTES_METHODS = [{
      name: function name(element) {
        return "get".concat(element, "Attribute");
      },
      attacher: attachEdgeAttributeGetter
    }, {
      name: function name(element) {
        return "get".concat(element, "Attributes");
      },
      attacher: attachEdgeAttributesGetter
    }, {
      name: function name(element) {
        return "has".concat(element, "Attribute");
      },
      attacher: attachEdgeAttributeChecker
    }, {
      name: function name(element) {
        return "set".concat(element, "Attribute");
      },
      attacher: attachEdgeAttributeSetter
    }, {
      name: function name(element) {
        return "update".concat(element, "Attribute");
      },
      attacher: attachEdgeAttributeUpdater
    }, {
      name: function name(element) {
        return "remove".concat(element, "Attribute");
      },
      attacher: attachEdgeAttributeRemover
    }, {
      name: function name(element) {
        return "replace".concat(element, "Attributes");
      },
      attacher: attachEdgeAttributesReplacer
    }, {
      name: function name(element) {
        return "merge".concat(element, "Attributes");
      },
      attacher: attachEdgeAttributesMerger
    }, {
      name: function name(element) {
        return "update".concat(element, "Attributes");
      },
      attacher: attachEdgeAttributesUpdater
    }];
    function attachEdgeAttributesMethods(Graph3) {
      EDGE_ATTRIBUTES_METHODS.forEach(function(_ref) {
        var name = _ref.name, attacher = _ref.attacher;
        attacher(Graph3, name("Edge"), "mixed");
        attacher(Graph3, name("DirectedEdge"), "directed");
        attacher(Graph3, name("UndirectedEdge"), "undirected");
      });
    }
    var EDGES_ITERATION = [{
      name: "edges",
      type: "mixed"
    }, {
      name: "inEdges",
      type: "directed",
      direction: "in"
    }, {
      name: "outEdges",
      type: "directed",
      direction: "out"
    }, {
      name: "inboundEdges",
      type: "mixed",
      direction: "in"
    }, {
      name: "outboundEdges",
      type: "mixed",
      direction: "out"
    }, {
      name: "directedEdges",
      type: "directed"
    }, {
      name: "undirectedEdges",
      type: "undirected"
    }];
    function forEachSimple(breakable, object2, callback, avoid) {
      var shouldBreak = false;
      for (var k in object2) {
        if (k === avoid) continue;
        var edgeData = object2[k];
        shouldBreak = callback(edgeData.key, edgeData.attributes, edgeData.source.key, edgeData.target.key, edgeData.source.attributes, edgeData.target.attributes, edgeData.undirected);
        if (breakable && shouldBreak) return edgeData.key;
      }
      return;
    }
    function forEachMulti(breakable, object2, callback, avoid) {
      var edgeData, source, target;
      var shouldBreak = false;
      for (var k in object2) {
        if (k === avoid) continue;
        edgeData = object2[k];
        do {
          source = edgeData.source;
          target = edgeData.target;
          shouldBreak = callback(edgeData.key, edgeData.attributes, source.key, target.key, source.attributes, target.attributes, edgeData.undirected);
          if (breakable && shouldBreak) return edgeData.key;
          edgeData = edgeData.next;
        } while (edgeData !== void 0);
      }
      return;
    }
    function createIterator(object2, avoid) {
      var keys = Object.keys(object2);
      var l = keys.length;
      var edgeData;
      var i = 0;
      return new Iterator__default["default"](function next() {
        do {
          if (!edgeData) {
            if (i >= l) return {
              done: true
            };
            var k = keys[i++];
            if (k === avoid) {
              edgeData = void 0;
              continue;
            }
            edgeData = object2[k];
          } else {
            edgeData = edgeData.next;
          }
        } while (!edgeData);
        return {
          done: false,
          value: {
            edge: edgeData.key,
            attributes: edgeData.attributes,
            source: edgeData.source.key,
            target: edgeData.target.key,
            sourceAttributes: edgeData.source.attributes,
            targetAttributes: edgeData.target.attributes,
            undirected: edgeData.undirected
          }
        };
      });
    }
    function forEachForKeySimple(breakable, object2, k, callback) {
      var edgeData = object2[k];
      if (!edgeData) return;
      var sourceData = edgeData.source;
      var targetData = edgeData.target;
      if (callback(edgeData.key, edgeData.attributes, sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.undirected) && breakable) return edgeData.key;
    }
    function forEachForKeyMulti(breakable, object2, k, callback) {
      var edgeData = object2[k];
      if (!edgeData) return;
      var shouldBreak = false;
      do {
        shouldBreak = callback(edgeData.key, edgeData.attributes, edgeData.source.key, edgeData.target.key, edgeData.source.attributes, edgeData.target.attributes, edgeData.undirected);
        if (breakable && shouldBreak) return edgeData.key;
        edgeData = edgeData.next;
      } while (edgeData !== void 0);
      return;
    }
    function createIteratorForKey(object2, k) {
      var edgeData = object2[k];
      if (edgeData.next !== void 0) {
        return new Iterator__default["default"](function() {
          if (!edgeData) return {
            done: true
          };
          var value = {
            edge: edgeData.key,
            attributes: edgeData.attributes,
            source: edgeData.source.key,
            target: edgeData.target.key,
            sourceAttributes: edgeData.source.attributes,
            targetAttributes: edgeData.target.attributes,
            undirected: edgeData.undirected
          };
          edgeData = edgeData.next;
          return {
            done: false,
            value
          };
        });
      }
      return Iterator__default["default"].of({
        edge: edgeData.key,
        attributes: edgeData.attributes,
        source: edgeData.source.key,
        target: edgeData.target.key,
        sourceAttributes: edgeData.source.attributes,
        targetAttributes: edgeData.target.attributes,
        undirected: edgeData.undirected
      });
    }
    function createEdgeArray(graph, type) {
      if (graph.size === 0) return [];
      if (type === "mixed" || type === graph.type) {
        if (typeof Array.from === "function") return Array.from(graph._edges.keys());
        return take__default["default"](graph._edges.keys(), graph._edges.size);
      }
      var size = type === "undirected" ? graph.undirectedSize : graph.directedSize;
      var list = new Array(size), mask = type === "undirected";
      var iterator = graph._edges.values();
      var i = 0;
      var step, data;
      while (step = iterator.next(), step.done !== true) {
        data = step.value;
        if (data.undirected === mask) list[i++] = data.key;
      }
      return list;
    }
    function forEachEdge(breakable, graph, type, callback) {
      if (graph.size === 0) return;
      var shouldFilter = type !== "mixed" && type !== graph.type;
      var mask = type === "undirected";
      var step, data;
      var shouldBreak = false;
      var iterator = graph._edges.values();
      while (step = iterator.next(), step.done !== true) {
        data = step.value;
        if (shouldFilter && data.undirected !== mask) continue;
        var _data = data, key = _data.key, attributes = _data.attributes, source = _data.source, target = _data.target;
        shouldBreak = callback(key, attributes, source.key, target.key, source.attributes, target.attributes, data.undirected);
        if (breakable && shouldBreak) return key;
      }
      return;
    }
    function createEdgeIterator(graph, type) {
      if (graph.size === 0) return Iterator__default["default"].empty();
      var shouldFilter = type !== "mixed" && type !== graph.type;
      var mask = type === "undirected";
      var iterator = graph._edges.values();
      return new Iterator__default["default"](function next() {
        var step, data;
        while (true) {
          step = iterator.next();
          if (step.done) return step;
          data = step.value;
          if (shouldFilter && data.undirected !== mask) continue;
          break;
        }
        var value = {
          edge: data.key,
          attributes: data.attributes,
          source: data.source.key,
          target: data.target.key,
          sourceAttributes: data.source.attributes,
          targetAttributes: data.target.attributes,
          undirected: data.undirected
        };
        return {
          value,
          done: false
        };
      });
    }
    function forEachEdgeForNode(breakable, multi, type, direction, nodeData, callback) {
      var fn = multi ? forEachMulti : forEachSimple;
      var found;
      if (type !== "undirected") {
        if (direction !== "out") {
          found = fn(breakable, nodeData["in"], callback);
          if (breakable && found) return found;
        }
        if (direction !== "in") {
          found = fn(breakable, nodeData.out, callback, !direction ? nodeData.key : void 0);
          if (breakable && found) return found;
        }
      }
      if (type !== "directed") {
        found = fn(breakable, nodeData.undirected, callback);
        if (breakable && found) return found;
      }
      return;
    }
    function createEdgeArrayForNode(multi, type, direction, nodeData) {
      var edges = [];
      forEachEdgeForNode(false, multi, type, direction, nodeData, function(key) {
        edges.push(key);
      });
      return edges;
    }
    function createEdgeIteratorForNode(type, direction, nodeData) {
      var iterator = Iterator__default["default"].empty();
      if (type !== "undirected") {
        if (direction !== "out" && typeof nodeData["in"] !== "undefined") iterator = chain__default["default"](iterator, createIterator(nodeData["in"]));
        if (direction !== "in" && typeof nodeData.out !== "undefined") iterator = chain__default["default"](iterator, createIterator(nodeData.out, !direction ? nodeData.key : void 0));
      }
      if (type !== "directed" && typeof nodeData.undirected !== "undefined") {
        iterator = chain__default["default"](iterator, createIterator(nodeData.undirected));
      }
      return iterator;
    }
    function forEachEdgeForPath(breakable, type, multi, direction, sourceData, target, callback) {
      var fn = multi ? forEachForKeyMulti : forEachForKeySimple;
      var found;
      if (type !== "undirected") {
        if (typeof sourceData["in"] !== "undefined" && direction !== "out") {
          found = fn(breakable, sourceData["in"], target, callback);
          if (breakable && found) return found;
        }
        if (typeof sourceData.out !== "undefined" && direction !== "in" && (direction || sourceData.key !== target)) {
          found = fn(breakable, sourceData.out, target, callback);
          if (breakable && found) return found;
        }
      }
      if (type !== "directed") {
        if (typeof sourceData.undirected !== "undefined") {
          found = fn(breakable, sourceData.undirected, target, callback);
          if (breakable && found) return found;
        }
      }
      return;
    }
    function createEdgeArrayForPath(type, multi, direction, sourceData, target) {
      var edges = [];
      forEachEdgeForPath(false, type, multi, direction, sourceData, target, function(key) {
        edges.push(key);
      });
      return edges;
    }
    function createEdgeIteratorForPath(type, direction, sourceData, target) {
      var iterator = Iterator__default["default"].empty();
      if (type !== "undirected") {
        if (typeof sourceData["in"] !== "undefined" && direction !== "out" && target in sourceData["in"]) iterator = chain__default["default"](iterator, createIteratorForKey(sourceData["in"], target));
        if (typeof sourceData.out !== "undefined" && direction !== "in" && target in sourceData.out && (direction || sourceData.key !== target)) iterator = chain__default["default"](iterator, createIteratorForKey(sourceData.out, target));
      }
      if (type !== "directed") {
        if (typeof sourceData.undirected !== "undefined" && target in sourceData.undirected) iterator = chain__default["default"](iterator, createIteratorForKey(sourceData.undirected, target));
      }
      return iterator;
    }
    function attachEdgeArrayCreator(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      Class2.prototype[name] = function(source, target) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return [];
        if (!arguments.length) return createEdgeArray(this, type);
        if (arguments.length === 1) {
          source = "" + source;
          var nodeData = this._nodes.get(source);
          if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(name, ': could not find the "').concat(source, '" node in the graph.'));
          return createEdgeArrayForNode(this.multi, type === "mixed" ? this.type : type, direction, nodeData);
        }
        if (arguments.length === 2) {
          source = "" + source;
          target = "" + target;
          var sourceData = this._nodes.get(source);
          if (!sourceData) throw new NotFoundGraphError("Graph.".concat(name, ':  could not find the "').concat(source, '" source node in the graph.'));
          if (!this._nodes.has(target)) throw new NotFoundGraphError("Graph.".concat(name, ':  could not find the "').concat(target, '" target node in the graph.'));
          return createEdgeArrayForPath(type, this.multi, direction, sourceData, target);
        }
        throw new InvalidArgumentsGraphError("Graph.".concat(name, ": too many arguments (expecting 0, 1 or 2 and got ").concat(arguments.length, ")."));
      };
    }
    function attachForEachEdge(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      var forEachName = "forEach" + name[0].toUpperCase() + name.slice(1, -1);
      Class2.prototype[forEachName] = function(source, target, callback) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return;
        if (arguments.length === 1) {
          callback = source;
          return forEachEdge(false, this, type, callback);
        }
        if (arguments.length === 2) {
          source = "" + source;
          callback = target;
          var nodeData = this._nodes.get(source);
          if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(forEachName, ': could not find the "').concat(source, '" node in the graph.'));
          return forEachEdgeForNode(false, this.multi, type === "mixed" ? this.type : type, direction, nodeData, callback);
        }
        if (arguments.length === 3) {
          source = "" + source;
          target = "" + target;
          var sourceData = this._nodes.get(source);
          if (!sourceData) throw new NotFoundGraphError("Graph.".concat(forEachName, ':  could not find the "').concat(source, '" source node in the graph.'));
          if (!this._nodes.has(target)) throw new NotFoundGraphError("Graph.".concat(forEachName, ':  could not find the "').concat(target, '" target node in the graph.'));
          return forEachEdgeForPath(false, type, this.multi, direction, sourceData, target, callback);
        }
        throw new InvalidArgumentsGraphError("Graph.".concat(forEachName, ": too many arguments (expecting 1, 2 or 3 and got ").concat(arguments.length, ")."));
      };
      var mapName = "map" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[mapName] = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        var result;
        if (args.length === 0) {
          var length = 0;
          if (type !== "directed") length += this.undirectedSize;
          if (type !== "undirected") length += this.directedSize;
          result = new Array(length);
          var i = 0;
          args.push(function(e, ea, s, t, sa, ta, u) {
            result[i++] = callback(e, ea, s, t, sa, ta, u);
          });
        } else {
          result = [];
          args.push(function(e, ea, s, t, sa, ta, u) {
            result.push(callback(e, ea, s, t, sa, ta, u));
          });
        }
        this[forEachName].apply(this, args);
        return result;
      };
      var filterName = "filter" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[filterName] = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        var result = [];
        args.push(function(e, ea, s, t, sa, ta, u) {
          if (callback(e, ea, s, t, sa, ta, u)) result.push(e);
        });
        this[forEachName].apply(this, args);
        return result;
      };
      var reduceName = "reduce" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[reduceName] = function() {
        var args = Array.prototype.slice.call(arguments);
        if (args.length < 2 || args.length > 4) {
          throw new InvalidArgumentsGraphError("Graph.".concat(reduceName, ": invalid number of arguments (expecting 2, 3 or 4 and got ").concat(args.length, ")."));
        }
        if (typeof args[args.length - 1] === "function" && typeof args[args.length - 2] !== "function") {
          throw new InvalidArgumentsGraphError("Graph.".concat(reduceName, ": missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array."));
        }
        var callback;
        var initialValue;
        if (args.length === 2) {
          callback = args[0];
          initialValue = args[1];
          args = [];
        } else if (args.length === 3) {
          callback = args[1];
          initialValue = args[2];
          args = [args[0]];
        } else if (args.length === 4) {
          callback = args[2];
          initialValue = args[3];
          args = [args[0], args[1]];
        }
        var accumulator = initialValue;
        args.push(function(e, ea, s, t, sa, ta, u) {
          accumulator = callback(accumulator, e, ea, s, t, sa, ta, u);
        });
        this[forEachName].apply(this, args);
        return accumulator;
      };
    }
    function attachFindEdge(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      var findEdgeName = "find" + name[0].toUpperCase() + name.slice(1, -1);
      Class2.prototype[findEdgeName] = function(source, target, callback) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return false;
        if (arguments.length === 1) {
          callback = source;
          return forEachEdge(true, this, type, callback);
        }
        if (arguments.length === 2) {
          source = "" + source;
          callback = target;
          var nodeData = this._nodes.get(source);
          if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(findEdgeName, ': could not find the "').concat(source, '" node in the graph.'));
          return forEachEdgeForNode(true, this.multi, type === "mixed" ? this.type : type, direction, nodeData, callback);
        }
        if (arguments.length === 3) {
          source = "" + source;
          target = "" + target;
          var sourceData = this._nodes.get(source);
          if (!sourceData) throw new NotFoundGraphError("Graph.".concat(findEdgeName, ':  could not find the "').concat(source, '" source node in the graph.'));
          if (!this._nodes.has(target)) throw new NotFoundGraphError("Graph.".concat(findEdgeName, ':  could not find the "').concat(target, '" target node in the graph.'));
          return forEachEdgeForPath(true, type, this.multi, direction, sourceData, target, callback);
        }
        throw new InvalidArgumentsGraphError("Graph.".concat(findEdgeName, ": too many arguments (expecting 1, 2 or 3 and got ").concat(arguments.length, ")."));
      };
      var someName = "some" + name[0].toUpperCase() + name.slice(1, -1);
      Class2.prototype[someName] = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        args.push(function(e, ea, s, t, sa, ta, u) {
          return callback(e, ea, s, t, sa, ta, u);
        });
        var found = this[findEdgeName].apply(this, args);
        if (found) return true;
        return false;
      };
      var everyName = "every" + name[0].toUpperCase() + name.slice(1, -1);
      Class2.prototype[everyName] = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        args.push(function(e, ea, s, t, sa, ta, u) {
          return !callback(e, ea, s, t, sa, ta, u);
        });
        var found = this[findEdgeName].apply(this, args);
        if (found) return false;
        return true;
      };
    }
    function attachEdgeIteratorCreator(Class2, description) {
      var originalName = description.name, type = description.type, direction = description.direction;
      var name = originalName.slice(0, -1) + "Entries";
      Class2.prototype[name] = function(source, target) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return Iterator__default["default"].empty();
        if (!arguments.length) return createEdgeIterator(this, type);
        if (arguments.length === 1) {
          source = "" + source;
          var sourceData = this._nodes.get(source);
          if (!sourceData) throw new NotFoundGraphError("Graph.".concat(name, ': could not find the "').concat(source, '" node in the graph.'));
          return createEdgeIteratorForNode(type, direction, sourceData);
        }
        if (arguments.length === 2) {
          source = "" + source;
          target = "" + target;
          var _sourceData = this._nodes.get(source);
          if (!_sourceData) throw new NotFoundGraphError("Graph.".concat(name, ':  could not find the "').concat(source, '" source node in the graph.'));
          if (!this._nodes.has(target)) throw new NotFoundGraphError("Graph.".concat(name, ':  could not find the "').concat(target, '" target node in the graph.'));
          return createEdgeIteratorForPath(type, direction, _sourceData, target);
        }
        throw new InvalidArgumentsGraphError("Graph.".concat(name, ": too many arguments (expecting 0, 1 or 2 and got ").concat(arguments.length, ")."));
      };
    }
    function attachEdgeIterationMethods(Graph3) {
      EDGES_ITERATION.forEach(function(description) {
        attachEdgeArrayCreator(Graph3, description);
        attachForEachEdge(Graph3, description);
        attachFindEdge(Graph3, description);
        attachEdgeIteratorCreator(Graph3, description);
      });
    }
    var NEIGHBORS_ITERATION = [{
      name: "neighbors",
      type: "mixed"
    }, {
      name: "inNeighbors",
      type: "directed",
      direction: "in"
    }, {
      name: "outNeighbors",
      type: "directed",
      direction: "out"
    }, {
      name: "inboundNeighbors",
      type: "mixed",
      direction: "in"
    }, {
      name: "outboundNeighbors",
      type: "mixed",
      direction: "out"
    }, {
      name: "directedNeighbors",
      type: "directed"
    }, {
      name: "undirectedNeighbors",
      type: "undirected"
    }];
    function CompositeSetWrapper() {
      this.A = null;
      this.B = null;
    }
    CompositeSetWrapper.prototype.wrap = function(set2) {
      if (this.A === null) this.A = set2;
      else if (this.B === null) this.B = set2;
    };
    CompositeSetWrapper.prototype.has = function(key) {
      if (this.A !== null && key in this.A) return true;
      if (this.B !== null && key in this.B) return true;
      return false;
    };
    function forEachInObjectOnce(breakable, visited, nodeData, object2, callback) {
      for (var k in object2) {
        var edgeData = object2[k];
        var sourceData = edgeData.source;
        var targetData = edgeData.target;
        var neighborData = sourceData === nodeData ? targetData : sourceData;
        if (visited && visited.has(neighborData.key)) continue;
        var shouldBreak = callback(neighborData.key, neighborData.attributes);
        if (breakable && shouldBreak) return neighborData.key;
      }
      return;
    }
    function forEachNeighbor(breakable, type, direction, nodeData, callback) {
      if (type !== "mixed") {
        if (type === "undirected") return forEachInObjectOnce(breakable, null, nodeData, nodeData.undirected, callback);
        if (typeof direction === "string") return forEachInObjectOnce(breakable, null, nodeData, nodeData[direction], callback);
      }
      var visited = new CompositeSetWrapper();
      var found;
      if (type !== "undirected") {
        if (direction !== "out") {
          found = forEachInObjectOnce(breakable, null, nodeData, nodeData["in"], callback);
          if (breakable && found) return found;
          visited.wrap(nodeData["in"]);
        }
        if (direction !== "in") {
          found = forEachInObjectOnce(breakable, visited, nodeData, nodeData.out, callback);
          if (breakable && found) return found;
          visited.wrap(nodeData.out);
        }
      }
      if (type !== "directed") {
        found = forEachInObjectOnce(breakable, visited, nodeData, nodeData.undirected, callback);
        if (breakable && found) return found;
      }
      return;
    }
    function createNeighborArrayForNode(type, direction, nodeData) {
      if (type !== "mixed") {
        if (type === "undirected") return Object.keys(nodeData.undirected);
        if (typeof direction === "string") return Object.keys(nodeData[direction]);
      }
      var neighbors = [];
      forEachNeighbor(false, type, direction, nodeData, function(key) {
        neighbors.push(key);
      });
      return neighbors;
    }
    function createDedupedObjectIterator(visited, nodeData, object2) {
      var keys = Object.keys(object2);
      var l = keys.length;
      var i = 0;
      return new Iterator__default["default"](function next() {
        var neighborData = null;
        do {
          if (i >= l) {
            if (visited) visited.wrap(object2);
            return {
              done: true
            };
          }
          var edgeData = object2[keys[i++]];
          var sourceData = edgeData.source;
          var targetData = edgeData.target;
          neighborData = sourceData === nodeData ? targetData : sourceData;
          if (visited && visited.has(neighborData.key)) {
            neighborData = null;
            continue;
          }
        } while (neighborData === null);
        return {
          done: false,
          value: {
            neighbor: neighborData.key,
            attributes: neighborData.attributes
          }
        };
      });
    }
    function createNeighborIterator(type, direction, nodeData) {
      if (type !== "mixed") {
        if (type === "undirected") return createDedupedObjectIterator(null, nodeData, nodeData.undirected);
        if (typeof direction === "string") return createDedupedObjectIterator(null, nodeData, nodeData[direction]);
      }
      var iterator = Iterator__default["default"].empty();
      var visited = new CompositeSetWrapper();
      if (type !== "undirected") {
        if (direction !== "out") {
          iterator = chain__default["default"](iterator, createDedupedObjectIterator(visited, nodeData, nodeData["in"]));
        }
        if (direction !== "in") {
          iterator = chain__default["default"](iterator, createDedupedObjectIterator(visited, nodeData, nodeData.out));
        }
      }
      if (type !== "directed") {
        iterator = chain__default["default"](iterator, createDedupedObjectIterator(visited, nodeData, nodeData.undirected));
      }
      return iterator;
    }
    function attachNeighborArrayCreator(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      Class2.prototype[name] = function(node) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return [];
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(name, ': could not find the "').concat(node, '" node in the graph.'));
        return createNeighborArrayForNode(type === "mixed" ? this.type : type, direction, nodeData);
      };
    }
    function attachForEachNeighbor(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      var forEachName = "forEach" + name[0].toUpperCase() + name.slice(1, -1);
      Class2.prototype[forEachName] = function(node, callback) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return;
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(forEachName, ': could not find the "').concat(node, '" node in the graph.'));
        forEachNeighbor(false, type === "mixed" ? this.type : type, direction, nodeData, callback);
      };
      var mapName = "map" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[mapName] = function(node, callback) {
        var result = [];
        this[forEachName](node, function(n, a) {
          result.push(callback(n, a));
        });
        return result;
      };
      var filterName = "filter" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[filterName] = function(node, callback) {
        var result = [];
        this[forEachName](node, function(n, a) {
          if (callback(n, a)) result.push(n);
        });
        return result;
      };
      var reduceName = "reduce" + name[0].toUpperCase() + name.slice(1);
      Class2.prototype[reduceName] = function(node, callback, initialValue) {
        if (arguments.length < 3) throw new InvalidArgumentsGraphError("Graph.".concat(reduceName, ": missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array."));
        var accumulator = initialValue;
        this[forEachName](node, function(n, a) {
          accumulator = callback(accumulator, n, a);
        });
        return accumulator;
      };
    }
    function attachFindNeighbor(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      var capitalizedSingular = name[0].toUpperCase() + name.slice(1, -1);
      var findName = "find" + capitalizedSingular;
      Class2.prototype[findName] = function(node, callback) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return;
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(findName, ': could not find the "').concat(node, '" node in the graph.'));
        return forEachNeighbor(true, type === "mixed" ? this.type : type, direction, nodeData, callback);
      };
      var someName = "some" + capitalizedSingular;
      Class2.prototype[someName] = function(node, callback) {
        var found = this[findName](node, callback);
        if (found) return true;
        return false;
      };
      var everyName = "every" + capitalizedSingular;
      Class2.prototype[everyName] = function(node, callback) {
        var found = this[findName](node, function(n, a) {
          return !callback(n, a);
        });
        if (found) return false;
        return true;
      };
    }
    function attachNeighborIteratorCreator(Class2, description) {
      var name = description.name, type = description.type, direction = description.direction;
      var iteratorName = name.slice(0, -1) + "Entries";
      Class2.prototype[iteratorName] = function(node) {
        if (type !== "mixed" && this.type !== "mixed" && type !== this.type) return Iterator__default["default"].empty();
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (typeof nodeData === "undefined") throw new NotFoundGraphError("Graph.".concat(iteratorName, ': could not find the "').concat(node, '" node in the graph.'));
        return createNeighborIterator(type === "mixed" ? this.type : type, direction, nodeData);
      };
    }
    function attachNeighborIterationMethods(Graph3) {
      NEIGHBORS_ITERATION.forEach(function(description) {
        attachNeighborArrayCreator(Graph3, description);
        attachForEachNeighbor(Graph3, description);
        attachFindNeighbor(Graph3, description);
        attachNeighborIteratorCreator(Graph3, description);
      });
    }
    function forEachAdjacency(breakable, assymetric, disconnectedNodes, graph, callback) {
      var iterator = graph._nodes.values();
      var type = graph.type;
      var step, sourceData, neighbor, adj, edgeData, targetData, shouldBreak;
      while (step = iterator.next(), step.done !== true) {
        var hasEdges = false;
        sourceData = step.value;
        if (type !== "undirected") {
          adj = sourceData.out;
          for (neighbor in adj) {
            edgeData = adj[neighbor];
            do {
              targetData = edgeData.target;
              hasEdges = true;
              shouldBreak = callback(sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.key, edgeData.attributes, edgeData.undirected);
              if (breakable && shouldBreak) return edgeData;
              edgeData = edgeData.next;
            } while (edgeData);
          }
        }
        if (type !== "directed") {
          adj = sourceData.undirected;
          for (neighbor in adj) {
            if (assymetric && sourceData.key > neighbor) continue;
            edgeData = adj[neighbor];
            do {
              targetData = edgeData.target;
              if (targetData.key !== neighbor) targetData = edgeData.source;
              hasEdges = true;
              shouldBreak = callback(sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.key, edgeData.attributes, edgeData.undirected);
              if (breakable && shouldBreak) return edgeData;
              edgeData = edgeData.next;
            } while (edgeData);
          }
        }
        if (disconnectedNodes && !hasEdges) {
          shouldBreak = callback(sourceData.key, null, sourceData.attributes, null, null, null, null);
          if (breakable && shouldBreak) return null;
        }
      }
      return;
    }
    function serializeNode(key, data) {
      var serialized = {
        key
      };
      if (!isEmpty(data.attributes)) serialized.attributes = assign({}, data.attributes);
      return serialized;
    }
    function serializeEdge(type, key, data) {
      var serialized = {
        key,
        source: data.source.key,
        target: data.target.key
      };
      if (!isEmpty(data.attributes)) serialized.attributes = assign({}, data.attributes);
      if (type === "mixed" && data.undirected) serialized.undirected = true;
      return serialized;
    }
    function validateSerializedNode(value) {
      if (!isPlainObject2(value)) throw new InvalidArgumentsGraphError('Graph.import: invalid serialized node. A serialized node should be a plain object with at least a "key" property.');
      if (!("key" in value)) throw new InvalidArgumentsGraphError("Graph.import: serialized node is missing its key.");
      if ("attributes" in value && (!isPlainObject2(value.attributes) || value.attributes === null)) throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.");
    }
    function validateSerializedEdge(value) {
      if (!isPlainObject2(value)) throw new InvalidArgumentsGraphError('Graph.import: invalid serialized edge. A serialized edge should be a plain object with at least a "source" & "target" property.');
      if (!("source" in value)) throw new InvalidArgumentsGraphError("Graph.import: serialized edge is missing its source.");
      if (!("target" in value)) throw new InvalidArgumentsGraphError("Graph.import: serialized edge is missing its target.");
      if ("attributes" in value && (!isPlainObject2(value.attributes) || value.attributes === null)) throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Attributes should be a plain object, null or omitted.");
      if ("undirected" in value && typeof value.undirected !== "boolean") throw new InvalidArgumentsGraphError("Graph.import: invalid undirectedness information. Undirected should be boolean or omitted.");
    }
    var INSTANCE_ID = incrementalIdStartingFromRandomByte();
    var TYPES = /* @__PURE__ */ new Set(["directed", "undirected", "mixed"]);
    var EMITTER_PROPS = /* @__PURE__ */ new Set(["domain", "_events", "_eventsCount", "_maxListeners"]);
    var EDGE_ADD_METHODS = [{
      name: function name(verb) {
        return "".concat(verb, "Edge");
      },
      generateKey: true
    }, {
      name: function name(verb) {
        return "".concat(verb, "DirectedEdge");
      },
      generateKey: true,
      type: "directed"
    }, {
      name: function name(verb) {
        return "".concat(verb, "UndirectedEdge");
      },
      generateKey: true,
      type: "undirected"
    }, {
      name: function name(verb) {
        return "".concat(verb, "EdgeWithKey");
      }
    }, {
      name: function name(verb) {
        return "".concat(verb, "DirectedEdgeWithKey");
      },
      type: "directed"
    }, {
      name: function name(verb) {
        return "".concat(verb, "UndirectedEdgeWithKey");
      },
      type: "undirected"
    }];
    var DEFAULTS = {
      allowSelfLoops: true,
      multi: false,
      type: "mixed"
    };
    function _addNode(graph, node, attributes) {
      if (attributes && !isPlainObject2(attributes)) throw new InvalidArgumentsGraphError('Graph.addNode: invalid attributes. Expecting an object but got "'.concat(attributes, '"'));
      node = "" + node;
      attributes = attributes || {};
      if (graph._nodes.has(node)) throw new UsageGraphError('Graph.addNode: the "'.concat(node, '" node already exist in the graph.'));
      var data = new graph.NodeDataClass(node, attributes);
      graph._nodes.set(node, data);
      graph.emit("nodeAdded", {
        key: node,
        attributes
      });
      return data;
    }
    function unsafeAddNode(graph, node, attributes) {
      var data = new graph.NodeDataClass(node, attributes);
      graph._nodes.set(node, data);
      graph.emit("nodeAdded", {
        key: node,
        attributes
      });
      return data;
    }
    function addEdge(graph, name, mustGenerateKey, undirected, edge, source, target, attributes) {
      if (!undirected && graph.type === "undirected") throw new UsageGraphError("Graph.".concat(name, ": you cannot add a directed edge to an undirected graph. Use the #.addEdge or #.addUndirectedEdge instead."));
      if (undirected && graph.type === "directed") throw new UsageGraphError("Graph.".concat(name, ": you cannot add an undirected edge to a directed graph. Use the #.addEdge or #.addDirectedEdge instead."));
      if (attributes && !isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(name, ': invalid attributes. Expecting an object but got "').concat(attributes, '"'));
      source = "" + source;
      target = "" + target;
      attributes = attributes || {};
      if (!graph.allowSelfLoops && source === target) throw new UsageGraphError("Graph.".concat(name, ': source & target are the same ("').concat(source, `"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false.`));
      var sourceData = graph._nodes.get(source), targetData = graph._nodes.get(target);
      if (!sourceData) throw new NotFoundGraphError("Graph.".concat(name, ': source node "').concat(source, '" not found.'));
      if (!targetData) throw new NotFoundGraphError("Graph.".concat(name, ': target node "').concat(target, '" not found.'));
      var eventData = {
        key: null,
        undirected,
        source,
        target,
        attributes
      };
      if (mustGenerateKey) {
        edge = graph._edgeKeyGenerator();
      } else {
        edge = "" + edge;
        if (graph._edges.has(edge)) throw new UsageGraphError("Graph.".concat(name, ': the "').concat(edge, '" edge already exists in the graph.'));
      }
      if (!graph.multi && (undirected ? typeof sourceData.undirected[target] !== "undefined" : typeof sourceData.out[target] !== "undefined")) {
        throw new UsageGraphError("Graph.".concat(name, ': an edge linking "').concat(source, '" to "').concat(target, `" already exists. If you really want to add multiple edges linking those nodes, you should create a multi graph by using the 'multi' option.`));
      }
      var edgeData = new EdgeData(undirected, edge, sourceData, targetData, attributes);
      graph._edges.set(edge, edgeData);
      var isSelfLoop = source === target;
      if (undirected) {
        sourceData.undirectedDegree++;
        targetData.undirectedDegree++;
        if (isSelfLoop) {
          sourceData.undirectedLoops++;
          graph._undirectedSelfLoopCount++;
        }
      } else {
        sourceData.outDegree++;
        targetData.inDegree++;
        if (isSelfLoop) {
          sourceData.directedLoops++;
          graph._directedSelfLoopCount++;
        }
      }
      if (graph.multi) edgeData.attachMulti();
      else edgeData.attach();
      if (undirected) graph._undirectedSize++;
      else graph._directedSize++;
      eventData.key = edge;
      graph.emit("edgeAdded", eventData);
      return edge;
    }
    function mergeEdge(graph, name, mustGenerateKey, undirected, edge, source, target, attributes, asUpdater) {
      if (!undirected && graph.type === "undirected") throw new UsageGraphError("Graph.".concat(name, ": you cannot merge/update a directed edge to an undirected graph. Use the #.mergeEdge/#.updateEdge or #.addUndirectedEdge instead."));
      if (undirected && graph.type === "directed") throw new UsageGraphError("Graph.".concat(name, ": you cannot merge/update an undirected edge to a directed graph. Use the #.mergeEdge/#.updateEdge or #.addDirectedEdge instead."));
      if (attributes) {
        if (asUpdater) {
          if (typeof attributes !== "function") throw new InvalidArgumentsGraphError("Graph.".concat(name, ': invalid updater function. Expecting a function but got "').concat(attributes, '"'));
        } else {
          if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.".concat(name, ': invalid attributes. Expecting an object but got "').concat(attributes, '"'));
        }
      }
      source = "" + source;
      target = "" + target;
      var updater;
      if (asUpdater) {
        updater = attributes;
        attributes = void 0;
      }
      if (!graph.allowSelfLoops && source === target) throw new UsageGraphError("Graph.".concat(name, ': source & target are the same ("').concat(source, `"), thus creating a loop explicitly forbidden by this graph 'allowSelfLoops' option set to false.`));
      var sourceData = graph._nodes.get(source);
      var targetData = graph._nodes.get(target);
      var edgeData;
      var alreadyExistingEdgeData;
      if (!mustGenerateKey) {
        edgeData = graph._edges.get(edge);
        if (edgeData) {
          if (edgeData.source.key !== source || edgeData.target.key !== target) {
            if (!undirected || edgeData.source.key !== target || edgeData.target.key !== source) {
              throw new UsageGraphError("Graph.".concat(name, ': inconsistency detected when attempting to merge the "').concat(edge, '" edge with "').concat(source, '" source & "').concat(target, '" target vs. ("').concat(edgeData.source.key, '", "').concat(edgeData.target.key, '").'));
            }
          }
          alreadyExistingEdgeData = edgeData;
        }
      }
      if (!alreadyExistingEdgeData && !graph.multi && sourceData) {
        alreadyExistingEdgeData = undirected ? sourceData.undirected[target] : sourceData.out[target];
      }
      if (alreadyExistingEdgeData) {
        var info = [alreadyExistingEdgeData.key, false, false, false];
        if (asUpdater ? !updater : !attributes) return info;
        if (asUpdater) {
          var oldAttributes = alreadyExistingEdgeData.attributes;
          alreadyExistingEdgeData.attributes = updater(oldAttributes);
          graph.emit("edgeAttributesUpdated", {
            type: "replace",
            key: alreadyExistingEdgeData.key,
            attributes: alreadyExistingEdgeData.attributes
          });
        } else {
          assign(alreadyExistingEdgeData.attributes, attributes);
          graph.emit("edgeAttributesUpdated", {
            type: "merge",
            key: alreadyExistingEdgeData.key,
            attributes: alreadyExistingEdgeData.attributes,
            data: attributes
          });
        }
        return info;
      }
      attributes = attributes || {};
      if (asUpdater && updater) attributes = updater(attributes);
      var eventData = {
        key: null,
        undirected,
        source,
        target,
        attributes
      };
      if (mustGenerateKey) {
        edge = graph._edgeKeyGenerator();
      } else {
        edge = "" + edge;
        if (graph._edges.has(edge)) throw new UsageGraphError("Graph.".concat(name, ': the "').concat(edge, '" edge already exists in the graph.'));
      }
      var sourceWasAdded = false;
      var targetWasAdded = false;
      if (!sourceData) {
        sourceData = unsafeAddNode(graph, source, {});
        sourceWasAdded = true;
        if (source === target) {
          targetData = sourceData;
          targetWasAdded = true;
        }
      }
      if (!targetData) {
        targetData = unsafeAddNode(graph, target, {});
        targetWasAdded = true;
      }
      edgeData = new EdgeData(undirected, edge, sourceData, targetData, attributes);
      graph._edges.set(edge, edgeData);
      var isSelfLoop = source === target;
      if (undirected) {
        sourceData.undirectedDegree++;
        targetData.undirectedDegree++;
        if (isSelfLoop) {
          sourceData.undirectedLoops++;
          graph._undirectedSelfLoopCount++;
        }
      } else {
        sourceData.outDegree++;
        targetData.inDegree++;
        if (isSelfLoop) {
          sourceData.directedLoops++;
          graph._directedSelfLoopCount++;
        }
      }
      if (graph.multi) edgeData.attachMulti();
      else edgeData.attach();
      if (undirected) graph._undirectedSize++;
      else graph._directedSize++;
      eventData.key = edge;
      graph.emit("edgeAdded", eventData);
      return [edge, true, sourceWasAdded, targetWasAdded];
    }
    function dropEdgeFromData(graph, edgeData) {
      graph._edges["delete"](edgeData.key);
      var sourceData = edgeData.source, targetData = edgeData.target, attributes = edgeData.attributes;
      var undirected = edgeData.undirected;
      var isSelfLoop = sourceData === targetData;
      if (undirected) {
        sourceData.undirectedDegree--;
        targetData.undirectedDegree--;
        if (isSelfLoop) {
          sourceData.undirectedLoops--;
          graph._undirectedSelfLoopCount--;
        }
      } else {
        sourceData.outDegree--;
        targetData.inDegree--;
        if (isSelfLoop) {
          sourceData.directedLoops--;
          graph._directedSelfLoopCount--;
        }
      }
      if (graph.multi) edgeData.detachMulti();
      else edgeData.detach();
      if (undirected) graph._undirectedSize--;
      else graph._directedSize--;
      graph.emit("edgeDropped", {
        key: edgeData.key,
        attributes,
        source: sourceData.key,
        target: targetData.key,
        undirected
      });
    }
    var Graph2 = /* @__PURE__ */ (function(_EventEmitter) {
      _inheritsLoose(Graph3, _EventEmitter);
      function Graph3(options) {
        var _this;
        _this = _EventEmitter.call(this) || this;
        options = assign({}, DEFAULTS, options);
        if (typeof options.multi !== "boolean") throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'multi' option. Expecting a boolean but got "`.concat(options.multi, '".'));
        if (!TYPES.has(options.type)) throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'type' option. Should be one of "mixed", "directed" or "undirected" but got "`.concat(options.type, '".'));
        if (typeof options.allowSelfLoops !== "boolean") throw new InvalidArgumentsGraphError(`Graph.constructor: invalid 'allowSelfLoops' option. Expecting a boolean but got "`.concat(options.allowSelfLoops, '".'));
        var NodeDataClass = options.type === "mixed" ? MixedNodeData : options.type === "directed" ? DirectedNodeData : UndirectedNodeData;
        privateProperty(_assertThisInitialized(_this), "NodeDataClass", NodeDataClass);
        var instancePrefix = "geid_" + INSTANCE_ID() + "_";
        var edgeId = 0;
        var edgeKeyGenerator = function edgeKeyGenerator2() {
          var availableEdgeKey;
          do {
            availableEdgeKey = instancePrefix + edgeId++;
          } while (_this._edges.has(availableEdgeKey));
          return availableEdgeKey;
        };
        privateProperty(_assertThisInitialized(_this), "_attributes", {});
        privateProperty(_assertThisInitialized(_this), "_nodes", /* @__PURE__ */ new Map());
        privateProperty(_assertThisInitialized(_this), "_edges", /* @__PURE__ */ new Map());
        privateProperty(_assertThisInitialized(_this), "_directedSize", 0);
        privateProperty(_assertThisInitialized(_this), "_undirectedSize", 0);
        privateProperty(_assertThisInitialized(_this), "_directedSelfLoopCount", 0);
        privateProperty(_assertThisInitialized(_this), "_undirectedSelfLoopCount", 0);
        privateProperty(_assertThisInitialized(_this), "_edgeKeyGenerator", edgeKeyGenerator);
        privateProperty(_assertThisInitialized(_this), "_options", options);
        EMITTER_PROPS.forEach(function(prop) {
          return privateProperty(_assertThisInitialized(_this), prop, _this[prop]);
        });
        readOnlyProperty(_assertThisInitialized(_this), "order", function() {
          return _this._nodes.size;
        });
        readOnlyProperty(_assertThisInitialized(_this), "size", function() {
          return _this._edges.size;
        });
        readOnlyProperty(_assertThisInitialized(_this), "directedSize", function() {
          return _this._directedSize;
        });
        readOnlyProperty(_assertThisInitialized(_this), "undirectedSize", function() {
          return _this._undirectedSize;
        });
        readOnlyProperty(_assertThisInitialized(_this), "selfLoopCount", function() {
          return _this._directedSelfLoopCount + _this._undirectedSelfLoopCount;
        });
        readOnlyProperty(_assertThisInitialized(_this), "directedSelfLoopCount", function() {
          return _this._directedSelfLoopCount;
        });
        readOnlyProperty(_assertThisInitialized(_this), "undirectedSelfLoopCount", function() {
          return _this._undirectedSelfLoopCount;
        });
        readOnlyProperty(_assertThisInitialized(_this), "multi", _this._options.multi);
        readOnlyProperty(_assertThisInitialized(_this), "type", _this._options.type);
        readOnlyProperty(_assertThisInitialized(_this), "allowSelfLoops", _this._options.allowSelfLoops);
        readOnlyProperty(_assertThisInitialized(_this), "implementation", function() {
          return "graphology";
        });
        return _this;
      }
      var _proto = Graph3.prototype;
      _proto._resetInstanceCounters = function _resetInstanceCounters() {
        this._directedSize = 0;
        this._undirectedSize = 0;
        this._directedSelfLoopCount = 0;
        this._undirectedSelfLoopCount = 0;
      };
      _proto.hasNode = function hasNode(node) {
        return this._nodes.has("" + node);
      };
      _proto.hasDirectedEdge = function hasDirectedEdge(source, target) {
        if (this.type === "undirected") return false;
        if (arguments.length === 1) {
          var edge = "" + source;
          var edgeData = this._edges.get(edge);
          return !!edgeData && !edgeData.undirected;
        } else if (arguments.length === 2) {
          source = "" + source;
          target = "" + target;
          var nodeData = this._nodes.get(source);
          if (!nodeData) return false;
          return nodeData.out.hasOwnProperty(target);
        }
        throw new InvalidArgumentsGraphError("Graph.hasDirectedEdge: invalid arity (".concat(arguments.length, ", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."));
      };
      _proto.hasUndirectedEdge = function hasUndirectedEdge(source, target) {
        if (this.type === "directed") return false;
        if (arguments.length === 1) {
          var edge = "" + source;
          var edgeData = this._edges.get(edge);
          return !!edgeData && edgeData.undirected;
        } else if (arguments.length === 2) {
          source = "" + source;
          target = "" + target;
          var nodeData = this._nodes.get(source);
          if (!nodeData) return false;
          return nodeData.undirected.hasOwnProperty(target);
        }
        throw new InvalidArgumentsGraphError("Graph.hasDirectedEdge: invalid arity (".concat(arguments.length, ", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."));
      };
      _proto.hasEdge = function hasEdge(source, target) {
        if (arguments.length === 1) {
          var edge = "" + source;
          return this._edges.has(edge);
        } else if (arguments.length === 2) {
          source = "" + source;
          target = "" + target;
          var nodeData = this._nodes.get(source);
          if (!nodeData) return false;
          return typeof nodeData.out !== "undefined" && nodeData.out.hasOwnProperty(target) || typeof nodeData.undirected !== "undefined" && nodeData.undirected.hasOwnProperty(target);
        }
        throw new InvalidArgumentsGraphError("Graph.hasEdge: invalid arity (".concat(arguments.length, ", instead of 1 or 2). You can either ask for an edge id or for the existence of an edge between a source & a target."));
      };
      _proto.directedEdge = function directedEdge(source, target) {
        if (this.type === "undirected") return;
        source = "" + source;
        target = "" + target;
        if (this.multi) throw new UsageGraphError("Graph.directedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.directedEdges instead.");
        var sourceData = this._nodes.get(source);
        if (!sourceData) throw new NotFoundGraphError('Graph.directedEdge: could not find the "'.concat(source, '" source node in the graph.'));
        if (!this._nodes.has(target)) throw new NotFoundGraphError('Graph.directedEdge: could not find the "'.concat(target, '" target node in the graph.'));
        var edgeData = sourceData.out && sourceData.out[target] || void 0;
        if (edgeData) return edgeData.key;
      };
      _proto.undirectedEdge = function undirectedEdge(source, target) {
        if (this.type === "directed") return;
        source = "" + source;
        target = "" + target;
        if (this.multi) throw new UsageGraphError("Graph.undirectedEdge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.undirectedEdges instead.");
        var sourceData = this._nodes.get(source);
        if (!sourceData) throw new NotFoundGraphError('Graph.undirectedEdge: could not find the "'.concat(source, '" source node in the graph.'));
        if (!this._nodes.has(target)) throw new NotFoundGraphError('Graph.undirectedEdge: could not find the "'.concat(target, '" target node in the graph.'));
        var edgeData = sourceData.undirected && sourceData.undirected[target] || void 0;
        if (edgeData) return edgeData.key;
      };
      _proto.edge = function edge(source, target) {
        if (this.multi) throw new UsageGraphError("Graph.edge: this method is irrelevant with multigraphs since there might be multiple edges between source & target. See #.edges instead.");
        source = "" + source;
        target = "" + target;
        var sourceData = this._nodes.get(source);
        if (!sourceData) throw new NotFoundGraphError('Graph.edge: could not find the "'.concat(source, '" source node in the graph.'));
        if (!this._nodes.has(target)) throw new NotFoundGraphError('Graph.edge: could not find the "'.concat(target, '" target node in the graph.'));
        var edgeData = sourceData.out && sourceData.out[target] || sourceData.undirected && sourceData.undirected[target] || void 0;
        if (edgeData) return edgeData.key;
      };
      _proto.areDirectedNeighbors = function areDirectedNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areDirectedNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return false;
        return neighbor in nodeData["in"] || neighbor in nodeData.out;
      };
      _proto.areOutNeighbors = function areOutNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areOutNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return false;
        return neighbor in nodeData.out;
      };
      _proto.areInNeighbors = function areInNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areInNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return false;
        return neighbor in nodeData["in"];
      };
      _proto.areUndirectedNeighbors = function areUndirectedNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areUndirectedNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "directed") return false;
        return neighbor in nodeData.undirected;
      };
      _proto.areNeighbors = function areNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type !== "undirected") {
          if (neighbor in nodeData["in"] || neighbor in nodeData.out) return true;
        }
        if (this.type !== "directed") {
          if (neighbor in nodeData.undirected) return true;
        }
        return false;
      };
      _proto.areInboundNeighbors = function areInboundNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areInboundNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type !== "undirected") {
          if (neighbor in nodeData["in"]) return true;
        }
        if (this.type !== "directed") {
          if (neighbor in nodeData.undirected) return true;
        }
        return false;
      };
      _proto.areOutboundNeighbors = function areOutboundNeighbors(node, neighbor) {
        node = "" + node;
        neighbor = "" + neighbor;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.areOutboundNeighbors: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type !== "undirected") {
          if (neighbor in nodeData.out) return true;
        }
        if (this.type !== "directed") {
          if (neighbor in nodeData.undirected) return true;
        }
        return false;
      };
      _proto.inDegree = function inDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.inDegree: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.inDegree;
      };
      _proto.outDegree = function outDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.outDegree: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.outDegree;
      };
      _proto.directedDegree = function directedDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.directedDegree: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.inDegree + nodeData.outDegree;
      };
      _proto.undirectedDegree = function undirectedDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.undirectedDegree: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "directed") return 0;
        return nodeData.undirectedDegree;
      };
      _proto.inboundDegree = function inboundDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.inboundDegree: could not find the "'.concat(node, '" node in the graph.'));
        var degree = 0;
        if (this.type !== "directed") {
          degree += nodeData.undirectedDegree;
        }
        if (this.type !== "undirected") {
          degree += nodeData.inDegree;
        }
        return degree;
      };
      _proto.outboundDegree = function outboundDegree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.outboundDegree: could not find the "'.concat(node, '" node in the graph.'));
        var degree = 0;
        if (this.type !== "directed") {
          degree += nodeData.undirectedDegree;
        }
        if (this.type !== "undirected") {
          degree += nodeData.outDegree;
        }
        return degree;
      };
      _proto.degree = function degree(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.degree: could not find the "'.concat(node, '" node in the graph.'));
        var degree2 = 0;
        if (this.type !== "directed") {
          degree2 += nodeData.undirectedDegree;
        }
        if (this.type !== "undirected") {
          degree2 += nodeData.inDegree + nodeData.outDegree;
        }
        return degree2;
      };
      _proto.inDegreeWithoutSelfLoops = function inDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.inDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.inDegree - nodeData.directedLoops;
      };
      _proto.outDegreeWithoutSelfLoops = function outDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.outDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.outDegree - nodeData.directedLoops;
      };
      _proto.directedDegreeWithoutSelfLoops = function directedDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.directedDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "undirected") return 0;
        return nodeData.inDegree + nodeData.outDegree - nodeData.directedLoops * 2;
      };
      _proto.undirectedDegreeWithoutSelfLoops = function undirectedDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.undirectedDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        if (this.type === "directed") return 0;
        return nodeData.undirectedDegree - nodeData.undirectedLoops * 2;
      };
      _proto.inboundDegreeWithoutSelfLoops = function inboundDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.inboundDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        var degree = 0;
        var loops = 0;
        if (this.type !== "directed") {
          degree += nodeData.undirectedDegree;
          loops += nodeData.undirectedLoops * 2;
        }
        if (this.type !== "undirected") {
          degree += nodeData.inDegree;
          loops += nodeData.directedLoops;
        }
        return degree - loops;
      };
      _proto.outboundDegreeWithoutSelfLoops = function outboundDegreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.outboundDegreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        var degree = 0;
        var loops = 0;
        if (this.type !== "directed") {
          degree += nodeData.undirectedDegree;
          loops += nodeData.undirectedLoops * 2;
        }
        if (this.type !== "undirected") {
          degree += nodeData.outDegree;
          loops += nodeData.directedLoops;
        }
        return degree - loops;
      };
      _proto.degreeWithoutSelfLoops = function degreeWithoutSelfLoops(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.degreeWithoutSelfLoops: could not find the "'.concat(node, '" node in the graph.'));
        var degree = 0;
        var loops = 0;
        if (this.type !== "directed") {
          degree += nodeData.undirectedDegree;
          loops += nodeData.undirectedLoops * 2;
        }
        if (this.type !== "undirected") {
          degree += nodeData.inDegree + nodeData.outDegree;
          loops += nodeData.directedLoops * 2;
        }
        return degree - loops;
      };
      _proto.source = function source(edge) {
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.source: could not find the "'.concat(edge, '" edge in the graph.'));
        return data.source.key;
      };
      _proto.target = function target(edge) {
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.target: could not find the "'.concat(edge, '" edge in the graph.'));
        return data.target.key;
      };
      _proto.extremities = function extremities(edge) {
        edge = "" + edge;
        var edgeData = this._edges.get(edge);
        if (!edgeData) throw new NotFoundGraphError('Graph.extremities: could not find the "'.concat(edge, '" edge in the graph.'));
        return [edgeData.source.key, edgeData.target.key];
      };
      _proto.opposite = function opposite(node, edge) {
        node = "" + node;
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.opposite: could not find the "'.concat(edge, '" edge in the graph.'));
        var source = data.source.key;
        var target = data.target.key;
        if (node === source) return target;
        if (node === target) return source;
        throw new NotFoundGraphError('Graph.opposite: the "'.concat(node, '" node is not attached to the "').concat(edge, '" edge (').concat(source, ", ").concat(target, ")."));
      };
      _proto.hasExtremity = function hasExtremity(edge, node) {
        edge = "" + edge;
        node = "" + node;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.hasExtremity: could not find the "'.concat(edge, '" edge in the graph.'));
        return data.source.key === node || data.target.key === node;
      };
      _proto.isUndirected = function isUndirected(edge) {
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.isUndirected: could not find the "'.concat(edge, '" edge in the graph.'));
        return data.undirected;
      };
      _proto.isDirected = function isDirected(edge) {
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.isDirected: could not find the "'.concat(edge, '" edge in the graph.'));
        return !data.undirected;
      };
      _proto.isSelfLoop = function isSelfLoop(edge) {
        edge = "" + edge;
        var data = this._edges.get(edge);
        if (!data) throw new NotFoundGraphError('Graph.isSelfLoop: could not find the "'.concat(edge, '" edge in the graph.'));
        return data.source === data.target;
      };
      _proto.addNode = function addNode(node, attributes) {
        var nodeData = _addNode(this, node, attributes);
        return nodeData.key;
      };
      _proto.mergeNode = function mergeNode(node, attributes) {
        if (attributes && !isPlainObject2(attributes)) throw new InvalidArgumentsGraphError('Graph.mergeNode: invalid attributes. Expecting an object but got "'.concat(attributes, '"'));
        node = "" + node;
        attributes = attributes || {};
        var data = this._nodes.get(node);
        if (data) {
          if (attributes) {
            assign(data.attributes, attributes);
            this.emit("nodeAttributesUpdated", {
              type: "merge",
              key: node,
              attributes: data.attributes,
              data: attributes
            });
          }
          return [node, false];
        }
        data = new this.NodeDataClass(node, attributes);
        this._nodes.set(node, data);
        this.emit("nodeAdded", {
          key: node,
          attributes
        });
        return [node, true];
      };
      _proto.updateNode = function updateNode(node, updater) {
        if (updater && typeof updater !== "function") throw new InvalidArgumentsGraphError('Graph.updateNode: invalid updater function. Expecting a function but got "'.concat(updater, '"'));
        node = "" + node;
        var data = this._nodes.get(node);
        if (data) {
          if (updater) {
            var oldAttributes = data.attributes;
            data.attributes = updater(oldAttributes);
            this.emit("nodeAttributesUpdated", {
              type: "replace",
              key: node,
              attributes: data.attributes
            });
          }
          return [node, false];
        }
        var attributes = updater ? updater({}) : {};
        data = new this.NodeDataClass(node, attributes);
        this._nodes.set(node, data);
        this.emit("nodeAdded", {
          key: node,
          attributes
        });
        return [node, true];
      };
      _proto.dropNode = function dropNode(node) {
        node = "" + node;
        var nodeData = this._nodes.get(node);
        if (!nodeData) throw new NotFoundGraphError('Graph.dropNode: could not find the "'.concat(node, '" node in the graph.'));
        var edgeData;
        if (this.type !== "undirected") {
          for (var neighbor in nodeData.out) {
            edgeData = nodeData.out[neighbor];
            do {
              dropEdgeFromData(this, edgeData);
              edgeData = edgeData.next;
            } while (edgeData);
          }
          for (var _neighbor in nodeData["in"]) {
            edgeData = nodeData["in"][_neighbor];
            do {
              dropEdgeFromData(this, edgeData);
              edgeData = edgeData.next;
            } while (edgeData);
          }
        }
        if (this.type !== "directed") {
          for (var _neighbor2 in nodeData.undirected) {
            edgeData = nodeData.undirected[_neighbor2];
            do {
              dropEdgeFromData(this, edgeData);
              edgeData = edgeData.next;
            } while (edgeData);
          }
        }
        this._nodes["delete"](node);
        this.emit("nodeDropped", {
          key: node,
          attributes: nodeData.attributes
        });
      };
      _proto.dropEdge = function dropEdge(edge) {
        var edgeData;
        if (arguments.length > 1) {
          var source = "" + arguments[0];
          var target = "" + arguments[1];
          edgeData = getMatchingEdge(this, source, target, this.type);
          if (!edgeData) throw new NotFoundGraphError('Graph.dropEdge: could not find the "'.concat(source, '" -> "').concat(target, '" edge in the graph.'));
        } else {
          edge = "" + edge;
          edgeData = this._edges.get(edge);
          if (!edgeData) throw new NotFoundGraphError('Graph.dropEdge: could not find the "'.concat(edge, '" edge in the graph.'));
        }
        dropEdgeFromData(this, edgeData);
        return this;
      };
      _proto.dropDirectedEdge = function dropDirectedEdge(source, target) {
        if (arguments.length < 2) throw new UsageGraphError("Graph.dropDirectedEdge: it does not make sense to try and drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");
        if (this.multi) throw new UsageGraphError("Graph.dropDirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");
        source = "" + source;
        target = "" + target;
        var edgeData = getMatchingEdge(this, source, target, "directed");
        if (!edgeData) throw new NotFoundGraphError('Graph.dropDirectedEdge: could not find a "'.concat(source, '" -> "').concat(target, '" edge in the graph.'));
        dropEdgeFromData(this, edgeData);
        return this;
      };
      _proto.dropUndirectedEdge = function dropUndirectedEdge(source, target) {
        if (arguments.length < 2) throw new UsageGraphError("Graph.dropUndirectedEdge: it does not make sense to drop a directed edge by key. What if the edge with this key is undirected? Use #.dropEdge for this purpose instead.");
        if (this.multi) throw new UsageGraphError("Graph.dropUndirectedEdge: cannot use a {source,target} combo when dropping an edge in a MultiGraph since we cannot infer the one you want to delete as there could be multiple ones.");
        var edgeData = getMatchingEdge(this, source, target, "undirected");
        if (!edgeData) throw new NotFoundGraphError('Graph.dropUndirectedEdge: could not find a "'.concat(source, '" -> "').concat(target, '" edge in the graph.'));
        dropEdgeFromData(this, edgeData);
        return this;
      };
      _proto.clear = function clear() {
        this._edges.clear();
        this._nodes.clear();
        this._resetInstanceCounters();
        this.emit("cleared");
      };
      _proto.clearEdges = function clearEdges() {
        var iterator = this._nodes.values();
        var step;
        while (step = iterator.next(), step.done !== true) {
          step.value.clear();
        }
        this._edges.clear();
        this._resetInstanceCounters();
        this.emit("edgesCleared");
      };
      _proto.getAttribute = function getAttribute(name) {
        return this._attributes[name];
      };
      _proto.getAttributes = function getAttributes() {
        return this._attributes;
      };
      _proto.hasAttribute = function hasAttribute(name) {
        return this._attributes.hasOwnProperty(name);
      };
      _proto.setAttribute = function setAttribute(name, value) {
        this._attributes[name] = value;
        this.emit("attributesUpdated", {
          type: "set",
          attributes: this._attributes,
          name
        });
        return this;
      };
      _proto.updateAttribute = function updateAttribute(name, updater) {
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.updateAttribute: updater should be a function.");
        var value = this._attributes[name];
        this._attributes[name] = updater(value);
        this.emit("attributesUpdated", {
          type: "set",
          attributes: this._attributes,
          name
        });
        return this;
      };
      _proto.removeAttribute = function removeAttribute(name) {
        delete this._attributes[name];
        this.emit("attributesUpdated", {
          type: "remove",
          attributes: this._attributes,
          name
        });
        return this;
      };
      _proto.replaceAttributes = function replaceAttributes(attributes) {
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.replaceAttributes: provided attributes are not a plain object.");
        this._attributes = attributes;
        this.emit("attributesUpdated", {
          type: "replace",
          attributes: this._attributes
        });
        return this;
      };
      _proto.mergeAttributes = function mergeAttributes(attributes) {
        if (!isPlainObject2(attributes)) throw new InvalidArgumentsGraphError("Graph.mergeAttributes: provided attributes are not a plain object.");
        assign(this._attributes, attributes);
        this.emit("attributesUpdated", {
          type: "merge",
          attributes: this._attributes,
          data: attributes
        });
        return this;
      };
      _proto.updateAttributes = function updateAttributes(updater) {
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.updateAttributes: provided updater is not a function.");
        this._attributes = updater(this._attributes);
        this.emit("attributesUpdated", {
          type: "update",
          attributes: this._attributes
        });
        return this;
      };
      _proto.updateEachNodeAttributes = function updateEachNodeAttributes(updater, hints) {
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.updateEachNodeAttributes: expecting an updater function.");
        if (hints && !validateHints(hints)) throw new InvalidArgumentsGraphError("Graph.updateEachNodeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          nodeData.attributes = updater(nodeData.key, nodeData.attributes);
        }
        this.emit("eachNodeAttributesUpdated", {
          hints: hints ? hints : null
        });
      };
      _proto.updateEachEdgeAttributes = function updateEachEdgeAttributes(updater, hints) {
        if (typeof updater !== "function") throw new InvalidArgumentsGraphError("Graph.updateEachEdgeAttributes: expecting an updater function.");
        if (hints && !validateHints(hints)) throw new InvalidArgumentsGraphError("Graph.updateEachEdgeAttributes: invalid hints. Expecting an object having the following shape: {attributes?: [string]}");
        var iterator = this._edges.values();
        var step, edgeData, sourceData, targetData;
        while (step = iterator.next(), step.done !== true) {
          edgeData = step.value;
          sourceData = edgeData.source;
          targetData = edgeData.target;
          edgeData.attributes = updater(edgeData.key, edgeData.attributes, sourceData.key, targetData.key, sourceData.attributes, targetData.attributes, edgeData.undirected);
        }
        this.emit("eachEdgeAttributesUpdated", {
          hints: hints ? hints : null
        });
      };
      _proto.forEachAdjacencyEntry = function forEachAdjacencyEntry(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.forEachAdjacencyEntry: expecting a callback.");
        forEachAdjacency(false, false, false, this, callback);
      };
      _proto.forEachAdjacencyEntryWithOrphans = function forEachAdjacencyEntryWithOrphans(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.forEachAdjacencyEntryWithOrphans: expecting a callback.");
        forEachAdjacency(false, false, true, this, callback);
      };
      _proto.forEachAssymetricAdjacencyEntry = function forEachAssymetricAdjacencyEntry(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.forEachAssymetricAdjacencyEntry: expecting a callback.");
        forEachAdjacency(false, true, false, this, callback);
      };
      _proto.forEachAssymetricAdjacencyEntryWithOrphans = function forEachAssymetricAdjacencyEntryWithOrphans(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.forEachAssymetricAdjacencyEntryWithOrphans: expecting a callback.");
        forEachAdjacency(false, true, true, this, callback);
      };
      _proto.nodes = function nodes() {
        if (typeof Array.from === "function") return Array.from(this._nodes.keys());
        return take__default["default"](this._nodes.keys(), this._nodes.size);
      };
      _proto.forEachNode = function forEachNode(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.forEachNode: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          callback(nodeData.key, nodeData.attributes);
        }
      };
      _proto.findNode = function findNode(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.findNode: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          if (callback(nodeData.key, nodeData.attributes)) return nodeData.key;
        }
        return;
      };
      _proto.mapNodes = function mapNodes(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.mapNode: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        var result = new Array(this.order);
        var i = 0;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          result[i++] = callback(nodeData.key, nodeData.attributes);
        }
        return result;
      };
      _proto.someNode = function someNode(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.someNode: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          if (callback(nodeData.key, nodeData.attributes)) return true;
        }
        return false;
      };
      _proto.everyNode = function everyNode(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.everyNode: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          if (!callback(nodeData.key, nodeData.attributes)) return false;
        }
        return true;
      };
      _proto.filterNodes = function filterNodes(callback) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.filterNodes: expecting a callback.");
        var iterator = this._nodes.values();
        var step, nodeData;
        var result = [];
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          if (callback(nodeData.key, nodeData.attributes)) result.push(nodeData.key);
        }
        return result;
      };
      _proto.reduceNodes = function reduceNodes(callback, initialValue) {
        if (typeof callback !== "function") throw new InvalidArgumentsGraphError("Graph.reduceNodes: expecting a callback.");
        if (arguments.length < 2) throw new InvalidArgumentsGraphError("Graph.reduceNodes: missing initial value. You must provide it because the callback takes more than one argument and we cannot infer the initial value from the first iteration, as you could with a simple array.");
        var accumulator = initialValue;
        var iterator = this._nodes.values();
        var step, nodeData;
        while (step = iterator.next(), step.done !== true) {
          nodeData = step.value;
          accumulator = callback(accumulator, nodeData.key, nodeData.attributes);
        }
        return accumulator;
      };
      _proto.nodeEntries = function nodeEntries() {
        var iterator = this._nodes.values();
        return new Iterator__default["default"](function() {
          var step = iterator.next();
          if (step.done) return step;
          var data = step.value;
          return {
            value: {
              node: data.key,
              attributes: data.attributes
            },
            done: false
          };
        });
      };
      _proto["export"] = function _export() {
        var _this2 = this;
        var nodes = new Array(this._nodes.size);
        var i = 0;
        this._nodes.forEach(function(data, key) {
          nodes[i++] = serializeNode(key, data);
        });
        var edges = new Array(this._edges.size);
        i = 0;
        this._edges.forEach(function(data, key) {
          edges[i++] = serializeEdge(_this2.type, key, data);
        });
        return {
          options: {
            type: this.type,
            multi: this.multi,
            allowSelfLoops: this.allowSelfLoops
          },
          attributes: this.getAttributes(),
          nodes,
          edges
        };
      };
      _proto["import"] = function _import(data) {
        var _this3 = this;
        var merge2 = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : false;
        if (data instanceof Graph3) {
          data.forEachNode(function(n, a) {
            if (merge2) _this3.mergeNode(n, a);
            else _this3.addNode(n, a);
          });
          data.forEachEdge(function(e, a, s, t, _sa, _ta, u) {
            if (merge2) {
              if (u) _this3.mergeUndirectedEdgeWithKey(e, s, t, a);
              else _this3.mergeDirectedEdgeWithKey(e, s, t, a);
            } else {
              if (u) _this3.addUndirectedEdgeWithKey(e, s, t, a);
              else _this3.addDirectedEdgeWithKey(e, s, t, a);
            }
          });
          return this;
        }
        if (!isPlainObject2(data)) throw new InvalidArgumentsGraphError("Graph.import: invalid argument. Expecting a serialized graph or, alternatively, a Graph instance.");
        if (data.attributes) {
          if (!isPlainObject2(data.attributes)) throw new InvalidArgumentsGraphError("Graph.import: invalid attributes. Expecting a plain object.");
          if (merge2) this.mergeAttributes(data.attributes);
          else this.replaceAttributes(data.attributes);
        }
        var i, l, list, node, edge;
        if (data.nodes) {
          list = data.nodes;
          if (!Array.isArray(list)) throw new InvalidArgumentsGraphError("Graph.import: invalid nodes. Expecting an array.");
          for (i = 0, l = list.length; i < l; i++) {
            node = list[i];
            validateSerializedNode(node);
            var _node = node, key = _node.key, attributes = _node.attributes;
            if (merge2) this.mergeNode(key, attributes);
            else this.addNode(key, attributes);
          }
        }
        if (data.edges) {
          var undirectedByDefault = false;
          if (this.type === "undirected") {
            undirectedByDefault = true;
          }
          list = data.edges;
          if (!Array.isArray(list)) throw new InvalidArgumentsGraphError("Graph.import: invalid edges. Expecting an array.");
          for (i = 0, l = list.length; i < l; i++) {
            edge = list[i];
            validateSerializedEdge(edge);
            var _edge = edge, source = _edge.source, target = _edge.target, _attributes = _edge.attributes, _edge$undirected = _edge.undirected, undirected = _edge$undirected === void 0 ? undirectedByDefault : _edge$undirected;
            var method = void 0;
            if ("key" in edge) {
              method = merge2 ? undirected ? this.mergeUndirectedEdgeWithKey : this.mergeDirectedEdgeWithKey : undirected ? this.addUndirectedEdgeWithKey : this.addDirectedEdgeWithKey;
              method.call(this, edge.key, source, target, _attributes);
            } else {
              method = merge2 ? undirected ? this.mergeUndirectedEdge : this.mergeDirectedEdge : undirected ? this.addUndirectedEdge : this.addDirectedEdge;
              method.call(this, source, target, _attributes);
            }
          }
        }
        return this;
      };
      _proto.nullCopy = function nullCopy(options) {
        var graph = new Graph3(assign({}, this._options, options));
        graph.replaceAttributes(assign({}, this.getAttributes()));
        return graph;
      };
      _proto.emptyCopy = function emptyCopy(options) {
        var graph = this.nullCopy(options);
        this._nodes.forEach(function(nodeData, key) {
          var attributes = assign({}, nodeData.attributes);
          nodeData = new graph.NodeDataClass(key, attributes);
          graph._nodes.set(key, nodeData);
        });
        return graph;
      };
      _proto.copy = function copy(options) {
        options = options || {};
        if (typeof options.type === "string" && options.type !== this.type && options.type !== "mixed") throw new UsageGraphError('Graph.copy: cannot create an incompatible copy from "'.concat(this.type, '" type to "').concat(options.type, '" because this would mean losing information about the current graph.'));
        if (typeof options.multi === "boolean" && options.multi !== this.multi && options.multi !== true) throw new UsageGraphError("Graph.copy: cannot create an incompatible copy by downgrading a multi graph to a simple one because this would mean losing information about the current graph.");
        if (typeof options.allowSelfLoops === "boolean" && options.allowSelfLoops !== this.allowSelfLoops && options.allowSelfLoops !== true) throw new UsageGraphError("Graph.copy: cannot create an incompatible copy from a graph allowing self loops to one that does not because this would mean losing information about the current graph.");
        var graph = this.emptyCopy(options);
        var iterator = this._edges.values();
        var step, edgeData;
        while (step = iterator.next(), step.done !== true) {
          edgeData = step.value;
          addEdge(graph, "copy", false, edgeData.undirected, edgeData.key, edgeData.source.key, edgeData.target.key, assign({}, edgeData.attributes));
        }
        return graph;
      };
      _proto.toJSON = function toJSON() {
        return this["export"]();
      };
      _proto.toString = function toString() {
        return "[object Graph]";
      };
      _proto.inspect = function inspect() {
        var _this4 = this;
        var nodes = {};
        this._nodes.forEach(function(data, key) {
          nodes[key] = data.attributes;
        });
        var edges = {}, multiIndex = {};
        this._edges.forEach(function(data, key) {
          var direction = data.undirected ? "--" : "->";
          var label = "";
          var source = data.source.key;
          var target = data.target.key;
          var tmp;
          if (data.undirected && source > target) {
            tmp = source;
            source = target;
            target = tmp;
          }
          var desc = "(".concat(source, ")").concat(direction, "(").concat(target, ")");
          if (!key.startsWith("geid_")) {
            label += "[".concat(key, "]: ");
          } else if (_this4.multi) {
            if (typeof multiIndex[desc] === "undefined") {
              multiIndex[desc] = 0;
            } else {
              multiIndex[desc]++;
            }
            label += "".concat(multiIndex[desc], ". ");
          }
          label += desc;
          edges[label] = data.attributes;
        });
        var dummy = {};
        for (var k in this) {
          if (this.hasOwnProperty(k) && !EMITTER_PROPS.has(k) && typeof this[k] !== "function" && _typeof(k) !== "symbol") dummy[k] = this[k];
        }
        dummy.attributes = this._attributes;
        dummy.nodes = nodes;
        dummy.edges = edges;
        privateProperty(dummy, "constructor", this.constructor);
        return dummy;
      };
      return Graph3;
    })(events.EventEmitter);
    if (typeof Symbol !== "undefined") Graph2.prototype[Symbol["for"]("nodejs.util.inspect.custom")] = Graph2.prototype.inspect;
    EDGE_ADD_METHODS.forEach(function(method) {
      ["add", "merge", "update"].forEach(function(verb) {
        var name = method.name(verb);
        var fn = verb === "add" ? addEdge : mergeEdge;
        if (method.generateKey) {
          Graph2.prototype[name] = function(source, target, attributes) {
            return fn(this, name, true, (method.type || this.type) === "undirected", null, source, target, attributes, verb === "update");
          };
        } else {
          Graph2.prototype[name] = function(edge, source, target, attributes) {
            return fn(this, name, false, (method.type || this.type) === "undirected", edge, source, target, attributes, verb === "update");
          };
        }
      });
    });
    attachNodeAttributesMethods(Graph2);
    attachEdgeAttributesMethods(Graph2);
    attachEdgeIterationMethods(Graph2);
    attachNeighborIterationMethods(Graph2);
    var DirectedGraph = /* @__PURE__ */ (function(_Graph) {
      _inheritsLoose(DirectedGraph2, _Graph);
      function DirectedGraph2(options) {
        var finalOptions = assign({
          type: "directed"
        }, options);
        if ("multi" in finalOptions && finalOptions.multi !== false) throw new InvalidArgumentsGraphError("DirectedGraph.from: inconsistent indication that the graph should be multi in given options!");
        if (finalOptions.type !== "directed") throw new InvalidArgumentsGraphError('DirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
        return _Graph.call(this, finalOptions) || this;
      }
      return DirectedGraph2;
    })(Graph2);
    var UndirectedGraph = /* @__PURE__ */ (function(_Graph2) {
      _inheritsLoose(UndirectedGraph2, _Graph2);
      function UndirectedGraph2(options) {
        var finalOptions = assign({
          type: "undirected"
        }, options);
        if ("multi" in finalOptions && finalOptions.multi !== false) throw new InvalidArgumentsGraphError("UndirectedGraph.from: inconsistent indication that the graph should be multi in given options!");
        if (finalOptions.type !== "undirected") throw new InvalidArgumentsGraphError('UndirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
        return _Graph2.call(this, finalOptions) || this;
      }
      return UndirectedGraph2;
    })(Graph2);
    var MultiGraph = /* @__PURE__ */ (function(_Graph3) {
      _inheritsLoose(MultiGraph2, _Graph3);
      function MultiGraph2(options) {
        var finalOptions = assign({
          multi: true
        }, options);
        if ("multi" in finalOptions && finalOptions.multi !== true) throw new InvalidArgumentsGraphError("MultiGraph.from: inconsistent indication that the graph should be simple in given options!");
        return _Graph3.call(this, finalOptions) || this;
      }
      return MultiGraph2;
    })(Graph2);
    var MultiDirectedGraph = /* @__PURE__ */ (function(_Graph4) {
      _inheritsLoose(MultiDirectedGraph2, _Graph4);
      function MultiDirectedGraph2(options) {
        var finalOptions = assign({
          type: "directed",
          multi: true
        }, options);
        if ("multi" in finalOptions && finalOptions.multi !== true) throw new InvalidArgumentsGraphError("MultiDirectedGraph.from: inconsistent indication that the graph should be simple in given options!");
        if (finalOptions.type !== "directed") throw new InvalidArgumentsGraphError('MultiDirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
        return _Graph4.call(this, finalOptions) || this;
      }
      return MultiDirectedGraph2;
    })(Graph2);
    var MultiUndirectedGraph = /* @__PURE__ */ (function(_Graph5) {
      _inheritsLoose(MultiUndirectedGraph2, _Graph5);
      function MultiUndirectedGraph2(options) {
        var finalOptions = assign({
          type: "undirected",
          multi: true
        }, options);
        if ("multi" in finalOptions && finalOptions.multi !== true) throw new InvalidArgumentsGraphError("MultiUndirectedGraph.from: inconsistent indication that the graph should be simple in given options!");
        if (finalOptions.type !== "undirected") throw new InvalidArgumentsGraphError('MultiUndirectedGraph.from: inconsistent "' + finalOptions.type + '" type in given options!');
        return _Graph5.call(this, finalOptions) || this;
      }
      return MultiUndirectedGraph2;
    })(Graph2);
    function attachStaticFromMethod(Class2) {
      Class2.from = function(data, options) {
        var finalOptions = assign({}, data.options, options);
        var instance = new Class2(finalOptions);
        instance["import"](data);
        return instance;
      };
    }
    attachStaticFromMethod(Graph2);
    attachStaticFromMethod(DirectedGraph);
    attachStaticFromMethod(UndirectedGraph);
    attachStaticFromMethod(MultiGraph);
    attachStaticFromMethod(MultiDirectedGraph);
    attachStaticFromMethod(MultiUndirectedGraph);
    Graph2.Graph = Graph2;
    Graph2.DirectedGraph = DirectedGraph;
    Graph2.UndirectedGraph = UndirectedGraph;
    Graph2.MultiGraph = MultiGraph;
    Graph2.MultiDirectedGraph = MultiDirectedGraph;
    Graph2.MultiUndirectedGraph = MultiUndirectedGraph;
    Graph2.InvalidArgumentsGraphError = InvalidArgumentsGraphError;
    Graph2.NotFoundGraphError = NotFoundGraphError;
    Graph2.UsageGraphError = UsageGraphError;
    module.exports = Graph2;
  }
});

// node_modules/graphology-utils/defaults.js
var require_defaults = __commonJS({
  "node_modules/graphology-utils/defaults.js"(exports, module) {
    function isLeaf(o) {
      return !o || typeof o !== "object" || typeof o === "function" || Array.isArray(o) || o instanceof Set || o instanceof Map || o instanceof RegExp || o instanceof Date;
    }
    function resolveDefaults(target, defaults) {
      target = target || {};
      var output = {};
      for (var k in defaults) {
        var existing = target[k];
        var def = defaults[k];
        if (!isLeaf(def)) {
          output[k] = resolveDefaults(existing, def);
          continue;
        }
        if (existing === void 0) {
          output[k] = def;
        } else {
          output[k] = existing;
        }
      }
      return output;
    }
    module.exports = resolveDefaults;
  }
});

// node_modules/graphology-utils/is-graph.js
var require_is_graph = __commonJS({
  "node_modules/graphology-utils/is-graph.js"(exports, module) {
    module.exports = function isGraph(value) {
      return value !== null && typeof value === "object" && typeof value.addUndirectedEdgeWithKey === "function" && typeof value.dropNode === "function" && typeof value.multi === "boolean";
    };
  }
});

// node_modules/graphology-utils/infer-type.js
var require_infer_type = __commonJS({
  "node_modules/graphology-utils/infer-type.js"(exports, module) {
    var isGraph = require_is_graph();
    module.exports = function inferType(graph) {
      if (!isGraph(graph))
        throw new Error(
          "graphology-utils/infer-type: expecting a valid graphology instance."
        );
      var declaredType = graph.type;
      if (declaredType !== "mixed") return declaredType;
      if (graph.directedSize === 0 && graph.undirectedSize === 0 || graph.directedSize > 0 && graph.undirectedSize > 0)
        return "mixed";
      if (graph.directedSize > 0) return "directed";
      return "undirected";
    };
  }
});

// node_modules/mnemonist/utils/typed-arrays.js
var require_typed_arrays = __commonJS({
  "node_modules/mnemonist/utils/typed-arrays.js"(exports) {
    var MAX_8BIT_INTEGER = Math.pow(2, 8) - 1;
    var MAX_16BIT_INTEGER = Math.pow(2, 16) - 1;
    var MAX_32BIT_INTEGER = Math.pow(2, 32) - 1;
    var MAX_SIGNED_8BIT_INTEGER = Math.pow(2, 7) - 1;
    var MAX_SIGNED_16BIT_INTEGER = Math.pow(2, 15) - 1;
    var MAX_SIGNED_32BIT_INTEGER = Math.pow(2, 31) - 1;
    exports.getPointerArray = function(size) {
      var maxIndex = size - 1;
      if (maxIndex <= MAX_8BIT_INTEGER)
        return Uint8Array;
      if (maxIndex <= MAX_16BIT_INTEGER)
        return Uint16Array;
      if (maxIndex <= MAX_32BIT_INTEGER)
        return Uint32Array;
      throw new Error("mnemonist: Pointer Array of size > 4294967295 is not supported.");
    };
    exports.getSignedPointerArray = function(size) {
      var maxIndex = size - 1;
      if (maxIndex <= MAX_SIGNED_8BIT_INTEGER)
        return Int8Array;
      if (maxIndex <= MAX_SIGNED_16BIT_INTEGER)
        return Int16Array;
      if (maxIndex <= MAX_SIGNED_32BIT_INTEGER)
        return Int32Array;
      return Float64Array;
    };
    exports.getNumberType = function(value) {
      if (value === (value | 0)) {
        if (Math.sign(value) === -1) {
          if (value <= 127 && value >= -128)
            return Int8Array;
          if (value <= 32767 && value >= -32768)
            return Int16Array;
          return Int32Array;
        } else {
          if (value <= 255)
            return Uint8Array;
          if (value <= 65535)
            return Uint16Array;
          return Uint32Array;
        }
      }
      return Float64Array;
    };
    var TYPE_PRIORITY = {
      Uint8Array: 1,
      Int8Array: 2,
      Uint16Array: 3,
      Int16Array: 4,
      Uint32Array: 5,
      Int32Array: 6,
      Float32Array: 7,
      Float64Array: 8
    };
    exports.getMinimalRepresentation = function(array2, getter) {
      var maxType = null, maxPriority = 0, p, t, v, i, l;
      for (i = 0, l = array2.length; i < l; i++) {
        v = getter ? getter(array2[i]) : array2[i];
        t = exports.getNumberType(v);
        p = TYPE_PRIORITY[t.name];
        if (p > maxPriority) {
          maxPriority = p;
          maxType = t;
        }
      }
      return maxType;
    };
    exports.isTypedArray = function(value) {
      return typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value);
    };
    exports.concat = function() {
      var length = 0, i, o, l;
      for (i = 0, l = arguments.length; i < l; i++)
        length += arguments[i].length;
      var array2 = new arguments[0].constructor(length);
      for (i = 0, o = 0; i < l; i++) {
        array2.set(arguments[i], o);
        o += arguments[i].length;
      }
      return array2;
    };
    exports.indices = function(length) {
      var PointerArray = exports.getPointerArray(length);
      var array2 = new PointerArray(length);
      for (var i = 0; i < length; i++)
        array2[i] = i;
      return array2;
    };
  }
});

// node_modules/mnemonist/sparse-map.js
var require_sparse_map = __commonJS({
  "node_modules/mnemonist/sparse-map.js"(exports, module) {
    var Iterator = require_iterator();
    var getPointerArray = require_typed_arrays().getPointerArray;
    function SparseMap(Values, length) {
      if (arguments.length < 2) {
        length = Values;
        Values = Array;
      }
      var ByteArray = getPointerArray(length);
      this.size = 0;
      this.length = length;
      this.dense = new ByteArray(length);
      this.sparse = new ByteArray(length);
      this.vals = new Values(length);
    }
    SparseMap.prototype.clear = function() {
      this.size = 0;
    };
    SparseMap.prototype.has = function(member) {
      var index = this.sparse[member];
      return index < this.size && this.dense[index] === member;
    };
    SparseMap.prototype.get = function(member) {
      var index = this.sparse[member];
      if (index < this.size && this.dense[index] === member)
        return this.vals[index];
      return;
    };
    SparseMap.prototype.set = function(member, value) {
      var index = this.sparse[member];
      if (index < this.size && this.dense[index] === member) {
        this.vals[index] = value;
        return this;
      }
      this.dense[this.size] = member;
      this.sparse[member] = this.size;
      this.vals[this.size] = value;
      this.size++;
      return this;
    };
    SparseMap.prototype.delete = function(member) {
      var index = this.sparse[member];
      if (index >= this.size || this.dense[index] !== member)
        return false;
      index = this.dense[this.size - 1];
      this.dense[this.sparse[member]] = index;
      this.sparse[index] = this.sparse[member];
      this.size--;
      return true;
    };
    SparseMap.prototype.forEach = function(callback, scope) {
      scope = arguments.length > 1 ? scope : this;
      for (var i = 0; i < this.size; i++)
        callback.call(scope, this.vals[i], this.dense[i]);
    };
    SparseMap.prototype.keys = function() {
      var size = this.size, dense = this.dense, i = 0;
      return new Iterator(function() {
        if (i < size) {
          var item = dense[i];
          i++;
          return {
            value: item
          };
        }
        return {
          done: true
        };
      });
    };
    SparseMap.prototype.values = function() {
      var size = this.size, values = this.vals, i = 0;
      return new Iterator(function() {
        if (i < size) {
          var item = values[i];
          i++;
          return {
            value: item
          };
        }
        return {
          done: true
        };
      });
    };
    SparseMap.prototype.entries = function() {
      var size = this.size, dense = this.dense, values = this.vals, i = 0;
      return new Iterator(function() {
        if (i < size) {
          var item = [dense[i], values[i]];
          i++;
          return {
            value: item
          };
        }
        return {
          done: true
        };
      });
    };
    if (typeof Symbol !== "undefined")
      SparseMap.prototype[Symbol.iterator] = SparseMap.prototype.entries;
    SparseMap.prototype.inspect = function() {
      var proxy = /* @__PURE__ */ new Map();
      for (var i = 0; i < this.size; i++)
        proxy.set(this.dense[i], this.vals[i]);
      Object.defineProperty(proxy, "constructor", {
        value: SparseMap,
        enumerable: false
      });
      proxy.length = this.length;
      if (this.vals.constructor !== Array)
        proxy.type = this.vals.constructor.name;
      return proxy;
    };
    if (typeof Symbol !== "undefined")
      SparseMap.prototype[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = SparseMap.prototype.inspect;
    module.exports = SparseMap;
  }
});

// node_modules/mnemonist/sparse-queue-set.js
var require_sparse_queue_set = __commonJS({
  "node_modules/mnemonist/sparse-queue-set.js"(exports, module) {
    var Iterator = require_iterator();
    var getPointerArray = require_typed_arrays().getPointerArray;
    function SparseQueueSet(capacity) {
      var ByteArray = getPointerArray(capacity);
      this.start = 0;
      this.size = 0;
      this.capacity = capacity;
      this.dense = new ByteArray(capacity);
      this.sparse = new ByteArray(capacity);
    }
    SparseQueueSet.prototype.clear = function() {
      this.start = 0;
      this.size = 0;
    };
    SparseQueueSet.prototype.has = function(member) {
      if (this.size === 0)
        return false;
      var index = this.sparse[member];
      var inBounds = index < this.capacity && (index >= this.start && index < this.start + this.size) || index < (this.start + this.size) % this.capacity;
      return inBounds && this.dense[index] === member;
    };
    SparseQueueSet.prototype.enqueue = function(member) {
      var index = this.sparse[member];
      if (this.size !== 0) {
        var inBounds = index < this.capacity && (index >= this.start && index < this.start + this.size) || index < (this.start + this.size) % this.capacity;
        if (inBounds && this.dense[index] === member)
          return this;
      }
      index = (this.start + this.size) % this.capacity;
      this.dense[index] = member;
      this.sparse[member] = index;
      this.size++;
      return this;
    };
    SparseQueueSet.prototype.dequeue = function() {
      if (this.size === 0)
        return;
      var index = this.start;
      this.size--;
      this.start++;
      if (this.start === this.capacity)
        this.start = 0;
      var member = this.dense[index];
      this.sparse[member] = this.capacity;
      return member;
    };
    SparseQueueSet.prototype.forEach = function(callback, scope) {
      scope = arguments.length > 1 ? scope : this;
      var c = this.capacity, l = this.size, i = this.start, j = 0;
      while (j < l) {
        callback.call(scope, this.dense[i], j, this);
        i++;
        j++;
        if (i === c)
          i = 0;
      }
    };
    SparseQueueSet.prototype.values = function() {
      var dense = this.dense, c = this.capacity, l = this.size, i = this.start, j = 0;
      return new Iterator(function() {
        if (j >= l)
          return {
            done: true
          };
        var value = dense[i];
        i++;
        j++;
        if (i === c)
          i = 0;
        return {
          value,
          done: false
        };
      });
    };
    if (typeof Symbol !== "undefined")
      SparseQueueSet.prototype[Symbol.iterator] = SparseQueueSet.prototype.values;
    SparseQueueSet.prototype.inspect = function() {
      var proxy = [];
      this.forEach(function(member) {
        proxy.push(member);
      });
      Object.defineProperty(proxy, "constructor", {
        value: SparseQueueSet,
        enumerable: false
      });
      proxy.capacity = this.capacity;
      return proxy;
    };
    if (typeof Symbol !== "undefined")
      SparseQueueSet.prototype[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = SparseQueueSet.prototype.inspect;
    module.exports = SparseQueueSet;
  }
});

// node_modules/pandemonium/random-index.js
var require_random_index = __commonJS({
  "node_modules/pandemonium/random-index.js"(exports, module) {
    function createRandomIndex(rng) {
      return function(length) {
        if (typeof length !== "number") length = length.length;
        return Math.floor(rng() * length);
      };
    }
    var randomIndex = createRandomIndex(Math.random);
    randomIndex.createRandomIndex = createRandomIndex;
    module.exports = randomIndex;
  }
});

// node_modules/graphology-utils/getters.js
var require_getters = __commonJS({
  "node_modules/graphology-utils/getters.js"(exports) {
    function coerceWeight(value) {
      if (typeof value !== "number" || isNaN(value)) return 1;
      return value;
    }
    function createNodeValueGetter(nameOrFunction, defaultValue) {
      var getter = {};
      var coerceToDefault = function(v) {
        if (typeof v === "undefined") return defaultValue;
        return v;
      };
      if (typeof defaultValue === "function") coerceToDefault = defaultValue;
      var get = function(attributes) {
        return coerceToDefault(attributes[nameOrFunction]);
      };
      var returnDefault = function() {
        return coerceToDefault(void 0);
      };
      if (typeof nameOrFunction === "string") {
        getter.fromAttributes = get;
        getter.fromGraph = function(graph, node) {
          return get(graph.getNodeAttributes(node));
        };
        getter.fromEntry = function(node, attributes) {
          return get(attributes);
        };
      } else if (typeof nameOrFunction === "function") {
        getter.fromAttributes = function() {
          throw new Error(
            "graphology-utils/getters/createNodeValueGetter: irrelevant usage."
          );
        };
        getter.fromGraph = function(graph, node) {
          return coerceToDefault(
            nameOrFunction(node, graph.getNodeAttributes(node))
          );
        };
        getter.fromEntry = function(node, attributes) {
          return coerceToDefault(nameOrFunction(node, attributes));
        };
      } else {
        getter.fromAttributes = returnDefault;
        getter.fromGraph = returnDefault;
        getter.fromEntry = returnDefault;
      }
      return getter;
    }
    function createEdgeValueGetter(nameOrFunction, defaultValue) {
      var getter = {};
      var coerceToDefault = function(v) {
        if (typeof v === "undefined") return defaultValue;
        return v;
      };
      if (typeof defaultValue === "function") coerceToDefault = defaultValue;
      var get = function(attributes) {
        return coerceToDefault(attributes[nameOrFunction]);
      };
      var returnDefault = function() {
        return coerceToDefault(void 0);
      };
      if (typeof nameOrFunction === "string") {
        getter.fromAttributes = get;
        getter.fromGraph = function(graph, edge) {
          return get(graph.getEdgeAttributes(edge));
        };
        getter.fromEntry = function(edge, attributes) {
          return get(attributes);
        };
        getter.fromPartialEntry = getter.fromEntry;
        getter.fromMinimalEntry = getter.fromEntry;
      } else if (typeof nameOrFunction === "function") {
        getter.fromAttributes = function() {
          throw new Error(
            "graphology-utils/getters/createEdgeValueGetter: irrelevant usage."
          );
        };
        getter.fromGraph = function(graph, edge) {
          var extremities = graph.extremities(edge);
          return coerceToDefault(
            nameOrFunction(
              edge,
              graph.getEdgeAttributes(edge),
              extremities[0],
              extremities[1],
              graph.getNodeAttributes(extremities[0]),
              graph.getNodeAttributes(extremities[1]),
              graph.isUndirected(edge)
            )
          );
        };
        getter.fromEntry = function(e, a, s, t, sa, ta, u) {
          return coerceToDefault(nameOrFunction(e, a, s, t, sa, ta, u));
        };
        getter.fromPartialEntry = function(e, a, s, t) {
          return coerceToDefault(nameOrFunction(e, a, s, t));
        };
        getter.fromMinimalEntry = function(e, a) {
          return coerceToDefault(nameOrFunction(e, a));
        };
      } else {
        getter.fromAttributes = returnDefault;
        getter.fromGraph = returnDefault;
        getter.fromEntry = returnDefault;
        getter.fromMinimalEntry = returnDefault;
      }
      return getter;
    }
    exports.createNodeValueGetter = createNodeValueGetter;
    exports.createEdgeValueGetter = createEdgeValueGetter;
    exports.createEdgeWeightGetter = function(name) {
      return createEdgeValueGetter(name, coerceWeight);
    };
  }
});

// node_modules/graphology-indices/louvain.js
var require_louvain = __commonJS({
  "node_modules/graphology-indices/louvain.js"(exports) {
    var typed = require_typed_arrays();
    var resolveDefaults = require_defaults();
    var createEdgeWeightGetter = require_getters().createEdgeWeightGetter;
    var INSPECT = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
    var DEFAULTS = {
      getEdgeWeight: "weight",
      keepDendrogram: false,
      resolution: 1
    };
    function UndirectedLouvainIndex(graph, options) {
      options = resolveDefaults(options, DEFAULTS);
      var resolution = options.resolution;
      var getEdgeWeight = createEdgeWeightGetter(options.getEdgeWeight).fromEntry;
      var size = (graph.size - graph.selfLoopCount) * 2;
      var NeighborhoodPointerArray = typed.getPointerArray(size);
      var NodesPointerArray = typed.getPointerArray(graph.order + 1);
      var WeightsArray = options.getEdgeWeight ? Float64Array : typed.getPointerArray(graph.size * 2);
      this.C = graph.order;
      this.M = 0;
      this.E = size;
      this.U = 0;
      this.resolution = resolution;
      this.level = 0;
      this.graph = graph;
      this.nodes = new Array(graph.order);
      this.keepDendrogram = options.keepDendrogram;
      this.neighborhood = new NodesPointerArray(size);
      this.weights = new WeightsArray(size);
      this.loops = new WeightsArray(graph.order);
      this.starts = new NeighborhoodPointerArray(graph.order + 1);
      this.belongings = new NodesPointerArray(graph.order);
      this.dendrogram = [];
      this.mapping = null;
      this.counts = new NodesPointerArray(graph.order);
      this.unused = new NodesPointerArray(graph.order);
      this.totalWeights = new WeightsArray(graph.order);
      var ids = {};
      var weight;
      var i = 0, n = 0;
      var self = this;
      graph.forEachNode(function(node) {
        self.nodes[i] = node;
        ids[node] = i;
        n += graph.undirectedDegreeWithoutSelfLoops(node);
        self.starts[i] = n;
        self.belongings[i] = i;
        self.counts[i] = 1;
        i++;
      });
      graph.forEachEdge(function(edge, attr, source, target, sa, ta, u) {
        weight = getEdgeWeight(edge, attr, source, target, sa, ta, u);
        source = ids[source];
        target = ids[target];
        self.M += weight;
        if (source === target) {
          self.totalWeights[source] += weight * 2;
          self.loops[source] = weight * 2;
        } else {
          self.totalWeights[source] += weight;
          self.totalWeights[target] += weight;
          var startSource = --self.starts[source], startTarget = --self.starts[target];
          self.neighborhood[startSource] = target;
          self.neighborhood[startTarget] = source;
          self.weights[startSource] = weight;
          self.weights[startTarget] = weight;
        }
      });
      this.starts[i] = this.E;
      if (this.keepDendrogram) this.dendrogram.push(this.belongings.slice());
      else this.mapping = this.belongings.slice();
    }
    UndirectedLouvainIndex.prototype.isolate = function(i, degree) {
      var currentCommunity = this.belongings[i];
      if (this.counts[currentCommunity] === 1) return currentCommunity;
      var newCommunity = this.unused[--this.U];
      var loops = this.loops[i];
      this.totalWeights[currentCommunity] -= degree + loops;
      this.totalWeights[newCommunity] += degree + loops;
      this.belongings[i] = newCommunity;
      this.counts[currentCommunity]--;
      this.counts[newCommunity]++;
      return newCommunity;
    };
    UndirectedLouvainIndex.prototype.move = function(i, degree, targetCommunity) {
      var currentCommunity = this.belongings[i], loops = this.loops[i];
      this.totalWeights[currentCommunity] -= degree + loops;
      this.totalWeights[targetCommunity] += degree + loops;
      this.belongings[i] = targetCommunity;
      var nowEmpty = this.counts[currentCommunity]-- === 1;
      this.counts[targetCommunity]++;
      if (nowEmpty) this.unused[this.U++] = currentCommunity;
    };
    UndirectedLouvainIndex.prototype.computeNodeDegree = function(i) {
      var o, l, weight;
      var degree = 0;
      for (o = this.starts[i], l = this.starts[i + 1]; o < l; o++) {
        weight = this.weights[o];
        degree += weight;
      }
      return degree;
    };
    UndirectedLouvainIndex.prototype.expensiveIsolate = function(i) {
      var degree = this.computeNodeDegree(i);
      return this.isolate(i, degree);
    };
    UndirectedLouvainIndex.prototype.expensiveMove = function(i, ci) {
      var degree = this.computeNodeDegree(i);
      this.move(i, degree, ci);
    };
    UndirectedLouvainIndex.prototype.zoomOut = function() {
      var inducedGraph = new Array(this.C - this.U), newLabels = {};
      var N = this.nodes.length;
      var C = 0, E = 0;
      var i, j, l, m, n, ci, cj, data, adj;
      for (i = 0, l = this.C; i < l; i++) {
        ci = this.belongings[i];
        if (!(ci in newLabels)) {
          newLabels[ci] = C;
          inducedGraph[C] = {
            adj: {},
            totalWeights: this.totalWeights[ci],
            internalWeights: 0
          };
          C++;
        }
        this.belongings[i] = newLabels[ci];
      }
      var currentLevel, nextLevel;
      if (this.keepDendrogram) {
        currentLevel = this.dendrogram[this.level];
        nextLevel = new (typed.getPointerArray(C))(N);
        for (i = 0; i < N; i++) nextLevel[i] = this.belongings[currentLevel[i]];
        this.dendrogram.push(nextLevel);
      } else {
        for (i = 0; i < N; i++) this.mapping[i] = this.belongings[this.mapping[i]];
      }
      for (i = 0, l = this.C; i < l; i++) {
        ci = this.belongings[i];
        data = inducedGraph[ci];
        adj = data.adj;
        data.internalWeights += this.loops[i];
        for (j = this.starts[i], m = this.starts[i + 1]; j < m; j++) {
          n = this.neighborhood[j];
          cj = this.belongings[n];
          if (ci === cj) {
            data.internalWeights += this.weights[j];
            continue;
          }
          if (!(cj in adj)) adj[cj] = 0;
          adj[cj] += this.weights[j];
        }
      }
      this.C = C;
      n = 0;
      for (ci = 0; ci < C; ci++) {
        data = inducedGraph[ci];
        adj = data.adj;
        ci = +ci;
        this.totalWeights[ci] = data.totalWeights;
        this.loops[ci] = data.internalWeights;
        this.counts[ci] = 1;
        this.starts[ci] = n;
        this.belongings[ci] = ci;
        for (cj in adj) {
          this.neighborhood[n] = +cj;
          this.weights[n] = adj[cj];
          E++;
          n++;
        }
      }
      this.starts[C] = E;
      this.E = E;
      this.U = 0;
      this.level++;
      return newLabels;
    };
    UndirectedLouvainIndex.prototype.modularity = function() {
      var ci, cj, i, j, m;
      var Q = 0;
      var M2 = this.M * 2;
      var internalWeights = new Float64Array(this.C);
      for (i = 0; i < this.C; i++) {
        ci = this.belongings[i];
        internalWeights[ci] += this.loops[i];
        for (j = this.starts[i], m = this.starts[i + 1]; j < m; j++) {
          cj = this.belongings[this.neighborhood[j]];
          if (ci !== cj) continue;
          internalWeights[ci] += this.weights[j];
        }
      }
      for (i = 0; i < this.C; i++) {
        Q += internalWeights[i] / M2 - Math.pow(this.totalWeights[i] / M2, 2) * this.resolution;
      }
      return Q;
    };
    UndirectedLouvainIndex.prototype.delta = function(i, degree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalWeight = this.totalWeights[targetCommunity];
      degree += this.loops[i];
      return targetCommunityDegree / M - // NOTE: formula is a bit different here because targetCommunityDegree is passed without * 2
      targetCommunityTotalWeight * degree * this.resolution / (2 * M * M);
    };
    UndirectedLouvainIndex.prototype.deltaWithOwnCommunity = function(i, degree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalWeight = this.totalWeights[targetCommunity];
      degree += this.loops[i];
      return targetCommunityDegree / M - // NOTE: formula is a bit different here because targetCommunityDegree is passed without * 2
      (targetCommunityTotalWeight - degree) * degree * this.resolution / (2 * M * M);
    };
    UndirectedLouvainIndex.prototype.fastDelta = function(i, degree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalWeight = this.totalWeights[targetCommunity];
      degree += this.loops[i];
      return targetCommunityDegree - degree * targetCommunityTotalWeight * this.resolution / (2 * M);
    };
    UndirectedLouvainIndex.prototype.fastDeltaWithOwnCommunity = function(i, degree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalWeight = this.totalWeights[targetCommunity];
      degree += this.loops[i];
      return targetCommunityDegree - degree * (targetCommunityTotalWeight - degree) * this.resolution / (2 * M);
    };
    UndirectedLouvainIndex.prototype.bounds = function(i) {
      return [this.starts[i], this.starts[i + 1]];
    };
    UndirectedLouvainIndex.prototype.project = function() {
      var self = this;
      var projection = {};
      self.nodes.slice(0, this.C).forEach(function(node, i) {
        projection[node] = Array.from(
          self.neighborhood.slice(self.starts[i], self.starts[i + 1])
        ).map(function(j) {
          return self.nodes[j];
        });
      });
      return projection;
    };
    UndirectedLouvainIndex.prototype.collect = function(level) {
      if (arguments.length < 1) level = this.level;
      var o = {};
      var mapping = this.keepDendrogram ? this.dendrogram[level] : this.mapping;
      var i, l;
      for (i = 0, l = mapping.length; i < l; i++) o[this.nodes[i]] = mapping[i];
      return o;
    };
    UndirectedLouvainIndex.prototype.assign = function(prop, level) {
      if (arguments.length < 2) level = this.level;
      var mapping = this.keepDendrogram ? this.dendrogram[level] : this.mapping;
      var i, l;
      for (i = 0, l = mapping.length; i < l; i++)
        this.graph.setNodeAttribute(this.nodes[i], prop, mapping[i]);
    };
    UndirectedLouvainIndex.prototype[INSPECT] = function() {
      var proxy = {};
      Object.defineProperty(proxy, "constructor", {
        value: UndirectedLouvainIndex,
        enumerable: false
      });
      proxy.C = this.C;
      proxy.M = this.M;
      proxy.E = this.E;
      proxy.U = this.U;
      proxy.resolution = this.resolution;
      proxy.level = this.level;
      proxy.nodes = this.nodes;
      proxy.starts = this.starts.slice(0, proxy.C + 1);
      var eTruncated = ["neighborhood", "weights"];
      var cTruncated = ["counts", "loops", "belongings", "totalWeights"];
      var self = this;
      eTruncated.forEach(function(key) {
        proxy[key] = self[key].slice(0, proxy.E);
      });
      cTruncated.forEach(function(key) {
        proxy[key] = self[key].slice(0, proxy.C);
      });
      proxy.unused = this.unused.slice(0, this.U);
      if (this.keepDendrogram) proxy.dendrogram = this.dendrogram;
      else proxy.mapping = this.mapping;
      return proxy;
    };
    function DirectedLouvainIndex(graph, options) {
      options = resolveDefaults(options, DEFAULTS);
      var resolution = options.resolution;
      var getEdgeWeight = createEdgeWeightGetter(options.getEdgeWeight).fromEntry;
      var size = (graph.size - graph.selfLoopCount) * 2;
      var NeighborhoodPointerArray = typed.getPointerArray(size);
      var NodesPointerArray = typed.getPointerArray(graph.order + 1);
      var WeightsArray = options.getEdgeWeight ? Float64Array : typed.getPointerArray(graph.size * 2);
      this.C = graph.order;
      this.M = 0;
      this.E = size;
      this.U = 0;
      this.resolution = resolution;
      this.level = 0;
      this.graph = graph;
      this.nodes = new Array(graph.order);
      this.keepDendrogram = options.keepDendrogram;
      this.neighborhood = new NodesPointerArray(size);
      this.weights = new WeightsArray(size);
      this.loops = new WeightsArray(graph.order);
      this.starts = new NeighborhoodPointerArray(graph.order + 1);
      this.offsets = new NeighborhoodPointerArray(graph.order);
      this.belongings = new NodesPointerArray(graph.order);
      this.dendrogram = [];
      this.counts = new NodesPointerArray(graph.order);
      this.unused = new NodesPointerArray(graph.order);
      this.totalInWeights = new WeightsArray(graph.order);
      this.totalOutWeights = new WeightsArray(graph.order);
      var ids = {};
      var weight;
      var i = 0, n = 0;
      var self = this;
      graph.forEachNode(function(node) {
        self.nodes[i] = node;
        ids[node] = i;
        n += graph.outDegreeWithoutSelfLoops(node);
        self.starts[i] = n;
        n += graph.inDegreeWithoutSelfLoops(node);
        self.offsets[i] = n;
        self.belongings[i] = i;
        self.counts[i] = 1;
        i++;
      });
      graph.forEachEdge(function(edge, attr, source, target, sa, ta, u) {
        weight = getEdgeWeight(edge, attr, source, target, sa, ta, u);
        source = ids[source];
        target = ids[target];
        self.M += weight;
        if (source === target) {
          self.loops[source] += weight;
          self.totalInWeights[source] += weight;
          self.totalOutWeights[source] += weight;
        } else {
          self.totalOutWeights[source] += weight;
          self.totalInWeights[target] += weight;
          var startSource = --self.starts[source], startTarget = --self.offsets[target];
          self.neighborhood[startSource] = target;
          self.neighborhood[startTarget] = source;
          self.weights[startSource] = weight;
          self.weights[startTarget] = weight;
        }
      });
      this.starts[i] = this.E;
      if (this.keepDendrogram) this.dendrogram.push(this.belongings.slice());
      else this.mapping = this.belongings.slice();
    }
    DirectedLouvainIndex.prototype.bounds = UndirectedLouvainIndex.prototype.bounds;
    DirectedLouvainIndex.prototype.inBounds = function(i) {
      return [this.offsets[i], this.starts[i + 1]];
    };
    DirectedLouvainIndex.prototype.outBounds = function(i) {
      return [this.starts[i], this.offsets[i]];
    };
    DirectedLouvainIndex.prototype.project = UndirectedLouvainIndex.prototype.project;
    DirectedLouvainIndex.prototype.projectIn = function() {
      var self = this;
      var projection = {};
      self.nodes.slice(0, this.C).forEach(function(node, i) {
        projection[node] = Array.from(
          self.neighborhood.slice(self.offsets[i], self.starts[i + 1])
        ).map(function(j) {
          return self.nodes[j];
        });
      });
      return projection;
    };
    DirectedLouvainIndex.prototype.projectOut = function() {
      var self = this;
      var projection = {};
      self.nodes.slice(0, this.C).forEach(function(node, i) {
        projection[node] = Array.from(
          self.neighborhood.slice(self.starts[i], self.offsets[i])
        ).map(function(j) {
          return self.nodes[j];
        });
      });
      return projection;
    };
    DirectedLouvainIndex.prototype.isolate = function(i, inDegree, outDegree) {
      var currentCommunity = this.belongings[i];
      if (this.counts[currentCommunity] === 1) return currentCommunity;
      var newCommunity = this.unused[--this.U];
      var loops = this.loops[i];
      this.totalInWeights[currentCommunity] -= inDegree + loops;
      this.totalInWeights[newCommunity] += inDegree + loops;
      this.totalOutWeights[currentCommunity] -= outDegree + loops;
      this.totalOutWeights[newCommunity] += outDegree + loops;
      this.belongings[i] = newCommunity;
      this.counts[currentCommunity]--;
      this.counts[newCommunity]++;
      return newCommunity;
    };
    DirectedLouvainIndex.prototype.move = function(i, inDegree, outDegree, targetCommunity) {
      var currentCommunity = this.belongings[i], loops = this.loops[i];
      this.totalInWeights[currentCommunity] -= inDegree + loops;
      this.totalInWeights[targetCommunity] += inDegree + loops;
      this.totalOutWeights[currentCommunity] -= outDegree + loops;
      this.totalOutWeights[targetCommunity] += outDegree + loops;
      this.belongings[i] = targetCommunity;
      var nowEmpty = this.counts[currentCommunity]-- === 1;
      this.counts[targetCommunity]++;
      if (nowEmpty) this.unused[this.U++] = currentCommunity;
    };
    DirectedLouvainIndex.prototype.computeNodeInDegree = function(i) {
      var o, l, weight;
      var inDegree = 0;
      for (o = this.offsets[i], l = this.starts[i + 1]; o < l; o++) {
        weight = this.weights[o];
        inDegree += weight;
      }
      return inDegree;
    };
    DirectedLouvainIndex.prototype.computeNodeOutDegree = function(i) {
      var o, l, weight;
      var outDegree = 0;
      for (o = this.starts[i], l = this.offsets[i]; o < l; o++) {
        weight = this.weights[o];
        outDegree += weight;
      }
      return outDegree;
    };
    DirectedLouvainIndex.prototype.expensiveMove = function(i, ci) {
      var inDegree = this.computeNodeInDegree(i), outDegree = this.computeNodeOutDegree(i);
      this.move(i, inDegree, outDegree, ci);
    };
    DirectedLouvainIndex.prototype.zoomOut = function() {
      var inducedGraph = new Array(this.C - this.U), newLabels = {};
      var N = this.nodes.length;
      var C = 0, E = 0;
      var i, j, l, m, n, ci, cj, data, offset, out, adj, inAdj, outAdj;
      for (i = 0, l = this.C; i < l; i++) {
        ci = this.belongings[i];
        if (!(ci in newLabels)) {
          newLabels[ci] = C;
          inducedGraph[C] = {
            inAdj: {},
            outAdj: {},
            totalInWeights: this.totalInWeights[ci],
            totalOutWeights: this.totalOutWeights[ci],
            internalWeights: 0
          };
          C++;
        }
        this.belongings[i] = newLabels[ci];
      }
      var currentLevel, nextLevel;
      if (this.keepDendrogram) {
        currentLevel = this.dendrogram[this.level];
        nextLevel = new (typed.getPointerArray(C))(N);
        for (i = 0; i < N; i++) nextLevel[i] = this.belongings[currentLevel[i]];
        this.dendrogram.push(nextLevel);
      } else {
        for (i = 0; i < N; i++) this.mapping[i] = this.belongings[this.mapping[i]];
      }
      for (i = 0, l = this.C; i < l; i++) {
        ci = this.belongings[i];
        offset = this.offsets[i];
        data = inducedGraph[ci];
        inAdj = data.inAdj;
        outAdj = data.outAdj;
        data.internalWeights += this.loops[i];
        for (j = this.starts[i], m = this.starts[i + 1]; j < m; j++) {
          n = this.neighborhood[j];
          cj = this.belongings[n];
          out = j < offset;
          adj = out ? outAdj : inAdj;
          if (ci === cj) {
            if (out) data.internalWeights += this.weights[j];
            continue;
          }
          if (!(cj in adj)) adj[cj] = 0;
          adj[cj] += this.weights[j];
        }
      }
      this.C = C;
      n = 0;
      for (ci = 0; ci < C; ci++) {
        data = inducedGraph[ci];
        inAdj = data.inAdj;
        outAdj = data.outAdj;
        ci = +ci;
        this.totalInWeights[ci] = data.totalInWeights;
        this.totalOutWeights[ci] = data.totalOutWeights;
        this.loops[ci] = data.internalWeights;
        this.counts[ci] = 1;
        this.starts[ci] = n;
        this.belongings[ci] = ci;
        for (cj in outAdj) {
          this.neighborhood[n] = +cj;
          this.weights[n] = outAdj[cj];
          E++;
          n++;
        }
        this.offsets[ci] = n;
        for (cj in inAdj) {
          this.neighborhood[n] = +cj;
          this.weights[n] = inAdj[cj];
          E++;
          n++;
        }
      }
      this.starts[C] = E;
      this.E = E;
      this.U = 0;
      this.level++;
      return newLabels;
    };
    DirectedLouvainIndex.prototype.modularity = function() {
      var ci, cj, i, j, m;
      var Q = 0;
      var M = this.M;
      var internalWeights = new Float64Array(this.C);
      for (i = 0; i < this.C; i++) {
        ci = this.belongings[i];
        internalWeights[ci] += this.loops[i];
        for (j = this.starts[i], m = this.offsets[i]; j < m; j++) {
          cj = this.belongings[this.neighborhood[j]];
          if (ci !== cj) continue;
          internalWeights[ci] += this.weights[j];
        }
      }
      for (i = 0; i < this.C; i++)
        Q += internalWeights[i] / M - this.totalInWeights[i] * this.totalOutWeights[i] / Math.pow(M, 2) * this.resolution;
      return Q;
    };
    DirectedLouvainIndex.prototype.delta = function(i, inDegree, outDegree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalInWeight = this.totalInWeights[targetCommunity], targetCommunityTotalOutWeight = this.totalOutWeights[targetCommunity];
      var loops = this.loops[i];
      inDegree += loops;
      outDegree += loops;
      return targetCommunityDegree / M - (outDegree * targetCommunityTotalInWeight + inDegree * targetCommunityTotalOutWeight) * this.resolution / (M * M);
    };
    DirectedLouvainIndex.prototype.deltaWithOwnCommunity = function(i, inDegree, outDegree, targetCommunityDegree, targetCommunity) {
      var M = this.M;
      var targetCommunityTotalInWeight = this.totalInWeights[targetCommunity], targetCommunityTotalOutWeight = this.totalOutWeights[targetCommunity];
      var loops = this.loops[i];
      inDegree += loops;
      outDegree += loops;
      return targetCommunityDegree / M - (outDegree * (targetCommunityTotalInWeight - inDegree) + inDegree * (targetCommunityTotalOutWeight - outDegree)) * this.resolution / (M * M);
    };
    DirectedLouvainIndex.prototype.collect = UndirectedLouvainIndex.prototype.collect;
    DirectedLouvainIndex.prototype.assign = UndirectedLouvainIndex.prototype.assign;
    DirectedLouvainIndex.prototype[INSPECT] = function() {
      var proxy = {};
      Object.defineProperty(proxy, "constructor", {
        value: DirectedLouvainIndex,
        enumerable: false
      });
      proxy.C = this.C;
      proxy.M = this.M;
      proxy.E = this.E;
      proxy.U = this.U;
      proxy.resolution = this.resolution;
      proxy.level = this.level;
      proxy.nodes = this.nodes;
      proxy.starts = this.starts.slice(0, proxy.C + 1);
      var eTruncated = ["neighborhood", "weights"];
      var cTruncated = [
        "counts",
        "offsets",
        "loops",
        "belongings",
        "totalInWeights",
        "totalOutWeights"
      ];
      var self = this;
      eTruncated.forEach(function(key) {
        proxy[key] = self[key].slice(0, proxy.E);
      });
      cTruncated.forEach(function(key) {
        proxy[key] = self[key].slice(0, proxy.C);
      });
      proxy.unused = this.unused.slice(0, this.U);
      if (this.keepDendrogram) proxy.dendrogram = this.dendrogram;
      else proxy.mapping = this.mapping;
      return proxy;
    };
    exports.UndirectedLouvainIndex = UndirectedLouvainIndex;
    exports.DirectedLouvainIndex = DirectedLouvainIndex;
  }
});

// node_modules/graphology-communities-louvain/index.js
var require_graphology_communities_louvain = __commonJS({
  "node_modules/graphology-communities-louvain/index.js"(exports, module) {
    var resolveDefaults = require_defaults();
    var isGraph = require_is_graph();
    var inferType = require_infer_type();
    var SparseMap = require_sparse_map();
    var SparseQueueSet = require_sparse_queue_set();
    var createRandomIndex = require_random_index().createRandomIndex;
    var indices = require_louvain();
    var UndirectedLouvainIndex = indices.UndirectedLouvainIndex;
    var DirectedLouvainIndex = indices.DirectedLouvainIndex;
    var DEFAULTS = {
      nodeCommunityAttribute: "community",
      getEdgeWeight: "weight",
      fastLocalMoves: true,
      randomWalk: true,
      resolution: 1,
      rng: Math.random
    };
    function addWeightToCommunity(map2, community, weight) {
      var currentWeight = map2.get(community);
      if (typeof currentWeight === "undefined") currentWeight = 0;
      currentWeight += weight;
      map2.set(community, currentWeight);
    }
    var EPSILON = 1e-10;
    function tieBreaker(bestCommunity, currentCommunity, targetCommunity, delta, bestDelta) {
      if (Math.abs(delta - bestDelta) < EPSILON) {
        if (bestCommunity === currentCommunity) {
          return false;
        } else {
          return targetCommunity > bestCommunity;
        }
      } else if (delta > bestDelta) {
        return true;
      }
      return false;
    }
    function undirectedLouvain(detailed, graph, options) {
      var index = new UndirectedLouvainIndex(graph, {
        getEdgeWeight: options.getEdgeWeight,
        keepDendrogram: detailed,
        resolution: options.resolution
      });
      var randomIndex = createRandomIndex(options.rng);
      var moveWasMade = true, localMoveWasMade = true;
      var currentCommunity, targetCommunity;
      var communities = new SparseMap(Float64Array, index.C);
      var queue, start, end, weight, ci, ri, s, i, j, l;
      var degree, targetCommunityDegree;
      var bestCommunity, bestDelta, deltaIsBetter, delta;
      var deltaComputations = 0, nodesVisited = 0, moves = [], localMoves, currentMoves;
      if (options.fastLocalMoves) queue = new SparseQueueSet(index.C);
      while (moveWasMade) {
        l = index.C;
        moveWasMade = false;
        localMoveWasMade = true;
        if (options.fastLocalMoves) {
          currentMoves = 0;
          ri = options.randomWalk ? randomIndex(l) : 0;
          for (s = 0; s < l; s++, ri++) {
            i = ri % l;
            queue.enqueue(i);
          }
          while (queue.size !== 0) {
            i = queue.dequeue();
            nodesVisited++;
            degree = 0;
            communities.clear();
            currentCommunity = index.belongings[i];
            start = index.starts[i];
            end = index.starts[i + 1];
            for (; start < end; start++) {
              j = index.neighborhood[start];
              weight = index.weights[start];
              targetCommunity = index.belongings[j];
              degree += weight;
              addWeightToCommunity(communities, targetCommunity, weight);
            }
            bestDelta = index.fastDeltaWithOwnCommunity(
              i,
              degree,
              communities.get(currentCommunity) || 0,
              currentCommunity
            );
            bestCommunity = currentCommunity;
            for (ci = 0; ci < communities.size; ci++) {
              targetCommunity = communities.dense[ci];
              if (targetCommunity === currentCommunity) continue;
              targetCommunityDegree = communities.vals[ci];
              deltaComputations++;
              delta = index.fastDelta(
                i,
                degree,
                targetCommunityDegree,
                targetCommunity
              );
              deltaIsBetter = tieBreaker(
                bestCommunity,
                currentCommunity,
                targetCommunity,
                delta,
                bestDelta
              );
              if (deltaIsBetter) {
                bestDelta = delta;
                bestCommunity = targetCommunity;
              }
            }
            if (bestDelta < 0) {
              bestCommunity = index.isolate(i, degree);
              if (bestCommunity === currentCommunity) continue;
            } else {
              if (bestCommunity === currentCommunity) {
                continue;
              } else {
                index.move(i, degree, bestCommunity);
              }
            }
            moveWasMade = true;
            currentMoves++;
            start = index.starts[i];
            end = index.starts[i + 1];
            for (; start < end; start++) {
              j = index.neighborhood[start];
              targetCommunity = index.belongings[j];
              if (targetCommunity !== bestCommunity) queue.enqueue(j);
            }
          }
          moves.push(currentMoves);
        } else {
          localMoves = [];
          moves.push(localMoves);
          while (localMoveWasMade) {
            localMoveWasMade = false;
            currentMoves = 0;
            ri = options.randomWalk ? randomIndex(l) : 0;
            for (s = 0; s < l; s++, ri++) {
              i = ri % l;
              nodesVisited++;
              degree = 0;
              communities.clear();
              currentCommunity = index.belongings[i];
              start = index.starts[i];
              end = index.starts[i + 1];
              for (; start < end; start++) {
                j = index.neighborhood[start];
                weight = index.weights[start];
                targetCommunity = index.belongings[j];
                degree += weight;
                addWeightToCommunity(communities, targetCommunity, weight);
              }
              bestDelta = index.fastDeltaWithOwnCommunity(
                i,
                degree,
                communities.get(currentCommunity) || 0,
                currentCommunity
              );
              bestCommunity = currentCommunity;
              for (ci = 0; ci < communities.size; ci++) {
                targetCommunity = communities.dense[ci];
                if (targetCommunity === currentCommunity) continue;
                targetCommunityDegree = communities.vals[ci];
                deltaComputations++;
                delta = index.fastDelta(
                  i,
                  degree,
                  targetCommunityDegree,
                  targetCommunity
                );
                deltaIsBetter = tieBreaker(
                  bestCommunity,
                  currentCommunity,
                  targetCommunity,
                  delta,
                  bestDelta
                );
                if (deltaIsBetter) {
                  bestDelta = delta;
                  bestCommunity = targetCommunity;
                }
              }
              if (bestDelta < 0) {
                bestCommunity = index.isolate(i, degree);
                if (bestCommunity === currentCommunity) continue;
              } else {
                if (bestCommunity === currentCommunity) {
                  continue;
                } else {
                  index.move(i, degree, bestCommunity);
                }
              }
              localMoveWasMade = true;
              currentMoves++;
            }
            localMoves.push(currentMoves);
            moveWasMade = localMoveWasMade || moveWasMade;
          }
        }
        if (moveWasMade) index.zoomOut();
      }
      var results = {
        index,
        deltaComputations,
        nodesVisited,
        moves
      };
      return results;
    }
    function directedLouvain(detailed, graph, options) {
      var index = new DirectedLouvainIndex(graph, {
        getEdgeWeight: options.getEdgeWeight,
        keepDendrogram: detailed,
        resolution: options.resolution
      });
      var randomIndex = createRandomIndex(options.rng);
      var moveWasMade = true, localMoveWasMade = true;
      var currentCommunity, targetCommunity;
      var communities = new SparseMap(Float64Array, index.C);
      var queue, start, end, offset, out, weight, ci, ri, s, i, j, l;
      var inDegree, outDegree, targetCommunityDegree;
      var bestCommunity, bestDelta, deltaIsBetter, delta;
      var deltaComputations = 0, nodesVisited = 0, moves = [], localMoves, currentMoves;
      if (options.fastLocalMoves) queue = new SparseQueueSet(index.C);
      while (moveWasMade) {
        l = index.C;
        moveWasMade = false;
        localMoveWasMade = true;
        if (options.fastLocalMoves) {
          currentMoves = 0;
          ri = options.randomWalk ? randomIndex(l) : 0;
          for (s = 0; s < l; s++, ri++) {
            i = ri % l;
            queue.enqueue(i);
          }
          while (queue.size !== 0) {
            i = queue.dequeue();
            nodesVisited++;
            inDegree = 0;
            outDegree = 0;
            communities.clear();
            currentCommunity = index.belongings[i];
            start = index.starts[i];
            end = index.starts[i + 1];
            offset = index.offsets[i];
            for (; start < end; start++) {
              out = start < offset;
              j = index.neighborhood[start];
              weight = index.weights[start];
              targetCommunity = index.belongings[j];
              if (out) outDegree += weight;
              else inDegree += weight;
              addWeightToCommunity(communities, targetCommunity, weight);
            }
            bestDelta = index.deltaWithOwnCommunity(
              i,
              inDegree,
              outDegree,
              communities.get(currentCommunity) || 0,
              currentCommunity
            );
            bestCommunity = currentCommunity;
            for (ci = 0; ci < communities.size; ci++) {
              targetCommunity = communities.dense[ci];
              if (targetCommunity === currentCommunity) continue;
              targetCommunityDegree = communities.vals[ci];
              deltaComputations++;
              delta = index.delta(
                i,
                inDegree,
                outDegree,
                targetCommunityDegree,
                targetCommunity
              );
              deltaIsBetter = tieBreaker(
                bestCommunity,
                currentCommunity,
                targetCommunity,
                delta,
                bestDelta
              );
              if (deltaIsBetter) {
                bestDelta = delta;
                bestCommunity = targetCommunity;
              }
            }
            if (bestDelta < 0) {
              bestCommunity = index.isolate(i, inDegree, outDegree);
              if (bestCommunity === currentCommunity) continue;
            } else {
              if (bestCommunity === currentCommunity) {
                continue;
              } else {
                index.move(i, inDegree, outDegree, bestCommunity);
              }
            }
            moveWasMade = true;
            currentMoves++;
            start = index.starts[i];
            end = index.starts[i + 1];
            for (; start < end; start++) {
              j = index.neighborhood[start];
              targetCommunity = index.belongings[j];
              if (targetCommunity !== bestCommunity) queue.enqueue(j);
            }
          }
          moves.push(currentMoves);
        } else {
          localMoves = [];
          moves.push(localMoves);
          while (localMoveWasMade) {
            localMoveWasMade = false;
            currentMoves = 0;
            ri = options.randomWalk ? randomIndex(l) : 0;
            for (s = 0; s < l; s++, ri++) {
              i = ri % l;
              nodesVisited++;
              inDegree = 0;
              outDegree = 0;
              communities.clear();
              currentCommunity = index.belongings[i];
              start = index.starts[i];
              end = index.starts[i + 1];
              offset = index.offsets[i];
              for (; start < end; start++) {
                out = start < offset;
                j = index.neighborhood[start];
                weight = index.weights[start];
                targetCommunity = index.belongings[j];
                if (out) outDegree += weight;
                else inDegree += weight;
                addWeightToCommunity(communities, targetCommunity, weight);
              }
              bestDelta = index.deltaWithOwnCommunity(
                i,
                inDegree,
                outDegree,
                communities.get(currentCommunity) || 0,
                currentCommunity
              );
              bestCommunity = currentCommunity;
              for (ci = 0; ci < communities.size; ci++) {
                targetCommunity = communities.dense[ci];
                if (targetCommunity === currentCommunity) continue;
                targetCommunityDegree = communities.vals[ci];
                deltaComputations++;
                delta = index.delta(
                  i,
                  inDegree,
                  outDegree,
                  targetCommunityDegree,
                  targetCommunity
                );
                deltaIsBetter = tieBreaker(
                  bestCommunity,
                  currentCommunity,
                  targetCommunity,
                  delta,
                  bestDelta
                );
                if (deltaIsBetter) {
                  bestDelta = delta;
                  bestCommunity = targetCommunity;
                }
              }
              if (bestDelta < 0) {
                bestCommunity = index.isolate(i, inDegree, outDegree);
                if (bestCommunity === currentCommunity) continue;
              } else {
                if (bestCommunity === currentCommunity) {
                  continue;
                } else {
                  index.move(i, inDegree, outDegree, bestCommunity);
                }
              }
              localMoveWasMade = true;
              currentMoves++;
            }
            localMoves.push(currentMoves);
            moveWasMade = localMoveWasMade || moveWasMade;
          }
        }
        if (moveWasMade) index.zoomOut();
      }
      var results = {
        index,
        deltaComputations,
        nodesVisited,
        moves
      };
      return results;
    }
    function louvain2(assign, detailed, graph, options) {
      if (!isGraph(graph))
        throw new Error(
          "graphology-communities-louvain: the given graph is not a valid graphology instance."
        );
      var type = inferType(graph);
      if (type === "mixed")
        throw new Error(
          "graphology-communities-louvain: cannot run the algorithm on a true mixed graph."
        );
      options = resolveDefaults(options, DEFAULTS);
      var c = 0;
      if (graph.size === 0) {
        if (assign) {
          graph.forEachNode(function(node) {
            graph.setNodeAttribute(node, options.nodeCommunityAttribute, c++);
          });
          return;
        }
        var communities = {};
        graph.forEachNode(function(node) {
          communities[node] = c++;
        });
        if (!detailed) return communities;
        return {
          communities,
          count: graph.order,
          deltaComputations: 0,
          dendrogram: null,
          level: 0,
          modularity: NaN,
          moves: null,
          nodesVisited: 0,
          resolution: options.resolution
        };
      }
      var fn2 = type === "undirected" ? undirectedLouvain : directedLouvain;
      var results = fn2(detailed, graph, options);
      var index = results.index;
      if (!detailed) {
        if (assign) {
          index.assign(options.nodeCommunityAttribute);
          return;
        }
        return index.collect();
      }
      var output = {
        count: index.C,
        deltaComputations: results.deltaComputations,
        dendrogram: index.dendrogram,
        level: index.level,
        modularity: index.modularity(),
        moves: results.moves,
        nodesVisited: results.nodesVisited,
        resolution: options.resolution
      };
      if (assign) {
        index.assign(options.nodeCommunityAttribute);
        return output;
      }
      output.communities = index.collect();
      return output;
    }
    var fn = louvain2.bind(null, false, false);
    fn.assign = louvain2.bind(null, true, false);
    fn.detailed = louvain2.bind(null, false, true);
    fn.defaults = DEFAULTS;
    module.exports = fn;
  }
});

// src/lib/codegraph/analyzer-entry.ts
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync
} from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";

// node_modules/zod/v4/classic/external.js
var external_exports = {};
__export(external_exports, {
  $brand: () => $brand,
  $input: () => $input,
  $output: () => $output,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBase64: () => ZodBase64,
  ZodBase64URL: () => ZodBase64URL,
  ZodBigInt: () => ZodBigInt,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBoolean: () => ZodBoolean,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCUID: () => ZodCUID,
  ZodCUID2: () => ZodCUID2,
  ZodCatch: () => ZodCatch,
  ZodCodec: () => ZodCodec,
  ZodCustom: () => ZodCustom,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodE164: () => ZodE164,
  ZodEmail: () => ZodEmail,
  ZodEmoji: () => ZodEmoji,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodExactOptional: () => ZodExactOptional,
  ZodFile: () => ZodFile,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodGUID: () => ZodGUID,
  ZodIPv4: () => ZodIPv4,
  ZodIPv6: () => ZodIPv6,
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodJWT: () => ZodJWT,
  ZodKSUID: () => ZodKSUID,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMAC: () => ZodMAC,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNanoID: () => ZodNanoID,
  ZodNever: () => ZodNever,
  ZodNonOptional: () => ZodNonOptional,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodPipe: () => ZodPipe,
  ZodPrefault: () => ZodPrefault,
  ZodPreprocess: () => ZodPreprocess,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRealError: () => ZodRealError,
  ZodRecord: () => ZodRecord,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodStringFormat: () => ZodStringFormat,
  ZodSuccess: () => ZodSuccess,
  ZodSymbol: () => ZodSymbol,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodTransform: () => ZodTransform,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodULID: () => ZodULID,
  ZodURL: () => ZodURL,
  ZodUUID: () => ZodUUID,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  ZodXID: () => ZodXID,
  ZodXor: () => ZodXor,
  _ZodString: () => _ZodString,
  _default: () => _default2,
  _function: () => _function,
  any: () => any,
  array: () => array,
  base64: () => base642,
  base64url: () => base64url2,
  bigint: () => bigint2,
  boolean: () => boolean2,
  catch: () => _catch2,
  check: () => check,
  cidrv4: () => cidrv42,
  cidrv6: () => cidrv62,
  clone: () => clone,
  codec: () => codec,
  coerce: () => coerce_exports,
  config: () => config,
  core: () => core_exports2,
  cuid: () => cuid3,
  cuid2: () => cuid22,
  custom: () => custom,
  date: () => date3,
  decode: () => decode2,
  decodeAsync: () => decodeAsync2,
  describe: () => describe2,
  discriminatedUnion: () => discriminatedUnion,
  e164: () => e1642,
  email: () => email2,
  emoji: () => emoji2,
  encode: () => encode2,
  encodeAsync: () => encodeAsync2,
  endsWith: () => _endsWith,
  enum: () => _enum2,
  exactOptional: () => exactOptional,
  file: () => file,
  flattenError: () => flattenError,
  float32: () => float32,
  float64: () => float64,
  formatError: () => formatError,
  fromJSONSchema: () => fromJSONSchema,
  function: () => _function,
  getErrorMap: () => getErrorMap,
  globalRegistry: () => globalRegistry,
  gt: () => _gt,
  gte: () => _gte,
  guid: () => guid2,
  hash: () => hash,
  hex: () => hex2,
  hostname: () => hostname2,
  httpUrl: () => httpUrl,
  includes: () => _includes,
  instanceof: () => _instanceof,
  int: () => int,
  int32: () => int32,
  int64: () => int64,
  intersection: () => intersection,
  invertCodec: () => invertCodec,
  ipv4: () => ipv42,
  ipv6: () => ipv62,
  iso: () => iso_exports,
  json: () => json,
  jwt: () => jwt,
  keyof: () => keyof,
  ksuid: () => ksuid2,
  lazy: () => lazy,
  length: () => _length,
  literal: () => literal,
  locales: () => locales_exports,
  looseObject: () => looseObject,
  looseRecord: () => looseRecord,
  lowercase: () => _lowercase,
  lt: () => _lt,
  lte: () => _lte,
  mac: () => mac2,
  map: () => map,
  maxLength: () => _maxLength,
  maxSize: () => _maxSize,
  meta: () => meta2,
  mime: () => _mime,
  minLength: () => _minLength,
  minSize: () => _minSize,
  multipleOf: () => _multipleOf,
  nan: () => nan,
  nanoid: () => nanoid2,
  nativeEnum: () => nativeEnum,
  negative: () => _negative,
  never: () => never,
  nonnegative: () => _nonnegative,
  nonoptional: () => nonoptional,
  nonpositive: () => _nonpositive,
  normalize: () => _normalize,
  null: () => _null3,
  nullable: () => nullable,
  nullish: () => nullish2,
  number: () => number2,
  object: () => object,
  optional: () => optional,
  overwrite: () => _overwrite,
  parse: () => parse2,
  parseAsync: () => parseAsync2,
  partialRecord: () => partialRecord,
  pipe: () => pipe,
  positive: () => _positive,
  prefault: () => prefault,
  preprocess: () => preprocess,
  prettifyError: () => prettifyError,
  promise: () => promise,
  property: () => _property,
  readonly: () => readonly,
  record: () => record,
  refine: () => refine,
  regex: () => _regex,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeDecode: () => safeDecode2,
  safeDecodeAsync: () => safeDecodeAsync2,
  safeEncode: () => safeEncode2,
  safeEncodeAsync: () => safeEncodeAsync2,
  safeParse: () => safeParse2,
  safeParseAsync: () => safeParseAsync2,
  set: () => set,
  setErrorMap: () => setErrorMap,
  size: () => _size,
  slugify: () => _slugify,
  startsWith: () => _startsWith,
  strictObject: () => strictObject,
  string: () => string2,
  stringFormat: () => stringFormat,
  stringbool: () => stringbool,
  success: () => success,
  superRefine: () => superRefine,
  symbol: () => symbol,
  templateLiteral: () => templateLiteral,
  toJSONSchema: () => toJSONSchema,
  toLowerCase: () => _toLowerCase,
  toUpperCase: () => _toUpperCase,
  transform: () => transform,
  treeifyError: () => treeifyError,
  trim: () => _trim,
  tuple: () => tuple,
  uint32: () => uint32,
  uint64: () => uint64,
  ulid: () => ulid2,
  undefined: () => _undefined3,
  union: () => union,
  unknown: () => unknown,
  uppercase: () => _uppercase,
  url: () => url,
  util: () => util_exports,
  uuid: () => uuid2,
  uuidv4: () => uuidv4,
  uuidv6: () => uuidv6,
  uuidv7: () => uuidv7,
  void: () => _void2,
  xid: () => xid2,
  xor: () => xor
});

// node_modules/zod/v4/core/index.js
var core_exports2 = {};
__export(core_exports2, {
  $ZodAny: () => $ZodAny,
  $ZodArray: () => $ZodArray,
  $ZodAsyncError: () => $ZodAsyncError,
  $ZodBase64: () => $ZodBase64,
  $ZodBase64URL: () => $ZodBase64URL,
  $ZodBigInt: () => $ZodBigInt,
  $ZodBigIntFormat: () => $ZodBigIntFormat,
  $ZodBoolean: () => $ZodBoolean,
  $ZodCIDRv4: () => $ZodCIDRv4,
  $ZodCIDRv6: () => $ZodCIDRv6,
  $ZodCUID: () => $ZodCUID,
  $ZodCUID2: () => $ZodCUID2,
  $ZodCatch: () => $ZodCatch,
  $ZodCheck: () => $ZodCheck,
  $ZodCheckBigIntFormat: () => $ZodCheckBigIntFormat,
  $ZodCheckEndsWith: () => $ZodCheckEndsWith,
  $ZodCheckGreaterThan: () => $ZodCheckGreaterThan,
  $ZodCheckIncludes: () => $ZodCheckIncludes,
  $ZodCheckLengthEquals: () => $ZodCheckLengthEquals,
  $ZodCheckLessThan: () => $ZodCheckLessThan,
  $ZodCheckLowerCase: () => $ZodCheckLowerCase,
  $ZodCheckMaxLength: () => $ZodCheckMaxLength,
  $ZodCheckMaxSize: () => $ZodCheckMaxSize,
  $ZodCheckMimeType: () => $ZodCheckMimeType,
  $ZodCheckMinLength: () => $ZodCheckMinLength,
  $ZodCheckMinSize: () => $ZodCheckMinSize,
  $ZodCheckMultipleOf: () => $ZodCheckMultipleOf,
  $ZodCheckNumberFormat: () => $ZodCheckNumberFormat,
  $ZodCheckOverwrite: () => $ZodCheckOverwrite,
  $ZodCheckProperty: () => $ZodCheckProperty,
  $ZodCheckRegex: () => $ZodCheckRegex,
  $ZodCheckSizeEquals: () => $ZodCheckSizeEquals,
  $ZodCheckStartsWith: () => $ZodCheckStartsWith,
  $ZodCheckStringFormat: () => $ZodCheckStringFormat,
  $ZodCheckUpperCase: () => $ZodCheckUpperCase,
  $ZodCodec: () => $ZodCodec,
  $ZodCustom: () => $ZodCustom,
  $ZodCustomStringFormat: () => $ZodCustomStringFormat,
  $ZodDate: () => $ZodDate,
  $ZodDefault: () => $ZodDefault,
  $ZodDiscriminatedUnion: () => $ZodDiscriminatedUnion,
  $ZodE164: () => $ZodE164,
  $ZodEmail: () => $ZodEmail,
  $ZodEmoji: () => $ZodEmoji,
  $ZodEncodeError: () => $ZodEncodeError,
  $ZodEnum: () => $ZodEnum,
  $ZodError: () => $ZodError,
  $ZodExactOptional: () => $ZodExactOptional,
  $ZodFile: () => $ZodFile,
  $ZodFunction: () => $ZodFunction,
  $ZodGUID: () => $ZodGUID,
  $ZodIPv4: () => $ZodIPv4,
  $ZodIPv6: () => $ZodIPv6,
  $ZodISODate: () => $ZodISODate,
  $ZodISODateTime: () => $ZodISODateTime,
  $ZodISODuration: () => $ZodISODuration,
  $ZodISOTime: () => $ZodISOTime,
  $ZodIntersection: () => $ZodIntersection,
  $ZodJWT: () => $ZodJWT,
  $ZodKSUID: () => $ZodKSUID,
  $ZodLazy: () => $ZodLazy,
  $ZodLiteral: () => $ZodLiteral,
  $ZodMAC: () => $ZodMAC,
  $ZodMap: () => $ZodMap,
  $ZodNaN: () => $ZodNaN,
  $ZodNanoID: () => $ZodNanoID,
  $ZodNever: () => $ZodNever,
  $ZodNonOptional: () => $ZodNonOptional,
  $ZodNull: () => $ZodNull,
  $ZodNullable: () => $ZodNullable,
  $ZodNumber: () => $ZodNumber,
  $ZodNumberFormat: () => $ZodNumberFormat,
  $ZodObject: () => $ZodObject,
  $ZodObjectJIT: () => $ZodObjectJIT,
  $ZodOptional: () => $ZodOptional,
  $ZodPipe: () => $ZodPipe,
  $ZodPrefault: () => $ZodPrefault,
  $ZodPreprocess: () => $ZodPreprocess,
  $ZodPromise: () => $ZodPromise,
  $ZodReadonly: () => $ZodReadonly,
  $ZodRealError: () => $ZodRealError,
  $ZodRecord: () => $ZodRecord,
  $ZodRegistry: () => $ZodRegistry,
  $ZodSet: () => $ZodSet,
  $ZodString: () => $ZodString,
  $ZodStringFormat: () => $ZodStringFormat,
  $ZodSuccess: () => $ZodSuccess,
  $ZodSymbol: () => $ZodSymbol,
  $ZodTemplateLiteral: () => $ZodTemplateLiteral,
  $ZodTransform: () => $ZodTransform,
  $ZodTuple: () => $ZodTuple,
  $ZodType: () => $ZodType,
  $ZodULID: () => $ZodULID,
  $ZodURL: () => $ZodURL,
  $ZodUUID: () => $ZodUUID,
  $ZodUndefined: () => $ZodUndefined,
  $ZodUnion: () => $ZodUnion,
  $ZodUnknown: () => $ZodUnknown,
  $ZodVoid: () => $ZodVoid,
  $ZodXID: () => $ZodXID,
  $ZodXor: () => $ZodXor,
  $brand: () => $brand,
  $constructor: () => $constructor,
  $input: () => $input,
  $output: () => $output,
  Doc: () => Doc,
  JSONSchema: () => json_schema_exports,
  JSONSchemaGenerator: () => JSONSchemaGenerator,
  NEVER: () => NEVER,
  TimePrecision: () => TimePrecision,
  _any: () => _any,
  _array: () => _array,
  _base64: () => _base64,
  _base64url: () => _base64url,
  _bigint: () => _bigint,
  _boolean: () => _boolean,
  _catch: () => _catch,
  _check: () => _check,
  _cidrv4: () => _cidrv4,
  _cidrv6: () => _cidrv6,
  _coercedBigint: () => _coercedBigint,
  _coercedBoolean: () => _coercedBoolean,
  _coercedDate: () => _coercedDate,
  _coercedNumber: () => _coercedNumber,
  _coercedString: () => _coercedString,
  _cuid: () => _cuid,
  _cuid2: () => _cuid2,
  _custom: () => _custom,
  _date: () => _date,
  _decode: () => _decode,
  _decodeAsync: () => _decodeAsync,
  _default: () => _default,
  _discriminatedUnion: () => _discriminatedUnion,
  _e164: () => _e164,
  _email: () => _email,
  _emoji: () => _emoji2,
  _encode: () => _encode,
  _encodeAsync: () => _encodeAsync,
  _endsWith: () => _endsWith,
  _enum: () => _enum,
  _file: () => _file,
  _float32: () => _float32,
  _float64: () => _float64,
  _gt: () => _gt,
  _gte: () => _gte,
  _guid: () => _guid,
  _includes: () => _includes,
  _int: () => _int,
  _int32: () => _int32,
  _int64: () => _int64,
  _intersection: () => _intersection,
  _ipv4: () => _ipv4,
  _ipv6: () => _ipv6,
  _isoDate: () => _isoDate,
  _isoDateTime: () => _isoDateTime,
  _isoDuration: () => _isoDuration,
  _isoTime: () => _isoTime,
  _jwt: () => _jwt,
  _ksuid: () => _ksuid,
  _lazy: () => _lazy,
  _length: () => _length,
  _literal: () => _literal,
  _lowercase: () => _lowercase,
  _lt: () => _lt,
  _lte: () => _lte,
  _mac: () => _mac,
  _map: () => _map,
  _max: () => _lte,
  _maxLength: () => _maxLength,
  _maxSize: () => _maxSize,
  _mime: () => _mime,
  _min: () => _gte,
  _minLength: () => _minLength,
  _minSize: () => _minSize,
  _multipleOf: () => _multipleOf,
  _nan: () => _nan,
  _nanoid: () => _nanoid,
  _nativeEnum: () => _nativeEnum,
  _negative: () => _negative,
  _never: () => _never,
  _nonnegative: () => _nonnegative,
  _nonoptional: () => _nonoptional,
  _nonpositive: () => _nonpositive,
  _normalize: () => _normalize,
  _null: () => _null2,
  _nullable: () => _nullable,
  _number: () => _number,
  _optional: () => _optional,
  _overwrite: () => _overwrite,
  _parse: () => _parse,
  _parseAsync: () => _parseAsync,
  _pipe: () => _pipe,
  _positive: () => _positive,
  _promise: () => _promise,
  _property: () => _property,
  _readonly: () => _readonly,
  _record: () => _record,
  _refine: () => _refine,
  _regex: () => _regex,
  _safeDecode: () => _safeDecode,
  _safeDecodeAsync: () => _safeDecodeAsync,
  _safeEncode: () => _safeEncode,
  _safeEncodeAsync: () => _safeEncodeAsync,
  _safeParse: () => _safeParse,
  _safeParseAsync: () => _safeParseAsync,
  _set: () => _set,
  _size: () => _size,
  _slugify: () => _slugify,
  _startsWith: () => _startsWith,
  _string: () => _string,
  _stringFormat: () => _stringFormat,
  _stringbool: () => _stringbool,
  _success: () => _success,
  _superRefine: () => _superRefine,
  _symbol: () => _symbol,
  _templateLiteral: () => _templateLiteral,
  _toLowerCase: () => _toLowerCase,
  _toUpperCase: () => _toUpperCase,
  _transform: () => _transform,
  _trim: () => _trim,
  _tuple: () => _tuple,
  _uint32: () => _uint32,
  _uint64: () => _uint64,
  _ulid: () => _ulid,
  _undefined: () => _undefined2,
  _union: () => _union,
  _unknown: () => _unknown,
  _uppercase: () => _uppercase,
  _url: () => _url,
  _uuid: () => _uuid,
  _uuidv4: () => _uuidv4,
  _uuidv6: () => _uuidv6,
  _uuidv7: () => _uuidv7,
  _void: () => _void,
  _xid: () => _xid,
  _xor: () => _xor,
  clone: () => clone,
  config: () => config,
  createStandardJSONSchemaMethod: () => createStandardJSONSchemaMethod,
  createToJSONSchemaMethod: () => createToJSONSchemaMethod,
  decode: () => decode,
  decodeAsync: () => decodeAsync,
  describe: () => describe,
  encode: () => encode,
  encodeAsync: () => encodeAsync,
  extractDefs: () => extractDefs,
  finalize: () => finalize,
  flattenError: () => flattenError,
  formatError: () => formatError,
  globalConfig: () => globalConfig,
  globalRegistry: () => globalRegistry,
  initializeContext: () => initializeContext,
  isValidBase64: () => isValidBase64,
  isValidBase64URL: () => isValidBase64URL,
  isValidJWT: () => isValidJWT,
  locales: () => locales_exports,
  meta: () => meta,
  parse: () => parse,
  parseAsync: () => parseAsync,
  prettifyError: () => prettifyError,
  process: () => process2,
  regexes: () => regexes_exports,
  registry: () => registry,
  safeDecode: () => safeDecode,
  safeDecodeAsync: () => safeDecodeAsync,
  safeEncode: () => safeEncode,
  safeEncodeAsync: () => safeEncodeAsync,
  safeParse: () => safeParse,
  safeParseAsync: () => safeParseAsync,
  toDotPath: () => toDotPath,
  toJSONSchema: () => toJSONSchema,
  treeifyError: () => treeifyError,
  util: () => util_exports,
  version: () => version
});

// node_modules/zod/v4/core/core.js
var _a;
var NEVER = /* @__PURE__ */ Object.freeze({
  status: "aborted"
});
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer3, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: /* @__PURE__ */ new Set()
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer3(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a3;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = /* @__PURE__ */ Symbol("zod_brand");
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
var $ZodEncodeError = class extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  slugify: () => slugify,
  stringifyPrimitive: () => stringifyPrimitive,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set2 = false;
  return {
    get value() {
      if (!set2) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object2, key, getter) {
  let value = void 0;
  Object.defineProperty(object2, key, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined"
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class2, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class2 ? new Class2({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class2, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class2({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a3;
    (_a3 = iss).path ?? (_a3.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base643) {
  const binaryString = atob(base643);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url4) {
  const base643 = base64url4.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base643.length % 4) % 4);
  return base64ToUint8Array(base643 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex3) {
  const cleanHex = hex3.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var Class = class {
  constructor(..._args) {
  }
};

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error51, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error51.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error51, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error52, path = []) => {
    for (const issue2 of error52.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error51);
  return fieldErrors;
}
function treeifyError(error51, mapper = (issue2) => issue2.message) {
  const result = { errors: [] };
  const processError = (error52, path = []) => {
    var _a3, _b;
    for (const issue2 of error52.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          result.errors.push(mapper(issue2));
          continue;
        }
        let curr = result;
        let i = 0;
        while (i < fullpath.length) {
          const el = fullpath[i];
          const terminal = i === fullpath.length - 1;
          if (typeof el === "string") {
            curr.properties ?? (curr.properties = {});
            (_a3 = curr.properties)[el] ?? (_a3[el] = { errors: [] });
            curr = curr.properties[el];
          } else {
            curr.items ?? (curr.items = []);
            (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
            curr = curr.items[el];
          }
          if (terminal) {
            curr.errors.push(mapper(issue2));
          }
          i++;
        }
      }
    }
  };
  processError(error51);
  return result;
}
function toDotPath(_path) {
  const segs = [];
  const path = _path.map((seg) => typeof seg === "object" ? seg.key : seg);
  for (const seg of path) {
    if (typeof seg === "number")
      segs.push(`[${seg}]`);
    else if (typeof seg === "symbol")
      segs.push(`[${JSON.stringify(String(seg))}]`);
    else if (/[^\w$]/.test(seg))
      segs.push(`[${JSON.stringify(seg)}]`);
    else {
      if (segs.length)
        segs.push(".");
      segs.push(seg);
    }
  }
  return segs.join("");
}
function prettifyError(error51) {
  const lines = [];
  const issues = [...error51.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
  for (const issue2 of issues) {
    lines.push(`\u2716 ${issue2.message}`);
    if (issue2.path?.length)
      lines.push(`  \u2192 at ${toDotPath(issue2.path)}`);
  }
  return lines.join("\n");
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var encode = /* @__PURE__ */ _encode($ZodRealError);
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var decode = /* @__PURE__ */ _decode($ZodRealError);
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var encodeAsync = /* @__PURE__ */ _encodeAsync($ZodRealError);
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var decodeAsync = /* @__PURE__ */ _decodeAsync($ZodRealError);
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var safeEncode = /* @__PURE__ */ _safeEncode($ZodRealError);
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var safeDecode = /* @__PURE__ */ _safeDecode($ZodRealError);
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync($ZodRealError);
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var regexes_exports = {};
__export(regexes_exports, {
  base64: () => base64,
  base64url: () => base64url,
  bigint: () => bigint,
  boolean: () => boolean,
  browserEmail: () => browserEmail,
  cidrv4: () => cidrv4,
  cidrv6: () => cidrv6,
  cuid: () => cuid,
  cuid2: () => cuid2,
  date: () => date,
  datetime: () => datetime,
  domain: () => domain,
  duration: () => duration,
  e164: () => e164,
  email: () => email,
  emoji: () => emoji,
  extendedDuration: () => extendedDuration,
  guid: () => guid,
  hex: () => hex,
  hostname: () => hostname,
  html5Email: () => html5Email,
  httpProtocol: () => httpProtocol,
  idnEmail: () => idnEmail,
  integer: () => integer,
  ipv4: () => ipv4,
  ipv6: () => ipv6,
  ksuid: () => ksuid,
  lowercase: () => lowercase,
  mac: () => mac,
  md5_base64: () => md5_base64,
  md5_base64url: () => md5_base64url,
  md5_hex: () => md5_hex,
  nanoid: () => nanoid,
  null: () => _null,
  number: () => number,
  rfc5322Email: () => rfc5322Email,
  sha1_base64: () => sha1_base64,
  sha1_base64url: () => sha1_base64url,
  sha1_hex: () => sha1_hex,
  sha256_base64: () => sha256_base64,
  sha256_base64url: () => sha256_base64url,
  sha256_hex: () => sha256_hex,
  sha384_base64: () => sha384_base64,
  sha384_base64url: () => sha384_base64url,
  sha384_hex: () => sha384_hex,
  sha512_base64: () => sha512_base64,
  sha512_base64url: () => sha512_base64url,
  sha512_hex: () => sha512_hex,
  string: () => string,
  time: () => time,
  ulid: () => ulid,
  undefined: () => _undefined,
  unicodeEmail: () => unicodeEmail,
  uppercase: () => uppercase,
  uuid: () => uuid,
  uuid4: () => uuid4,
  uuid6: () => uuid6,
  uuid7: () => uuid7,
  xid: () => xid
});
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version2) => {
  if (!version2)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var uuid4 = /* @__PURE__ */ uuid(4);
var uuid6 = /* @__PURE__ */ uuid(6);
var uuid7 = /* @__PURE__ */ uuid(7);
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
var unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
var idnEmail = unicodeEmail;
var browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var mac = (delimiter) => {
  const escapedDelim = escapeRegex(delimiter ?? ":");
  return new RegExp(`^(?:[0-9A-F]{2}${escapedDelim}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${escapedDelim}){5}[0-9a-f]{2}$`);
};
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
var domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time3 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time3}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var bigint = /^-?\d+n?$/;
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var _undefined = /^undefined$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
var hex = /^[0-9a-fA-F]*$/;
function fixedBase64(bodyLength, padding) {
  return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
function fixedBase64url(length) {
  return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
var md5_hex = /^[0-9a-fA-F]{32}$/;
var md5_base64 = /* @__PURE__ */ fixedBase64(22, "==");
var md5_base64url = /* @__PURE__ */ fixedBase64url(22);
var sha1_hex = /^[0-9a-fA-F]{40}$/;
var sha1_base64 = /* @__PURE__ */ fixedBase64(27, "=");
var sha1_base64url = /* @__PURE__ */ fixedBase64url(27);
var sha256_hex = /^[0-9a-fA-F]{64}$/;
var sha256_base64 = /* @__PURE__ */ fixedBase64(43, "=");
var sha256_base64url = /* @__PURE__ */ fixedBase64url(43);
var sha384_hex = /^[0-9a-fA-F]{96}$/;
var sha384_base64 = /* @__PURE__ */ fixedBase64(64, "");
var sha384_base64url = /* @__PURE__ */ fixedBase64url(64);
var sha512_hex = /^[0-9a-fA-F]{128}$/;
var sha512_base64 = /* @__PURE__ */ fixedBase64(86, "==");
var sha512_base64url = /* @__PURE__ */ fixedBase64url(86);

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a3;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a3 = inst._zod).onattach ?? (_a3.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a3;
    (_a3 = inst2._zod.bag).multipleOf ?? (_a3.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckBigIntFormat = /* @__PURE__ */ $constructor("$ZodCheckBigIntFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  const [minimum, maximum] = BIGINT_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (input < minimum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxSize = /* @__PURE__ */ $constructor("$ZodCheckMaxSize", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size <= def.maximum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinSize = /* @__PURE__ */ $constructor("$ZodCheckMinSize", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size >= def.minimum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckSizeEquals = /* @__PURE__ */ $constructor("$ZodCheckSizeEquals", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.size;
    bag.maximum = def.size;
    bag.size = def.size;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size === def.size)
      return;
    const tooBig = size > def.size;
    payload.issues.push({
      origin: getSizableOrigin(input),
      ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a3, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a3 = inst._zod).check ?? (_a3.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function handleCheckPropertyResult(result, payload, property) {
  if (result.issues.length) {
    payload.issues.push(...prefixIssues(property, result.issues));
  }
}
var $ZodCheckProperty = /* @__PURE__ */ $constructor("$ZodCheckProperty", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    const result = def.schema._zod.run({
      value: payload.value[def.property],
      issues: []
    }, {});
    if (result instanceof Promise) {
      return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
    }
    handleCheckPropertyResult(result, payload, def.property);
    return;
  };
});
var $ZodCheckMimeType = /* @__PURE__ */ $constructor("$ZodCheckMimeType", (inst, def) => {
  $ZodCheck.init(inst, def);
  const mimeSet = new Set(def.mime);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.mime = def.mime;
  });
  inst._zod.check = (payload) => {
    if (mimeSet.has(payload.value.type))
      return;
    payload.issues.push({
      code: "invalid_value",
      values: def.mime,
      input: payload.value.type,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
var Doc = class {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));
  }
};

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a3;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url2 = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url2.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url2.protocol.endsWith(":") ? url2.protocol.slice(0, -1) : url2.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url2.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodMAC = /* @__PURE__ */ $constructor("$ZodMAC", (inst, def) => {
  def.pattern ?? (def.pattern = mac(def.delimiter));
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `mac`;
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error();
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error();
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base643 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base643.padEnd(Math.ceil(base643.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCustomStringFormat = /* @__PURE__ */ $constructor("$ZodCustomStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (def.fn(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: def.format,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = bigint;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = BigInt(payload.value);
      } catch (_) {
      }
    if (typeof payload.value === "bigint")
      return payload;
    payload.issues.push({
      expected: "bigint",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodBigIntFormat = /* @__PURE__ */ $constructor("$ZodBigIntFormat", (inst, def) => {
  $ZodCheckBigIntFormat.init(inst, def);
  $ZodBigInt.init(inst, def);
});
var $ZodSymbol = /* @__PURE__ */ $constructor("$ZodSymbol", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "symbol")
      return payload;
    payload.issues.push({
      expected: "symbol",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUndefined = /* @__PURE__ */ $constructor("$ZodUndefined", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _undefined;
  inst._zod.values = /* @__PURE__ */ new Set([void 0]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "undefined",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = /* @__PURE__ */ new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodVoid = /* @__PURE__ */ $constructor("$ZodVoid", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "void",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodDate = /* @__PURE__ */ $constructor("$ZodDate", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce) {
      try {
        payload.value = new Date(payload.value);
      } catch (_err) {
      }
    }
    const input = payload.value;
    const isDate = input instanceof Date;
    const isValidDate = isDate && !Number.isNaN(input.getTime());
    if (isValidDate)
      return payload;
    payload.issues.push({
      expected: "date",
      code: "invalid_type",
      input,
      ...isDate ? { received: "Invalid Date" } : {},
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
function handleExclusiveUnionResults(results, final, inst, ctx) {
  const successes = results.filter((r) => r.issues.length === 0);
  if (successes.length === 1) {
    final.value = successes[0].value;
    return final;
  }
  if (successes.length === 0) {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
    });
  } else {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: [],
      inclusive: false
    });
  }
  return final;
}
var $ZodXor = /* @__PURE__ */ $constructor("$ZodXor", (inst, def) => {
  $ZodUnion.init(inst, def);
  def.inclusive = false;
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        results.push(result);
      }
    }
    if (!async)
      return handleExclusiveUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleExclusiveUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = /* @__PURE__ */ new Set();
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map2 = /* @__PURE__ */ new Map();
    for (const o of opts) {
      const values = o._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map2.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map2.set(v, o);
      }
    }
    return map2;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0; i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1; i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === void 0) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodMap = /* @__PURE__ */ $constructor("$ZodMap", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Map)) {
      payload.issues.push({
        expected: "map",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    payload.value = /* @__PURE__ */ new Map();
    for (const [key, value] of input) {
      const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
      const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
      if (keyResult instanceof Promise || valueResult instanceof Promise) {
        proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
          handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
        }));
      } else {
        handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
  if (keyResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, keyResult.issues));
    } else {
      final.issues.push({
        code: "invalid_key",
        origin: "map",
        input,
        inst,
        issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  if (valueResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, valueResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_element",
        input,
        inst,
        key,
        issues: valueResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  final.value.set(keyResult.value, valueResult.value);
}
var $ZodSet = /* @__PURE__ */ $constructor("$ZodSet", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Set)) {
      payload.issues.push({
        input,
        inst,
        expected: "set",
        code: "invalid_type"
      });
      return payload;
    }
    const proms = [];
    payload.value = /* @__PURE__ */ new Set();
    for (const item of input) {
      const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleSetResult(result2, payload)));
      } else
        handleSetResult(result, payload);
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleSetResult(result, final) {
  if (result.issues.length) {
    final.issues.push(...result.issues);
  }
  final.value.add(result.value);
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodFile = /* @__PURE__ */ $constructor("$ZodFile", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input instanceof File)
      return payload;
    payload.issues.push({
      expected: "file",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === void 0 && (result.issues.length || result.fallback)) {
    return { issues: [], value: void 0 };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodSuccess = /* @__PURE__ */ $constructor("$ZodSuccess", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError("ZodSuccess");
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.issues.length === 0;
        return payload;
      });
    }
    payload.value = result.issues.length === 0;
    return payload;
  };
});
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodNaN = /* @__PURE__ */ $constructor("$ZodNaN", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "nan",
        code: "invalid_type"
      });
      return payload;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
var $ZodCodec = /* @__PURE__ */ $constructor("$ZodCodec", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    const direction = ctx.direction || "forward";
    if (direction === "forward") {
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handleCodecAResult(left2, def, ctx));
      }
      return handleCodecAResult(left, def, ctx);
    } else {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handleCodecAResult(right2, def, ctx));
      }
      return handleCodecAResult(right, def, ctx);
    }
  };
});
function handleCodecAResult(result, def, ctx) {
  if (result.issues.length) {
    result.aborted = true;
    return result;
  }
  const direction = ctx.direction || "forward";
  if (direction === "forward") {
    const transformed = def.transform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
    }
    return handleCodecTxResult(result, transformed, def.out, ctx);
  } else {
    const transformed = def.reverseTransform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
    }
    return handleCodecTxResult(result, transformed, def.in, ctx);
  }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
var $ZodPreprocess = /* @__PURE__ */ $constructor("$ZodPreprocess", (inst, def) => {
  $ZodPipe.init(inst, def);
});
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodTemplateLiteral = /* @__PURE__ */ $constructor("$ZodTemplateLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const regexParts = [];
  for (const part of def.parts) {
    if (typeof part === "object" && part !== null) {
      if (!part._zod.pattern) {
        throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
      }
      const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
      if (!source)
        throw new Error(`Invalid template literal part: ${part._zod.traits}`);
      const start = source.startsWith("^") ? 1 : 0;
      const end = source.endsWith("$") ? source.length - 1 : source.length;
      regexParts.push(source.slice(start, end));
    } else if (part === null || primitiveTypes.has(typeof part)) {
      regexParts.push(escapeRegex(`${part}`));
    } else {
      throw new Error(`Invalid template literal part: ${part}`);
    }
  }
  inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "string") {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "string",
        code: "invalid_type"
      });
      return payload;
    }
    inst._zod.pattern.lastIndex = 0;
    if (!inst._zod.pattern.test(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        code: "invalid_format",
        format: def.format ?? "template_literal",
        pattern: inst._zod.pattern.source
      });
      return payload;
    }
    return payload;
  };
});
var $ZodFunction = /* @__PURE__ */ $constructor("$ZodFunction", (inst, def) => {
  $ZodType.init(inst, def);
  inst._def = def;
  inst._zod.def = def;
  inst.implement = (func) => {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    return function(...args) {
      const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
      const result = Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return parse(inst._def.output, result);
      }
      return result;
    };
  };
  inst.implementAsync = (func) => {
    if (typeof func !== "function") {
      throw new Error("implementAsync() must be called with a function");
    }
    return async function(...args) {
      const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
      const result = await Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return await parseAsync(inst._def.output, result);
      }
      return result;
    };
  };
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "function") {
      payload.issues.push({
        code: "invalid_type",
        expected: "function",
        input: payload.value,
        inst
      });
      return payload;
    }
    const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
    if (hasPromiseOutput) {
      payload.value = inst.implementAsync(payload.value);
    } else {
      payload.value = inst.implement(payload.value);
    }
    return payload;
  };
  inst.input = (...args) => {
    const F = inst.constructor;
    if (Array.isArray(args[0])) {
      return new F({
        type: "function",
        input: new $ZodTuple({
          type: "tuple",
          items: args[0],
          rest: args[1]
        }),
        output: inst._def.output
      });
    }
    return new F({
      type: "function",
      input: args[0],
      output: inst._def.output
    });
  };
  inst.output = (output) => {
    const F = inst.constructor;
    return new F({
      type: "function",
      input: inst._def.input,
      output
    });
  };
  return inst;
});
var $ZodPromise = /* @__PURE__ */ $constructor("$ZodPromise", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
  };
});
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => {
    const d = def;
    if (!d._cachedInner)
      d._cachedInner = def.getter();
    return d._cachedInner;
  });
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
  defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
  defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? void 0);
  defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? void 0);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// node_modules/zod/v4/locales/index.js
var locales_exports = {};
__export(locales_exports, {
  ar: () => ar_default,
  az: () => az_default,
  be: () => be_default,
  bg: () => bg_default,
  ca: () => ca_default,
  cs: () => cs_default,
  da: () => da_default,
  de: () => de_default,
  el: () => el_default,
  en: () => en_default,
  eo: () => eo_default,
  es: () => es_default,
  fa: () => fa_default,
  fi: () => fi_default,
  fr: () => fr_default,
  frCA: () => fr_CA_default,
  he: () => he_default,
  hr: () => hr_default,
  hu: () => hu_default,
  hy: () => hy_default,
  id: () => id_default,
  is: () => is_default,
  it: () => it_default,
  ja: () => ja_default,
  ka: () => ka_default,
  kh: () => kh_default,
  km: () => km_default,
  ko: () => ko_default,
  lt: () => lt_default,
  mk: () => mk_default,
  ms: () => ms_default,
  nl: () => nl_default,
  no: () => no_default,
  ota: () => ota_default,
  pl: () => pl_default,
  ps: () => ps_default,
  pt: () => pt_default,
  ro: () => ro_default,
  ru: () => ru_default,
  sl: () => sl_default,
  sv: () => sv_default,
  ta: () => ta_default,
  th: () => th_default,
  tr: () => tr_default,
  ua: () => ua_default,
  uk: () => uk_default,
  ur: () => ur_default,
  uz: () => uz_default,
  vi: () => vi_default,
  yo: () => yo_default,
  zhCN: () => zh_CN_default,
  zhTW: () => zh_TW_default
});

// node_modules/zod/v4/locales/ar.js
var error = () => {
  const Sizable = {
    string: { unit: "\u062D\u0631\u0641", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    file: { unit: "\u0628\u0627\u064A\u062A", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    array: { unit: "\u0639\u0646\u0635\u0631", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" },
    set: { unit: "\u0639\u0646\u0635\u0631", verb: "\u0623\u0646 \u064A\u062D\u0648\u064A" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0645\u062F\u062E\u0644",
    email: "\u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A",
    url: "\u0631\u0627\u0628\u0637",
    emoji: "\u0625\u064A\u0645\u0648\u062C\u064A",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u062A\u0627\u0631\u064A\u062E \u0648\u0648\u0642\u062A \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    date: "\u062A\u0627\u0631\u064A\u062E \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    time: "\u0648\u0642\u062A \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    duration: "\u0645\u062F\u0629 \u0628\u0645\u0639\u064A\u0627\u0631 ISO",
    ipv4: "\u0639\u0646\u0648\u0627\u0646 IPv4",
    ipv6: "\u0639\u0646\u0648\u0627\u0646 IPv6",
    cidrv4: "\u0645\u062F\u0649 \u0639\u0646\u0627\u0648\u064A\u0646 \u0628\u0635\u064A\u063A\u0629 IPv4",
    cidrv6: "\u0645\u062F\u0649 \u0639\u0646\u0627\u0648\u064A\u0646 \u0628\u0635\u064A\u063A\u0629 IPv6",
    base64: "\u0646\u064E\u0635 \u0628\u062A\u0631\u0645\u064A\u0632 base64-encoded",
    base64url: "\u0646\u064E\u0635 \u0628\u062A\u0631\u0645\u064A\u0632 base64url-encoded",
    json_string: "\u0646\u064E\u0635 \u0639\u0644\u0649 \u0647\u064A\u0626\u0629 JSON",
    e164: "\u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0628\u0645\u0639\u064A\u0627\u0631 E.164",
    jwt: "JWT",
    template_literal: "\u0645\u062F\u062E\u0644"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0645\u062F\u062E\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644\u0629: \u064A\u0641\u062A\u0631\u0636 \u0625\u062F\u062E\u0627\u0644 instanceof ${issue2.expected}\u060C \u0648\u0644\u0643\u0646 \u062A\u0645 \u0625\u062F\u062E\u0627\u0644 ${received}`;
        }
        return `\u0645\u062F\u062E\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644\u0629: \u064A\u0641\u062A\u0631\u0636 \u0625\u062F\u062E\u0627\u0644 ${expected}\u060C \u0648\u0644\u0643\u0646 \u062A\u0645 \u0625\u062F\u062E\u0627\u0644 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0645\u062F\u062E\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644\u0629: \u064A\u0641\u062A\u0631\u0636 \u0625\u062F\u062E\u0627\u0644 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0627\u062E\u062A\u064A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062A\u0648\u0642\u0639 \u0627\u0646\u062A\u0642\u0627\u0621 \u0623\u062D\u062F \u0647\u0630\u0647 \u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return ` \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0623\u0646 \u062A\u0643\u0648\u0646 ${issue2.origin ?? "\u0627\u0644\u0642\u064A\u0645\u0629"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631"}`;
        return `\u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0623\u0646 \u062A\u0643\u0648\u0646 ${issue2.origin ?? "\u0627\u0644\u0642\u064A\u0645\u0629"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0623\u0635\u063A\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0644\u0640 ${issue2.origin} \u0623\u0646 \u064A\u0643\u0648\u0646 ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0623\u0635\u063A\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645: \u064A\u0641\u062A\u0631\u0636 \u0644\u0640 ${issue2.origin} \u0623\u0646 \u064A\u0643\u0648\u0646 ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0628\u0640 "${issue2.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0646\u062A\u0647\u064A \u0628\u0640 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0636\u0645\u0651\u064E\u0646 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u0646\u064E\u0635 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u0646\u0645\u0637 ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644`;
      }
      case "not_multiple_of":
        return `\u0631\u0642\u0645 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644: \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0646 \u0645\u0636\u0627\u0639\u0641\u0627\u062A ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u0645\u0639\u0631\u0641${issue2.keys.length > 1 ? "\u0627\u062A" : ""} \u063A\u0631\u064A\u0628${issue2.keys.length > 1 ? "\u0629" : ""}: ${joinValues(issue2.keys, "\u060C ")}`;
      case "invalid_key":
        return `\u0645\u0639\u0631\u0641 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644 \u0641\u064A ${issue2.origin}`;
      case "invalid_union":
        return "\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644";
      case "invalid_element":
        return `\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644 \u0641\u064A ${issue2.origin}`;
      default:
        return "\u0645\u062F\u062E\u0644 \u063A\u064A\u0631 \u0645\u0642\u0628\u0648\u0644";
    }
  };
};
function ar_default() {
  return {
    localeError: error()
  };
}

// node_modules/zod/v4/locales/az.js
var error2 = () => {
  const Sizable = {
    string: { unit: "simvol", verb: "olmal\u0131d\u0131r" },
    file: { unit: "bayt", verb: "olmal\u0131d\u0131r" },
    array: { unit: "element", verb: "olmal\u0131d\u0131r" },
    set: { unit: "element", verb: "olmal\u0131d\u0131r" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Yanl\u0131\u015F d\u0259y\u0259r: g\xF6zl\u0259nil\u0259n instanceof ${issue2.expected}, daxil olan ${received}`;
        }
        return `Yanl\u0131\u015F d\u0259y\u0259r: g\xF6zl\u0259nil\u0259n ${expected}, daxil olan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Yanl\u0131\u015F d\u0259y\u0259r: g\xF6zl\u0259nil\u0259n ${stringifyPrimitive(issue2.values[0])}`;
        return `Yanl\u0131\u015F se\xE7im: a\u015Fa\u011F\u0131dak\u0131lardan biri olmal\u0131d\u0131r: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ox b\xF6y\xFCk: g\xF6zl\u0259nil\u0259n ${issue2.origin ?? "d\u0259y\u0259r"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        return `\xC7ox b\xF6y\xFCk: g\xF6zl\u0259nil\u0259n ${issue2.origin ?? "d\u0259y\u0259r"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ox ki\xE7ik: g\xF6zl\u0259nil\u0259n ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `\xC7ox ki\xE7ik: g\xF6zl\u0259nil\u0259n ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.prefix}" il\u0259 ba\u015Flamal\u0131d\u0131r`;
        if (_issue.format === "ends_with")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.suffix}" il\u0259 bitm\u0259lidir`;
        if (_issue.format === "includes")
          return `Yanl\u0131\u015F m\u0259tn: "${_issue.includes}" daxil olmal\u0131d\u0131r`;
        if (_issue.format === "regex")
          return `Yanl\u0131\u015F m\u0259tn: ${_issue.pattern} \u015Fablonuna uy\u011Fun olmal\u0131d\u0131r`;
        return `Yanl\u0131\u015F ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Yanl\u0131\u015F \u0259d\u0259d: ${issue2.divisor} il\u0259 b\xF6l\xFCn\u0259 bil\u0259n olmal\u0131d\u0131r`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan a\xE7ar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} daxilind\u0259 yanl\u0131\u015F a\xE7ar`;
      case "invalid_union":
        return "Yanl\u0131\u015F d\u0259y\u0259r";
      case "invalid_element":
        return `${issue2.origin} daxilind\u0259 yanl\u0131\u015F d\u0259y\u0259r`;
      default:
        return `Yanl\u0131\u015F d\u0259y\u0259r`;
    }
  };
};
function az_default() {
  return {
    localeError: error2()
  };
}

// node_modules/zod/v4/locales/be.js
function getBelarusianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error3 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "\u0441\u0456\u043C\u0432\u0430\u043B",
        few: "\u0441\u0456\u043C\u0432\u0430\u043B\u044B",
        many: "\u0441\u0456\u043C\u0432\u0430\u043B\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    array: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    set: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    },
    file: {
      unit: {
        one: "\u0431\u0430\u0439\u0442",
        few: "\u0431\u0430\u0439\u0442\u044B",
        many: "\u0431\u0430\u0439\u0442\u0430\u045E"
      },
      verb: "\u043C\u0435\u0446\u044C"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0443\u0432\u043E\u0434",
    email: "email \u0430\u0434\u0440\u0430\u0441",
    url: "URL",
    emoji: "\u044D\u043C\u043E\u0434\u0437\u0456",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0430 \u0456 \u0447\u0430\u0441",
    date: "ISO \u0434\u0430\u0442\u0430",
    time: "ISO \u0447\u0430\u0441",
    duration: "ISO \u043F\u0440\u0430\u0446\u044F\u0433\u043B\u0430\u0441\u0446\u044C",
    ipv4: "IPv4 \u0430\u0434\u0440\u0430\u0441",
    ipv6: "IPv6 \u0430\u0434\u0440\u0430\u0441",
    cidrv4: "IPv4 \u0434\u044B\u044F\u043F\u0430\u0437\u043E\u043D",
    cidrv6: "IPv6 \u0434\u044B\u044F\u043F\u0430\u0437\u043E\u043D",
    base64: "\u0440\u0430\u0434\u043E\u043A \u0443 \u0444\u0430\u0440\u043C\u0430\u0446\u0435 base64",
    base64url: "\u0440\u0430\u0434\u043E\u043A \u0443 \u0444\u0430\u0440\u043C\u0430\u0446\u0435 base64url",
    json_string: "JSON \u0440\u0430\u0434\u043E\u043A",
    e164: "\u043D\u0443\u043C\u0430\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0443\u0432\u043E\u0434"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u043B\u0456\u043A",
    array: "\u043C\u0430\u0441\u0456\u045E"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434: \u0447\u0430\u043A\u0430\u045E\u0441\u044F instanceof ${issue2.expected}, \u0430\u0442\u0440\u044B\u043C\u0430\u043D\u0430 ${received}`;
        }
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434: \u0447\u0430\u043A\u0430\u045E\u0441\u044F ${expected}, \u0430\u0442\u0440\u044B\u043C\u0430\u043D\u0430 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0432\u0430\u0440\u044B\u044F\u043D\u0442: \u0447\u0430\u043A\u0430\u045E\u0441\u044F \u0430\u0434\u0437\u0456\u043D \u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u0432\u044F\u043B\u0456\u043A\u0456: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435"} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 ${sizing.verb} ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u0432\u044F\u043B\u0456\u043A\u0456: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435"} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 \u0431\u044B\u0446\u044C ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u043C\u0430\u043B\u044B: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 ${sizing.verb} ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u0430 \u043C\u0430\u043B\u044B: \u0447\u0430\u043A\u0430\u043B\u0430\u0441\u044F, \u0448\u0442\u043E ${issue2.origin} \u043F\u0430\u0432\u0456\u043D\u043D\u0430 \u0431\u044B\u0446\u044C ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u043F\u0430\u0447\u044B\u043D\u0430\u0446\u0446\u0430 \u0437 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0437\u0430\u043A\u0430\u043D\u0447\u0432\u0430\u0446\u0446\u0430 \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0437\u043C\u044F\u0448\u0447\u0430\u0446\u044C "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u0440\u0430\u0434\u043E\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0430\u0434\u043F\u0430\u0432\u044F\u0434\u0430\u0446\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u043B\u0456\u043A: \u043F\u0430\u0432\u0456\u043D\u0435\u043D \u0431\u044B\u0446\u044C \u043A\u0440\u0430\u0442\u043D\u044B\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u0430\u0441\u043F\u0430\u0437\u043D\u0430\u043D\u044B ${issue2.keys.length > 1 ? "\u043A\u043B\u044E\u0447\u044B" : "\u043A\u043B\u044E\u0447"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u043A\u043B\u044E\u0447 \u0443 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434";
      case "invalid_element":
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u0430\u0435 \u0437\u043D\u0430\u0447\u044D\u043D\u043D\u0435 \u045E ${issue2.origin}`;
      default:
        return `\u041D\u044F\u043F\u0440\u0430\u0432\u0456\u043B\u044C\u043D\u044B \u045E\u0432\u043E\u0434`;
    }
  };
};
function be_default() {
  return {
    localeError: error3()
  };
}

// node_modules/zod/v4/locales/bg.js
var error4 = () => {
  const Sizable = {
    string: { unit: "\u0441\u0438\u043C\u0432\u043E\u043B\u0430", verb: "\u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430" },
    file: { unit: "\u0431\u0430\u0439\u0442\u0430", verb: "\u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430" },
    array: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0430", verb: "\u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430" },
    set: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0430", verb: "\u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0432\u0445\u043E\u0434",
    email: "\u0438\u043C\u0435\u0439\u043B \u0430\u0434\u0440\u0435\u0441",
    url: "URL",
    emoji: "\u0435\u043C\u043E\u0434\u0436\u0438",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0432\u0440\u0435\u043C\u0435",
    date: "ISO \u0434\u0430\u0442\u0430",
    time: "ISO \u0432\u0440\u0435\u043C\u0435",
    duration: "ISO \u043F\u0440\u043E\u0434\u044A\u043B\u0436\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442",
    ipv4: "IPv4 \u0430\u0434\u0440\u0435\u0441",
    ipv6: "IPv6 \u0430\u0434\u0440\u0435\u0441",
    cidrv4: "IPv4 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    cidrv6: "IPv6 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    base64: "base64-\u043A\u043E\u0434\u0438\u0440\u0430\u043D \u043D\u0438\u0437",
    base64url: "base64url-\u043A\u043E\u0434\u0438\u0440\u0430\u043D \u043D\u0438\u0437",
    json_string: "JSON \u043D\u0438\u0437",
    e164: "E.164 \u043D\u043E\u043C\u0435\u0440",
    jwt: "JWT",
    template_literal: "\u0432\u0445\u043E\u0434"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0447\u0438\u0441\u043B\u043E",
    array: "\u043C\u0430\u0441\u0438\u0432"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0432\u0445\u043E\u0434: \u043E\u0447\u0430\u043A\u0432\u0430\u043D instanceof ${issue2.expected}, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${received}`;
        }
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0432\u0445\u043E\u0434: \u043E\u0447\u0430\u043A\u0432\u0430\u043D ${expected}, \u043F\u043E\u043B\u0443\u0447\u0435\u043D ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0432\u0445\u043E\u0434: \u043E\u0447\u0430\u043A\u0432\u0430\u043D ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430 \u043E\u043F\u0446\u0438\u044F: \u043E\u0447\u0430\u043A\u0432\u0430\u043D\u043E \u0435\u0434\u043D\u043E \u043E\u0442 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0422\u0432\u044A\u0440\u0434\u0435 \u0433\u043E\u043B\u044F\u043C\u043E: \u043E\u0447\u0430\u043A\u0432\u0430 \u0441\u0435 ${issue2.origin ?? "\u0441\u0442\u043E\u0439\u043D\u043E\u0441\u0442"} \u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0430"}`;
        return `\u0422\u0432\u044A\u0440\u0434\u0435 \u0433\u043E\u043B\u044F\u043C\u043E: \u043E\u0447\u0430\u043A\u0432\u0430 \u0441\u0435 ${issue2.origin ?? "\u0441\u0442\u043E\u0439\u043D\u043E\u0441\u0442"} \u0434\u0430 \u0431\u044A\u0434\u0435 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0422\u0432\u044A\u0440\u0434\u0435 \u043C\u0430\u043B\u043A\u043E: \u043E\u0447\u0430\u043A\u0432\u0430 \u0441\u0435 ${issue2.origin} \u0434\u0430 \u0441\u044A\u0434\u044A\u0440\u0436\u0430 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0422\u0432\u044A\u0440\u0434\u0435 \u043C\u0430\u043B\u043A\u043E: \u043E\u0447\u0430\u043A\u0432\u0430 \u0441\u0435 ${issue2.origin} \u0434\u0430 \u0431\u044A\u0434\u0435 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u043D\u0438\u0437: \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u0437\u0430\u043F\u043E\u0447\u0432\u0430 \u0441 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u043D\u0438\u0437: \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u0437\u0430\u0432\u044A\u0440\u0448\u0432\u0430 \u0441 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u043D\u0438\u0437: \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u0432\u043A\u043B\u044E\u0447\u0432\u0430 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u043D\u0438\u0437: \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u0441\u044A\u0432\u043F\u0430\u0434\u0430 \u0441 ${_issue.pattern}`;
        let invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D";
        if (_issue.format === "emoji")
          invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u043E";
        if (_issue.format === "datetime")
          invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u043E";
        if (_issue.format === "date")
          invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430";
        if (_issue.format === "time")
          invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u043E";
        if (_issue.format === "duration")
          invalid_adj = "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430";
        return `${invalid_adj} ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u043E \u0447\u0438\u0441\u043B\u043E: \u0442\u0440\u044F\u0431\u0432\u0430 \u0434\u0430 \u0431\u044A\u0434\u0435 \u043A\u0440\u0430\u0442\u043D\u043E \u043D\u0430 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u0430\u0437\u043F\u043E\u0437\u043D\u0430\u0442${issue2.keys.length > 1 ? "\u0438" : ""} \u043A\u043B\u044E\u0447${issue2.keys.length > 1 ? "\u043E\u0432\u0435" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u043A\u043B\u044E\u0447 \u0432 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0432\u0445\u043E\u0434";
      case "invalid_element":
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u0430 \u0441\u0442\u043E\u0439\u043D\u043E\u0441\u0442 \u0432 ${issue2.origin}`;
      default:
        return `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D \u0432\u0445\u043E\u0434`;
    }
  };
};
function bg_default() {
  return {
    localeError: error4()
  };
}

// node_modules/zod/v4/locales/ca.js
var error5 = () => {
  const Sizable = {
    string: { unit: "car\xE0cters", verb: "contenir" },
    file: { unit: "bytes", verb: "contenir" },
    array: { unit: "elements", verb: "contenir" },
    set: { unit: "elements", verb: "contenir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrada",
    email: "adre\xE7a electr\xF2nica",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "durada ISO",
    ipv4: "adre\xE7a IPv4",
    ipv6: "adre\xE7a IPv6",
    cidrv4: "rang IPv4",
    cidrv6: "rang IPv6",
    base64: "cadena codificada en base64",
    base64url: "cadena codificada en base64url",
    json_string: "cadena JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Tipus inv\xE0lid: s'esperava instanceof ${issue2.expected}, s'ha rebut ${received}`;
        }
        return `Tipus inv\xE0lid: s'esperava ${expected}, s'ha rebut ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Valor inv\xE0lid: s'esperava ${stringifyPrimitive(issue2.values[0])}`;
        return `Opci\xF3 inv\xE0lida: s'esperava una de ${joinValues(issue2.values, " o ")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "com a m\xE0xim" : "menys de";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} contingu\xE9s ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} fos ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "com a m\xEDnim" : "m\xE9s de";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Massa petit: s'esperava que ${issue2.origin} contingu\xE9s ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Massa petit: s'esperava que ${issue2.origin} fos ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Format inv\xE0lid: ha de comen\xE7ar amb "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Format inv\xE0lid: ha d'acabar amb "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Format inv\xE0lid: ha d'incloure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Format inv\xE0lid: ha de coincidir amb el patr\xF3 ${_issue.pattern}`;
        return `Format inv\xE0lid per a ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE0lid: ha de ser m\xFAltiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clau${issue2.keys.length > 1 ? "s" : ""} no reconeguda${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clau inv\xE0lida a ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE0lida";
      // Could also be "Tipus d'unió invàlid" but "Entrada invàlida" is more general
      case "invalid_element":
        return `Element inv\xE0lid a ${issue2.origin}`;
      default:
        return `Entrada inv\xE0lida`;
    }
  };
};
function ca_default() {
  return {
    localeError: error5()
  };
}

// node_modules/zod/v4/locales/cs.js
var error6 = () => {
  const Sizable = {
    string: { unit: "znak\u016F", verb: "m\xEDt" },
    file: { unit: "bajt\u016F", verb: "m\xEDt" },
    array: { unit: "prvk\u016F", verb: "m\xEDt" },
    set: { unit: "prvk\u016F", verb: "m\xEDt" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "regul\xE1rn\xED v\xFDraz",
    email: "e-mailov\xE1 adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "datum a \u010Das ve form\xE1tu ISO",
    date: "datum ve form\xE1tu ISO",
    time: "\u010Das ve form\xE1tu ISO",
    duration: "doba trv\xE1n\xED ISO",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "rozsah IPv4",
    cidrv6: "rozsah IPv6",
    base64: "\u0159et\u011Bzec zak\xF3dovan\xFD ve form\xE1tu base64",
    base64url: "\u0159et\u011Bzec zak\xF3dovan\xFD ve form\xE1tu base64url",
    json_string: "\u0159et\u011Bzec ve form\xE1tu JSON",
    e164: "\u010D\xEDslo E.164",
    jwt: "JWT",
    template_literal: "vstup"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u010D\xEDslo",
    string: "\u0159et\u011Bzec",
    function: "funkce",
    array: "pole"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neplatn\xFD vstup: o\u010Dek\xE1v\xE1no instanceof ${issue2.expected}, obdr\u017Eeno ${received}`;
        }
        return `Neplatn\xFD vstup: o\u010Dek\xE1v\xE1no ${expected}, obdr\u017Eeno ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neplatn\xFD vstup: o\u010Dek\xE1v\xE1no ${stringifyPrimitive(issue2.values[0])}`;
        return `Neplatn\xE1 mo\u017Enost: o\u010Dek\xE1v\xE1na jedna z hodnot ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je p\u0159\xEDli\u0161 velk\xE1: ${issue2.origin ?? "hodnota"} mus\xED m\xEDt ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "prvk\u016F"}`;
        }
        return `Hodnota je p\u0159\xEDli\u0161 velk\xE1: ${issue2.origin ?? "hodnota"} mus\xED b\xFDt ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je p\u0159\xEDli\u0161 mal\xE1: ${issue2.origin ?? "hodnota"} mus\xED m\xEDt ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "prvk\u016F"}`;
        }
        return `Hodnota je p\u0159\xEDli\u0161 mal\xE1: ${issue2.origin ?? "hodnota"} mus\xED b\xFDt ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED za\u010D\xEDnat na "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED kon\u010Dit na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED obsahovat "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neplatn\xFD \u0159et\u011Bzec: mus\xED odpov\xEDdat vzoru ${_issue.pattern}`;
        return `Neplatn\xFD form\xE1t ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neplatn\xE9 \u010D\xEDslo: mus\xED b\xFDt n\xE1sobkem ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nezn\xE1m\xE9 kl\xED\u010De: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neplatn\xFD kl\xED\u010D v ${issue2.origin}`;
      case "invalid_union":
        return "Neplatn\xFD vstup";
      case "invalid_element":
        return `Neplatn\xE1 hodnota v ${issue2.origin}`;
      default:
        return `Neplatn\xFD vstup`;
    }
  };
};
function cs_default() {
  return {
    localeError: error6()
  };
}

// node_modules/zod/v4/locales/da.js
var error7 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "havde" },
    file: { unit: "bytes", verb: "havde" },
    array: { unit: "elementer", verb: "indeholdt" },
    set: { unit: "elementer", verb: "indeholdt" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "e-mailadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkesl\xE6t",
    date: "ISO-dato",
    time: "ISO-klokkesl\xE6t",
    duration: "ISO-varighed",
    ipv4: "IPv4-omr\xE5de",
    ipv6: "IPv6-omr\xE5de",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodet streng",
    base64url: "base64url-kodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "streng",
    number: "tal",
    boolean: "boolean",
    array: "liste",
    object: "objekt",
    set: "s\xE6t",
    file: "fil"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ugyldigt input: forventede instanceof ${issue2.expected}, fik ${received}`;
        }
        return `Ugyldigt input: forventede ${expected}, fik ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig v\xE6rdi: forventede ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldigt valg: forventede en af f\xF8lgende ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `For stor: forventede ${origin ?? "value"} ${sizing.verb} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor: forventede ${origin ?? "value"} havde ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `For lille: forventede ${origin} ${sizing.verb} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lille: forventede ${origin} havde ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: skal starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: skal ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: skal indeholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: skal matche m\xF8nsteret ${_issue.pattern}`;
        return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldigt tal: skal v\xE6re deleligt med ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukendte n\xF8gler" : "Ukendt n\xF8gle"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig n\xF8gle i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldigt input: matcher ingen af de tilladte typer";
      case "invalid_element":
        return `Ugyldig v\xE6rdi i ${issue2.origin}`;
      default:
        return `Ugyldigt input`;
    }
  };
};
function da_default() {
  return {
    localeError: error7()
  };
}

// node_modules/zod/v4/locales/de.js
var error8 = () => {
  const Sizable = {
    string: { unit: "Zeichen", verb: "zu haben" },
    file: { unit: "Bytes", verb: "zu haben" },
    array: { unit: "Elemente", verb: "zu haben" },
    set: { unit: "Elemente", verb: "zu haben" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "Eingabe",
    email: "E-Mail-Adresse",
    url: "URL",
    emoji: "Emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-Datum und -Uhrzeit",
    date: "ISO-Datum",
    time: "ISO-Uhrzeit",
    duration: "ISO-Dauer",
    ipv4: "IPv4-Adresse",
    ipv6: "IPv6-Adresse",
    cidrv4: "IPv4-Bereich",
    cidrv6: "IPv6-Bereich",
    base64: "Base64-codierter String",
    base64url: "Base64-URL-codierter String",
    json_string: "JSON-String",
    e164: "E.164-Nummer",
    jwt: "JWT",
    template_literal: "Eingabe"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "Zahl",
    array: "Array"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ung\xFCltige Eingabe: erwartet instanceof ${issue2.expected}, erhalten ${received}`;
        }
        return `Ung\xFCltige Eingabe: erwartet ${expected}, erhalten ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ung\xFCltige Eingabe: erwartet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ung\xFCltige Option: erwartet eine von ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Zu gro\xDF: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
        return `Zu gro\xDF: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ist`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} hat`;
        }
        return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ist`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ung\xFCltiger String: muss mit "${_issue.prefix}" beginnen`;
        if (_issue.format === "ends_with")
          return `Ung\xFCltiger String: muss mit "${_issue.suffix}" enden`;
        if (_issue.format === "includes")
          return `Ung\xFCltiger String: muss "${_issue.includes}" enthalten`;
        if (_issue.format === "regex")
          return `Ung\xFCltiger String: muss dem Muster ${_issue.pattern} entsprechen`;
        return `Ung\xFCltig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ung\xFCltige Zahl: muss ein Vielfaches von ${issue2.divisor} sein`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Unbekannte Schl\xFCssel" : "Unbekannter Schl\xFCssel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ung\xFCltiger Schl\xFCssel in ${issue2.origin}`;
      case "invalid_union":
        return "Ung\xFCltige Eingabe";
      case "invalid_element":
        return `Ung\xFCltiger Wert in ${issue2.origin}`;
      default:
        return `Ung\xFCltige Eingabe`;
    }
  };
};
function de_default() {
  return {
    localeError: error8()
  };
}

// node_modules/zod/v4/locales/el.js
var error9 = () => {
  const Sizable = {
    string: { unit: "\u03C7\u03B1\u03C1\u03B1\u03BA\u03C4\u03AE\u03C1\u03B5\u03C2", verb: "\u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9" },
    file: { unit: "bytes", verb: "\u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9" },
    array: { unit: "\u03C3\u03C4\u03BF\u03B9\u03C7\u03B5\u03AF\u03B1", verb: "\u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9" },
    set: { unit: "\u03C3\u03C4\u03BF\u03B9\u03C7\u03B5\u03AF\u03B1", verb: "\u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9" },
    map: { unit: "\u03BA\u03B1\u03C4\u03B1\u03C7\u03C9\u03C1\u03AE\u03C3\u03B5\u03B9\u03C2", verb: "\u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2",
    email: "\u03B4\u03B9\u03B5\u03CD\u03B8\u03C5\u03BD\u03C3\u03B7 email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u03B7\u03BC\u03B5\u03C1\u03BF\u03BC\u03B7\u03BD\u03AF\u03B1 \u03BA\u03B1\u03B9 \u03CE\u03C1\u03B1",
    date: "ISO \u03B7\u03BC\u03B5\u03C1\u03BF\u03BC\u03B7\u03BD\u03AF\u03B1",
    time: "ISO \u03CE\u03C1\u03B1",
    duration: "ISO \u03B4\u03B9\u03AC\u03C1\u03BA\u03B5\u03B9\u03B1",
    ipv4: "\u03B4\u03B9\u03B5\u03CD\u03B8\u03C5\u03BD\u03C3\u03B7 IPv4",
    ipv6: "\u03B4\u03B9\u03B5\u03CD\u03B8\u03C5\u03BD\u03C3\u03B7 IPv6",
    mac: "\u03B4\u03B9\u03B5\u03CD\u03B8\u03C5\u03BD\u03C3\u03B7 MAC",
    cidrv4: "\u03B5\u03CD\u03C1\u03BF\u03C2 IPv4",
    cidrv6: "\u03B5\u03CD\u03C1\u03BF\u03C2 IPv6",
    base64: "\u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC \u03BA\u03C9\u03B4\u03B9\u03BA\u03BF\u03C0\u03BF\u03B9\u03B7\u03BC\u03AD\u03BD\u03B7 \u03C3\u03B5 base64",
    base64url: "\u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC \u03BA\u03C9\u03B4\u03B9\u03BA\u03BF\u03C0\u03BF\u03B9\u03B7\u03BC\u03AD\u03BD\u03B7 \u03C3\u03B5 base64url",
    json_string: "\u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC JSON",
    e164: "\u03B1\u03C1\u03B9\u03B8\u03BC\u03CC\u03C2 E.164",
    jwt: "JWT",
    template_literal: "\u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (typeof issue2.expected === "string" && /^[A-Z]/.test(issue2.expected)) {
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD instanceof ${issue2.expected}, \u03BB\u03AE\u03C6\u03B8\u03B7\u03BA\u03B5 ${received}`;
        }
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${expected}, \u03BB\u03AE\u03C6\u03B8\u03B7\u03BA\u03B5 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${stringifyPrimitive(issue2.values[0])}`;
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03C0\u03B9\u03BB\u03BF\u03B3\u03AE: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD \u03AD\u03BD\u03B1 \u03B1\u03C0\u03CC ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u03A0\u03BF\u03BB\u03CD \u03BC\u03B5\u03B3\u03AC\u03BB\u03BF: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${issue2.origin ?? "\u03C4\u03B9\u03BC\u03AE"} \u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u03C3\u03C4\u03BF\u03B9\u03C7\u03B5\u03AF\u03B1"}`;
        return `\u03A0\u03BF\u03BB\u03CD \u03BC\u03B5\u03B3\u03AC\u03BB\u03BF: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${issue2.origin ?? "\u03C4\u03B9\u03BC\u03AE"} \u03BD\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u03A0\u03BF\u03BB\u03CD \u03BC\u03B9\u03BA\u03C1\u03CC: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${issue2.origin} \u03BD\u03B1 \u03AD\u03C7\u03B5\u03B9 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u03A0\u03BF\u03BB\u03CD \u03BC\u03B9\u03BA\u03C1\u03CC: \u03B1\u03BD\u03B1\u03BC\u03B5\u03BD\u03CC\u03C4\u03B1\u03BD ${issue2.origin} \u03BD\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC: \u03C0\u03C1\u03AD\u03C0\u03B5\u03B9 \u03BD\u03B1 \u03BE\u03B5\u03BA\u03B9\u03BD\u03AC \u03BC\u03B5 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC: \u03C0\u03C1\u03AD\u03C0\u03B5\u03B9 \u03BD\u03B1 \u03C4\u03B5\u03BB\u03B5\u03B9\u03CE\u03BD\u03B5\u03B9 \u03BC\u03B5 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC: \u03C0\u03C1\u03AD\u03C0\u03B5\u03B9 \u03BD\u03B1 \u03C0\u03B5\u03C1\u03B9\u03AD\u03C7\u03B5\u03B9 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03C3\u03C5\u03BC\u03B2\u03BF\u03BB\u03BF\u03C3\u03B5\u03B9\u03C1\u03AC: \u03C0\u03C1\u03AD\u03C0\u03B5\u03B9 \u03BD\u03B1 \u03C4\u03B1\u03B9\u03C1\u03B9\u03AC\u03B6\u03B5\u03B9 \u03BC\u03B5 \u03C4\u03BF \u03BC\u03BF\u03C4\u03AF\u03B2\u03BF ${_issue.pattern}`;
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03BF: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03BF\u03C2 \u03B1\u03C1\u03B9\u03B8\u03BC\u03CC\u03C2: \u03C0\u03C1\u03AD\u03C0\u03B5\u03B9 \u03BD\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03C0\u03BF\u03BB\u03BB\u03B1\u03C0\u03BB\u03AC\u03C3\u03B9\u03BF \u03C4\u03BF\u03C5 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u0386\u03B3\u03BD\u03C9\u03C3\u03C4${issue2.keys.length > 1 ? "\u03B1" : "\u03BF"} \u03BA\u03BB\u03B5\u03B9\u03B4${issue2.keys.length > 1 ? "\u03B9\u03AC" : "\u03AF"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03BF \u03BA\u03BB\u03B5\u03B9\u03B4\u03AF \u03C3\u03C4\u03BF ${issue2.origin}`;
      case "invalid_union":
        return "\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2";
      case "invalid_element":
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03C4\u03B9\u03BC\u03AE \u03C3\u03C4\u03BF ${issue2.origin}`;
      default:
        return `\u039C\u03B7 \u03AD\u03B3\u03BA\u03C5\u03C1\u03B7 \u03B5\u03AF\u03C3\u03BF\u03B4\u03BF\u03C2`;
    }
  };
};
function el_default() {
  return {
    localeError: error9()
  };
}

// node_modules/zod/v4/locales/en.js
var error10 = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    // Compatibility: "nan" -> "NaN" for display
    nan: "NaN"
    // All other type names omitted - they fall back to raw values via ?? operator
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
          const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error10()
  };
}

// node_modules/zod/v4/locales/eo.js
var error11 = () => {
  const Sizable = {
    string: { unit: "karaktrojn", verb: "havi" },
    file: { unit: "bajtojn", verb: "havi" },
    array: { unit: "elementojn", verb: "havi" },
    set: { unit: "elementojn", verb: "havi" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "enigo",
    email: "retadreso",
    url: "URL",
    emoji: "emo\u011Dio",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datotempo",
    date: "ISO-dato",
    time: "ISO-tempo",
    duration: "ISO-da\u016Dro",
    ipv4: "IPv4-adreso",
    ipv6: "IPv6-adreso",
    cidrv4: "IPv4-rango",
    cidrv6: "IPv6-rango",
    base64: "64-ume kodita karaktraro",
    base64url: "URL-64-ume kodita karaktraro",
    json_string: "JSON-karaktraro",
    e164: "E.164-nombro",
    jwt: "JWT",
    template_literal: "enigo"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "nombro",
    array: "tabelo",
    null: "senvalora"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Nevalida enigo: atendi\u011Dis instanceof ${issue2.expected}, ricevi\u011Dis ${received}`;
        }
        return `Nevalida enigo: atendi\u011Dis ${expected}, ricevi\u011Dis ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nevalida enigo: atendi\u011Dis ${stringifyPrimitive(issue2.values[0])}`;
        return `Nevalida opcio: atendi\u011Dis unu el ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tro granda: atendi\u011Dis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
        return `Tro granda: atendi\u011Dis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Tro malgranda: atendi\u011Dis ke ${issue2.origin} havu ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Tro malgranda: atendi\u011Dis ke ${issue2.origin} estu ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nevalida karaktraro: devas komenci\u011Di per "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nevalida karaktraro: devas fini\u011Di per "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
        return `Nevalida ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nevalida nombro: devas esti oblo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nekonata${issue2.keys.length > 1 ? "j" : ""} \u015Dlosilo${issue2.keys.length > 1 ? "j" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nevalida \u015Dlosilo en ${issue2.origin}`;
      case "invalid_union":
        return "Nevalida enigo";
      case "invalid_element":
        return `Nevalida valoro en ${issue2.origin}`;
      default:
        return `Nevalida enigo`;
    }
  };
};
function eo_default() {
  return {
    localeError: error11()
  };
}

// node_modules/zod/v4/locales/es.js
var error12 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "tener" },
    file: { unit: "bytes", verb: "tener" },
    array: { unit: "elementos", verb: "tener" },
    set: { unit: "elementos", verb: "tener" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrada",
    email: "direcci\xF3n de correo electr\xF3nico",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "fecha y hora ISO",
    date: "fecha ISO",
    time: "hora ISO",
    duration: "duraci\xF3n ISO",
    ipv4: "direcci\xF3n IPv4",
    ipv6: "direcci\xF3n IPv6",
    cidrv4: "rango IPv4",
    cidrv6: "rango IPv6",
    base64: "cadena codificada en base64",
    base64url: "URL codificada en base64",
    json_string: "cadena JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "texto",
    number: "n\xFAmero",
    boolean: "booleano",
    array: "arreglo",
    object: "objeto",
    set: "conjunto",
    file: "archivo",
    date: "fecha",
    bigint: "n\xFAmero grande",
    symbol: "s\xEDmbolo",
    undefined: "indefinido",
    null: "nulo",
    function: "funci\xF3n",
    map: "mapa",
    record: "registro",
    tuple: "tupla",
    enum: "enumeraci\xF3n",
    union: "uni\xF3n",
    literal: "literal",
    promise: "promesa",
    void: "vac\xEDo",
    never: "nunca",
    unknown: "desconocido",
    any: "cualquiera"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entrada inv\xE1lida: se esperaba instanceof ${issue2.expected}, recibido ${received}`;
        }
        return `Entrada inv\xE1lida: se esperaba ${expected}, recibido ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inv\xE1lida: se esperaba ${stringifyPrimitive(issue2.values[0])}`;
        return `Opci\xF3n inv\xE1lida: se esperaba una de ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `Demasiado grande: se esperaba que ${origin ?? "valor"} tuviera ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Demasiado grande: se esperaba que ${origin ?? "valor"} fuera ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `Demasiado peque\xF1o: se esperaba que ${origin} tuviera ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Demasiado peque\xF1o: se esperaba que ${origin} fuera ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cadena inv\xE1lida: debe comenzar con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cadena inv\xE1lida: debe terminar en "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cadena inv\xE1lida: debe incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cadena inv\xE1lida: debe coincidir con el patr\xF3n ${_issue.pattern}`;
        return `Inv\xE1lido ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE1lido: debe ser m\xFAltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Llave${issue2.keys.length > 1 ? "s" : ""} desconocida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Llave inv\xE1lida en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE1lida";
      case "invalid_element":
        return `Valor inv\xE1lido en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      default:
        return `Entrada inv\xE1lida`;
    }
  };
};
function es_default() {
  return {
    localeError: error12()
  };
}

// node_modules/zod/v4/locales/fa.js
var error13 = () => {
  const Sizable = {
    string: { unit: "\u06A9\u0627\u0631\u0627\u06A9\u062A\u0631", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    file: { unit: "\u0628\u0627\u06CC\u062A", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    array: { unit: "\u0622\u06CC\u062A\u0645", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" },
    set: { unit: "\u0622\u06CC\u062A\u0645", verb: "\u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0648\u0631\u0648\u062F\u06CC",
    email: "\u0622\u062F\u0631\u0633 \u0627\u06CC\u0645\u06CC\u0644",
    url: "URL",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u06CC",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u062A\u0627\u0631\u06CC\u062E \u0648 \u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    date: "\u062A\u0627\u0631\u06CC\u062E \u0627\u06CC\u0632\u0648",
    time: "\u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    duration: "\u0645\u062F\u062A \u0632\u0645\u0627\u0646 \u0627\u06CC\u0632\u0648",
    ipv4: "IPv4 \u0622\u062F\u0631\u0633",
    ipv6: "IPv6 \u0622\u062F\u0631\u0633",
    cidrv4: "IPv4 \u062F\u0627\u0645\u0646\u0647",
    cidrv6: "IPv6 \u062F\u0627\u0645\u0646\u0647",
    base64: "base64-encoded \u0631\u0634\u062A\u0647",
    base64url: "base64url-encoded \u0631\u0634\u062A\u0647",
    json_string: "JSON \u0631\u0634\u062A\u0647",
    e164: "E.164 \u0639\u062F\u062F",
    jwt: "JWT",
    template_literal: "\u0648\u0631\u0648\u062F\u06CC"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0639\u062F\u062F",
    array: "\u0622\u0631\u0627\u06CC\u0647"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A instanceof ${issue2.expected} \u0645\u06CC\u200C\u0628\u0648\u062F\u060C ${received} \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F`;
        }
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A ${expected} \u0645\u06CC\u200C\u0628\u0648\u062F\u060C ${received} \u062F\u0631\u06CC\u0627\u0641\u062A \u0634\u062F`;
      }
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A ${stringifyPrimitive(issue2.values[0])} \u0645\u06CC\u200C\u0628\u0648\u062F`;
        }
        return `\u06AF\u0632\u06CC\u0646\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0645\u06CC\u200C\u0628\u0627\u06CC\u0633\u062A \u06CC\u06A9\u06CC \u0627\u0632 ${joinValues(issue2.values, "|")} \u0645\u06CC\u200C\u0628\u0648\u062F`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u062E\u06CC\u0644\u06CC \u0628\u0632\u0631\u06AF: ${issue2.origin ?? "\u0645\u0642\u062F\u0627\u0631"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631"} \u0628\u0627\u0634\u062F`;
        }
        return `\u062E\u06CC\u0644\u06CC \u0628\u0632\u0631\u06AF: ${issue2.origin ?? "\u0645\u0642\u062F\u0627\u0631"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} \u0628\u0627\u0634\u062F`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0628\u0627\u0634\u062F`;
        }
        return `\u062E\u06CC\u0644\u06CC \u06A9\u0648\u0686\u06A9: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} \u0628\u0627\u0634\u062F`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 "${_issue.prefix}" \u0634\u0631\u0648\u0639 \u0634\u0648\u062F`;
        }
        if (_issue.format === "ends_with") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 "${_issue.suffix}" \u062A\u0645\u0627\u0645 \u0634\u0648\u062F`;
        }
        if (_issue.format === "includes") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0634\u0627\u0645\u0644 "${_issue.includes}" \u0628\u0627\u0634\u062F`;
        }
        if (_issue.format === "regex") {
          return `\u0631\u0634\u062A\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0628\u0627 \u0627\u0644\u06AF\u0648\u06CC ${_issue.pattern} \u0645\u0637\u0627\u0628\u0642\u062A \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u062F`;
        }
        return `${FormatDictionary[_issue.format] ?? issue2.format} \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
      }
      case "not_multiple_of":
        return `\u0639\u062F\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631: \u0628\u0627\u06CC\u062F \u0645\u0636\u0631\u0628 ${issue2.divisor} \u0628\u0627\u0634\u062F`;
      case "unrecognized_keys":
        return `\u06A9\u0644\u06CC\u062F${issue2.keys.length > 1 ? "\u0647\u0627\u06CC" : ""} \u0646\u0627\u0634\u0646\u0627\u0633: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u06A9\u0644\u06CC\u062F \u0646\u0627\u0634\u0646\u0627\u0633 \u062F\u0631 ${issue2.origin}`;
      case "invalid_union":
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
      case "invalid_element":
        return `\u0645\u0642\u062F\u0627\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u062F\u0631 ${issue2.origin}`;
      default:
        return `\u0648\u0631\u0648\u062F\u06CC \u0646\u0627\u0645\u0639\u062A\u0628\u0631`;
    }
  };
};
function fa_default() {
  return {
    localeError: error13()
  };
}

// node_modules/zod/v4/locales/fi.js
var error14 = () => {
  const Sizable = {
    string: { unit: "merkki\xE4", subject: "merkkijonon" },
    file: { unit: "tavua", subject: "tiedoston" },
    array: { unit: "alkiota", subject: "listan" },
    set: { unit: "alkiota", subject: "joukon" },
    number: { unit: "", subject: "luvun" },
    bigint: { unit: "", subject: "suuren kokonaisluvun" },
    int: { unit: "", subject: "kokonaisluvun" },
    date: { unit: "", subject: "p\xE4iv\xE4m\xE4\xE4r\xE4n" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "s\xE4\xE4nn\xF6llinen lauseke",
    email: "s\xE4hk\xF6postiosoite",
    url: "URL-osoite",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-aikaleima",
    date: "ISO-p\xE4iv\xE4m\xE4\xE4r\xE4",
    time: "ISO-aika",
    duration: "ISO-kesto",
    ipv4: "IPv4-osoite",
    ipv6: "IPv6-osoite",
    cidrv4: "IPv4-alue",
    cidrv6: "IPv6-alue",
    base64: "base64-koodattu merkkijono",
    base64url: "base64url-koodattu merkkijono",
    json_string: "JSON-merkkijono",
    e164: "E.164-luku",
    jwt: "JWT",
    template_literal: "templaattimerkkijono"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Virheellinen tyyppi: odotettiin instanceof ${issue2.expected}, oli ${received}`;
        }
        return `Virheellinen tyyppi: odotettiin ${expected}, oli ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Virheellinen sy\xF6te: t\xE4ytyy olla ${stringifyPrimitive(issue2.values[0])}`;
        return `Virheellinen valinta: t\xE4ytyy olla yksi seuraavista: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian suuri: ${sizing.subject} t\xE4ytyy olla ${adj}${issue2.maximum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian suuri: arvon t\xE4ytyy olla ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian pieni: ${sizing.subject} t\xE4ytyy olla ${adj}${issue2.minimum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian pieni: arvon t\xE4ytyy olla ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Virheellinen sy\xF6te: t\xE4ytyy alkaa "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Virheellinen sy\xF6te: t\xE4ytyy loppua "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Virheellinen sy\xF6te: t\xE4ytyy sis\xE4lt\xE4\xE4 "${_issue.includes}"`;
        if (_issue.format === "regex") {
          return `Virheellinen sy\xF6te: t\xE4ytyy vastata s\xE4\xE4nn\xF6llist\xE4 lauseketta ${_issue.pattern}`;
        }
        return `Virheellinen ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Virheellinen luku: t\xE4ytyy olla luvun ${issue2.divisor} monikerta`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Virheellinen avain tietueessa";
      case "invalid_union":
        return "Virheellinen unioni";
      case "invalid_element":
        return "Virheellinen arvo joukossa";
      default:
        return `Virheellinen sy\xF6te`;
    }
  };
};
function fi_default() {
  return {
    localeError: error14()
  };
}

// node_modules/zod/v4/locales/fr.js
var error15 = () => {
  const Sizable = {
    string: { unit: "caract\xE8res", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "\xE9l\xE9ments", verb: "avoir" },
    set: { unit: "\xE9l\xE9ments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entr\xE9e",
    email: "adresse e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date et heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "dur\xE9e ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "cha\xEEne encod\xE9e en base64",
    base64url: "cha\xEEne encod\xE9e en base64url",
    json_string: "cha\xEEne JSON",
    e164: "num\xE9ro E.164",
    jwt: "JWT",
    template_literal: "entr\xE9e"
  };
  const TypeDictionary = {
    string: "cha\xEEne",
    number: "nombre",
    int: "entier",
    boolean: "bool\xE9en",
    bigint: "grand entier",
    symbol: "symbole",
    undefined: "ind\xE9fini",
    null: "null",
    never: "jamais",
    void: "vide",
    date: "date",
    array: "tableau",
    object: "objet",
    tuple: "tuple",
    record: "enregistrement",
    map: "carte",
    set: "ensemble",
    file: "fichier",
    nonoptional: "non-optionnel",
    nan: "NaN",
    function: "fonction"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entr\xE9e invalide : instanceof ${issue2.expected} attendu, ${received} re\xE7u`;
        }
        return `Entr\xE9e invalide : ${expected} attendu, ${received} re\xE7u`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entr\xE9e invalide : ${stringifyPrimitive(issue2.values[0])} attendu`;
        return `Option invalide : une valeur parmi ${joinValues(issue2.values, "|")} attendue`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\xE9l\xE9ment(s)"}`;
        return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit \xEAtre ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit \xEAtre ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cha\xEEne invalide : doit commencer par "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cha\xEEne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cha\xEEne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cha\xEEne invalide : doit correspondre au mod\xE8le ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit \xEAtre un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Cl\xE9${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cl\xE9 invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entr\xE9e invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entr\xE9e invalide`;
    }
  };
};
function fr_default() {
  return {
    localeError: error15()
  };
}

// node_modules/zod/v4/locales/fr-CA.js
var error16 = () => {
  const Sizable = {
    string: { unit: "caract\xE8res", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "\xE9l\xE9ments", verb: "avoir" },
    set: { unit: "\xE9l\xE9ments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entr\xE9e",
    email: "adresse courriel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date-heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "dur\xE9e ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "cha\xEEne encod\xE9e en base64",
    base64url: "cha\xEEne encod\xE9e en base64url",
    json_string: "cha\xEEne JSON",
    e164: "num\xE9ro E.164",
    jwt: "JWT",
    template_literal: "entr\xE9e"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entr\xE9e invalide : attendu instanceof ${issue2.expected}, re\xE7u ${received}`;
        }
        return `Entr\xE9e invalide : attendu ${expected}, re\xE7u ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entr\xE9e invalide : attendu ${stringifyPrimitive(issue2.values[0])}`;
        return `Option invalide : attendu l'une des valeurs suivantes ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u2264" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} ait ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} soit ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u2265" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : attendu que ${issue2.origin} ait ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : attendu que ${issue2.origin} soit ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Cha\xEEne invalide : doit commencer par "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Cha\xEEne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cha\xEEne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cha\xEEne invalide : doit correspondre au motif ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit \xEAtre un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Cl\xE9${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cl\xE9 invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entr\xE9e invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entr\xE9e invalide`;
    }
  };
};
function fr_CA_default() {
  return {
    localeError: error16()
  };
}

// node_modules/zod/v4/locales/he.js
var error17 = () => {
  const TypeNames = {
    string: { label: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA", gender: "f" },
    number: { label: "\u05DE\u05E1\u05E4\u05E8", gender: "m" },
    boolean: { label: "\u05E2\u05E8\u05DA \u05D1\u05D5\u05DC\u05D9\u05D0\u05E0\u05D9", gender: "m" },
    bigint: { label: "BigInt", gender: "m" },
    date: { label: "\u05EA\u05D0\u05E8\u05D9\u05DA", gender: "m" },
    array: { label: "\u05DE\u05E2\u05E8\u05DA", gender: "m" },
    object: { label: "\u05D0\u05D5\u05D1\u05D9\u05D9\u05E7\u05D8", gender: "m" },
    null: { label: "\u05E2\u05E8\u05DA \u05E8\u05D9\u05E7 (null)", gender: "m" },
    undefined: { label: "\u05E2\u05E8\u05DA \u05DC\u05D0 \u05DE\u05D5\u05D2\u05D3\u05E8 (undefined)", gender: "m" },
    symbol: { label: "\u05E1\u05D9\u05DE\u05D1\u05D5\u05DC (Symbol)", gender: "m" },
    function: { label: "\u05E4\u05D5\u05E0\u05E7\u05E6\u05D9\u05D4", gender: "f" },
    map: { label: "\u05DE\u05E4\u05D4 (Map)", gender: "f" },
    set: { label: "\u05E7\u05D1\u05D5\u05E6\u05D4 (Set)", gender: "f" },
    file: { label: "\u05E7\u05D5\u05D1\u05E5", gender: "m" },
    promise: { label: "Promise", gender: "m" },
    NaN: { label: "NaN", gender: "m" },
    unknown: { label: "\u05E2\u05E8\u05DA \u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2", gender: "m" },
    value: { label: "\u05E2\u05E8\u05DA", gender: "m" }
  };
  const Sizable = {
    string: { unit: "\u05EA\u05D5\u05D5\u05D9\u05DD", shortLabel: "\u05E7\u05E6\u05E8", longLabel: "\u05D0\u05E8\u05D5\u05DA" },
    file: { unit: "\u05D1\u05D9\u05D9\u05D8\u05D9\u05DD", shortLabel: "\u05E7\u05D8\u05DF", longLabel: "\u05D2\u05D3\u05D5\u05DC" },
    array: { unit: "\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD", shortLabel: "\u05E7\u05D8\u05DF", longLabel: "\u05D2\u05D3\u05D5\u05DC" },
    set: { unit: "\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD", shortLabel: "\u05E7\u05D8\u05DF", longLabel: "\u05D2\u05D3\u05D5\u05DC" },
    number: { unit: "", shortLabel: "\u05E7\u05D8\u05DF", longLabel: "\u05D2\u05D3\u05D5\u05DC" }
    // no unit
  };
  const typeEntry = (t) => t ? TypeNames[t] : void 0;
  const typeLabel = (t) => {
    const e = typeEntry(t);
    if (e)
      return e.label;
    return t ?? TypeNames.unknown.label;
  };
  const withDefinite = (t) => `\u05D4${typeLabel(t)}`;
  const verbFor = (t) => {
    const e = typeEntry(t);
    const gender = e?.gender ?? "m";
    return gender === "f" ? "\u05E6\u05E8\u05D9\u05DB\u05D4 \u05DC\u05D4\u05D9\u05D5\u05EA" : "\u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA";
  };
  const getSizing = (origin) => {
    if (!origin)
      return null;
    return Sizable[origin] ?? null;
  };
  const FormatDictionary = {
    regex: { label: "\u05E7\u05DC\u05D8", gender: "m" },
    email: { label: "\u05DB\u05EA\u05D5\u05D1\u05EA \u05D0\u05D9\u05DE\u05D9\u05D9\u05DC", gender: "f" },
    url: { label: "\u05DB\u05EA\u05D5\u05D1\u05EA \u05E8\u05E9\u05EA", gender: "f" },
    emoji: { label: "\u05D0\u05D9\u05DE\u05D5\u05D2'\u05D9", gender: "m" },
    uuid: { label: "UUID", gender: "m" },
    nanoid: { label: "nanoid", gender: "m" },
    guid: { label: "GUID", gender: "m" },
    cuid: { label: "cuid", gender: "m" },
    cuid2: { label: "cuid2", gender: "m" },
    ulid: { label: "ULID", gender: "m" },
    xid: { label: "XID", gender: "m" },
    ksuid: { label: "KSUID", gender: "m" },
    datetime: { label: "\u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05D6\u05DE\u05DF ISO", gender: "m" },
    date: { label: "\u05EA\u05D0\u05E8\u05D9\u05DA ISO", gender: "m" },
    time: { label: "\u05D6\u05DE\u05DF ISO", gender: "m" },
    duration: { label: "\u05DE\u05E9\u05DA \u05D6\u05DE\u05DF ISO", gender: "m" },
    ipv4: { label: "\u05DB\u05EA\u05D5\u05D1\u05EA IPv4", gender: "f" },
    ipv6: { label: "\u05DB\u05EA\u05D5\u05D1\u05EA IPv6", gender: "f" },
    cidrv4: { label: "\u05D8\u05D5\u05D5\u05D7 IPv4", gender: "m" },
    cidrv6: { label: "\u05D8\u05D5\u05D5\u05D7 IPv6", gender: "m" },
    base64: { label: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D1\u05D1\u05E1\u05D9\u05E1 64", gender: "f" },
    base64url: { label: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D1\u05D1\u05E1\u05D9\u05E1 64 \u05DC\u05DB\u05EA\u05D5\u05D1\u05D5\u05EA \u05E8\u05E9\u05EA", gender: "f" },
    json_string: { label: "\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA JSON", gender: "f" },
    e164: { label: "\u05DE\u05E1\u05E4\u05E8 E.164", gender: "m" },
    jwt: { label: "JWT", gender: "m" },
    ends_with: { label: "\u05E7\u05DC\u05D8", gender: "m" },
    includes: { label: "\u05E7\u05DC\u05D8", gender: "m" },
    lowercase: { label: "\u05E7\u05DC\u05D8", gender: "m" },
    starts_with: { label: "\u05E7\u05DC\u05D8", gender: "m" },
    uppercase: { label: "\u05E7\u05DC\u05D8", gender: "m" }
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expectedKey = issue2.expected;
        const expected = TypeDictionary[expectedKey ?? ""] ?? typeLabel(expectedKey);
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? TypeNames[receivedType]?.label ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA instanceof ${issue2.expected}, \u05D4\u05EA\u05E7\u05D1\u05DC ${received}`;
        }
        return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${expected}, \u05D4\u05EA\u05E7\u05D1\u05DC ${received}`;
      }
      case "invalid_value": {
        if (issue2.values.length === 1) {
          return `\u05E2\u05E8\u05DA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05D4\u05E2\u05E8\u05DA \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA ${stringifyPrimitive(issue2.values[0])}`;
        }
        const stringified = issue2.values.map((v) => stringifyPrimitive(v));
        if (issue2.values.length === 2) {
          return `\u05E2\u05E8\u05DA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05D4\u05D0\u05E4\u05E9\u05E8\u05D5\u05D9\u05D5\u05EA \u05D4\u05DE\u05EA\u05D0\u05D9\u05DE\u05D5\u05EA \u05D4\u05DF ${stringified[0]} \u05D0\u05D5 ${stringified[1]}`;
        }
        const lastValue = stringified[stringified.length - 1];
        const restValues = stringified.slice(0, -1).join(", ");
        return `\u05E2\u05E8\u05DA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05D4\u05D0\u05E4\u05E9\u05E8\u05D5\u05D9\u05D5\u05EA \u05D4\u05DE\u05EA\u05D0\u05D9\u05DE\u05D5\u05EA \u05D4\u05DF ${restValues} \u05D0\u05D5 ${lastValue}`;
      }
      case "too_big": {
        const sizing = getSizing(issue2.origin);
        const subject = withDefinite(issue2.origin ?? "value");
        if (issue2.origin === "string") {
          return `${sizing?.longLabel ?? "\u05D0\u05E8\u05D5\u05DA"} \u05DE\u05D3\u05D9: ${subject} \u05E6\u05E8\u05D9\u05DB\u05D4 \u05DC\u05D4\u05DB\u05D9\u05DC ${issue2.maximum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "\u05D0\u05D5 \u05E4\u05D7\u05D5\u05EA" : "\u05DC\u05DB\u05DC \u05D4\u05D9\u05D5\u05EA\u05E8"}`.trim();
        }
        if (issue2.origin === "number") {
          const comparison = issue2.inclusive ? `\u05E7\u05D8\u05DF \u05D0\u05D5 \u05E9\u05D5\u05D5\u05D4 \u05DC-${issue2.maximum}` : `\u05E7\u05D8\u05DF \u05DE-${issue2.maximum}`;
          return `\u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9: ${subject} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${comparison}`;
        }
        if (issue2.origin === "array" || issue2.origin === "set") {
          const verb = issue2.origin === "set" ? "\u05E6\u05E8\u05D9\u05DB\u05D4" : "\u05E6\u05E8\u05D9\u05DA";
          const comparison = issue2.inclusive ? `${issue2.maximum} ${sizing?.unit ?? ""} \u05D0\u05D5 \u05E4\u05D7\u05D5\u05EA` : `\u05E4\u05D7\u05D5\u05EA \u05DE-${issue2.maximum} ${sizing?.unit ?? ""}`;
          return `\u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9: ${subject} ${verb} \u05DC\u05D4\u05DB\u05D9\u05DC ${comparison}`.trim();
        }
        const adj = issue2.inclusive ? "<=" : "<";
        const be = verbFor(issue2.origin ?? "value");
        if (sizing?.unit) {
          return `${sizing.longLabel} \u05DE\u05D3\u05D9: ${subject} ${be} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        }
        return `${sizing?.longLabel ?? "\u05D2\u05D3\u05D5\u05DC"} \u05DE\u05D3\u05D9: ${subject} ${be} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const sizing = getSizing(issue2.origin);
        const subject = withDefinite(issue2.origin ?? "value");
        if (issue2.origin === "string") {
          return `${sizing?.shortLabel ?? "\u05E7\u05E6\u05E8"} \u05DE\u05D3\u05D9: ${subject} \u05E6\u05E8\u05D9\u05DB\u05D4 \u05DC\u05D4\u05DB\u05D9\u05DC ${issue2.minimum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "\u05D0\u05D5 \u05D9\u05D5\u05EA\u05E8" : "\u05DC\u05E4\u05D7\u05D5\u05EA"}`.trim();
        }
        if (issue2.origin === "number") {
          const comparison = issue2.inclusive ? `\u05D2\u05D3\u05D5\u05DC \u05D0\u05D5 \u05E9\u05D5\u05D5\u05D4 \u05DC-${issue2.minimum}` : `\u05D2\u05D3\u05D5\u05DC \u05DE-${issue2.minimum}`;
          return `\u05E7\u05D8\u05DF \u05DE\u05D3\u05D9: ${subject} \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA ${comparison}`;
        }
        if (issue2.origin === "array" || issue2.origin === "set") {
          const verb = issue2.origin === "set" ? "\u05E6\u05E8\u05D9\u05DB\u05D4" : "\u05E6\u05E8\u05D9\u05DA";
          if (issue2.minimum === 1 && issue2.inclusive) {
            const singularPhrase = issue2.origin === "set" ? "\u05DC\u05E4\u05D7\u05D5\u05EA \u05E4\u05E8\u05D9\u05D8 \u05D0\u05D7\u05D3" : "\u05DC\u05E4\u05D7\u05D5\u05EA \u05E4\u05E8\u05D9\u05D8 \u05D0\u05D7\u05D3";
            return `\u05E7\u05D8\u05DF \u05DE\u05D3\u05D9: ${subject} ${verb} \u05DC\u05D4\u05DB\u05D9\u05DC ${singularPhrase}`;
          }
          const comparison = issue2.inclusive ? `${issue2.minimum} ${sizing?.unit ?? ""} \u05D0\u05D5 \u05D9\u05D5\u05EA\u05E8` : `\u05D9\u05D5\u05EA\u05E8 \u05DE-${issue2.minimum} ${sizing?.unit ?? ""}`;
          return `\u05E7\u05D8\u05DF \u05DE\u05D3\u05D9: ${subject} ${verb} \u05DC\u05D4\u05DB\u05D9\u05DC ${comparison}`.trim();
        }
        const adj = issue2.inclusive ? ">=" : ">";
        const be = verbFor(issue2.origin ?? "value");
        if (sizing?.unit) {
          return `${sizing.shortLabel} \u05DE\u05D3\u05D9: ${subject} ${be} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `${sizing?.shortLabel ?? "\u05E7\u05D8\u05DF"} \u05DE\u05D3\u05D9: ${subject} ${be} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u05D4\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05D1 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u05D4\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05E1\u05EA\u05D9\u05D9\u05DD \u05D1 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u05D4\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05DB\u05DC\u05D5\u05DC "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u05D4\u05DE\u05D7\u05E8\u05D5\u05D6\u05EA \u05D7\u05D9\u05D9\u05D1\u05EA \u05DC\u05D4\u05EA\u05D0\u05D9\u05DD \u05DC\u05EA\u05D1\u05E0\u05D9\u05EA ${_issue.pattern}`;
        const nounEntry = FormatDictionary[_issue.format];
        const noun = nounEntry?.label ?? _issue.format;
        const gender = nounEntry?.gender ?? "m";
        const adjective = gender === "f" ? "\u05EA\u05E7\u05D9\u05E0\u05D4" : "\u05EA\u05E7\u05D9\u05DF";
        return `${noun} \u05DC\u05D0 ${adjective}`;
      }
      case "not_multiple_of":
        return `\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF: \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05DB\u05E4\u05DC\u05D4 \u05E9\u05DC ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u05DE\u05E4\u05EA\u05D7${issue2.keys.length > 1 ? "\u05D5\u05EA" : ""} \u05DC\u05D0 \u05DE\u05D6\u05D5\u05D4${issue2.keys.length > 1 ? "\u05D9\u05DD" : "\u05D4"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key": {
        return `\u05E9\u05D3\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u05D1\u05D0\u05D5\u05D1\u05D9\u05D9\u05E7\u05D8`;
      }
      case "invalid_union":
        return "\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF";
      case "invalid_element": {
        const place = withDefinite(issue2.origin ?? "array");
        return `\u05E2\u05E8\u05DA \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u05D1${place}`;
      }
      default:
        return `\u05E7\u05DC\u05D8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF`;
    }
  };
};
function he_default() {
  return {
    localeError: error17()
  };
}

// node_modules/zod/v4/locales/hr.js
var error18 = () => {
  const Sizable = {
    string: { unit: "znakova", verb: "imati" },
    file: { unit: "bajtova", verb: "imati" },
    array: { unit: "stavki", verb: "imati" },
    set: { unit: "stavki", verb: "imati" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "unos",
    email: "email adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum i vrijeme",
    date: "ISO datum",
    time: "ISO vrijeme",
    duration: "ISO trajanje",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "IPv4 raspon",
    cidrv6: "IPv6 raspon",
    base64: "base64 kodirani tekst",
    base64url: "base64url kodirani tekst",
    json_string: "JSON tekst",
    e164: "E.164 broj",
    jwt: "JWT",
    template_literal: "unos"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "tekst",
    number: "broj",
    boolean: "boolean",
    array: "niz",
    object: "objekt",
    set: "skup",
    file: "datoteka",
    date: "datum",
    bigint: "bigint",
    symbol: "simbol",
    undefined: "undefined",
    null: "null",
    function: "funkcija",
    map: "mapa"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neispravan unos: o\u010Dekuje se instanceof ${issue2.expected}, a primljeno je ${received}`;
        }
        return `Neispravan unos: o\u010Dekuje se ${expected}, a primljeno je ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neispravna vrijednost: o\u010Dekivano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neispravna opcija: o\u010Dekivano jedno od ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `Preveliko: o\u010Dekivano da ${origin ?? "vrijednost"} ima ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemenata"}`;
        return `Preveliko: o\u010Dekivano da ${origin ?? "vrijednost"} bude ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `Premalo: o\u010Dekivano da ${origin} ima ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premalo: o\u010Dekivano da ${origin} bude ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neispravan tekst: mora zapo\u010Dinjati s "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neispravan tekst: mora zavr\u0161avati s "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neispravan tekst: mora sadr\u017Eavati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neispravan tekst: mora odgovarati uzorku ${_issue.pattern}`;
        return `Neispravna ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neispravan broj: mora biti vi\u0161ekratnik od ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznat${issue2.keys.length > 1 ? "i klju\u010Devi" : " klju\u010D"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neispravan klju\u010D u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      case "invalid_union":
        return "Neispravan unos";
      case "invalid_element":
        return `Neispravna vrijednost u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      default:
        return `Neispravan unos`;
    }
  };
};
function hr_default() {
  return {
    localeError: error18()
  };
}

// node_modules/zod/v4/locales/hu.js
var error19 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "legyen" },
    file: { unit: "byte", verb: "legyen" },
    array: { unit: "elem", verb: "legyen" },
    set: { unit: "elem", verb: "legyen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "bemenet",
    email: "email c\xEDm",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO id\u0151b\xE9lyeg",
    date: "ISO d\xE1tum",
    time: "ISO id\u0151",
    duration: "ISO id\u0151intervallum",
    ipv4: "IPv4 c\xEDm",
    ipv6: "IPv6 c\xEDm",
    cidrv4: "IPv4 tartom\xE1ny",
    cidrv6: "IPv6 tartom\xE1ny",
    base64: "base64-k\xF3dolt string",
    base64url: "base64url-k\xF3dolt string",
    json_string: "JSON string",
    e164: "E.164 sz\xE1m",
    jwt: "JWT",
    template_literal: "bemenet"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "sz\xE1m",
    array: "t\xF6mb"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\xC9rv\xE9nytelen bemenet: a v\xE1rt \xE9rt\xE9k instanceof ${issue2.expected}, a kapott \xE9rt\xE9k ${received}`;
        }
        return `\xC9rv\xE9nytelen bemenet: a v\xE1rt \xE9rt\xE9k ${expected}, a kapott \xE9rt\xE9k ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\xC9rv\xE9nytelen bemenet: a v\xE1rt \xE9rt\xE9k ${stringifyPrimitive(issue2.values[0])}`;
        return `\xC9rv\xE9nytelen opci\xF3: valamelyik \xE9rt\xE9k v\xE1rt ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `T\xFAl nagy: ${issue2.origin ?? "\xE9rt\xE9k"} m\xE9rete t\xFAl nagy ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elem"}`;
        return `T\xFAl nagy: a bemeneti \xE9rt\xE9k ${issue2.origin ?? "\xE9rt\xE9k"} t\xFAl nagy: ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `T\xFAl kicsi: a bemeneti \xE9rt\xE9k ${issue2.origin} m\xE9rete t\xFAl kicsi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `T\xFAl kicsi: a bemeneti \xE9rt\xE9k ${issue2.origin} t\xFAl kicsi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\xC9rv\xE9nytelen string: "${_issue.prefix}" \xE9rt\xE9kkel kell kezd\u0151dnie`;
        if (_issue.format === "ends_with")
          return `\xC9rv\xE9nytelen string: "${_issue.suffix}" \xE9rt\xE9kkel kell v\xE9gz\u0151dnie`;
        if (_issue.format === "includes")
          return `\xC9rv\xE9nytelen string: "${_issue.includes}" \xE9rt\xE9ket kell tartalmaznia`;
        if (_issue.format === "regex")
          return `\xC9rv\xE9nytelen string: ${_issue.pattern} mint\xE1nak kell megfelelnie`;
        return `\xC9rv\xE9nytelen ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\xC9rv\xE9nytelen sz\xE1m: ${issue2.divisor} t\xF6bbsz\xF6r\xF6s\xE9nek kell lennie`;
      case "unrecognized_keys":
        return `Ismeretlen kulcs${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\xC9rv\xE9nytelen kulcs ${issue2.origin}`;
      case "invalid_union":
        return "\xC9rv\xE9nytelen bemenet";
      case "invalid_element":
        return `\xC9rv\xE9nytelen \xE9rt\xE9k: ${issue2.origin}`;
      default:
        return `\xC9rv\xE9nytelen bemenet`;
    }
  };
};
function hu_default() {
  return {
    localeError: error19()
  };
}

// node_modules/zod/v4/locales/hy.js
function getArmenianPlural(count, one, many) {
  return Math.abs(count) === 1 ? one : many;
}
function withDefiniteArticle(word) {
  if (!word)
    return "";
  const vowels = ["\u0561", "\u0565", "\u0568", "\u056B", "\u0578", "\u0578\u0582", "\u0585"];
  const lastChar = word[word.length - 1];
  return word + (vowels.includes(lastChar) ? "\u0576" : "\u0568");
}
var error20 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "\u0576\u0577\u0561\u0576",
        many: "\u0576\u0577\u0561\u0576\u0576\u0565\u0580"
      },
      verb: "\u0578\u0582\u0576\u0565\u0576\u0561\u056C"
    },
    file: {
      unit: {
        one: "\u0562\u0561\u0575\u0569",
        many: "\u0562\u0561\u0575\u0569\u0565\u0580"
      },
      verb: "\u0578\u0582\u0576\u0565\u0576\u0561\u056C"
    },
    array: {
      unit: {
        one: "\u057F\u0561\u0580\u0580",
        many: "\u057F\u0561\u0580\u0580\u0565\u0580"
      },
      verb: "\u0578\u0582\u0576\u0565\u0576\u0561\u056C"
    },
    set: {
      unit: {
        one: "\u057F\u0561\u0580\u0580",
        many: "\u057F\u0561\u0580\u0580\u0565\u0580"
      },
      verb: "\u0578\u0582\u0576\u0565\u0576\u0561\u056C"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0574\u0578\u0582\u057F\u0584",
    email: "\u0567\u056C. \u0570\u0561\u057D\u0581\u0565",
    url: "URL",
    emoji: "\u0567\u0574\u0578\u057B\u056B",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0561\u0574\u057D\u0561\u0569\u056B\u057E \u0587 \u056A\u0561\u0574",
    date: "ISO \u0561\u0574\u057D\u0561\u0569\u056B\u057E",
    time: "ISO \u056A\u0561\u0574",
    duration: "ISO \u057F\u0587\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    ipv4: "IPv4 \u0570\u0561\u057D\u0581\u0565",
    ipv6: "IPv6 \u0570\u0561\u057D\u0581\u0565",
    cidrv4: "IPv4 \u0574\u056B\u057B\u0561\u056F\u0561\u0575\u0584",
    cidrv6: "IPv6 \u0574\u056B\u057B\u0561\u056F\u0561\u0575\u0584",
    base64: "base64 \u0571\u0587\u0561\u0579\u0561\u0583\u0578\u057E \u057F\u0578\u0572",
    base64url: "base64url \u0571\u0587\u0561\u0579\u0561\u0583\u0578\u057E \u057F\u0578\u0572",
    json_string: "JSON \u057F\u0578\u0572",
    e164: "E.164 \u0570\u0561\u0574\u0561\u0580",
    jwt: "JWT",
    template_literal: "\u0574\u0578\u0582\u057F\u0584"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0569\u056B\u057E",
    array: "\u0566\u0561\u0576\u0563\u057E\u0561\u056E"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u054D\u056D\u0561\u056C \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0578\u0582\u0574\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567\u0580 instanceof ${issue2.expected}, \u057D\u057F\u0561\u0581\u057E\u0565\u056C \u0567 ${received}`;
        }
        return `\u054D\u056D\u0561\u056C \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0578\u0582\u0574\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567\u0580 ${expected}, \u057D\u057F\u0561\u0581\u057E\u0565\u056C \u0567 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u054D\u056D\u0561\u056C \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0578\u0582\u0574\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567\u0580 ${stringifyPrimitive(issue2.values[1])}`;
        return `\u054D\u056D\u0561\u056C \u057F\u0561\u0580\u0562\u0565\u0580\u0561\u056F\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567\u0580 \u0570\u0565\u057F\u0587\u0575\u0561\u056C\u0576\u0565\u0580\u056B\u0581 \u0574\u0565\u056F\u0568\u055D ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getArmenianPlural(maxValue, sizing.unit.one, sizing.unit.many);
          return `\u0549\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0561\u0580\u056A\u0565\u0584\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567, \u0578\u0580 ${withDefiniteArticle(issue2.origin ?? "\u0561\u0580\u056A\u0565\u0584")} \u056F\u0578\u0582\u0576\u0565\u0576\u0561 ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `\u0549\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0561\u0580\u056A\u0565\u0584\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567, \u0578\u0580 ${withDefiniteArticle(issue2.origin ?? "\u0561\u0580\u056A\u0565\u0584")} \u056C\u056B\u0576\u056B ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getArmenianPlural(minValue, sizing.unit.one, sizing.unit.many);
          return `\u0549\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0583\u0578\u0584\u0580 \u0561\u0580\u056A\u0565\u0584\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567, \u0578\u0580 ${withDefiniteArticle(issue2.origin)} \u056F\u0578\u0582\u0576\u0565\u0576\u0561 ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `\u0549\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0583\u0578\u0584\u0580 \u0561\u0580\u056A\u0565\u0584\u2024 \u057D\u057A\u0561\u057D\u057E\u0578\u0582\u0574 \u0567, \u0578\u0580 ${withDefiniteArticle(issue2.origin)} \u056C\u056B\u0576\u056B ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u054D\u056D\u0561\u056C \u057F\u0578\u0572\u2024 \u057A\u0565\u057F\u0584 \u0567 \u057D\u056F\u057D\u057E\u056B "${_issue.prefix}"-\u0578\u057E`;
        if (_issue.format === "ends_with")
          return `\u054D\u056D\u0561\u056C \u057F\u0578\u0572\u2024 \u057A\u0565\u057F\u0584 \u0567 \u0561\u057E\u0561\u0580\u057F\u057E\u056B "${_issue.suffix}"-\u0578\u057E`;
        if (_issue.format === "includes")
          return `\u054D\u056D\u0561\u056C \u057F\u0578\u0572\u2024 \u057A\u0565\u057F\u0584 \u0567 \u057A\u0561\u0580\u0578\u0582\u0576\u0561\u056F\u056B "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u054D\u056D\u0561\u056C \u057F\u0578\u0572\u2024 \u057A\u0565\u057F\u0584 \u0567 \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u056B ${_issue.pattern} \u0571\u0587\u0561\u0579\u0561\u0583\u056B\u0576`;
        return `\u054D\u056D\u0561\u056C ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u054D\u056D\u0561\u056C \u0569\u056B\u057E\u2024 \u057A\u0565\u057F\u0584 \u0567 \u0562\u0561\u0566\u0574\u0561\u057A\u0561\u057F\u056B\u056F \u056C\u056B\u0576\u056B ${issue2.divisor}-\u056B`;
      case "unrecognized_keys":
        return `\u0549\u0573\u0561\u0576\u0561\u0579\u057E\u0561\u056E \u0562\u0561\u0576\u0561\u056C\u056B${issue2.keys.length > 1 ? "\u0576\u0565\u0580" : ""}. ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u054D\u056D\u0561\u056C \u0562\u0561\u0576\u0561\u056C\u056B ${withDefiniteArticle(issue2.origin)}-\u0578\u0582\u0574`;
      case "invalid_union":
        return "\u054D\u056D\u0561\u056C \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0578\u0582\u0574";
      case "invalid_element":
        return `\u054D\u056D\u0561\u056C \u0561\u0580\u056A\u0565\u0584 ${withDefiniteArticle(issue2.origin)}-\u0578\u0582\u0574`;
      default:
        return `\u054D\u056D\u0561\u056C \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0578\u0582\u0574`;
    }
  };
};
function hy_default() {
  return {
    localeError: error20()
  };
}

// node_modules/zod/v4/locales/id.js
var error21 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "memiliki" },
    file: { unit: "byte", verb: "memiliki" },
    array: { unit: "item", verb: "memiliki" },
    set: { unit: "item", verb: "memiliki" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "alamat email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tanggal dan waktu format ISO",
    date: "tanggal format ISO",
    time: "jam format ISO",
    duration: "durasi format ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "rentang alamat IPv4",
    cidrv6: "rentang alamat IPv6",
    base64: "string dengan enkode base64",
    base64url: "string dengan enkode base64url",
    json_string: "string JSON",
    e164: "angka E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input tidak valid: diharapkan instanceof ${issue2.expected}, diterima ${received}`;
        }
        return `Input tidak valid: diharapkan ${expected}, diterima ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak valid: diharapkan ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak valid: diharapkan salah satu dari ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} memiliki ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} menjadi ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: diharapkan ${issue2.origin} memiliki ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: diharapkan ${issue2.origin} menjadi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak valid: harus menyertakan "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} tidak valid`;
      }
      case "not_multiple_of":
        return `Angka tidak valid: harus kelipatan dari ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak valid di ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak valid";
      case "invalid_element":
        return `Nilai tidak valid di ${issue2.origin}`;
      default:
        return `Input tidak valid`;
    }
  };
};
function id_default() {
  return {
    localeError: error21()
  };
}

// node_modules/zod/v4/locales/is.js
var error22 = () => {
  const Sizable = {
    string: { unit: "stafi", verb: "a\xF0 hafa" },
    file: { unit: "b\xE6ti", verb: "a\xF0 hafa" },
    array: { unit: "hluti", verb: "a\xF0 hafa" },
    set: { unit: "hluti", verb: "a\xF0 hafa" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "gildi",
    email: "netfang",
    url: "vefsl\xF3\xF0",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dagsetning og t\xEDmi",
    date: "ISO dagsetning",
    time: "ISO t\xEDmi",
    duration: "ISO t\xEDmalengd",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded strengur",
    base64url: "base64url-encoded strengur",
    json_string: "JSON strengur",
    e164: "E.164 t\xF6lugildi",
    jwt: "JWT",
    template_literal: "gildi"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "n\xFAmer",
    array: "fylki"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Rangt gildi: \xDE\xFA sl\xF3st inn ${received} \xFEar sem \xE1 a\xF0 vera instanceof ${issue2.expected}`;
        }
        return `Rangt gildi: \xDE\xFA sl\xF3st inn ${received} \xFEar sem \xE1 a\xF0 vera ${expected}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Rangt gildi: gert r\xE1\xF0 fyrir ${stringifyPrimitive(issue2.values[0])}`;
        return `\xD3gilt val: m\xE1 vera eitt af eftirfarandi ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Of st\xF3rt: gert er r\xE1\xF0 fyrir a\xF0 ${issue2.origin ?? "gildi"} hafi ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "hluti"}`;
        return `Of st\xF3rt: gert er r\xE1\xF0 fyrir a\xF0 ${issue2.origin ?? "gildi"} s\xE9 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Of l\xEDti\xF0: gert er r\xE1\xF0 fyrir a\xF0 ${issue2.origin} hafi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Of l\xEDti\xF0: gert er r\xE1\xF0 fyrir a\xF0 ${issue2.origin} s\xE9 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\xD3gildur strengur: ver\xF0ur a\xF0 byrja \xE1 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\xD3gildur strengur: ver\xF0ur a\xF0 enda \xE1 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\xD3gildur strengur: ver\xF0ur a\xF0 innihalda "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\xD3gildur strengur: ver\xF0ur a\xF0 fylgja mynstri ${_issue.pattern}`;
        return `Rangt ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `R\xF6ng tala: ver\xF0ur a\xF0 vera margfeldi af ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\xD3\xFEekkt ${issue2.keys.length > 1 ? "ir lyklar" : "ur lykill"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Rangur lykill \xED ${issue2.origin}`;
      case "invalid_union":
        return "Rangt gildi";
      case "invalid_element":
        return `Rangt gildi \xED ${issue2.origin}`;
      default:
        return `Rangt gildi`;
    }
  };
};
function is_default() {
  return {
    localeError: error22()
  };
}

// node_modules/zod/v4/locales/it.js
var error23 = () => {
  const Sizable = {
    string: { unit: "caratteri", verb: "avere" },
    file: { unit: "byte", verb: "avere" },
    array: { unit: "elementi", verb: "avere" },
    set: { unit: "elementi", verb: "avere" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "indirizzo email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e ora ISO",
    date: "data ISO",
    time: "ora ISO",
    duration: "durata ISO",
    ipv4: "indirizzo IPv4",
    ipv6: "indirizzo IPv6",
    cidrv4: "intervallo IPv4",
    cidrv6: "intervallo IPv6",
    base64: "stringa codificata in base64",
    base64url: "URL codificata in base64",
    json_string: "stringa JSON",
    e164: "numero E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "numero",
    array: "vettore"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input non valido: atteso instanceof ${issue2.expected}, ricevuto ${received}`;
        }
        return `Input non valido: atteso ${expected}, ricevuto ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input non valido: atteso ${stringifyPrimitive(issue2.values[0])}`;
        return `Opzione non valida: atteso uno tra ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Troppo grande: ${issue2.origin ?? "valore"} deve avere ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementi"}`;
        return `Troppo grande: ${issue2.origin ?? "valore"} deve essere ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Troppo piccolo: ${issue2.origin} deve avere ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Troppo piccolo: ${issue2.origin} deve essere ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Stringa non valida: deve includere "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
        return `Input non valido: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Numero non valido: deve essere un multiplo di ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chiav${issue2.keys.length > 1 ? "i" : "e"} non riconosciut${issue2.keys.length > 1 ? "e" : "a"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chiave non valida in ${issue2.origin}`;
      case "invalid_union":
        return "Input non valido";
      case "invalid_element":
        return `Valore non valido in ${issue2.origin}`;
      default:
        return `Input non valido`;
    }
  };
};
function it_default() {
  return {
    localeError: error23()
  };
}

// node_modules/zod/v4/locales/ja.js
var error24 = () => {
  const Sizable = {
    string: { unit: "\u6587\u5B57", verb: "\u3067\u3042\u308B" },
    file: { unit: "\u30D0\u30A4\u30C8", verb: "\u3067\u3042\u308B" },
    array: { unit: "\u8981\u7D20", verb: "\u3067\u3042\u308B" },
    set: { unit: "\u8981\u7D20", verb: "\u3067\u3042\u308B" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u5165\u529B\u5024",
    email: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9",
    url: "URL",
    emoji: "\u7D75\u6587\u5B57",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO\u65E5\u6642",
    date: "ISO\u65E5\u4ED8",
    time: "ISO\u6642\u523B",
    duration: "ISO\u671F\u9593",
    ipv4: "IPv4\u30A2\u30C9\u30EC\u30B9",
    ipv6: "IPv6\u30A2\u30C9\u30EC\u30B9",
    cidrv4: "IPv4\u7BC4\u56F2",
    cidrv6: "IPv6\u7BC4\u56F2",
    base64: "base64\u30A8\u30F3\u30B3\u30FC\u30C9\u6587\u5B57\u5217",
    base64url: "base64url\u30A8\u30F3\u30B3\u30FC\u30C9\u6587\u5B57\u5217",
    json_string: "JSON\u6587\u5B57\u5217",
    e164: "E.164\u756A\u53F7",
    jwt: "JWT",
    template_literal: "\u5165\u529B\u5024"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u6570\u5024",
    array: "\u914D\u5217"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u7121\u52B9\u306A\u5165\u529B: instanceof ${issue2.expected}\u304C\u671F\u5F85\u3055\u308C\u307E\u3057\u305F\u304C\u3001${received}\u304C\u5165\u529B\u3055\u308C\u307E\u3057\u305F`;
        }
        return `\u7121\u52B9\u306A\u5165\u529B: ${expected}\u304C\u671F\u5F85\u3055\u308C\u307E\u3057\u305F\u304C\u3001${received}\u304C\u5165\u529B\u3055\u308C\u307E\u3057\u305F`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u7121\u52B9\u306A\u5165\u529B: ${stringifyPrimitive(issue2.values[0])}\u304C\u671F\u5F85\u3055\u308C\u307E\u3057\u305F`;
        return `\u7121\u52B9\u306A\u9078\u629E: ${joinValues(issue2.values, "\u3001")}\u306E\u3044\u305A\u308C\u304B\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u4EE5\u4E0B\u3067\u3042\u308B" : "\u3088\u308A\u5C0F\u3055\u3044";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u5927\u304D\u3059\u304E\u308B\u5024: ${issue2.origin ?? "\u5024"}\u306F${issue2.maximum.toString()}${sizing.unit ?? "\u8981\u7D20"}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u5927\u304D\u3059\u304E\u308B\u5024: ${issue2.origin ?? "\u5024"}\u306F${issue2.maximum.toString()}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u4EE5\u4E0A\u3067\u3042\u308B" : "\u3088\u308A\u5927\u304D\u3044";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u5C0F\u3055\u3059\u304E\u308B\u5024: ${issue2.origin}\u306F${issue2.minimum.toString()}${sizing.unit}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u5C0F\u3055\u3059\u304E\u308B\u5024: ${issue2.origin}\u306F${issue2.minimum.toString()}${adj}\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.prefix}"\u3067\u59CB\u307E\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "ends_with")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.suffix}"\u3067\u7D42\u308F\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "includes")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: "${_issue.includes}"\u3092\u542B\u3080\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        if (_issue.format === "regex")
          return `\u7121\u52B9\u306A\u6587\u5B57\u5217: \u30D1\u30BF\u30FC\u30F3${_issue.pattern}\u306B\u4E00\u81F4\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
        return `\u7121\u52B9\u306A${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u7121\u52B9\u306A\u6570\u5024: ${issue2.divisor}\u306E\u500D\u6570\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059`;
      case "unrecognized_keys":
        return `\u8A8D\u8B58\u3055\u308C\u3066\u3044\u306A\u3044\u30AD\u30FC${issue2.keys.length > 1 ? "\u7FA4" : ""}: ${joinValues(issue2.keys, "\u3001")}`;
      case "invalid_key":
        return `${issue2.origin}\u5185\u306E\u7121\u52B9\u306A\u30AD\u30FC`;
      case "invalid_union":
        return "\u7121\u52B9\u306A\u5165\u529B";
      case "invalid_element":
        return `${issue2.origin}\u5185\u306E\u7121\u52B9\u306A\u5024`;
      default:
        return `\u7121\u52B9\u306A\u5165\u529B`;
    }
  };
};
function ja_default() {
  return {
    localeError: error24()
  };
}

// node_modules/zod/v4/locales/ka.js
var error25 = () => {
  const Sizable = {
    string: { unit: "\u10E1\u10D8\u10DB\u10D1\u10DD\u10DA\u10DD", verb: "\u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D8\u10EA\u10D0\u10D5\u10D3\u10D4\u10E1" },
    file: { unit: "\u10D1\u10D0\u10D8\u10E2\u10D8", verb: "\u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D8\u10EA\u10D0\u10D5\u10D3\u10D4\u10E1" },
    array: { unit: "\u10D4\u10DA\u10D4\u10DB\u10D4\u10DC\u10E2\u10D8", verb: "\u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D8\u10EA\u10D0\u10D5\u10D3\u10D4\u10E1" },
    set: { unit: "\u10D4\u10DA\u10D4\u10DB\u10D4\u10DC\u10E2\u10D8", verb: "\u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D8\u10EA\u10D0\u10D5\u10D3\u10D4\u10E1" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0",
    email: "\u10D4\u10DA-\u10E4\u10DD\u10E1\u10E2\u10D8\u10E1 \u10DB\u10D8\u10E1\u10D0\u10DB\u10D0\u10E0\u10D7\u10D8",
    url: "URL",
    emoji: "\u10D4\u10DB\u10DD\u10EF\u10D8",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u10D7\u10D0\u10E0\u10D8\u10E6\u10D8-\u10D3\u10E0\u10DD",
    date: "\u10D7\u10D0\u10E0\u10D8\u10E6\u10D8",
    time: "\u10D3\u10E0\u10DD",
    duration: "\u10EE\u10D0\u10DC\u10D2\u10E0\u10EB\u10DA\u10D8\u10D5\u10DD\u10D1\u10D0",
    ipv4: "IPv4 \u10DB\u10D8\u10E1\u10D0\u10DB\u10D0\u10E0\u10D7\u10D8",
    ipv6: "IPv6 \u10DB\u10D8\u10E1\u10D0\u10DB\u10D0\u10E0\u10D7\u10D8",
    cidrv4: "IPv4 \u10D3\u10D8\u10D0\u10DE\u10D0\u10D6\u10DD\u10DC\u10D8",
    cidrv6: "IPv6 \u10D3\u10D8\u10D0\u10DE\u10D0\u10D6\u10DD\u10DC\u10D8",
    base64: "base64-\u10D9\u10DD\u10D3\u10D8\u10E0\u10D4\u10D1\u10E3\u10DA\u10D8 \u10D5\u10D4\u10DA\u10D8",
    base64url: "base64url-\u10D9\u10DD\u10D3\u10D8\u10E0\u10D4\u10D1\u10E3\u10DA\u10D8 \u10D5\u10D4\u10DA\u10D8",
    json_string: "JSON \u10D5\u10D4\u10DA\u10D8",
    e164: "E.164 \u10DC\u10DD\u10DB\u10D4\u10E0\u10D8",
    jwt: "JWT",
    template_literal: "\u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u10E0\u10D8\u10EA\u10EE\u10D5\u10D8",
    string: "\u10D5\u10D4\u10DA\u10D8",
    boolean: "\u10D1\u10E3\u10DA\u10D4\u10D0\u10DC\u10D8",
    function: "\u10E4\u10E3\u10DC\u10E5\u10EA\u10D8\u10D0",
    array: "\u10DB\u10D0\u10E1\u10D8\u10D5\u10D8"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 instanceof ${issue2.expected}, \u10DB\u10D8\u10E6\u10D4\u10D1\u10E3\u10DA\u10D8 ${received}`;
        }
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${expected}, \u10DB\u10D8\u10E6\u10D4\u10D1\u10E3\u10DA\u10D8 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D5\u10D0\u10E0\u10D8\u10D0\u10DC\u10E2\u10D8: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8\u10D0 \u10D4\u10E0\u10D7-\u10D4\u10E0\u10D7\u10D8 ${joinValues(issue2.values, "|")}-\u10D3\u10D0\u10DC`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u10D6\u10D4\u10D3\u10DB\u10D4\u10E2\u10D0\u10D3 \u10D3\u10D8\u10D3\u10D8: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${issue2.origin ?? "\u10DB\u10DC\u10D8\u10E8\u10D5\u10DC\u10D4\u10DA\u10DD\u10D1\u10D0"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `\u10D6\u10D4\u10D3\u10DB\u10D4\u10E2\u10D0\u10D3 \u10D3\u10D8\u10D3\u10D8: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${issue2.origin ?? "\u10DB\u10DC\u10D8\u10E8\u10D5\u10DC\u10D4\u10DA\u10DD\u10D1\u10D0"} \u10D8\u10E7\u10DD\u10E1 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u10D6\u10D4\u10D3\u10DB\u10D4\u10E2\u10D0\u10D3 \u10DE\u10D0\u10E2\u10D0\u10E0\u10D0: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u10D6\u10D4\u10D3\u10DB\u10D4\u10E2\u10D0\u10D3 \u10DE\u10D0\u10E2\u10D0\u10E0\u10D0: \u10DB\u10DD\u10E1\u10D0\u10DA\u10DD\u10D3\u10DC\u10D4\u10DA\u10D8 ${issue2.origin} \u10D8\u10E7\u10DD\u10E1 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D5\u10D4\u10DA\u10D8: \u10E3\u10DC\u10D3\u10D0 \u10D8\u10EC\u10E7\u10D4\u10D1\u10DD\u10D3\u10D4\u10E1 "${_issue.prefix}"-\u10D8\u10D7`;
        }
        if (_issue.format === "ends_with")
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D5\u10D4\u10DA\u10D8: \u10E3\u10DC\u10D3\u10D0 \u10DB\u10D7\u10D0\u10D5\u10E0\u10D3\u10D4\u10D1\u10DD\u10D3\u10D4\u10E1 "${_issue.suffix}"-\u10D8\u10D7`;
        if (_issue.format === "includes")
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D5\u10D4\u10DA\u10D8: \u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D8\u10EA\u10D0\u10D5\u10D3\u10D4\u10E1 "${_issue.includes}"-\u10E1`;
        if (_issue.format === "regex")
          return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D5\u10D4\u10DA\u10D8: \u10E3\u10DC\u10D3\u10D0 \u10E8\u10D4\u10D4\u10E1\u10D0\u10D1\u10D0\u10DB\u10D4\u10D1\u10DD\u10D3\u10D4\u10E1 \u10E8\u10D0\u10D1\u10DA\u10DD\u10DC\u10E1 ${_issue.pattern}`;
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E0\u10D8\u10EA\u10EE\u10D5\u10D8: \u10E3\u10DC\u10D3\u10D0 \u10D8\u10E7\u10DD\u10E1 ${issue2.divisor}-\u10D8\u10E1 \u10EF\u10D4\u10E0\u10D0\u10D3\u10D8`;
      case "unrecognized_keys":
        return `\u10E3\u10EA\u10DC\u10DD\u10D1\u10D8 \u10D2\u10D0\u10E1\u10D0\u10E6\u10D4\u10D1${issue2.keys.length > 1 ? "\u10D4\u10D1\u10D8" : "\u10D8"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10D2\u10D0\u10E1\u10D0\u10E6\u10D4\u10D1\u10D8 ${issue2.origin}-\u10E8\u10D8`;
      case "invalid_union":
        return "\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0";
      case "invalid_element":
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10DB\u10DC\u10D8\u10E8\u10D5\u10DC\u10D4\u10DA\u10DD\u10D1\u10D0 ${issue2.origin}-\u10E8\u10D8`;
      default:
        return `\u10D0\u10E0\u10D0\u10E1\u10EC\u10DD\u10E0\u10D8 \u10E8\u10D4\u10E7\u10D5\u10D0\u10DC\u10D0`;
    }
  };
};
function ka_default() {
  return {
    localeError: error25()
  };
}

// node_modules/zod/v4/locales/km.js
var error26 = () => {
  const Sizable = {
    string: { unit: "\u178F\u17BD\u17A2\u1780\u17D2\u179F\u179A", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    file: { unit: "\u1794\u17C3", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    array: { unit: "\u1792\u17B6\u178F\u17BB", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" },
    set: { unit: "\u1792\u17B6\u178F\u17BB", verb: "\u1782\u17BD\u179A\u1798\u17B6\u1793" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B",
    email: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793\u17A2\u17CA\u17B8\u1798\u17C2\u179B",
    url: "URL",
    emoji: "\u179F\u1789\u17D2\u1789\u17B6\u17A2\u17B6\u179A\u1798\u17D2\u1798\u178E\u17CD",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u1780\u17B6\u179B\u1794\u179A\u17B7\u1785\u17D2\u1786\u17C1\u1791 \u1793\u17B7\u1784\u1798\u17C9\u17C4\u1784 ISO",
    date: "\u1780\u17B6\u179B\u1794\u179A\u17B7\u1785\u17D2\u1786\u17C1\u1791 ISO",
    time: "\u1798\u17C9\u17C4\u1784 ISO",
    duration: "\u179A\u1799\u17C8\u1796\u17C1\u179B ISO",
    ipv4: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv4",
    ipv6: "\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv6",
    cidrv4: "\u178A\u17C2\u1793\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv4",
    cidrv6: "\u178A\u17C2\u1793\u17A2\u17B6\u179F\u1799\u178A\u17D2\u178B\u17B6\u1793 IPv6",
    base64: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u17A2\u17CA\u17B7\u1780\u17BC\u178A base64",
    base64url: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u17A2\u17CA\u17B7\u1780\u17BC\u178A base64url",
    json_string: "\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A JSON",
    e164: "\u179B\u17C1\u1781 E.164",
    jwt: "JWT",
    template_literal: "\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u179B\u17C1\u1781",
    array: "\u17A2\u17B6\u179A\u17C1 (Array)",
    null: "\u1782\u17D2\u1798\u17B6\u1793\u178F\u1798\u17D2\u179B\u17C3 (null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A instanceof ${issue2.expected} \u1794\u17C9\u17BB\u1793\u17D2\u178F\u17C2\u1791\u1791\u17BD\u179B\u1794\u17B6\u1793 ${received}`;
        }
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${expected} \u1794\u17C9\u17BB\u1793\u17D2\u178F\u17C2\u1791\u1791\u17BD\u179B\u1794\u17B6\u1793 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1794\u1789\u17D2\u1785\u17BC\u179B\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${stringifyPrimitive(issue2.values[0])}`;
        return `\u1787\u1798\u17D2\u179A\u17BE\u179F\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1787\u17B6\u1798\u17BD\u1799\u1780\u17D2\u1793\u17BB\u1784\u1785\u17C6\u178E\u17C4\u1798 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u1792\u17C6\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin ?? "\u178F\u1798\u17D2\u179B\u17C3"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u1792\u17B6\u178F\u17BB"}`;
        return `\u1792\u17C6\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin ?? "\u178F\u1798\u17D2\u179B\u17C3"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u178F\u17BC\u1785\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u178F\u17BC\u1785\u1796\u17C1\u1780\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1780\u17B6\u179A ${issue2.origin} ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1785\u17B6\u1794\u17CB\u1795\u17D2\u178F\u17BE\u1798\u178A\u17C4\u1799 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1794\u1789\u17D2\u1785\u1794\u17CB\u178A\u17C4\u1799 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u1798\u17B6\u1793 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u1781\u17D2\u179F\u17C2\u17A2\u1780\u17D2\u179F\u179A\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u178F\u17C2\u1795\u17D2\u1782\u17BC\u1795\u17D2\u1782\u1784\u1793\u17B9\u1784\u1791\u1798\u17D2\u179A\u1784\u17CB\u178A\u17C2\u179B\u1794\u17B6\u1793\u1780\u17C6\u178E\u178F\u17CB ${_issue.pattern}`;
        return `\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u179B\u17C1\u1781\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u17D6 \u178F\u17D2\u179A\u17BC\u179C\u178F\u17C2\u1787\u17B6\u1796\u17A0\u17BB\u1782\u17BB\u178E\u1793\u17C3 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u179A\u1780\u1783\u17BE\u1789\u179F\u17C4\u1798\u17B7\u1793\u179F\u17D2\u1782\u17B6\u179B\u17CB\u17D6 ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u179F\u17C4\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u1793\u17C5\u1780\u17D2\u1793\u17BB\u1784 ${issue2.origin}`;
      case "invalid_union":
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C`;
      case "invalid_element":
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C\u1793\u17C5\u1780\u17D2\u1793\u17BB\u1784 ${issue2.origin}`;
      default:
        return `\u1791\u17B7\u1793\u17D2\u1793\u1793\u17D0\u1799\u1798\u17B7\u1793\u178F\u17D2\u179A\u17B9\u1798\u178F\u17D2\u179A\u17BC\u179C`;
    }
  };
};
function km_default() {
  return {
    localeError: error26()
  };
}

// node_modules/zod/v4/locales/kh.js
function kh_default() {
  return km_default();
}

// node_modules/zod/v4/locales/ko.js
var error27 = () => {
  const Sizable = {
    string: { unit: "\uBB38\uC790", verb: "to have" },
    file: { unit: "\uBC14\uC774\uD2B8", verb: "to have" },
    array: { unit: "\uAC1C", verb: "to have" },
    set: { unit: "\uAC1C", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\uC785\uB825",
    email: "\uC774\uBA54\uC77C \uC8FC\uC18C",
    url: "URL",
    emoji: "\uC774\uBAA8\uC9C0",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \uB0A0\uC9DC\uC2DC\uAC04",
    date: "ISO \uB0A0\uC9DC",
    time: "ISO \uC2DC\uAC04",
    duration: "ISO \uAE30\uAC04",
    ipv4: "IPv4 \uC8FC\uC18C",
    ipv6: "IPv6 \uC8FC\uC18C",
    cidrv4: "IPv4 \uBC94\uC704",
    cidrv6: "IPv6 \uBC94\uC704",
    base64: "base64 \uC778\uCF54\uB529 \uBB38\uC790\uC5F4",
    base64url: "base64url \uC778\uCF54\uB529 \uBB38\uC790\uC5F4",
    json_string: "JSON \uBB38\uC790\uC5F4",
    e164: "E.164 \uBC88\uD638",
    jwt: "JWT",
    template_literal: "\uC785\uB825"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\uC798\uBABB\uB41C \uC785\uB825: \uC608\uC0C1 \uD0C0\uC785\uC740 instanceof ${issue2.expected}, \uBC1B\uC740 \uD0C0\uC785\uC740 ${received}\uC785\uB2C8\uB2E4`;
        }
        return `\uC798\uBABB\uB41C \uC785\uB825: \uC608\uC0C1 \uD0C0\uC785\uC740 ${expected}, \uBC1B\uC740 \uD0C0\uC785\uC740 ${received}\uC785\uB2C8\uB2E4`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\uC798\uBABB\uB41C \uC785\uB825: \uAC12\uC740 ${stringifyPrimitive(issue2.values[0])} \uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4`;
        return `\uC798\uBABB\uB41C \uC635\uC158: ${joinValues(issue2.values, "\uB610\uB294 ")} \uC911 \uD558\uB098\uC5EC\uC57C \uD569\uB2C8\uB2E4`;
      case "too_big": {
        const adj = issue2.inclusive ? "\uC774\uD558" : "\uBBF8\uB9CC";
        const suffix = adj === "\uBBF8\uB9CC" ? "\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" : "\uC5EC\uC57C \uD569\uB2C8\uB2E4";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "\uC694\uC18C";
        if (sizing)
          return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4: ${issue2.maximum.toString()}${unit} ${adj}${suffix}`;
        return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4: ${issue2.maximum.toString()} ${adj}${suffix}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\uC774\uC0C1" : "\uCD08\uACFC";
        const suffix = adj === "\uC774\uC0C1" ? "\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4" : "\uC5EC\uC57C \uD569\uB2C8\uB2E4";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "\uC694\uC18C";
        if (sizing) {
          return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uC791\uC2B5\uB2C8\uB2E4: ${issue2.minimum.toString()}${unit} ${adj}${suffix}`;
        }
        return `${issue2.origin ?? "\uAC12"}\uC774 \uB108\uBB34 \uC791\uC2B5\uB2C8\uB2E4: ${issue2.minimum.toString()} ${adj}${suffix}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.prefix}"(\uC73C)\uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4`;
        }
        if (_issue.format === "ends_with")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.suffix}"(\uC73C)\uB85C \uB05D\uB098\uC57C \uD569\uB2C8\uB2E4`;
        if (_issue.format === "includes")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: "${_issue.includes}"\uC744(\uB97C) \uD3EC\uD568\uD574\uC57C \uD569\uB2C8\uB2E4`;
        if (_issue.format === "regex")
          return `\uC798\uBABB\uB41C \uBB38\uC790\uC5F4: \uC815\uADDC\uC2DD ${_issue.pattern} \uD328\uD134\uACFC \uC77C\uCE58\uD574\uC57C \uD569\uB2C8\uB2E4`;
        return `\uC798\uBABB\uB41C ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\uC798\uBABB\uB41C \uC22B\uC790: ${issue2.divisor}\uC758 \uBC30\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4`;
      case "unrecognized_keys":
        return `\uC778\uC2DD\uD560 \uC218 \uC5C6\uB294 \uD0A4: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\uC798\uBABB\uB41C \uD0A4: ${issue2.origin}`;
      case "invalid_union":
        return `\uC798\uBABB\uB41C \uC785\uB825`;
      case "invalid_element":
        return `\uC798\uBABB\uB41C \uAC12: ${issue2.origin}`;
      default:
        return `\uC798\uBABB\uB41C \uC785\uB825`;
    }
  };
};
function ko_default() {
  return {
    localeError: error27()
  };
}

// node_modules/zod/v4/locales/lt.js
var capitalizeFirstCharacter = (text) => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};
function getUnitTypeFromNumber(number4) {
  const abs = Math.abs(number4);
  const last = abs % 10;
  const last2 = abs % 100;
  if (last2 >= 11 && last2 <= 19 || last === 0)
    return "many";
  if (last === 1)
    return "one";
  return "few";
}
var error28 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "simbolis",
        few: "simboliai",
        many: "simboli\u0173"
      },
      verb: {
        smaller: {
          inclusive: "turi b\u016Bti ne ilgesn\u0117 kaip",
          notInclusive: "turi b\u016Bti trumpesn\u0117 kaip"
        },
        bigger: {
          inclusive: "turi b\u016Bti ne trumpesn\u0117 kaip",
          notInclusive: "turi b\u016Bti ilgesn\u0117 kaip"
        }
      }
    },
    file: {
      unit: {
        one: "baitas",
        few: "baitai",
        many: "bait\u0173"
      },
      verb: {
        smaller: {
          inclusive: "turi b\u016Bti ne didesnis kaip",
          notInclusive: "turi b\u016Bti ma\u017Eesnis kaip"
        },
        bigger: {
          inclusive: "turi b\u016Bti ne ma\u017Eesnis kaip",
          notInclusive: "turi b\u016Bti didesnis kaip"
        }
      }
    },
    array: {
      unit: {
        one: "element\u0105",
        few: "elementus",
        many: "element\u0173"
      },
      verb: {
        smaller: {
          inclusive: "turi tur\u0117ti ne daugiau kaip",
          notInclusive: "turi tur\u0117ti ma\u017Eiau kaip"
        },
        bigger: {
          inclusive: "turi tur\u0117ti ne ma\u017Eiau kaip",
          notInclusive: "turi tur\u0117ti daugiau kaip"
        }
      }
    },
    set: {
      unit: {
        one: "element\u0105",
        few: "elementus",
        many: "element\u0173"
      },
      verb: {
        smaller: {
          inclusive: "turi tur\u0117ti ne daugiau kaip",
          notInclusive: "turi tur\u0117ti ma\u017Eiau kaip"
        },
        bigger: {
          inclusive: "turi tur\u0117ti ne ma\u017Eiau kaip",
          notInclusive: "turi tur\u0117ti daugiau kaip"
        }
      }
    }
  };
  function getSizing(origin, unitType, inclusive, targetShouldBe) {
    const result = Sizable[origin] ?? null;
    if (result === null)
      return result;
    return {
      unit: result.unit[unitType],
      verb: result.verb[targetShouldBe][inclusive ? "inclusive" : "notInclusive"]
    };
  }
  const FormatDictionary = {
    regex: "\u012Fvestis",
    email: "el. pa\u0161to adresas",
    url: "URL",
    emoji: "jaustukas",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO data ir laikas",
    date: "ISO data",
    time: "ISO laikas",
    duration: "ISO trukm\u0117",
    ipv4: "IPv4 adresas",
    ipv6: "IPv6 adresas",
    cidrv4: "IPv4 tinklo prefiksas (CIDR)",
    cidrv6: "IPv6 tinklo prefiksas (CIDR)",
    base64: "base64 u\u017Ekoduota eilut\u0117",
    base64url: "base64url u\u017Ekoduota eilut\u0117",
    json_string: "JSON eilut\u0117",
    e164: "E.164 numeris",
    jwt: "JWT",
    template_literal: "\u012Fvestis"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "skai\u010Dius",
    bigint: "sveikasis skai\u010Dius",
    string: "eilut\u0117",
    boolean: "login\u0117 reik\u0161m\u0117",
    undefined: "neapibr\u0117\u017Eta reik\u0161m\u0117",
    function: "funkcija",
    symbol: "simbolis",
    array: "masyvas",
    object: "objektas",
    null: "nulin\u0117 reik\u0161m\u0117"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Gautas tipas ${received}, o tik\u0117tasi - instanceof ${issue2.expected}`;
        }
        return `Gautas tipas ${received}, o tik\u0117tasi - ${expected}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Privalo b\u016Bti ${stringifyPrimitive(issue2.values[0])}`;
        return `Privalo b\u016Bti vienas i\u0161 ${joinValues(issue2.values, "|")} pasirinkim\u0173`;
      case "too_big": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.maximum)), issue2.inclusive ?? false, "smaller");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reik\u0161m\u0117")} ${sizing.verb} ${issue2.maximum.toString()} ${sizing.unit ?? "element\u0173"}`;
        const adj = issue2.inclusive ? "ne didesnis kaip" : "ma\u017Eesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reik\u0161m\u0117")} turi b\u016Bti ${adj} ${issue2.maximum.toString()} ${sizing?.unit}`;
      }
      case "too_small": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.minimum)), issue2.inclusive ?? false, "bigger");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reik\u0161m\u0117")} ${sizing.verb} ${issue2.minimum.toString()} ${sizing.unit ?? "element\u0173"}`;
        const adj = issue2.inclusive ? "ne ma\u017Eesnis kaip" : "didesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reik\u0161m\u0117")} turi b\u016Bti ${adj} ${issue2.minimum.toString()} ${sizing?.unit}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Eilut\u0117 privalo prasid\u0117ti "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Eilut\u0117 privalo pasibaigti "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Eilut\u0117 privalo \u012Ftraukti "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Eilut\u0117 privalo atitikti ${_issue.pattern}`;
        return `Neteisingas ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Skai\u010Dius privalo b\u016Bti ${issue2.divisor} kartotinis.`;
      case "unrecognized_keys":
        return `Neatpa\u017Eint${issue2.keys.length > 1 ? "i" : "as"} rakt${issue2.keys.length > 1 ? "ai" : "as"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Rastas klaidingas raktas";
      case "invalid_union":
        return "Klaidinga \u012Fvestis";
      case "invalid_element": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reik\u0161m\u0117")} turi klaiding\u0105 \u012Fvest\u012F`;
      }
      default:
        return "Klaidinga \u012Fvestis";
    }
  };
};
function lt_default() {
  return {
    localeError: error28()
  };
}

// node_modules/zod/v4/locales/mk.js
var error29 = () => {
  const Sizable = {
    string: { unit: "\u0437\u043D\u0430\u0446\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    file: { unit: "\u0431\u0430\u0458\u0442\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    array: { unit: "\u0441\u0442\u0430\u0432\u043A\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" },
    set: { unit: "\u0441\u0442\u0430\u0432\u043A\u0438", verb: "\u0434\u0430 \u0438\u043C\u0430\u0430\u0442" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0432\u043D\u0435\u0441",
    email: "\u0430\u0434\u0440\u0435\u0441\u0430 \u043D\u0430 \u0435-\u043F\u043E\u0448\u0442\u0430",
    url: "URL",
    emoji: "\u0435\u043C\u043E\u045F\u0438",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0443\u043C \u0438 \u0432\u0440\u0435\u043C\u0435",
    date: "ISO \u0434\u0430\u0442\u0443\u043C",
    time: "ISO \u0432\u0440\u0435\u043C\u0435",
    duration: "ISO \u0432\u0440\u0435\u043C\u0435\u0442\u0440\u0430\u0435\u045A\u0435",
    ipv4: "IPv4 \u0430\u0434\u0440\u0435\u0441\u0430",
    ipv6: "IPv6 \u0430\u0434\u0440\u0435\u0441\u0430",
    cidrv4: "IPv4 \u043E\u043F\u0441\u0435\u0433",
    cidrv6: "IPv6 \u043E\u043F\u0441\u0435\u0433",
    base64: "base64-\u0435\u043D\u043A\u043E\u0434\u0438\u0440\u0430\u043D\u0430 \u043D\u0438\u0437\u0430",
    base64url: "base64url-\u0435\u043D\u043A\u043E\u0434\u0438\u0440\u0430\u043D\u0430 \u043D\u0438\u0437\u0430",
    json_string: "JSON \u043D\u0438\u0437\u0430",
    e164: "E.164 \u0431\u0440\u043E\u0458",
    jwt: "JWT",
    template_literal: "\u0432\u043D\u0435\u0441"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0431\u0440\u043E\u0458",
    array: "\u043D\u0438\u0437\u0430"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 instanceof ${issue2.expected}, \u043F\u0440\u0438\u043C\u0435\u043D\u043E ${received}`;
        }
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${expected}, \u043F\u0440\u0438\u043C\u0435\u043D\u043E ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0413\u0440\u0435\u0448\u0430\u043D\u0430 \u043E\u043F\u0446\u0438\u0458\u0430: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 \u0435\u0434\u043D\u0430 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u0433\u043E\u043B\u0435\u043C: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin ?? "\u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442\u0430"} \u0434\u0430 \u0438\u043C\u0430 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0438"}`;
        return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u0433\u043E\u043B\u0435\u043C: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin ?? "\u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442\u0430"} \u0434\u0430 \u0431\u0438\u0434\u0435 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u043C\u0430\u043B: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin} \u0434\u0430 \u0438\u043C\u0430 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u041F\u0440\u0435\u043C\u043D\u043E\u0433\u0443 \u043C\u0430\u043B: \u0441\u0435 \u043E\u0447\u0435\u043A\u0443\u0432\u0430 ${issue2.origin} \u0434\u0430 \u0431\u0438\u0434\u0435 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0437\u0430\u043F\u043E\u0447\u043D\u0443\u0432\u0430 \u0441\u043E "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0437\u0430\u0432\u0440\u0448\u0443\u0432\u0430 \u0441\u043E "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0432\u043A\u043B\u0443\u0447\u0443\u0432\u0430 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u0432\u0430\u0436\u0435\u0447\u043A\u0430 \u043D\u0438\u0437\u0430: \u043C\u043E\u0440\u0430 \u0434\u0430 \u043E\u0434\u0433\u043E\u0430\u0440\u0430 \u043D\u0430 \u043F\u0430\u0442\u0435\u0440\u043D\u043E\u0442 ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0431\u0440\u043E\u0458: \u043C\u043E\u0440\u0430 \u0434\u0430 \u0431\u0438\u0434\u0435 \u0434\u0435\u043B\u0438\u0432 \u0441\u043E ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "\u041D\u0435\u043F\u0440\u0435\u043F\u043E\u0437\u043D\u0430\u0435\u043D\u0438 \u043A\u043B\u0443\u0447\u0435\u0432\u0438" : "\u041D\u0435\u043F\u0440\u0435\u043F\u043E\u0437\u043D\u0430\u0435\u043D \u043A\u043B\u0443\u0447"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u043A\u043B\u0443\u0447 \u0432\u043E ${issue2.origin}`;
      case "invalid_union":
        return "\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441";
      case "invalid_element":
        return `\u0413\u0440\u0435\u0448\u043D\u0430 \u0432\u0440\u0435\u0434\u043D\u043E\u0441\u0442 \u0432\u043E ${issue2.origin}`;
      default:
        return `\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u043D\u0435\u0441`;
    }
  };
};
function mk_default() {
  return {
    localeError: error29()
  };
}

// node_modules/zod/v4/locales/ms.js
var error30 = () => {
  const Sizable = {
    string: { unit: "aksara", verb: "mempunyai" },
    file: { unit: "bait", verb: "mempunyai" },
    array: { unit: "elemen", verb: "mempunyai" },
    set: { unit: "elemen", verb: "mempunyai" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "alamat e-mel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tarikh masa ISO",
    date: "tarikh ISO",
    time: "masa ISO",
    duration: "tempoh ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "julat IPv4",
    cidrv6: "julat IPv6",
    base64: "string dikodkan base64",
    base64url: "string dikodkan base64url",
    json_string: "string JSON",
    e164: "nombor E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "nombor"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input tidak sah: dijangka instanceof ${issue2.expected}, diterima ${received}`;
        }
        return `Input tidak sah: dijangka ${expected}, diterima ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak sah: dijangka ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak sah: dijangka salah satu daripada ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} adalah ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: dijangka ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: dijangka ${issue2.origin} adalah ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} tidak sah`;
      }
      case "not_multiple_of":
        return `Nombor tidak sah: perlu gandaan ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak sah dalam ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak sah";
      case "invalid_element":
        return `Nilai tidak sah dalam ${issue2.origin}`;
      default:
        return `Input tidak sah`;
    }
  };
};
function ms_default() {
  return {
    localeError: error30()
  };
}

// node_modules/zod/v4/locales/nl.js
var error31 = () => {
  const Sizable = {
    string: { unit: "tekens", verb: "heeft" },
    file: { unit: "bytes", verb: "heeft" },
    array: { unit: "elementen", verb: "heeft" },
    set: { unit: "elementen", verb: "heeft" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "invoer",
    email: "emailadres",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum en tijd",
    date: "ISO datum",
    time: "ISO tijd",
    duration: "ISO duur",
    ipv4: "IPv4-adres",
    ipv6: "IPv6-adres",
    cidrv4: "IPv4-bereik",
    cidrv6: "IPv6-bereik",
    base64: "base64-gecodeerde tekst",
    base64url: "base64 URL-gecodeerde tekst",
    json_string: "JSON string",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "invoer"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "getal"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ongeldige invoer: verwacht instanceof ${issue2.expected}, ontving ${received}`;
        }
        return `Ongeldige invoer: verwacht ${expected}, ontving ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ongeldige invoer: verwacht ${stringifyPrimitive(issue2.values[0])}`;
        return `Ongeldige optie: verwacht \xE9\xE9n van ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const longName = issue2.origin === "date" ? "laat" : issue2.origin === "string" ? "lang" : "groot";
        if (sizing)
          return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementen"} ${sizing.verb}`;
        return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} is`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const shortName = issue2.origin === "date" ? "vroeg" : issue2.origin === "string" ? "kort" : "klein";
        if (sizing) {
          return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
        }
        return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} is`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
        }
        if (_issue.format === "ends_with")
          return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
        if (_issue.format === "includes")
          return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
        if (_issue.format === "regex")
          return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
        return `Ongeldig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ongeldig getal: moet een veelvoud van ${issue2.divisor} zijn`;
      case "unrecognized_keys":
        return `Onbekende key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ongeldige key in ${issue2.origin}`;
      case "invalid_union":
        return "Ongeldige invoer";
      case "invalid_element":
        return `Ongeldige waarde in ${issue2.origin}`;
      default:
        return `Ongeldige invoer`;
    }
  };
};
function nl_default() {
  return {
    localeError: error31()
  };
}

// node_modules/zod/v4/locales/no.js
var error32 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "\xE5 ha" },
    file: { unit: "bytes", verb: "\xE5 ha" },
    array: { unit: "elementer", verb: "\xE5 inneholde" },
    set: { unit: "elementer", verb: "\xE5 inneholde" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "e-postadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslett",
    date: "ISO-dato",
    time: "ISO-klokkeslett",
    duration: "ISO-varighet",
    ipv4: "IPv4-omr\xE5de",
    ipv6: "IPv6-omr\xE5de",
    cidrv4: "IPv4-spekter",
    cidrv6: "IPv6-spekter",
    base64: "base64-enkodet streng",
    base64url: "base64url-enkodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "tall",
    array: "liste"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ugyldig input: forventet instanceof ${issue2.expected}, fikk ${received}`;
        }
        return `Ugyldig input: forventet ${expected}, fikk ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig verdi: forventet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldig valg: forventet en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `For stor(t): forventet ${issue2.origin ?? "value"} til \xE5 ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor(t): forventet ${issue2.origin ?? "value"} til \xE5 ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `For lite(n): forventet ${issue2.origin} til \xE5 ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lite(n): forventet ${issue2.origin} til \xE5 ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: m\xE5 starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: m\xE5 ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: m\xE5 inneholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: m\xE5 matche m\xF8nsteret ${_issue.pattern}`;
        return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldig tall: m\xE5 v\xE6re et multiplum av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukjente n\xF8kler" : "Ukjent n\xF8kkel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig n\xF8kkel i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldig input";
      case "invalid_element":
        return `Ugyldig verdi i ${issue2.origin}`;
      default:
        return `Ugyldig input`;
    }
  };
};
function no_default() {
  return {
    localeError: error32()
  };
}

// node_modules/zod/v4/locales/ota.js
var error33 = () => {
  const Sizable = {
    string: { unit: "harf", verb: "olmal\u0131d\u0131r" },
    file: { unit: "bayt", verb: "olmal\u0131d\u0131r" },
    array: { unit: "unsur", verb: "olmal\u0131d\u0131r" },
    set: { unit: "unsur", verb: "olmal\u0131d\u0131r" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "giren",
    email: "epostag\xE2h",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO heng\xE2m\u0131",
    date: "ISO tarihi",
    time: "ISO zaman\u0131",
    duration: "ISO m\xFCddeti",
    ipv4: "IPv4 ni\u015F\xE2n\u0131",
    ipv6: "IPv6 ni\u015F\xE2n\u0131",
    cidrv4: "IPv4 menzili",
    cidrv6: "IPv6 menzili",
    base64: "base64-\u015Fifreli metin",
    base64url: "base64url-\u015Fifreli metin",
    json_string: "JSON metin",
    e164: "E.164 say\u0131s\u0131",
    jwt: "JWT",
    template_literal: "giren"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "numara",
    array: "saf",
    null: "gayb"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `F\xE2sit giren: umulan instanceof ${issue2.expected}, al\u0131nan ${received}`;
        }
        return `F\xE2sit giren: umulan ${expected}, al\u0131nan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `F\xE2sit giren: umulan ${stringifyPrimitive(issue2.values[0])}`;
        return `F\xE2sit tercih: m\xFBteberler ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Fazla b\xFCy\xFCk: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmal\u0131yd\u0131.`;
        return `Fazla b\xFCy\xFCk: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} olmal\u0131yd\u0131.`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Fazla k\xFC\xE7\xFCk: ${issue2.origin}, ${adj}${issue2.minimum.toString()} ${sizing.unit} sahip olmal\u0131yd\u0131.`;
        }
        return `Fazla k\xFC\xE7\xFCk: ${issue2.origin}, ${adj}${issue2.minimum.toString()} olmal\u0131yd\u0131.`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `F\xE2sit metin: "${_issue.prefix}" ile ba\u015Flamal\u0131.`;
        if (_issue.format === "ends_with")
          return `F\xE2sit metin: "${_issue.suffix}" ile bitmeli.`;
        if (_issue.format === "includes")
          return `F\xE2sit metin: "${_issue.includes}" ihtiv\xE2 etmeli.`;
        if (_issue.format === "regex")
          return `F\xE2sit metin: ${_issue.pattern} nak\u015F\u0131na uymal\u0131.`;
        return `F\xE2sit ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `F\xE2sit say\u0131: ${issue2.divisor} kat\u0131 olmal\u0131yd\u0131.`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan anahtar ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} i\xE7in tan\u0131nmayan anahtar var.`;
      case "invalid_union":
        return "Giren tan\u0131namad\u0131.";
      case "invalid_element":
        return `${issue2.origin} i\xE7in tan\u0131nmayan k\u0131ymet var.`;
      default:
        return `K\u0131ymet tan\u0131namad\u0131.`;
    }
  };
};
function ota_default() {
  return {
    localeError: error33()
  };
}

// node_modules/zod/v4/locales/ps.js
var error34 = () => {
  const Sizable = {
    string: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" },
    file: { unit: "\u0628\u0627\u06CC\u067C\u0633", verb: "\u0648\u0644\u0631\u064A" },
    array: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" },
    set: { unit: "\u062A\u0648\u06A9\u064A", verb: "\u0648\u0644\u0631\u064A" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0648\u0631\u0648\u062F\u064A",
    email: "\u0628\u0631\u06CC\u069A\u0646\u0627\u0644\u06CC\u06A9",
    url: "\u06CC\u0648 \u0622\u0631 \u0627\u0644",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u064A",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0646\u06CC\u067C\u0647 \u0627\u0648 \u0648\u062E\u062A",
    date: "\u0646\u06D0\u067C\u0647",
    time: "\u0648\u062E\u062A",
    duration: "\u0645\u0648\u062F\u0647",
    ipv4: "\u062F IPv4 \u067E\u062A\u0647",
    ipv6: "\u062F IPv6 \u067E\u062A\u0647",
    cidrv4: "\u062F IPv4 \u0633\u0627\u062D\u0647",
    cidrv6: "\u062F IPv6 \u0633\u0627\u062D\u0647",
    base64: "base64-encoded \u0645\u062A\u0646",
    base64url: "base64url-encoded \u0645\u062A\u0646",
    json_string: "JSON \u0645\u062A\u0646",
    e164: "\u062F E.164 \u0634\u0645\u06D0\u0631\u0647",
    jwt: "JWT",
    template_literal: "\u0648\u0631\u0648\u062F\u064A"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0639\u062F\u062F",
    array: "\u0627\u0631\u06D0"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0646\u0627\u0633\u0645 \u0648\u0631\u0648\u062F\u064A: \u0628\u0627\u06CC\u062F instanceof ${issue2.expected} \u0648\u0627\u06CC, \u0645\u06AB\u0631 ${received} \u062A\u0631\u0644\u0627\u0633\u0647 \u0634\u0648`;
        }
        return `\u0646\u0627\u0633\u0645 \u0648\u0631\u0648\u062F\u064A: \u0628\u0627\u06CC\u062F ${expected} \u0648\u0627\u06CC, \u0645\u06AB\u0631 ${received} \u062A\u0631\u0644\u0627\u0633\u0647 \u0634\u0648`;
      }
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `\u0646\u0627\u0633\u0645 \u0648\u0631\u0648\u062F\u064A: \u0628\u0627\u06CC\u062F ${stringifyPrimitive(issue2.values[0])} \u0648\u0627\u06CC`;
        }
        return `\u0646\u0627\u0633\u0645 \u0627\u0646\u062A\u062E\u0627\u0628: \u0628\u0627\u06CC\u062F \u06CC\u0648 \u0644\u0647 ${joinValues(issue2.values, "|")} \u0685\u062E\u0647 \u0648\u0627\u06CC`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0689\u06CC\u0631 \u0644\u0648\u06CC: ${issue2.origin ?? "\u0627\u0631\u0632\u069A\u062A"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0635\u0631\u0648\u0646\u0647"} \u0648\u0644\u0631\u064A`;
        }
        return `\u0689\u06CC\u0631 \u0644\u0648\u06CC: ${issue2.origin ?? "\u0627\u0631\u0632\u069A\u062A"} \u0628\u0627\u06CC\u062F ${adj}${issue2.maximum.toString()} \u0648\u064A`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0689\u06CC\u0631 \u06A9\u0648\u0686\u0646\u06CC: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0648\u0644\u0631\u064A`;
        }
        return `\u0689\u06CC\u0631 \u06A9\u0648\u0686\u0646\u06CC: ${issue2.origin} \u0628\u0627\u06CC\u062F ${adj}${issue2.minimum.toString()} \u0648\u064A`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F "${_issue.prefix}" \u0633\u0631\u0647 \u067E\u06CC\u0644 \u0634\u064A`;
        }
        if (_issue.format === "ends_with") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F "${_issue.suffix}" \u0633\u0631\u0647 \u067E\u0627\u06CC \u062A\u0647 \u0648\u0631\u0633\u064A\u0696\u064A`;
        }
        if (_issue.format === "includes") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F "${_issue.includes}" \u0648\u0644\u0631\u064A`;
        }
        if (_issue.format === "regex") {
          return `\u0646\u0627\u0633\u0645 \u0645\u062A\u0646: \u0628\u0627\u06CC\u062F \u062F ${_issue.pattern} \u0633\u0631\u0647 \u0645\u0637\u0627\u0628\u0642\u062A \u0648\u0644\u0631\u064A`;
        }
        return `${FormatDictionary[_issue.format] ?? issue2.format} \u0646\u0627\u0633\u0645 \u062F\u06CC`;
      }
      case "not_multiple_of":
        return `\u0646\u0627\u0633\u0645 \u0639\u062F\u062F: \u0628\u0627\u06CC\u062F \u062F ${issue2.divisor} \u0645\u0636\u0631\u0628 \u0648\u064A`;
      case "unrecognized_keys":
        return `\u0646\u0627\u0633\u0645 ${issue2.keys.length > 1 ? "\u06A9\u0644\u06CC\u0689\u0648\u0646\u0647" : "\u06A9\u0644\u06CC\u0689"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0646\u0627\u0633\u0645 \u06A9\u0644\u06CC\u0689 \u067E\u0647 ${issue2.origin} \u06A9\u06D0`;
      case "invalid_union":
        return `\u0646\u0627\u0633\u0645\u0647 \u0648\u0631\u0648\u062F\u064A`;
      case "invalid_element":
        return `\u0646\u0627\u0633\u0645 \u0639\u0646\u0635\u0631 \u067E\u0647 ${issue2.origin} \u06A9\u06D0`;
      default:
        return `\u0646\u0627\u0633\u0645\u0647 \u0648\u0631\u0648\u062F\u064A`;
    }
  };
};
function ps_default() {
  return {
    localeError: error34()
  };
}

// node_modules/zod/v4/locales/pl.js
var error35 = () => {
  const Sizable = {
    string: { unit: "znak\xF3w", verb: "mie\u0107" },
    file: { unit: "bajt\xF3w", verb: "mie\u0107" },
    array: { unit: "element\xF3w", verb: "mie\u0107" },
    set: { unit: "element\xF3w", verb: "mie\u0107" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "wyra\u017Cenie",
    email: "adres email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i godzina w formacie ISO",
    date: "data w formacie ISO",
    time: "godzina w formacie ISO",
    duration: "czas trwania ISO",
    ipv4: "adres IPv4",
    ipv6: "adres IPv6",
    cidrv4: "zakres IPv4",
    cidrv6: "zakres IPv6",
    base64: "ci\u0105g znak\xF3w zakodowany w formacie base64",
    base64url: "ci\u0105g znak\xF3w zakodowany w formacie base64url",
    json_string: "ci\u0105g znak\xF3w w formacie JSON",
    e164: "liczba E.164",
    jwt: "JWT",
    template_literal: "wej\u015Bcie"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "liczba",
    array: "tablica"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Nieprawid\u0142owe dane wej\u015Bciowe: oczekiwano instanceof ${issue2.expected}, otrzymano ${received}`;
        }
        return `Nieprawid\u0142owe dane wej\u015Bciowe: oczekiwano ${expected}, otrzymano ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nieprawid\u0142owe dane wej\u015Bciowe: oczekiwano ${stringifyPrimitive(issue2.values[0])}`;
        return `Nieprawid\u0142owa opcja: oczekiwano jednej z warto\u015Bci ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za du\u017Ca warto\u015B\u0107: oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie mie\u0107 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element\xF3w"}`;
        }
        return `Zbyt du\u017C(y/a/e): oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie wynosi\u0107 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za ma\u0142a warto\u015B\u0107: oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie mie\u0107 ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "element\xF3w"}`;
        }
        return `Zbyt ma\u0142(y/a/e): oczekiwano, \u017Ce ${issue2.origin ?? "warto\u015B\u0107"} b\u0119dzie wynosi\u0107 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi zaczyna\u0107 si\u0119 od "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi ko\u0144czy\u0107 si\u0119 na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi zawiera\u0107 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nieprawid\u0142owy ci\u0105g znak\xF3w: musi odpowiada\u0107 wzorcowi ${_issue.pattern}`;
        return `Nieprawid\u0142ow(y/a/e) ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nieprawid\u0142owa liczba: musi by\u0107 wielokrotno\u015Bci\u0105 ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nierozpoznane klucze${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nieprawid\u0142owy klucz w ${issue2.origin}`;
      case "invalid_union":
        return "Nieprawid\u0142owe dane wej\u015Bciowe";
      case "invalid_element":
        return `Nieprawid\u0142owa warto\u015B\u0107 w ${issue2.origin}`;
      default:
        return `Nieprawid\u0142owe dane wej\u015Bciowe`;
    }
  };
};
function pl_default() {
  return {
    localeError: error35()
  };
}

// node_modules/zod/v4/locales/pt.js
var error36 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "ter" },
    file: { unit: "bytes", verb: "ter" },
    array: { unit: "itens", verb: "ter" },
    set: { unit: "itens", verb: "ter" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "padr\xE3o",
    email: "endere\xE7o de e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "dura\xE7\xE3o ISO",
    ipv4: "endere\xE7o IPv4",
    ipv6: "endere\xE7o IPv6",
    cidrv4: "faixa de IPv4",
    cidrv6: "faixa de IPv6",
    base64: "texto codificado em base64",
    base64url: "URL codificada em base64",
    json_string: "texto JSON",
    e164: "n\xFAmero E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "n\xFAmero",
    null: "nulo"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Tipo inv\xE1lido: esperado instanceof ${issue2.expected}, recebido ${received}`;
        }
        return `Tipo inv\xE1lido: esperado ${expected}, recebido ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inv\xE1lida: esperado ${stringifyPrimitive(issue2.values[0])}`;
        return `Op\xE7\xE3o inv\xE1lida: esperada uma das ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Muito grande: esperado que ${issue2.origin ?? "valor"} tivesse ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Muito grande: esperado que ${issue2.origin ?? "valor"} fosse ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Muito pequeno: esperado que ${issue2.origin} tivesse ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Muito pequeno: esperado que ${issue2.origin} fosse ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Texto inv\xE1lido: deve come\xE7ar com "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Texto inv\xE1lido: deve terminar com "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Texto inv\xE1lido: deve incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Texto inv\xE1lido: deve corresponder ao padr\xE3o ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} inv\xE1lido`;
      }
      case "not_multiple_of":
        return `N\xFAmero inv\xE1lido: deve ser m\xFAltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chave${issue2.keys.length > 1 ? "s" : ""} desconhecida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chave inv\xE1lida em ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inv\xE1lida";
      case "invalid_element":
        return `Valor inv\xE1lido em ${issue2.origin}`;
      default:
        return `Campo inv\xE1lido`;
    }
  };
};
function pt_default() {
  return {
    localeError: error36()
  };
}

// node_modules/zod/v4/locales/ro.js
var error37 = () => {
  const Sizable = {
    string: { unit: "caractere", verb: "s\u0103 aib\u0103" },
    file: { unit: "octe\u021Bi", verb: "s\u0103 aib\u0103" },
    array: { unit: "elemente", verb: "s\u0103 aib\u0103" },
    set: { unit: "elemente", verb: "s\u0103 aib\u0103" },
    map: { unit: "intr\u0103ri", verb: "s\u0103 aib\u0103" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "intrare",
    email: "adres\u0103 de email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "dat\u0103 \u0219i or\u0103 ISO",
    date: "dat\u0103 ISO",
    time: "or\u0103 ISO",
    duration: "durat\u0103 ISO",
    ipv4: "adres\u0103 IPv4",
    ipv6: "adres\u0103 IPv6",
    mac: "adres\u0103 MAC",
    cidrv4: "interval IPv4",
    cidrv6: "interval IPv6",
    base64: "\u0219ir codat base64",
    base64url: "\u0219ir codat base64url",
    json_string: "\u0219ir JSON",
    e164: "num\u0103r E.164",
    jwt: "JWT",
    template_literal: "intrare"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "\u0219ir",
    number: "num\u0103r",
    boolean: "boolean",
    function: "func\u021Bie",
    array: "matrice",
    object: "obiect",
    undefined: "nedefinit",
    symbol: "simbol",
    bigint: "num\u0103r mare",
    void: "void",
    never: "never",
    map: "hart\u0103",
    set: "set"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Intrare invalid\u0103: a\u0219teptat ${expected}, primit ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Intrare invalid\u0103: a\u0219teptat ${stringifyPrimitive(issue2.values[0])}`;
        return `Op\u021Biune invalid\u0103: a\u0219teptat una dintre ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Prea mare: a\u0219teptat ca ${issue2.origin ?? "valoarea"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemente"}`;
        return `Prea mare: a\u0219teptat ca ${issue2.origin ?? "valoarea"} s\u0103 fie ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Prea mic: a\u0219teptat ca ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Prea mic: a\u0219teptat ca ${issue2.origin} s\u0103 fie ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0218ir invalid: trebuie s\u0103 \xEEnceap\u0103 cu "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u0218ir invalid: trebuie s\u0103 se termine cu "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u0218ir invalid: trebuie s\u0103 includ\u0103 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u0218ir invalid: trebuie s\u0103 se potriveasc\u0103 cu modelul ${_issue.pattern}`;
        return `Format invalid: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Num\u0103r invalid: trebuie s\u0103 fie multiplu de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chei nerecunoscute: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cheie invalid\u0103 \xEEn ${issue2.origin}`;
      case "invalid_union":
        return "Intrare invalid\u0103";
      case "invalid_element":
        return `Valoare invalid\u0103 \xEEn ${issue2.origin}`;
      default:
        return `Intrare invalid\u0103`;
    }
  };
};
function ro_default() {
  return {
    localeError: error37()
  };
}

// node_modules/zod/v4/locales/ru.js
function getRussianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error38 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "\u0441\u0438\u043C\u0432\u043E\u043B",
        few: "\u0441\u0438\u043C\u0432\u043E\u043B\u0430",
        many: "\u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    file: {
      unit: {
        one: "\u0431\u0430\u0439\u0442",
        few: "\u0431\u0430\u0439\u0442\u0430",
        many: "\u0431\u0430\u0439\u0442"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    array: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    },
    set: {
      unit: {
        one: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442",
        few: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430",
        many: "\u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432"
      },
      verb: "\u0438\u043C\u0435\u0442\u044C"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0432\u0432\u043E\u0434",
    email: "email \u0430\u0434\u0440\u0435\u0441",
    url: "URL",
    emoji: "\u044D\u043C\u043E\u0434\u0437\u0438",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0434\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043C\u044F",
    date: "ISO \u0434\u0430\u0442\u0430",
    time: "ISO \u0432\u0440\u0435\u043C\u044F",
    duration: "ISO \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C",
    ipv4: "IPv4 \u0430\u0434\u0440\u0435\u0441",
    ipv6: "IPv6 \u0430\u0434\u0440\u0435\u0441",
    cidrv4: "IPv4 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    cidrv6: "IPv6 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D",
    base64: "\u0441\u0442\u0440\u043E\u043A\u0430 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 base64",
    base64url: "\u0441\u0442\u0440\u043E\u043A\u0430 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 base64url",
    json_string: "JSON \u0441\u0442\u0440\u043E\u043A\u0430",
    e164: "\u043D\u043E\u043C\u0435\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0432\u0432\u043E\u0434"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0447\u0438\u0441\u043B\u043E",
    array: "\u043C\u0430\u0441\u0441\u0438\u0432"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0432\u043E\u0434: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C instanceof ${issue2.expected}, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E ${received}`;
        }
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0432\u043E\u0434: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C ${expected}, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0432\u043E\u0434: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0434\u043D\u043E \u0438\u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435"} \u0431\u0443\u0434\u0435\u0442 \u0438\u043C\u0435\u0442\u044C ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435"} \u0431\u0443\u0434\u0435\u0442 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin} \u0431\u0443\u0434\u0435\u0442 \u0438\u043C\u0435\u0442\u044C ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0430\u043B\u0435\u043D\u044C\u043A\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435: \u043E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C, \u0447\u0442\u043E ${issue2.origin} \u0431\u0443\u0434\u0435\u0442 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C\u0441\u044F \u0441 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0442\u044C\u0441\u044F \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430: \u0434\u043E\u043B\u0436\u043D\u0430 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0447\u0438\u0441\u043B\u043E: \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043A\u0440\u0430\u0442\u043D\u044B\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u043D${issue2.keys.length > 1 ? "\u044B\u0435" : "\u044B\u0439"} \u043A\u043B\u044E\u0447${issue2.keys.length > 1 ? "\u0438" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043B\u044E\u0447 \u0432 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0432\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435";
      case "invalid_element":
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0432 ${issue2.origin}`;
      default:
        return `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0432\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435`;
    }
  };
};
function ru_default() {
  return {
    localeError: error38()
  };
}

// node_modules/zod/v4/locales/sl.js
var error39 = () => {
  const Sizable = {
    string: { unit: "znakov", verb: "imeti" },
    file: { unit: "bajtov", verb: "imeti" },
    array: { unit: "elementov", verb: "imeti" },
    set: { unit: "elementov", verb: "imeti" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "vnos",
    email: "e-po\u0161tni naslov",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum in \u010Das",
    date: "ISO datum",
    time: "ISO \u010Das",
    duration: "ISO trajanje",
    ipv4: "IPv4 naslov",
    ipv6: "IPv6 naslov",
    cidrv4: "obseg IPv4",
    cidrv6: "obseg IPv6",
    base64: "base64 kodiran niz",
    base64url: "base64url kodiran niz",
    json_string: "JSON niz",
    e164: "E.164 \u0161tevilka",
    jwt: "JWT",
    template_literal: "vnos"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0161tevilo",
    array: "tabela"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neveljaven vnos: pri\u010Dakovano instanceof ${issue2.expected}, prejeto ${received}`;
        }
        return `Neveljaven vnos: pri\u010Dakovano ${expected}, prejeto ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neveljaven vnos: pri\u010Dakovano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neveljavna mo\u017Enost: pri\u010Dakovano eno izmed ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Preveliko: pri\u010Dakovano, da bo ${issue2.origin ?? "vrednost"} imelo ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementov"}`;
        return `Preveliko: pri\u010Dakovano, da bo ${issue2.origin ?? "vrednost"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Premajhno: pri\u010Dakovano, da bo ${issue2.origin} imelo ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premajhno: pri\u010Dakovano, da bo ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Neveljaven niz: mora se za\u010Deti z "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Neveljaven niz: mora se kon\u010Dati z "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
        return `Neveljaven ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neveljavno \u0161tevilo: mora biti ve\u010Dkratnik ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznan${issue2.keys.length > 1 ? "i klju\u010Di" : " klju\u010D"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neveljaven klju\u010D v ${issue2.origin}`;
      case "invalid_union":
        return "Neveljaven vnos";
      case "invalid_element":
        return `Neveljavna vrednost v ${issue2.origin}`;
      default:
        return "Neveljaven vnos";
    }
  };
};
function sl_default() {
  return {
    localeError: error39()
  };
}

// node_modules/zod/v4/locales/sv.js
var error40 = () => {
  const Sizable = {
    string: { unit: "tecken", verb: "att ha" },
    file: { unit: "bytes", verb: "att ha" },
    array: { unit: "objekt", verb: "att inneh\xE5lla" },
    set: { unit: "objekt", verb: "att inneh\xE5lla" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "regulj\xE4rt uttryck",
    email: "e-postadress",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datum och tid",
    date: "ISO-datum",
    time: "ISO-tid",
    duration: "ISO-varaktighet",
    ipv4: "IPv4-intervall",
    ipv6: "IPv6-intervall",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodad str\xE4ng",
    base64url: "base64url-kodad str\xE4ng",
    json_string: "JSON-str\xE4ng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "mall-literal"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "antal",
    array: "lista"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ogiltig inmatning: f\xF6rv\xE4ntat instanceof ${issue2.expected}, fick ${received}`;
        }
        return `Ogiltig inmatning: f\xF6rv\xE4ntat ${expected}, fick ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ogiltig inmatning: f\xF6rv\xE4ntat ${stringifyPrimitive(issue2.values[0])}`;
        return `Ogiltigt val: f\xF6rv\xE4ntade en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `F\xF6r stor(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        }
        return `F\xF6r stor(t): f\xF6rv\xE4ntat ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `F\xF6r lite(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `F\xF6r lite(t): f\xF6rv\xE4ntade ${issue2.origin ?? "v\xE4rdet"} att ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ogiltig str\xE4ng: m\xE5ste b\xF6rja med "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ogiltig str\xE4ng: m\xE5ste sluta med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ogiltig str\xE4ng: m\xE5ste inneh\xE5lla "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ogiltig str\xE4ng: m\xE5ste matcha m\xF6nstret "${_issue.pattern}"`;
        return `Ogiltig(t) ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ogiltigt tal: m\xE5ste vara en multipel av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ok\xE4nda nycklar" : "Ok\xE4nd nyckel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ogiltig nyckel i ${issue2.origin ?? "v\xE4rdet"}`;
      case "invalid_union":
        return "Ogiltig input";
      case "invalid_element":
        return `Ogiltigt v\xE4rde i ${issue2.origin ?? "v\xE4rdet"}`;
      default:
        return `Ogiltig input`;
    }
  };
};
function sv_default() {
  return {
    localeError: error40()
  };
}

// node_modules/zod/v4/locales/ta.js
var error41 = () => {
  const Sizable = {
    string: { unit: "\u0B8E\u0BB4\u0BC1\u0BA4\u0BCD\u0BA4\u0BC1\u0B95\u0BCD\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    file: { unit: "\u0BAA\u0BC8\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    array: { unit: "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" },
    set: { unit: "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD", verb: "\u0B95\u0BCA\u0BA3\u0BCD\u0B9F\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1",
    email: "\u0BAE\u0BBF\u0BA9\u0BCD\u0BA9\u0B9E\u0BCD\u0B9A\u0BB2\u0BCD \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u0BA4\u0BC7\u0BA4\u0BBF \u0BA8\u0BC7\u0BB0\u0BAE\u0BCD",
    date: "ISO \u0BA4\u0BC7\u0BA4\u0BBF",
    time: "ISO \u0BA8\u0BC7\u0BB0\u0BAE\u0BCD",
    duration: "ISO \u0B95\u0BBE\u0BB2 \u0B85\u0BB3\u0BB5\u0BC1",
    ipv4: "IPv4 \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    ipv6: "IPv6 \u0BAE\u0BC1\u0B95\u0BB5\u0BB0\u0BBF",
    cidrv4: "IPv4 \u0BB5\u0BB0\u0BAE\u0BCD\u0BAA\u0BC1",
    cidrv6: "IPv6 \u0BB5\u0BB0\u0BAE\u0BCD\u0BAA\u0BC1",
    base64: "base64-encoded \u0B9A\u0BB0\u0BAE\u0BCD",
    base64url: "base64url-encoded \u0B9A\u0BB0\u0BAE\u0BCD",
    json_string: "JSON \u0B9A\u0BB0\u0BAE\u0BCD",
    e164: "E.164 \u0B8E\u0BA3\u0BCD",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0B8E\u0BA3\u0BCD",
    array: "\u0B85\u0BA3\u0BBF",
    null: "\u0BB5\u0BC6\u0BB1\u0BC1\u0BAE\u0BC8"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 instanceof ${issue2.expected}, \u0BAA\u0BC6\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${received}`;
        }
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${expected}, \u0BAA\u0BC6\u0BB1\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BB5\u0BBF\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0BAE\u0BCD: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${joinValues(issue2.values, "|")} \u0B87\u0BB2\u0BCD \u0B92\u0BA9\u0BCD\u0BB1\u0BC1`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0BAE\u0BBF\u0B95 \u0BAA\u0BC6\u0BB0\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin ?? "\u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0B89\u0BB1\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD"} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        }
        return `\u0BAE\u0BBF\u0B95 \u0BAA\u0BC6\u0BB0\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin ?? "\u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1"} ${adj}${issue2.maximum.toString()} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0BAE\u0BBF\u0B95\u0B9A\u0BCD \u0B9A\u0BBF\u0BB1\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        }
        return `\u0BAE\u0BBF\u0B95\u0B9A\u0BCD \u0B9A\u0BBF\u0BB1\u0BBF\u0BAF\u0BA4\u0BC1: \u0B8E\u0BA4\u0BBF\u0BB0\u0BCD\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BA4\u0BC1 ${issue2.origin} ${adj}${issue2.minimum.toString()} \u0B86\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.prefix}" \u0B87\u0BB2\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "ends_with")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.suffix}" \u0B87\u0BB2\u0BCD \u0BAE\u0BC1\u0B9F\u0BBF\u0BB5\u0B9F\u0BC8\u0BAF \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "includes")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: "${_issue.includes}" \u0B90 \u0B89\u0BB3\u0BCD\u0BB3\u0B9F\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        if (_issue.format === "regex")
          return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B9A\u0BB0\u0BAE\u0BCD: ${_issue.pattern} \u0BAE\u0BC1\u0BB1\u0BC8\u0BAA\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1\u0B9F\u0BA9\u0BCD \u0BAA\u0BCA\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B8E\u0BA3\u0BCD: ${issue2.divisor} \u0B87\u0BA9\u0BCD \u0BAA\u0BB2\u0BAE\u0BBE\u0B95 \u0B87\u0BB0\u0BC1\u0B95\u0BCD\u0B95 \u0BB5\u0BC7\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD`;
      case "unrecognized_keys":
        return `\u0B85\u0B9F\u0BC8\u0BAF\u0BBE\u0BB3\u0BAE\u0BCD \u0BA4\u0BC6\u0BB0\u0BBF\u0BAF\u0BBE\u0BA4 \u0BB5\u0BBF\u0B9A\u0BC8${issue2.keys.length > 1 ? "\u0B95\u0BB3\u0BCD" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} \u0B87\u0BB2\u0BCD \u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BB5\u0BBF\u0B9A\u0BC8`;
      case "invalid_union":
        return "\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1";
      case "invalid_element":
        return `${issue2.origin} \u0B87\u0BB2\u0BCD \u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0BAE\u0BA4\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1`;
      default:
        return `\u0BA4\u0BB5\u0BB1\u0BBE\u0BA9 \u0B89\u0BB3\u0BCD\u0BB3\u0BC0\u0B9F\u0BC1`;
    }
  };
};
function ta_default() {
  return {
    localeError: error41()
  };
}

// node_modules/zod/v4/locales/th.js
var error42 = () => {
  const Sizable = {
    string: { unit: "\u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    file: { unit: "\u0E44\u0E1A\u0E15\u0E4C", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    array: { unit: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" },
    set: { unit: "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23", verb: "\u0E04\u0E27\u0E23\u0E21\u0E35" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1B\u0E49\u0E2D\u0E19",
    email: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E2D\u0E35\u0E40\u0E21\u0E25",
    url: "URL",
    emoji: "\u0E2D\u0E34\u0E42\u0E21\u0E08\u0E34",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    date: "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E1A\u0E1A ISO",
    time: "\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    duration: "\u0E0A\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32\u0E41\u0E1A\u0E1A ISO",
    ipv4: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48 IPv4",
    ipv6: "\u0E17\u0E35\u0E48\u0E2D\u0E22\u0E39\u0E48 IPv6",
    cidrv4: "\u0E0A\u0E48\u0E27\u0E07 IP \u0E41\u0E1A\u0E1A IPv4",
    cidrv6: "\u0E0A\u0E48\u0E27\u0E07 IP \u0E41\u0E1A\u0E1A IPv6",
    base64: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A Base64",
    base64url: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A Base64 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A URL",
    json_string: "\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E1A\u0E1A JSON",
    e164: "\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E28\u0E31\u0E1E\u0E17\u0E4C\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E1B\u0E23\u0E30\u0E40\u0E17\u0E28 (E.164)",
    jwt: "\u0E42\u0E17\u0E40\u0E04\u0E19 JWT",
    template_literal: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E1B\u0E49\u0E2D\u0E19"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02",
    array: "\u0E2D\u0E32\u0E23\u0E4C\u0E40\u0E23\u0E22\u0E4C (Array)",
    null: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E04\u0E48\u0E32 (null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19 instanceof ${issue2.expected} \u0E41\u0E15\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A ${received}`;
        }
        return `\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19 ${expected} \u0E41\u0E15\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0E04\u0E48\u0E32\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19 ${stringifyPrimitive(issue2.values[0])}`;
        return `\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E43\u0E19 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19" : "\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin ?? "\u0E04\u0E48\u0E32"} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23"}`;
        return `\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin ?? "\u0E04\u0E48\u0E32"} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22" : "\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E01\u0E33\u0E2B\u0E19\u0E14: ${issue2.origin} \u0E04\u0E27\u0E23\u0E21\u0E35${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E02\u0E36\u0E49\u0E19\u0E15\u0E49\u0E19\u0E14\u0E49\u0E27\u0E22 "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E25\u0E07\u0E17\u0E49\u0E32\u0E22\u0E14\u0E49\u0E27\u0E22 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35 "${_issue.includes}" \u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21`;
        if (_issue.format === "regex")
          return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E15\u0E49\u0E2D\u0E07\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14 ${_issue.pattern}`;
        return `\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E08\u0E33\u0E19\u0E27\u0E19\u0E17\u0E35\u0E48\u0E2B\u0E32\u0E23\u0E14\u0E49\u0E27\u0E22 ${issue2.divisor} \u0E44\u0E14\u0E49\u0E25\u0E07\u0E15\u0E31\u0E27`;
      case "unrecognized_keys":
        return `\u0E1E\u0E1A\u0E04\u0E35\u0E22\u0E4C\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49\u0E08\u0E31\u0E01: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u0E04\u0E35\u0E22\u0E4C\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E19 ${issue2.origin}`;
      case "invalid_union":
        return "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07: \u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E22\u0E39\u0E40\u0E19\u0E35\u0E22\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E44\u0E27\u0E49";
      case "invalid_element":
        return `\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07\u0E43\u0E19 ${issue2.origin}`;
      default:
        return `\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07`;
    }
  };
};
function th_default() {
  return {
    localeError: error42()
  };
}

// node_modules/zod/v4/locales/tr.js
var error43 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "olmal\u0131" },
    file: { unit: "bayt", verb: "olmal\u0131" },
    array: { unit: "\xF6\u011Fe", verb: "olmal\u0131" },
    set: { unit: "\xF6\u011Fe", verb: "olmal\u0131" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "girdi",
    email: "e-posta adresi",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO tarih ve saat",
    date: "ISO tarih",
    time: "ISO saat",
    duration: "ISO s\xFCre",
    ipv4: "IPv4 adresi",
    ipv6: "IPv6 adresi",
    cidrv4: "IPv4 aral\u0131\u011F\u0131",
    cidrv6: "IPv6 aral\u0131\u011F\u0131",
    base64: "base64 ile \u015Fifrelenmi\u015F metin",
    base64url: "base64url ile \u015Fifrelenmi\u015F metin",
    json_string: "JSON dizesi",
    e164: "E.164 say\u0131s\u0131",
    jwt: "JWT",
    template_literal: "\u015Eablon dizesi"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ge\xE7ersiz de\u011Fer: beklenen instanceof ${issue2.expected}, al\u0131nan ${received}`;
        }
        return `Ge\xE7ersiz de\u011Fer: beklenen ${expected}, al\u0131nan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ge\xE7ersiz de\u011Fer: beklenen ${stringifyPrimitive(issue2.values[0])}`;
        return `Ge\xE7ersiz se\xE7enek: a\u015Fa\u011F\u0131dakilerden biri olmal\u0131: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ok b\xFCy\xFCk: beklenen ${issue2.origin ?? "de\u011Fer"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\xF6\u011Fe"}`;
        return `\xC7ok b\xFCy\xFCk: beklenen ${issue2.origin ?? "de\u011Fer"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\xC7ok k\xFC\xE7\xFCk: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `\xC7ok k\xFC\xE7\xFCk: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ge\xE7ersiz metin: "${_issue.prefix}" ile ba\u015Flamal\u0131`;
        if (_issue.format === "ends_with")
          return `Ge\xE7ersiz metin: "${_issue.suffix}" ile bitmeli`;
        if (_issue.format === "includes")
          return `Ge\xE7ersiz metin: "${_issue.includes}" i\xE7ermeli`;
        if (_issue.format === "regex")
          return `Ge\xE7ersiz metin: ${_issue.pattern} desenine uymal\u0131`;
        return `Ge\xE7ersiz ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ge\xE7ersiz say\u0131: ${issue2.divisor} ile tam b\xF6l\xFCnebilmeli`;
      case "unrecognized_keys":
        return `Tan\u0131nmayan anahtar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} i\xE7inde ge\xE7ersiz anahtar`;
      case "invalid_union":
        return "Ge\xE7ersiz de\u011Fer";
      case "invalid_element":
        return `${issue2.origin} i\xE7inde ge\xE7ersiz de\u011Fer`;
      default:
        return `Ge\xE7ersiz de\u011Fer`;
    }
  };
};
function tr_default() {
  return {
    localeError: error43()
  };
}

// node_modules/zod/v4/locales/uk.js
var error44 = () => {
  const Sizable = {
    string: { unit: "\u0441\u0438\u043C\u0432\u043E\u043B\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    file: { unit: "\u0431\u0430\u0439\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    array: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" },
    set: { unit: "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432", verb: "\u043C\u0430\u0442\u0438\u043C\u0435" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456",
    email: "\u0430\u0434\u0440\u0435\u0441\u0430 \u0435\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0457 \u043F\u043E\u0448\u0442\u0438",
    url: "URL",
    emoji: "\u0435\u043C\u043E\u0434\u0437\u0456",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\u0434\u0430\u0442\u0430 \u0442\u0430 \u0447\u0430\u0441 ISO",
    date: "\u0434\u0430\u0442\u0430 ISO",
    time: "\u0447\u0430\u0441 ISO",
    duration: "\u0442\u0440\u0438\u0432\u0430\u043B\u0456\u0441\u0442\u044C ISO",
    ipv4: "\u0430\u0434\u0440\u0435\u0441\u0430 IPv4",
    ipv6: "\u0430\u0434\u0440\u0435\u0441\u0430 IPv6",
    cidrv4: "\u0434\u0456\u0430\u043F\u0430\u0437\u043E\u043D IPv4",
    cidrv6: "\u0434\u0456\u0430\u043F\u0430\u0437\u043E\u043D IPv6",
    base64: "\u0440\u044F\u0434\u043E\u043A \u0443 \u043A\u043E\u0434\u0443\u0432\u0430\u043D\u043D\u0456 base64",
    base64url: "\u0440\u044F\u0434\u043E\u043A \u0443 \u043A\u043E\u0434\u0443\u0432\u0430\u043D\u043D\u0456 base64url",
    json_string: "\u0440\u044F\u0434\u043E\u043A JSON",
    e164: "\u043D\u043E\u043C\u0435\u0440 E.164",
    jwt: "JWT",
    template_literal: "\u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0447\u0438\u0441\u043B\u043E",
    array: "\u043C\u0430\u0441\u0438\u0432"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F instanceof ${issue2.expected}, \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E ${received}`;
        }
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F ${expected}, \u043E\u0442\u0440\u0438\u043C\u0430\u043D\u043E ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F ${stringifyPrimitive(issue2.values[0])}`;
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0430 \u043E\u043F\u0446\u0456\u044F: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F \u043E\u0434\u043D\u0435 \u0437 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u0432\u0435\u043B\u0438\u043A\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0435\u043B\u0435\u043C\u0435\u043D\u0442\u0456\u0432"}`;
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u0432\u0435\u043B\u0438\u043A\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin ?? "\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F"} \u0431\u0443\u0434\u0435 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u043C\u0430\u043B\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u043C\u0430\u043B\u0435: \u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F, \u0449\u043E ${issue2.origin} \u0431\u0443\u0434\u0435 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u043F\u043E\u0447\u0438\u043D\u0430\u0442\u0438\u0441\u044F \u0437 "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u0437\u0430\u043A\u0456\u043D\u0447\u0443\u0432\u0430\u0442\u0438\u0441\u044F \u043D\u0430 "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u043C\u0456\u0441\u0442\u0438\u0442\u0438 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u0440\u044F\u0434\u043E\u043A: \u043F\u043E\u0432\u0438\u043D\u0435\u043D \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0442\u0438 \u0448\u0430\u0431\u043B\u043E\u043D\u0443 ${_issue.pattern}`;
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0435 \u0447\u0438\u0441\u043B\u043E: \u043F\u043E\u0432\u0438\u043D\u043D\u043E \u0431\u0443\u0442\u0438 \u043A\u0440\u0430\u0442\u043D\u0438\u043C ${issue2.divisor}`;
      case "unrecognized_keys":
        return `\u041D\u0435\u0440\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u043D\u0438\u0439 \u043A\u043B\u044E\u0447${issue2.keys.length > 1 ? "\u0456" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u043A\u043B\u044E\u0447 \u0443 ${issue2.origin}`;
      case "invalid_union":
        return "\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456";
      case "invalid_element":
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F \u0443 ${issue2.origin}`;
      default:
        return `\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0456 \u0432\u0445\u0456\u0434\u043D\u0456 \u0434\u0430\u043D\u0456`;
    }
  };
};
function uk_default() {
  return {
    localeError: error44()
  };
}

// node_modules/zod/v4/locales/ua.js
function ua_default() {
  return uk_default();
}

// node_modules/zod/v4/locales/ur.js
var error45 = () => {
  const Sizable = {
    string: { unit: "\u062D\u0631\u0648\u0641", verb: "\u06C1\u0648\u0646\u0627" },
    file: { unit: "\u0628\u0627\u0626\u0679\u0633", verb: "\u06C1\u0648\u0646\u0627" },
    array: { unit: "\u0622\u0626\u0679\u0645\u0632", verb: "\u06C1\u0648\u0646\u0627" },
    set: { unit: "\u0622\u0626\u0679\u0645\u0632", verb: "\u06C1\u0648\u0646\u0627" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0627\u0646 \u067E\u0679",
    email: "\u0627\u06CC \u0645\u06CC\u0644 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    url: "\u06CC\u0648 \u0622\u0631 \u0627\u06CC\u0644",
    emoji: "\u0627\u06CC\u0645\u0648\u062C\u06CC",
    uuid: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    uuidv4: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC \u0648\u06CC 4",
    uuidv6: "\u06CC\u0648 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC \u0648\u06CC 6",
    nanoid: "\u0646\u06CC\u0646\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    guid: "\u062C\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    cuid: "\u0633\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    cuid2: "\u0633\u06CC \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC 2",
    ulid: "\u06CC\u0648 \u0627\u06CC\u0644 \u0622\u0626\u06CC \u0688\u06CC",
    xid: "\u0627\u06CC\u06A9\u0633 \u0622\u0626\u06CC \u0688\u06CC",
    ksuid: "\u06A9\u06D2 \u0627\u06CC\u0633 \u06CC\u0648 \u0622\u0626\u06CC \u0688\u06CC",
    datetime: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0688\u06CC\u0679 \u0679\u0627\u0626\u0645",
    date: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u062A\u0627\u0631\u06CC\u062E",
    time: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0648\u0642\u062A",
    duration: "\u0622\u0626\u06CC \u0627\u06CC\u0633 \u0627\u0648 \u0645\u062F\u062A",
    ipv4: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 4 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    ipv6: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 6 \u0627\u06CC\u0688\u0631\u06CC\u0633",
    cidrv4: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 4 \u0631\u06CC\u0646\u062C",
    cidrv6: "\u0622\u0626\u06CC \u067E\u06CC \u0648\u06CC 6 \u0631\u06CC\u0646\u062C",
    base64: "\u0628\u06CC\u0633 64 \u0627\u0646 \u06A9\u0648\u0688\u0688 \u0633\u0679\u0631\u0646\u06AF",
    base64url: "\u0628\u06CC\u0633 64 \u06CC\u0648 \u0622\u0631 \u0627\u06CC\u0644 \u0627\u0646 \u06A9\u0648\u0688\u0688 \u0633\u0679\u0631\u0646\u06AF",
    json_string: "\u062C\u06D2 \u0627\u06CC\u0633 \u0627\u0648 \u0627\u06CC\u0646 \u0633\u0679\u0631\u0646\u06AF",
    e164: "\u0627\u06CC 164 \u0646\u0645\u0628\u0631",
    jwt: "\u062C\u06D2 \u0688\u0628\u0644\u06CC\u0648 \u0679\u06CC",
    template_literal: "\u0627\u0646 \u067E\u0679"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u0646\u0645\u0628\u0631",
    array: "\u0622\u0631\u06D2",
    null: "\u0646\u0644"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679: instanceof ${issue2.expected} \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627\u060C ${received} \u0645\u0648\u0635\u0648\u0644 \u06C1\u0648\u0627`;
        }
        return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679: ${expected} \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627\u060C ${received} \u0645\u0648\u0635\u0648\u0644 \u06C1\u0648\u0627`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679: ${stringifyPrimitive(issue2.values[0])} \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
        return `\u063A\u0644\u0637 \u0622\u067E\u0634\u0646: ${joinValues(issue2.values, "|")} \u0645\u06CC\u06BA \u0633\u06D2 \u0627\u06CC\u06A9 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u0628\u06C1\u062A \u0628\u0691\u0627: ${issue2.origin ?? "\u0648\u06CC\u0644\u06CC\u0648"} \u06A9\u06D2 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u0639\u0646\u0627\u0635\u0631"} \u06C1\u0648\u0646\u06D2 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u06D2`;
        return `\u0628\u06C1\u062A \u0628\u0691\u0627: ${issue2.origin ?? "\u0648\u06CC\u0644\u06CC\u0648"} \u06A9\u0627 ${adj}${issue2.maximum.toString()} \u06C1\u0648\u0646\u0627 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u0628\u06C1\u062A \u0686\u06BE\u0648\u0679\u0627: ${issue2.origin} \u06A9\u06D2 ${adj}${issue2.minimum.toString()} ${sizing.unit} \u06C1\u0648\u0646\u06D2 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u06D2`;
        }
        return `\u0628\u06C1\u062A \u0686\u06BE\u0648\u0679\u0627: ${issue2.origin} \u06A9\u0627 ${adj}${issue2.minimum.toString()} \u06C1\u0648\u0646\u0627 \u0645\u062A\u0648\u0642\u0639 \u062A\u06BE\u0627`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.prefix}" \u0633\u06D2 \u0634\u0631\u0648\u0639 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        }
        if (_issue.format === "ends_with")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.suffix}" \u067E\u0631 \u062E\u062A\u0645 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        if (_issue.format === "includes")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: "${_issue.includes}" \u0634\u0627\u0645\u0644 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        if (_issue.format === "regex")
          return `\u063A\u0644\u0637 \u0633\u0679\u0631\u0646\u06AF: \u067E\u06CC\u0679\u0631\u0646 ${_issue.pattern} \u0633\u06D2 \u0645\u06CC\u0686 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
        return `\u063A\u0644\u0637 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u063A\u0644\u0637 \u0646\u0645\u0628\u0631: ${issue2.divisor} \u06A9\u0627 \u0645\u0636\u0627\u0639\u0641 \u06C1\u0648\u0646\u0627 \u0686\u0627\u06C1\u06CC\u06D2`;
      case "unrecognized_keys":
        return `\u063A\u06CC\u0631 \u062A\u0633\u0644\u06CC\u0645 \u0634\u062F\u06C1 \u06A9\u06CC${issue2.keys.length > 1 ? "\u0632" : ""}: ${joinValues(issue2.keys, "\u060C ")}`;
      case "invalid_key":
        return `${issue2.origin} \u0645\u06CC\u06BA \u063A\u0644\u0637 \u06A9\u06CC`;
      case "invalid_union":
        return "\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679";
      case "invalid_element":
        return `${issue2.origin} \u0645\u06CC\u06BA \u063A\u0644\u0637 \u0648\u06CC\u0644\u06CC\u0648`;
      default:
        return `\u063A\u0644\u0637 \u0627\u0646 \u067E\u0679`;
    }
  };
};
function ur_default() {
  return {
    localeError: error45()
  };
}

// node_modules/zod/v4/locales/uz.js
var error46 = () => {
  const Sizable = {
    string: { unit: "belgi", verb: "bo\u2018lishi kerak" },
    file: { unit: "bayt", verb: "bo\u2018lishi kerak" },
    array: { unit: "element", verb: "bo\u2018lishi kerak" },
    set: { unit: "element", verb: "bo\u2018lishi kerak" },
    map: { unit: "yozuv", verb: "bo\u2018lishi kerak" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "kirish",
    email: "elektron pochta manzili",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO sana va vaqti",
    date: "ISO sana",
    time: "ISO vaqt",
    duration: "ISO davomiylik",
    ipv4: "IPv4 manzil",
    ipv6: "IPv6 manzil",
    mac: "MAC manzil",
    cidrv4: "IPv4 diapazon",
    cidrv6: "IPv6 diapazon",
    base64: "base64 kodlangan satr",
    base64url: "base64url kodlangan satr",
    json_string: "JSON satr",
    e164: "E.164 raqam",
    jwt: "JWT",
    template_literal: "kirish"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "raqam",
    array: "massiv"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Noto\u2018g\u2018ri kirish: kutilgan instanceof ${issue2.expected}, qabul qilingan ${received}`;
        }
        return `Noto\u2018g\u2018ri kirish: kutilgan ${expected}, qabul qilingan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Noto\u2018g\u2018ri kirish: kutilgan ${stringifyPrimitive(issue2.values[0])}`;
        return `Noto\u2018g\u2018ri variant: quyidagilardan biri kutilgan ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()} ${sizing.unit} ${sizing.verb}`;
        return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
        }
        return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Noto\u2018g\u2018ri satr: "${_issue.prefix}" bilan boshlanishi kerak`;
        if (_issue.format === "ends_with")
          return `Noto\u2018g\u2018ri satr: "${_issue.suffix}" bilan tugashi kerak`;
        if (_issue.format === "includes")
          return `Noto\u2018g\u2018ri satr: "${_issue.includes}" ni o\u2018z ichiga olishi kerak`;
        if (_issue.format === "regex")
          return `Noto\u2018g\u2018ri satr: ${_issue.pattern} shabloniga mos kelishi kerak`;
        return `Noto\u2018g\u2018ri ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Noto\u2018g\u2018ri raqam: ${issue2.divisor} ning karralisi bo\u2018lishi kerak`;
      case "unrecognized_keys":
        return `Noma\u2019lum kalit${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} dagi kalit noto\u2018g\u2018ri`;
      case "invalid_union":
        return "Noto\u2018g\u2018ri kirish";
      case "invalid_element":
        return `${issue2.origin} da noto\u2018g\u2018ri qiymat`;
      default:
        return `Noto\u2018g\u2018ri kirish`;
    }
  };
};
function uz_default() {
  return {
    localeError: error46()
  };
}

// node_modules/zod/v4/locales/vi.js
var error47 = () => {
  const Sizable = {
    string: { unit: "k\xFD t\u1EF1", verb: "c\xF3" },
    file: { unit: "byte", verb: "c\xF3" },
    array: { unit: "ph\u1EA7n t\u1EED", verb: "c\xF3" },
    set: { unit: "ph\u1EA7n t\u1EED", verb: "c\xF3" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u0111\u1EA7u v\xE0o",
    email: "\u0111\u1ECBa ch\u1EC9 email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ng\xE0y gi\u1EDD ISO",
    date: "ng\xE0y ISO",
    time: "gi\u1EDD ISO",
    duration: "kho\u1EA3ng th\u1EDDi gian ISO",
    ipv4: "\u0111\u1ECBa ch\u1EC9 IPv4",
    ipv6: "\u0111\u1ECBa ch\u1EC9 IPv6",
    cidrv4: "d\u1EA3i IPv4",
    cidrv6: "d\u1EA3i IPv6",
    base64: "chu\u1ED7i m\xE3 h\xF3a base64",
    base64url: "chu\u1ED7i m\xE3 h\xF3a base64url",
    json_string: "chu\u1ED7i JSON",
    e164: "s\u1ED1 E.164",
    jwt: "JWT",
    template_literal: "\u0111\u1EA7u v\xE0o"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "s\u1ED1",
    array: "m\u1EA3ng"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i instanceof ${issue2.expected}, nh\u1EADn \u0111\u01B0\u1EE3c ${received}`;
        }
        return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i ${expected}, nh\u1EADn \u0111\u01B0\u1EE3c ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i ${stringifyPrimitive(issue2.values[0])}`;
        return `T\xF9y ch\u1ECDn kh\xF4ng h\u1EE3p l\u1EC7: mong \u0111\u1EE3i m\u1ED9t trong c\xE1c gi\xE1 tr\u1ECB ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Qu\xE1 l\u1EDBn: mong \u0111\u1EE3i ${issue2.origin ?? "gi\xE1 tr\u1ECB"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "ph\u1EA7n t\u1EED"}`;
        return `Qu\xE1 l\u1EDBn: mong \u0111\u1EE3i ${issue2.origin ?? "gi\xE1 tr\u1ECB"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Qu\xE1 nh\u1ECF: mong \u0111\u1EE3i ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Qu\xE1 nh\u1ECF: mong \u0111\u1EE3i ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i k\u1EBFt th\xFAc b\u1EB1ng "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i bao g\u1ED3m "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chu\u1ED7i kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i kh\u1EDBp v\u1EDBi m\u1EABu ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} kh\xF4ng h\u1EE3p l\u1EC7`;
      }
      case "not_multiple_of":
        return `S\u1ED1 kh\xF4ng h\u1EE3p l\u1EC7: ph\u1EA3i l\xE0 b\u1ED9i s\u1ED1 c\u1EE7a ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kh\xF3a kh\xF4ng \u0111\u01B0\u1EE3c nh\u1EADn d\u1EA1ng: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kh\xF3a kh\xF4ng h\u1EE3p l\u1EC7 trong ${issue2.origin}`;
      case "invalid_union":
        return "\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7";
      case "invalid_element":
        return `Gi\xE1 tr\u1ECB kh\xF4ng h\u1EE3p l\u1EC7 trong ${issue2.origin}`;
      default:
        return `\u0110\u1EA7u v\xE0o kh\xF4ng h\u1EE3p l\u1EC7`;
    }
  };
};
function vi_default() {
  return {
    localeError: error47()
  };
}

// node_modules/zod/v4/locales/zh-CN.js
var error48 = () => {
  const Sizable = {
    string: { unit: "\u5B57\u7B26", verb: "\u5305\u542B" },
    file: { unit: "\u5B57\u8282", verb: "\u5305\u542B" },
    array: { unit: "\u9879", verb: "\u5305\u542B" },
    set: { unit: "\u9879", verb: "\u5305\u542B" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u8F93\u5165",
    email: "\u7535\u5B50\u90AE\u4EF6",
    url: "URL",
    emoji: "\u8868\u60C5\u7B26\u53F7",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO\u65E5\u671F\u65F6\u95F4",
    date: "ISO\u65E5\u671F",
    time: "ISO\u65F6\u95F4",
    duration: "ISO\u65F6\u957F",
    ipv4: "IPv4\u5730\u5740",
    ipv6: "IPv6\u5730\u5740",
    cidrv4: "IPv4\u7F51\u6BB5",
    cidrv6: "IPv6\u7F51\u6BB5",
    base64: "base64\u7F16\u7801\u5B57\u7B26\u4E32",
    base64url: "base64url\u7F16\u7801\u5B57\u7B26\u4E32",
    json_string: "JSON\u5B57\u7B26\u4E32",
    e164: "E.164\u53F7\u7801",
    jwt: "JWT",
    template_literal: "\u8F93\u5165"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "\u6570\u5B57",
    array: "\u6570\u7EC4",
    null: "\u7A7A\u503C(null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u65E0\u6548\u8F93\u5165\uFF1A\u671F\u671B instanceof ${issue2.expected}\uFF0C\u5B9E\u9645\u63A5\u6536 ${received}`;
        }
        return `\u65E0\u6548\u8F93\u5165\uFF1A\u671F\u671B ${expected}\uFF0C\u5B9E\u9645\u63A5\u6536 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u65E0\u6548\u8F93\u5165\uFF1A\u671F\u671B ${stringifyPrimitive(issue2.values[0])}`;
        return `\u65E0\u6548\u9009\u9879\uFF1A\u671F\u671B\u4EE5\u4E0B\u4E4B\u4E00 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u6570\u503C\u8FC7\u5927\uFF1A\u671F\u671B ${issue2.origin ?? "\u503C"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u4E2A\u5143\u7D20"}`;
        return `\u6570\u503C\u8FC7\u5927\uFF1A\u671F\u671B ${issue2.origin ?? "\u503C"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u6570\u503C\u8FC7\u5C0F\uFF1A\u671F\u671B ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u6570\u503C\u8FC7\u5C0F\uFF1A\u671F\u671B ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u4EE5 "${_issue.prefix}" \u5F00\u5934`;
        if (_issue.format === "ends_with")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u4EE5 "${_issue.suffix}" \u7ED3\u5C3E`;
        if (_issue.format === "includes")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u5305\u542B "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u65E0\u6548\u5B57\u7B26\u4E32\uFF1A\u5FC5\u987B\u6EE1\u8DB3\u6B63\u5219\u8868\u8FBE\u5F0F ${_issue.pattern}`;
        return `\u65E0\u6548${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u65E0\u6548\u6570\u5B57\uFF1A\u5FC5\u987B\u662F ${issue2.divisor} \u7684\u500D\u6570`;
      case "unrecognized_keys":
        return `\u51FA\u73B0\u672A\u77E5\u7684\u952E(key): ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} \u4E2D\u7684\u952E(key)\u65E0\u6548`;
      case "invalid_union":
        return "\u65E0\u6548\u8F93\u5165";
      case "invalid_element":
        return `${issue2.origin} \u4E2D\u5305\u542B\u65E0\u6548\u503C(value)`;
      default:
        return `\u65E0\u6548\u8F93\u5165`;
    }
  };
};
function zh_CN_default() {
  return {
    localeError: error48()
  };
}

// node_modules/zod/v4/locales/zh-TW.js
var error49 = () => {
  const Sizable = {
    string: { unit: "\u5B57\u5143", verb: "\u64C1\u6709" },
    file: { unit: "\u4F4D\u5143\u7D44", verb: "\u64C1\u6709" },
    array: { unit: "\u9805\u76EE", verb: "\u64C1\u6709" },
    set: { unit: "\u9805\u76EE", verb: "\u64C1\u6709" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u8F38\u5165",
    email: "\u90F5\u4EF6\u5730\u5740",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO \u65E5\u671F\u6642\u9593",
    date: "ISO \u65E5\u671F",
    time: "ISO \u6642\u9593",
    duration: "ISO \u671F\u9593",
    ipv4: "IPv4 \u4F4D\u5740",
    ipv6: "IPv6 \u4F4D\u5740",
    cidrv4: "IPv4 \u7BC4\u570D",
    cidrv6: "IPv6 \u7BC4\u570D",
    base64: "base64 \u7DE8\u78BC\u5B57\u4E32",
    base64url: "base64url \u7DE8\u78BC\u5B57\u4E32",
    json_string: "JSON \u5B57\u4E32",
    e164: "E.164 \u6578\u503C",
    jwt: "JWT",
    template_literal: "\u8F38\u5165"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\u7121\u6548\u7684\u8F38\u5165\u503C\uFF1A\u9810\u671F\u70BA instanceof ${issue2.expected}\uFF0C\u4F46\u6536\u5230 ${received}`;
        }
        return `\u7121\u6548\u7684\u8F38\u5165\u503C\uFF1A\u9810\u671F\u70BA ${expected}\uFF0C\u4F46\u6536\u5230 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\u7121\u6548\u7684\u8F38\u5165\u503C\uFF1A\u9810\u671F\u70BA ${stringifyPrimitive(issue2.values[0])}`;
        return `\u7121\u6548\u7684\u9078\u9805\uFF1A\u9810\u671F\u70BA\u4EE5\u4E0B\u5176\u4E2D\u4E4B\u4E00 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `\u6578\u503C\u904E\u5927\uFF1A\u9810\u671F ${issue2.origin ?? "\u503C"} \u61C9\u70BA ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "\u500B\u5143\u7D20"}`;
        return `\u6578\u503C\u904E\u5927\uFF1A\u9810\u671F ${issue2.origin ?? "\u503C"} \u61C9\u70BA ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `\u6578\u503C\u904E\u5C0F\uFF1A\u9810\u671F ${issue2.origin} \u61C9\u70BA ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `\u6578\u503C\u904E\u5C0F\uFF1A\u9810\u671F ${issue2.origin} \u61C9\u70BA ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u4EE5 "${_issue.prefix}" \u958B\u982D`;
        }
        if (_issue.format === "ends_with")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u4EE5 "${_issue.suffix}" \u7D50\u5C3E`;
        if (_issue.format === "includes")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u5305\u542B "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u7121\u6548\u7684\u5B57\u4E32\uFF1A\u5FC5\u9808\u7B26\u5408\u683C\u5F0F ${_issue.pattern}`;
        return `\u7121\u6548\u7684 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `\u7121\u6548\u7684\u6578\u5B57\uFF1A\u5FC5\u9808\u70BA ${issue2.divisor} \u7684\u500D\u6578`;
      case "unrecognized_keys":
        return `\u7121\u6CD5\u8B58\u5225\u7684\u9375\u503C${issue2.keys.length > 1 ? "\u5011" : ""}\uFF1A${joinValues(issue2.keys, "\u3001")}`;
      case "invalid_key":
        return `${issue2.origin} \u4E2D\u6709\u7121\u6548\u7684\u9375\u503C`;
      case "invalid_union":
        return "\u7121\u6548\u7684\u8F38\u5165\u503C";
      case "invalid_element":
        return `${issue2.origin} \u4E2D\u6709\u7121\u6548\u7684\u503C`;
      default:
        return `\u7121\u6548\u7684\u8F38\u5165\u503C`;
    }
  };
};
function zh_TW_default() {
  return {
    localeError: error49()
  };
}

// node_modules/zod/v4/locales/yo.js
var error50 = () => {
  const Sizable = {
    string: { unit: "\xE0mi", verb: "n\xED" },
    file: { unit: "bytes", verb: "n\xED" },
    array: { unit: "nkan", verb: "n\xED" },
    set: { unit: "nkan", verb: "n\xED" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "\u1EB9\u0300r\u1ECD \xECb\xE1w\u1ECDl\xE9",
    email: "\xE0d\xEDr\u1EB9\u0301s\xEC \xECm\u1EB9\u0301l\xEC",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "\xE0k\xF3k\xF2 ISO",
    date: "\u1ECDj\u1ECD\u0301 ISO",
    time: "\xE0k\xF3k\xF2 ISO",
    duration: "\xE0k\xF3k\xF2 t\xF3 p\xE9 ISO",
    ipv4: "\xE0d\xEDr\u1EB9\u0301s\xEC IPv4",
    ipv6: "\xE0d\xEDr\u1EB9\u0301s\xEC IPv6",
    cidrv4: "\xE0gb\xE8gb\xE8 IPv4",
    cidrv6: "\xE0gb\xE8gb\xE8 IPv6",
    base64: "\u1ECD\u0300r\u1ECD\u0300 t\xED a k\u1ECD\u0301 n\xED base64",
    base64url: "\u1ECD\u0300r\u1ECD\u0300 base64url",
    json_string: "\u1ECD\u0300r\u1ECD\u0300 JSON",
    e164: "n\u1ECD\u0301mb\xE0 E.164",
    jwt: "JWT",
    template_literal: "\u1EB9\u0300r\u1ECD \xECb\xE1w\u1ECDl\xE9"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "n\u1ECD\u0301mb\xE0",
    array: "akop\u1ECD"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `\xCCb\xE1w\u1ECDl\xE9 a\u1E63\xEC\u1E63e: a n\xED l\xE1ti fi instanceof ${issue2.expected}, \xE0m\u1ECD\u0300 a r\xED ${received}`;
        }
        return `\xCCb\xE1w\u1ECDl\xE9 a\u1E63\xEC\u1E63e: a n\xED l\xE1ti fi ${expected}, \xE0m\u1ECD\u0300 a r\xED ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `\xCCb\xE1w\u1ECDl\xE9 a\u1E63\xEC\u1E63e: a n\xED l\xE1ti fi ${stringifyPrimitive(issue2.values[0])}`;
        return `\xC0\u1E63\xE0y\xE0n a\u1E63\xEC\u1E63e: yan \u1ECD\u0300kan l\xE1ra ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `T\xF3 p\u1ECD\u0300 j\xF9: a n\xED l\xE1ti j\u1EB9\u0301 p\xE9 ${issue2.origin ?? "iye"} ${sizing.verb} ${adj}${issue2.maximum} ${sizing.unit}`;
        return `T\xF3 p\u1ECD\u0300 j\xF9: a n\xED l\xE1ti j\u1EB9\u0301 ${adj}${issue2.maximum}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `K\xE9r\xE9 ju: a n\xED l\xE1ti j\u1EB9\u0301 p\xE9 ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum} ${sizing.unit}`;
        return `K\xE9r\xE9 ju: a n\xED l\xE1ti j\u1EB9\u0301 ${adj}${issue2.minimum}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `\u1ECC\u0300r\u1ECD\u0300 a\u1E63\xEC\u1E63e: gb\u1ECD\u0301d\u1ECD\u0300 b\u1EB9\u0300r\u1EB9\u0300 p\u1EB9\u0300l\xFA "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `\u1ECC\u0300r\u1ECD\u0300 a\u1E63\xEC\u1E63e: gb\u1ECD\u0301d\u1ECD\u0300 par\xED p\u1EB9\u0300l\xFA "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `\u1ECC\u0300r\u1ECD\u0300 a\u1E63\xEC\u1E63e: gb\u1ECD\u0301d\u1ECD\u0300 n\xED "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `\u1ECC\u0300r\u1ECD\u0300 a\u1E63\xEC\u1E63e: gb\u1ECD\u0301d\u1ECD\u0300 b\xE1 \xE0p\u1EB9\u1EB9r\u1EB9 mu ${_issue.pattern}`;
        return `A\u1E63\xEC\u1E63e: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `N\u1ECD\u0301mb\xE0 a\u1E63\xEC\u1E63e: gb\u1ECD\u0301d\u1ECD\u0300 j\u1EB9\u0301 \xE8y\xE0 p\xEDp\xEDn ti ${issue2.divisor}`;
      case "unrecognized_keys":
        return `B\u1ECDt\xECn\xEC \xE0\xECm\u1ECD\u0300: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `B\u1ECDt\xECn\xEC a\u1E63\xEC\u1E63e n\xEDn\xFA ${issue2.origin}`;
      case "invalid_union":
        return "\xCCb\xE1w\u1ECDl\xE9 a\u1E63\xEC\u1E63e";
      case "invalid_element":
        return `Iye a\u1E63\xEC\u1E63e n\xEDn\xFA ${issue2.origin}`;
      default:
        return "\xCCb\xE1w\u1ECDl\xE9 a\u1E63\xEC\u1E63e";
    }
  };
};
function yo_default() {
  return {
    localeError: error50()
  };
}

// node_modules/zod/v4/core/registries.js
var _a2;
var $output = /* @__PURE__ */ Symbol("ZodOutput");
var $input = /* @__PURE__ */ Symbol("ZodInput");
var $ZodRegistry = class {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta3 = _meta[0];
    this._map.set(schema, meta3);
    if (meta3 && typeof meta3 === "object" && "id" in meta3) {
      this._idmap.set(meta3.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta3 = this._map.get(schema);
    if (meta3 && typeof meta3 === "object" && "id" in meta3) {
      this._idmap.delete(meta3.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : void 0;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
};
function registry() {
  return new $ZodRegistry();
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;

// node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedString(Class2, params) {
  return new Class2({
    type: "string",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _mac(Class2, params) {
  return new Class2({
    type: "string",
    format: "mac",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
var TimePrecision = {
  Any: null,
  Minute: -1,
  Second: 0,
  Millisecond: 3,
  Microsecond: 6
};
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedNumber(Class2, params) {
  return new Class2({
    type: "number",
    coerce: true,
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _float32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _float64(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "int32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uint32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "uint32",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedBoolean(Class2, params) {
  return new Class2({
    type: "boolean",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _bigint(Class2, params) {
  return new Class2({
    type: "bigint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedBigint(Class2, params) {
  return new Class2({
    type: "bigint",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "int64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uint64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "uint64",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _symbol(Class2, params) {
  return new Class2({
    type: "symbol",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _undefined2(Class2, params) {
  return new Class2({
    type: "undefined",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _any(Class2) {
  return new Class2({
    type: "any"
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _void(Class2, params) {
  return new Class2({
    type: "void",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _date(Class2, params) {
  return new Class2({
    type: "date",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _coercedDate(Class2, params) {
  return new Class2({
    type: "date",
    coerce: true,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nan(Class2, params) {
  return new Class2({
    type: "nan",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _positive(params) {
  return /* @__PURE__ */ _gt(0, params);
}
// @__NO_SIDE_EFFECTS__
function _negative(params) {
  return /* @__PURE__ */ _lt(0, params);
}
// @__NO_SIDE_EFFECTS__
function _nonpositive(params) {
  return /* @__PURE__ */ _lte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _nonnegative(params) {
  return /* @__PURE__ */ _gte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
// @__NO_SIDE_EFFECTS__
function _maxSize(maximum, params) {
  return new $ZodCheckMaxSize({
    check: "max_size",
    ...normalizeParams(params),
    maximum
  });
}
// @__NO_SIDE_EFFECTS__
function _minSize(minimum, params) {
  return new $ZodCheckMinSize({
    check: "min_size",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _size(size, params) {
  return new $ZodCheckSizeEquals({
    check: "size_equals",
    ...normalizeParams(params),
    size
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
// @__NO_SIDE_EFFECTS__
function _property(property, schema, params) {
  return new $ZodCheckProperty({
    check: "property",
    property,
    schema,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _mime(types, params) {
  return new $ZodCheckMimeType({
    check: "mime_type",
    mime: types,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _union(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
function _xor(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    inclusive: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _discriminatedUnion(Class2, discriminator, options, params) {
  return new Class2({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _intersection(Class2, left, right) {
  return new Class2({
    type: "intersection",
    left,
    right
  });
}
// @__NO_SIDE_EFFECTS__
function _tuple(Class2, items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new Class2({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _record(Class2, keyType, valueType, params) {
  return new Class2({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _map(Class2, keyType, valueType, params) {
  return new Class2({
    type: "map",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _set(Class2, valueType, params) {
  return new Class2({
    type: "set",
    valueType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _enum(Class2, values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nativeEnum(Class2, entries, params) {
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _literal(Class2, value, params) {
  return new Class2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _file(Class2, params) {
  return new Class2({
    type: "file",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _transform(Class2, fn) {
  return new Class2({
    type: "transform",
    transform: fn
  });
}
// @__NO_SIDE_EFFECTS__
function _optional(Class2, innerType) {
  return new Class2({
    type: "optional",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _nullable(Class2, innerType) {
  return new Class2({
    type: "nullable",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _default(Class2, innerType, defaultValue) {
  return new Class2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
// @__NO_SIDE_EFFECTS__
function _nonoptional(Class2, innerType, params) {
  return new Class2({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _success(Class2, innerType) {
  return new Class2({
    type: "success",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _catch(Class2, innerType, catchValue) {
  return new Class2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
// @__NO_SIDE_EFFECTS__
function _pipe(Class2, in_, out) {
  return new Class2({
    type: "pipe",
    in: in_,
    out
  });
}
// @__NO_SIDE_EFFECTS__
function _readonly(Class2, innerType) {
  return new Class2({
    type: "readonly",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _templateLiteral(Class2, parts, params) {
  return new Class2({
    type: "template_literal",
    parts,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lazy(Class2, getter) {
  return new Class2({
    type: "lazy",
    getter
  });
}
// @__NO_SIDE_EFFECTS__
function _promise(Class2, innerType) {
  return new Class2({
    type: "promise",
    innerType
  });
}
// @__NO_SIDE_EFFECTS__
function _custom(Class2, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// @__NO_SIDE_EFFECTS__
function describe(description) {
  const ch = new $ZodCheck({ check: "describe" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, description });
    }
  ];
  ch._zod.check = () => {
  };
  return ch;
}
// @__NO_SIDE_EFFECTS__
function meta(metadata) {
  const ch = new $ZodCheck({ check: "meta" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, ...metadata });
    }
  ];
  ch._zod.check = () => {
  };
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _stringbool(Classes, _params) {
  const params = normalizeParams(_params);
  let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
  let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
  if (params.case !== "sensitive") {
    truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
  }
  const truthySet = new Set(truthyArray);
  const falsySet = new Set(falsyArray);
  const _Codec = Classes.Codec ?? $ZodCodec;
  const _Boolean = Classes.Boolean ?? $ZodBoolean;
  const _String = Classes.String ?? $ZodString;
  const stringSchema = new _String({ type: "string", error: params.error });
  const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
  const codec2 = new _Codec({
    type: "pipe",
    in: stringSchema,
    out: booleanSchema,
    transform: ((input, payload) => {
      let data = input;
      if (params.case !== "sensitive")
        data = data.toLowerCase();
      if (truthySet.has(data)) {
        return true;
      } else if (falsySet.has(data)) {
        return false;
      } else {
        payload.issues.push({
          code: "invalid_value",
          expected: "stringbool",
          values: [...truthySet, ...falsySet],
          input: payload.value,
          inst: codec2,
          continue: false
        });
        return {};
      }
    }),
    reverseTransform: ((input, _payload) => {
      if (input === true) {
        return truthyArray[0] || "true";
      } else {
        return falsyArray[0] || "false";
      }
    }),
    error: params.error
  });
  return codec2;
}
// @__NO_SIDE_EFFECTS__
function _stringFormat(Class2, format, fnOrRegex, _params = {}) {
  const params = normalizeParams(_params);
  const def = {
    ...normalizeParams(_params),
    check: "string_format",
    type: "string",
    format,
    fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
    ...params
  };
  if (fnOrRegex instanceof RegExp) {
    def.pattern = fnOrRegex;
  }
  const inst = new Class2(def);
  return inst;
}

// node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {
    }),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? void 0
  };
}
function process2(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process2(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta3 = ctx.metadataRegistry.get(schema);
  if (meta3)
    Object.assign(result.schema, meta3);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {
  } else {
  }
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {
  } else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process2(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};

// node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
  // do not set
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json2 = _json;
  json2.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json2.minLength = minimum;
  if (typeof maximum === "number")
    json2.maxLength = maximum;
  if (format) {
    json2.format = formatMap[format] ?? format;
    if (json2.format === "")
      delete json2.format;
    if (format === "time") {
      delete json2.format;
    }
  }
  if (contentEncoding)
    json2.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json2.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json2.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json2 = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json2.type = "integer";
  else
    json2.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json2.minimum = exclusiveMinimum;
      json2.exclusiveMinimum = true;
    } else {
      json2.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json2.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json2.maximum = exclusiveMaximum;
      json2.exclusiveMaximum = true;
    } else {
      json2.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json2.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json2.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json2, _params) => {
  json2.type = "boolean";
};
var bigintProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("BigInt cannot be represented in JSON Schema");
  }
};
var symbolProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Symbols cannot be represented in JSON Schema");
  }
};
var nullProcessor = (_schema, ctx, json2, _params) => {
  if (ctx.target === "openapi-3.0") {
    json2.type = "string";
    json2.nullable = true;
    json2.enum = [null];
  } else {
    json2.type = "null";
  }
};
var undefinedProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Undefined cannot be represented in JSON Schema");
  }
};
var voidProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Void cannot be represented in JSON Schema");
  }
};
var neverProcessor = (_schema, _ctx, json2, _params) => {
  json2.not = {};
};
var anyProcessor = (_schema, _ctx, _json, _params) => {
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {
};
var dateProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Date cannot be represented in JSON Schema");
  }
};
var enumProcessor = (schema, _ctx, json2, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number"))
    json2.type = "number";
  if (values.every((v) => typeof v === "string"))
    json2.type = "string";
  json2.enum = values;
};
var literalProcessor = (schema, ctx, json2, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === void 0) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      } else {
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {
  } else if (vals.length === 1) {
    const val = vals[0];
    json2.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json2.enum = [val];
    } else {
      json2.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json2.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json2.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json2.type = "boolean";
    if (vals.every((v) => v === null))
      json2.type = "null";
    json2.enum = vals;
  }
};
var nanProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("NaN cannot be represented in JSON Schema");
  }
};
var templateLiteralProcessor = (schema, _ctx, json2, _params) => {
  const _json = json2;
  const pattern = schema._zod.pattern;
  if (!pattern)
    throw new Error("Pattern not found in template literal");
  _json.type = "string";
  _json.pattern = pattern.source;
};
var fileProcessor = (schema, _ctx, json2, _params) => {
  const _json = json2;
  const file2 = {
    type: "string",
    format: "binary",
    contentEncoding: "binary"
  };
  const { minimum, maximum, mime } = schema._zod.bag;
  if (minimum !== void 0)
    file2.minLength = minimum;
  if (maximum !== void 0)
    file2.maxLength = maximum;
  if (mime) {
    if (mime.length === 1) {
      file2.contentMediaType = mime[0];
      Object.assign(_json, file2);
    } else {
      Object.assign(_json, file2);
      _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
    }
  } else {
    Object.assign(_json, file2);
  }
};
var successProcessor = (_schema, _ctx, json2, _params) => {
  json2.type = "boolean";
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var functionProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Function types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var mapProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Map cannot be represented in JSON Schema");
  }
};
var setProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Set cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json2.minItems = minimum;
  if (typeof maximum === "number")
    json2.maxItems = maximum;
  json2.type = "array";
  json2.items = process2(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  json2.type = "object";
  json2.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json2.properties[key] = process2(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v.optin === void 0;
    } else {
      return v.optout === void 0;
    }
  }));
  if (requiredKeys.size > 0) {
    json2.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json2.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json2.additionalProperties = false;
  } else if (def.catchall) {
    json2.additionalProperties = process2(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json2.oneOf = options;
  } else {
    json2.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const a = process2(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process2(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json2.allOf = allOf;
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  json2.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => process2(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? process2(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  if (ctx.target === "draft-2020-12") {
    json2.prefixItems = prefixItems;
    if (rest) {
      json2.items = rest;
    }
  } else if (ctx.target === "openapi-3.0") {
    json2.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json2.items.anyOf.push(rest);
    }
    json2.minItems = prefixItems.length;
    if (!rest) {
      json2.maxItems = prefixItems.length;
    }
  } else {
    json2.items = prefixItems;
    if (rest) {
      json2.additionalItems = rest;
    }
  }
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json2.minItems = minimum;
  if (typeof maximum === "number")
    json2.maxItems = maximum;
};
var recordProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  json2.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json2.patternProperties = {};
    for (const pattern of patterns) {
      json2.patternProperties[pattern.source] = valueSchema;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json2.propertyNames = process2(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
    }
    json2.additionalProperties = process2(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json2.required = validKeyValues;
    }
  }
};
var nullableProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const inner = process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json2.nullable = true;
  } else {
    json2.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json2.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json2._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(void 0);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json2.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json2.readOnly = true;
};
var promiseProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process2(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  process2(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var allProcessors = {
  string: stringProcessor,
  number: numberProcessor,
  boolean: booleanProcessor,
  bigint: bigintProcessor,
  symbol: symbolProcessor,
  null: nullProcessor,
  undefined: undefinedProcessor,
  void: voidProcessor,
  never: neverProcessor,
  any: anyProcessor,
  unknown: unknownProcessor,
  date: dateProcessor,
  enum: enumProcessor,
  literal: literalProcessor,
  nan: nanProcessor,
  template_literal: templateLiteralProcessor,
  file: fileProcessor,
  success: successProcessor,
  custom: customProcessor,
  function: functionProcessor,
  transform: transformProcessor,
  map: mapProcessor,
  set: setProcessor,
  array: arrayProcessor,
  object: objectProcessor,
  union: unionProcessor,
  intersection: intersectionProcessor,
  tuple: tupleProcessor,
  record: recordProcessor,
  nullable: nullableProcessor,
  nonoptional: nonoptionalProcessor,
  default: defaultProcessor,
  prefault: prefaultProcessor,
  catch: catchProcessor,
  pipe: pipeProcessor,
  readonly: readonlyProcessor,
  promise: promiseProcessor,
  optional: optionalProcessor,
  lazy: lazyProcessor
};
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry2 = input;
    const ctx2 = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry2._idmap.entries()) {
      const [_, schema] = entry;
      process2(schema, ctx2);
    }
    const schemas = {};
    const external = {
      registry: registry2,
      uri: params?.uri,
      defs
    };
    ctx2.external = external;
    for (const entry of registry2._idmap.entries()) {
      const [key, schema] = entry;
      extractDefs(ctx2, schema);
      schemas[key] = finalize(ctx2, schema);
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  process2(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}

// node_modules/zod/v4/core/json-schema-generator.js
var JSONSchemaGenerator = class {
  /** @deprecated Access via ctx instead */
  get metadataRegistry() {
    return this.ctx.metadataRegistry;
  }
  /** @deprecated Access via ctx instead */
  get target() {
    return this.ctx.target;
  }
  /** @deprecated Access via ctx instead */
  get unrepresentable() {
    return this.ctx.unrepresentable;
  }
  /** @deprecated Access via ctx instead */
  get override() {
    return this.ctx.override;
  }
  /** @deprecated Access via ctx instead */
  get io() {
    return this.ctx.io;
  }
  /** @deprecated Access via ctx instead */
  get counter() {
    return this.ctx.counter;
  }
  set counter(value) {
    this.ctx.counter = value;
  }
  /** @deprecated Access via ctx instead */
  get seen() {
    return this.ctx.seen;
  }
  constructor(params) {
    let normalizedTarget = params?.target ?? "draft-2020-12";
    if (normalizedTarget === "draft-4")
      normalizedTarget = "draft-04";
    if (normalizedTarget === "draft-7")
      normalizedTarget = "draft-07";
    this.ctx = initializeContext({
      processors: allProcessors,
      target: normalizedTarget,
      ...params?.metadata && { metadata: params.metadata },
      ...params?.unrepresentable && { unrepresentable: params.unrepresentable },
      ...params?.override && { override: params.override },
      ...params?.io && { io: params.io }
    });
  }
  /**
   * Process a schema to prepare it for JSON Schema generation.
   * This must be called before emit().
   */
  process(schema, _params = { path: [], schemaPath: [] }) {
    return process2(schema, this.ctx, _params);
  }
  /**
   * Emit the final JSON Schema after processing.
   * Must call process() first.
   */
  emit(schema, _params) {
    if (_params) {
      if (_params.cycles)
        this.ctx.cycles = _params.cycles;
      if (_params.reused)
        this.ctx.reused = _params.reused;
      if (_params.external)
        this.ctx.external = _params.external;
    }
    extractDefs(this.ctx, schema);
    const result = finalize(this.ctx, schema);
    const { "~standard": _, ...plainResult } = result;
    return plainResult;
  }
};

// node_modules/zod/v4/core/json-schema.js
var json_schema_exports = {};

// node_modules/zod/v4/classic/schemas.js
var schemas_exports2 = {};
__export(schemas_exports2, {
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBase64: () => ZodBase64,
  ZodBase64URL: () => ZodBase64URL,
  ZodBigInt: () => ZodBigInt,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBoolean: () => ZodBoolean,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCUID: () => ZodCUID,
  ZodCUID2: () => ZodCUID2,
  ZodCatch: () => ZodCatch,
  ZodCodec: () => ZodCodec,
  ZodCustom: () => ZodCustom,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodE164: () => ZodE164,
  ZodEmail: () => ZodEmail,
  ZodEmoji: () => ZodEmoji,
  ZodEnum: () => ZodEnum,
  ZodExactOptional: () => ZodExactOptional,
  ZodFile: () => ZodFile,
  ZodFunction: () => ZodFunction,
  ZodGUID: () => ZodGUID,
  ZodIPv4: () => ZodIPv4,
  ZodIPv6: () => ZodIPv6,
  ZodIntersection: () => ZodIntersection,
  ZodJWT: () => ZodJWT,
  ZodKSUID: () => ZodKSUID,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMAC: () => ZodMAC,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNanoID: () => ZodNanoID,
  ZodNever: () => ZodNever,
  ZodNonOptional: () => ZodNonOptional,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodPipe: () => ZodPipe,
  ZodPrefault: () => ZodPrefault,
  ZodPreprocess: () => ZodPreprocess,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodStringFormat: () => ZodStringFormat,
  ZodSuccess: () => ZodSuccess,
  ZodSymbol: () => ZodSymbol,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodTransform: () => ZodTransform,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodULID: () => ZodULID,
  ZodURL: () => ZodURL,
  ZodUUID: () => ZodUUID,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  ZodXID: () => ZodXID,
  ZodXor: () => ZodXor,
  _ZodString: () => _ZodString,
  _default: () => _default2,
  _function: () => _function,
  any: () => any,
  array: () => array,
  base64: () => base642,
  base64url: () => base64url2,
  bigint: () => bigint2,
  boolean: () => boolean2,
  catch: () => _catch2,
  check: () => check,
  cidrv4: () => cidrv42,
  cidrv6: () => cidrv62,
  codec: () => codec,
  cuid: () => cuid3,
  cuid2: () => cuid22,
  custom: () => custom,
  date: () => date3,
  describe: () => describe2,
  discriminatedUnion: () => discriminatedUnion,
  e164: () => e1642,
  email: () => email2,
  emoji: () => emoji2,
  enum: () => _enum2,
  exactOptional: () => exactOptional,
  file: () => file,
  float32: () => float32,
  float64: () => float64,
  function: () => _function,
  guid: () => guid2,
  hash: () => hash,
  hex: () => hex2,
  hostname: () => hostname2,
  httpUrl: () => httpUrl,
  instanceof: () => _instanceof,
  int: () => int,
  int32: () => int32,
  int64: () => int64,
  intersection: () => intersection,
  invertCodec: () => invertCodec,
  ipv4: () => ipv42,
  ipv6: () => ipv62,
  json: () => json,
  jwt: () => jwt,
  keyof: () => keyof,
  ksuid: () => ksuid2,
  lazy: () => lazy,
  literal: () => literal,
  looseObject: () => looseObject,
  looseRecord: () => looseRecord,
  mac: () => mac2,
  map: () => map,
  meta: () => meta2,
  nan: () => nan,
  nanoid: () => nanoid2,
  nativeEnum: () => nativeEnum,
  never: () => never,
  nonoptional: () => nonoptional,
  null: () => _null3,
  nullable: () => nullable,
  nullish: () => nullish2,
  number: () => number2,
  object: () => object,
  optional: () => optional,
  partialRecord: () => partialRecord,
  pipe: () => pipe,
  prefault: () => prefault,
  preprocess: () => preprocess,
  promise: () => promise,
  readonly: () => readonly,
  record: () => record,
  refine: () => refine,
  set: () => set,
  strictObject: () => strictObject,
  string: () => string2,
  stringFormat: () => stringFormat,
  stringbool: () => stringbool,
  success: () => success,
  superRefine: () => superRefine,
  symbol: () => symbol,
  templateLiteral: () => templateLiteral,
  transform: () => transform,
  tuple: () => tuple,
  uint32: () => uint32,
  uint64: () => uint64,
  ulid: () => ulid2,
  undefined: () => _undefined3,
  union: () => union,
  unknown: () => unknown,
  url: () => url,
  uuid: () => uuid2,
  uuidv4: () => uuidv4,
  uuidv6: () => uuidv6,
  uuidv7: () => uuidv7,
  void: () => _void2,
  xid: () => xid2,
  xor: () => xor
});

// node_modules/zod/v4/classic/checks.js
var checks_exports2 = {};
__export(checks_exports2, {
  endsWith: () => _endsWith,
  gt: () => _gt,
  gte: () => _gte,
  includes: () => _includes,
  length: () => _length,
  lowercase: () => _lowercase,
  lt: () => _lt,
  lte: () => _lte,
  maxLength: () => _maxLength,
  maxSize: () => _maxSize,
  mime: () => _mime,
  minLength: () => _minLength,
  minSize: () => _minSize,
  multipleOf: () => _multipleOf,
  negative: () => _negative,
  nonnegative: () => _nonnegative,
  nonpositive: () => _nonpositive,
  normalize: () => _normalize,
  overwrite: () => _overwrite,
  positive: () => _positive,
  property: () => _property,
  regex: () => _regex,
  size: () => _size,
  slugify: () => _slugify,
  startsWith: () => _startsWith,
  toLowerCase: () => _toLowerCase,
  toUpperCase: () => _toUpperCase,
  trim: () => _trim,
  uppercase: () => _uppercase
});

// node_modules/zod/v4/classic/iso.js
var iso_exports = {};
__export(iso_exports, {
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  date: () => date2,
  datetime: () => datetime2,
  duration: () => duration2,
  time: () => time2
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
      // enumerable: false,
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
      // enumerable: false,
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
      // enumerable: false,
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
      // enumerable: false,
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
      // enumerable: false,
    }
  });
};
var ZodError = /* @__PURE__ */ $constructor("ZodError", initializer2);
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse2 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode2 = /* @__PURE__ */ _encode(ZodRealError);
var decode2 = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync2 = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync2 = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode2 = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode2 = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync2 = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync2 = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = /* @__PURE__ */ new Set();
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse2(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode2(inst, data, params);
  inst.decode = (data, params) => decode2(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync2(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync2(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode2(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode2(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync2(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync2(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(util_exports.mergeDefs(def2, {
        checks: [
          ...def2.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta3) {
      reg.add(this, meta3);
      return this;
    },
    refine(check2, params) {
      return this.check(refine(check2, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default2(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch2(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => stringProcessor(inst, ctx, json2, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function email2(params) {
  return _email(ZodEmail, params);
}
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function guid2(params) {
  return _guid(ZodGUID, params);
}
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
function uuidv4(params) {
  return _uuidv4(ZodUUID, params);
}
function uuidv6(params) {
  return _uuidv6(ZodUUID, params);
}
function uuidv7(params) {
  return _uuidv7(ZodUUID, params);
}
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function url(params) {
  return _url(ZodURL, params);
}
function httpUrl(params) {
  return _url(ZodURL, {
    protocol: regexes_exports.httpProtocol,
    hostname: regexes_exports.domain,
    ...util_exports.normalizeParams(params)
  });
}
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function emoji2(params) {
  return _emoji2(ZodEmoji, params);
}
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function nanoid2(params) {
  return _nanoid(ZodNanoID, params);
}
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid3(params) {
  return _cuid(ZodCUID, params);
}
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid22(params) {
  return _cuid2(ZodCUID2, params);
}
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ulid2(params) {
  return _ulid(ZodULID, params);
}
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function xid2(params) {
  return _xid(ZodXID, params);
}
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ksuid2(params) {
  return _ksuid(ZodKSUID, params);
}
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv42(params) {
  return _ipv4(ZodIPv4, params);
}
var ZodMAC = /* @__PURE__ */ $constructor("ZodMAC", (inst, def) => {
  $ZodMAC.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function mac2(params) {
  return _mac(ZodMAC, params);
}
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv62(params) {
  return _ipv6(ZodIPv6, params);
}
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv42(params) {
  return _cidrv4(ZodCIDRv4, params);
}
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv62(params) {
  return _cidrv6(ZodCIDRv6, params);
}
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base642(params) {
  return _base64(ZodBase64, params);
}
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base64url2(params) {
  return _base64url(ZodBase64URL, params);
}
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function e1642(params) {
  return _e164(ZodE164, params);
}
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function jwt(params) {
  return _jwt(ZodJWT, params);
}
var ZodCustomStringFormat = /* @__PURE__ */ $constructor("ZodCustomStringFormat", (inst, def) => {
  $ZodCustomStringFormat.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function stringFormat(format, fnOrRegex, _params = {}) {
  return _stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function hostname2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hostname", regexes_exports.hostname, _params);
}
function hex2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hex", regexes_exports.hex, _params);
}
function hash(alg, params) {
  const enc = params?.enc ?? "hex";
  const format = `${alg}_${enc}`;
  const regex = regexes_exports[format];
  if (!regex)
    throw new Error(`Unrecognized hash format: ${format}`);
  return _stringFormat(ZodCustomStringFormat, format, regex, params);
}
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => numberProcessor(inst, ctx, json2, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
function float32(params) {
  return _float32(ZodNumberFormat, params);
}
function float64(params) {
  return _float64(ZodNumberFormat, params);
}
function int32(params) {
  return _int32(ZodNumberFormat, params);
}
function uint32(params) {
  return _uint32(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => booleanProcessor(inst, ctx, json2, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodBigInt = /* @__PURE__ */ $constructor("ZodBigInt", (inst, def) => {
  $ZodBigInt.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => bigintProcessor(inst, ctx, json2, params);
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.positive = (params) => inst.check(_gt(BigInt(0), params));
  inst.negative = (params) => inst.check(_lt(BigInt(0), params));
  inst.nonpositive = (params) => inst.check(_lte(BigInt(0), params));
  inst.nonnegative = (params) => inst.check(_gte(BigInt(0), params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  const bag = inst._zod.bag;
  inst.minValue = bag.minimum ?? null;
  inst.maxValue = bag.maximum ?? null;
  inst.format = bag.format ?? null;
});
function bigint2(params) {
  return _bigint(ZodBigInt, params);
}
var ZodBigIntFormat = /* @__PURE__ */ $constructor("ZodBigIntFormat", (inst, def) => {
  $ZodBigIntFormat.init(inst, def);
  ZodBigInt.init(inst, def);
});
function int64(params) {
  return _int64(ZodBigIntFormat, params);
}
function uint64(params) {
  return _uint64(ZodBigIntFormat, params);
}
var ZodSymbol = /* @__PURE__ */ $constructor("ZodSymbol", (inst, def) => {
  $ZodSymbol.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => symbolProcessor(inst, ctx, json2, params);
});
function symbol(params) {
  return _symbol(ZodSymbol, params);
}
var ZodUndefined = /* @__PURE__ */ $constructor("ZodUndefined", (inst, def) => {
  $ZodUndefined.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => undefinedProcessor(inst, ctx, json2, params);
});
function _undefined3(params) {
  return _undefined2(ZodUndefined, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nullProcessor(inst, ctx, json2, params);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
  $ZodAny.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => anyProcessor(inst, ctx, json2, params);
});
function any() {
  return _any(ZodAny);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unknownProcessor(inst, ctx, json2, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => neverProcessor(inst, ctx, json2, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodVoid = /* @__PURE__ */ $constructor("ZodVoid", (inst, def) => {
  $ZodVoid.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => voidProcessor(inst, ctx, json2, params);
});
function _void2(params) {
  return _void(ZodVoid, params);
}
var ZodDate = /* @__PURE__ */ $constructor("ZodDate", (inst, def) => {
  $ZodDate.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => dateProcessor(inst, ctx, json2, params);
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  const c = inst._zod.bag;
  inst.minDate = c.minimum ? new Date(c.minimum) : null;
  inst.maxDate = c.maximum ? new Date(c.maximum) : null;
});
function date3(params) {
  return _date(ZodDate, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => arrayProcessor(inst, ctx, json2, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
function keyof(schema) {
  const shape = schema._zod.def.shape;
  return _enum2(Object.keys(shape));
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => objectProcessor(inst, ctx, json2, params);
  util_exports.defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum2(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: void 0 });
    },
    extend(incoming) {
      return util_exports.extend(this, incoming);
    },
    safeExtend(incoming) {
      return util_exports.safeExtend(this, incoming);
    },
    merge(other) {
      return util_exports.merge(this, other);
    },
    pick(mask) {
      return util_exports.pick(this, mask);
    },
    omit(mask) {
      return util_exports.omit(this, mask);
    },
    partial(...args) {
      return util_exports.partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return util_exports.required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...util_exports.normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: never(),
    ...util_exports.normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...util_exports.normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...util_exports.normalizeParams(params)
  });
}
var ZodXor = /* @__PURE__ */ $constructor("ZodXor", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodXor.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
  inst.options = def.options;
});
function xor(options, params) {
  return new ZodXor({
    type: "union",
    options,
    inclusive: false,
    ...util_exports.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...util_exports.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => intersectionProcessor(inst, ctx, json2, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => tupleProcessor(inst, ctx, json2, params);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...util_exports.normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => recordProcessor(inst, ctx, json2, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...util_exports.normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  const k = clone(keyType);
  k._zod.values = void 0;
  return new ZodRecord({
    type: "record",
    keyType: k,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
function looseRecord(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    mode: "loose",
    ...util_exports.normalizeParams(params)
  });
}
var ZodMap = /* @__PURE__ */ $constructor("ZodMap", (inst, def) => {
  $ZodMap.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => mapProcessor(inst, ctx, json2, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function map(keyType, valueType, params) {
  return new ZodMap({
    type: "map",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodSet = /* @__PURE__ */ $constructor("ZodSet", (inst, def) => {
  $ZodSet.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => setProcessor(inst, ctx, json2, params);
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function set(valueType, params) {
  return new ZodSet({
    type: "set",
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => enumProcessor(inst, ctx, json2, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum2(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
function nativeEnum(entries, params) {
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => literalProcessor(inst, ctx, json2, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params)
  });
}
var ZodFile = /* @__PURE__ */ $constructor("ZodFile", (inst, def) => {
  $ZodFile.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => fileProcessor(inst, ctx, json2, params);
  inst.min = (size, params) => inst.check(_minSize(size, params));
  inst.max = (size, params) => inst.check(_maxSize(size, params));
  inst.mime = (types, params) => inst.check(_mime(Array.isArray(types) ? types : [types], params));
});
function file(params) {
  return _file(ZodFile, params);
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => transformProcessor(inst, ctx, json2, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nullableProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function nullish2(innerType) {
  return optional(nullable(innerType));
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => defaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default2(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => prefaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nonoptionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodSuccess = /* @__PURE__ */ $constructor("ZodSuccess", (inst, def) => {
  $ZodSuccess.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => successProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function success(innerType) {
  return new ZodSuccess({
    type: "success",
    innerType
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => catchProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch2(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodNaN = /* @__PURE__ */ $constructor("ZodNaN", (inst, def) => {
  $ZodNaN.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nanProcessor(inst, ctx, json2, params);
});
function nan(params) {
  return _nan(ZodNaN, params);
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => pipeProcessor(inst, ctx, json2, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
var ZodCodec = /* @__PURE__ */ $constructor("ZodCodec", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodCodec.init(inst, def);
});
function codec(in_, out, params) {
  return new ZodCodec({
    type: "pipe",
    in: in_,
    out,
    transform: params.decode,
    reverseTransform: params.encode
  });
}
function invertCodec(codec2) {
  const def = codec2._zod.def;
  return new ZodCodec({
    type: "pipe",
    in: def.out,
    out: def.in,
    transform: def.reverseTransform,
    reverseTransform: def.transform
  });
}
var ZodPreprocess = /* @__PURE__ */ $constructor("ZodPreprocess", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodPreprocess.init(inst, def);
});
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => readonlyProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodTemplateLiteral = /* @__PURE__ */ $constructor("ZodTemplateLiteral", (inst, def) => {
  $ZodTemplateLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => templateLiteralProcessor(inst, ctx, json2, params);
});
function templateLiteral(parts, params) {
  return new ZodTemplateLiteral({
    type: "template_literal",
    parts,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => lazyProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
var ZodPromise = /* @__PURE__ */ $constructor("ZodPromise", (inst, def) => {
  $ZodPromise.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => promiseProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function promise(innerType) {
  return new ZodPromise({
    type: "promise",
    innerType
  });
}
var ZodFunction = /* @__PURE__ */ $constructor("ZodFunction", (inst, def) => {
  $ZodFunction.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => functionProcessor(inst, ctx, json2, params);
});
function _function(params) {
  return new ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? tuple(params?.input) : params?.input ?? array(unknown()),
    output: params?.output ?? unknown()
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => customProcessor(inst, ctx, json2, params);
});
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
    // ...util.normalizeParams(params),
  });
  ch._zod.check = fn;
  return ch;
}
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
var describe2 = describe;
var meta2 = meta;
function _instanceof(cls, params = {}) {
  const inst = new ZodCustom({
    type: "custom",
    check: "custom",
    fn: (data) => data instanceof cls,
    abort: true,
    ...util_exports.normalizeParams(params)
  });
  inst._zod.bag.Class = cls;
  inst._zod.check = (payload) => {
    if (!(payload.value instanceof cls)) {
      payload.issues.push({
        code: "invalid_type",
        expected: cls.name,
        input: payload.value,
        inst,
        path: [...inst._zod.def.path ?? []]
      });
    }
  };
  return inst;
}
var stringbool = (...args) => _stringbool({
  Codec: ZodCodec,
  Boolean: ZodBoolean,
  String: ZodString
}, ...args);
function json(params) {
  const jsonSchema = lazy(() => {
    return union([string2(params), number2(), boolean2(), _null3(), array(jsonSchema), record(string2(), jsonSchema)]);
  });
  return jsonSchema;
}
function preprocess(fn, schema) {
  return new ZodPreprocess({
    type: "pipe",
    in: transform(fn),
    out: schema
  });
}

// node_modules/zod/v4/classic/compat.js
var ZodIssueCode = {
  invalid_type: "invalid_type",
  too_big: "too_big",
  too_small: "too_small",
  invalid_format: "invalid_format",
  not_multiple_of: "not_multiple_of",
  unrecognized_keys: "unrecognized_keys",
  invalid_union: "invalid_union",
  invalid_key: "invalid_key",
  invalid_element: "invalid_element",
  invalid_value: "invalid_value",
  custom: "custom"
};
function setErrorMap(map2) {
  config({
    customError: map2
  });
}
function getErrorMap() {
  return config().customError;
}
var ZodFirstPartyTypeKind;
/* @__PURE__ */ (function(ZodFirstPartyTypeKind2) {
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));

// node_modules/zod/v4/classic/from-json-schema.js
var z = {
  ...schemas_exports2,
  ...checks_exports2,
  iso: iso_exports
};
var RECOGNIZED_KEYS = /* @__PURE__ */ new Set([
  // Schema identification
  "$schema",
  "$ref",
  "$defs",
  "definitions",
  // Core schema keywords
  "$id",
  "id",
  "$comment",
  "$anchor",
  "$vocabulary",
  "$dynamicRef",
  "$dynamicAnchor",
  // Type
  "type",
  "enum",
  "const",
  // Composition
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  // Object
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "propertyNames",
  "minProperties",
  "maxProperties",
  // Array
  "items",
  "prefixItems",
  "additionalItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  // String
  "minLength",
  "maxLength",
  "pattern",
  "format",
  // Number
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  // Already handled metadata
  "description",
  "default",
  // Content
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
  // Unsupported (error-throwing)
  "unevaluatedItems",
  "unevaluatedProperties",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "dependentRequired",
  // OpenAPI
  "nullable",
  "readOnly"
]);
function detectVersion(schema, defaultTarget) {
  const $schema = schema.$schema;
  if ($schema === "https://json-schema.org/draft/2020-12/schema") {
    return "draft-2020-12";
  }
  if ($schema === "http://json-schema.org/draft-07/schema#") {
    return "draft-7";
  }
  if ($schema === "http://json-schema.org/draft-04/schema#") {
    return "draft-4";
  }
  return defaultTarget ?? "draft-2020-12";
}
function resolveRef(ref, ctx) {
  if (!ref.startsWith("#")) {
    throw new Error("External $ref is not supported, only local refs (#/...) are allowed");
  }
  const path = ref.slice(1).split("/").filter(Boolean);
  if (path.length === 0) {
    return ctx.rootSchema;
  }
  const defsKey = ctx.version === "draft-2020-12" ? "$defs" : "definitions";
  if (path[0] === defsKey) {
    const key = path[1];
    if (!key || !ctx.defs[key]) {
      throw new Error(`Reference not found: ${ref}`);
    }
    return ctx.defs[key];
  }
  throw new Error(`Reference not found: ${ref}`);
}
function convertBaseSchema(schema, ctx) {
  if (schema.not !== void 0) {
    if (typeof schema.not === "object" && Object.keys(schema.not).length === 0) {
      return z.never();
    }
    throw new Error("not is not supported in Zod (except { not: {} } for never)");
  }
  if (schema.unevaluatedItems !== void 0) {
    throw new Error("unevaluatedItems is not supported");
  }
  if (schema.unevaluatedProperties !== void 0) {
    throw new Error("unevaluatedProperties is not supported");
  }
  if (schema.if !== void 0 || schema.then !== void 0 || schema.else !== void 0) {
    throw new Error("Conditional schemas (if/then/else) are not supported");
  }
  if (schema.dependentSchemas !== void 0 || schema.dependentRequired !== void 0) {
    throw new Error("dependentSchemas and dependentRequired are not supported");
  }
  if (schema.$ref) {
    const refPath = schema.$ref;
    if (ctx.refs.has(refPath)) {
      return ctx.refs.get(refPath);
    }
    if (ctx.processing.has(refPath)) {
      return z.lazy(() => {
        if (!ctx.refs.has(refPath)) {
          throw new Error(`Circular reference not resolved: ${refPath}`);
        }
        return ctx.refs.get(refPath);
      });
    }
    ctx.processing.add(refPath);
    const resolved = resolveRef(refPath, ctx);
    const zodSchema2 = convertSchema(resolved, ctx);
    ctx.refs.set(refPath, zodSchema2);
    ctx.processing.delete(refPath);
    return zodSchema2;
  }
  if (schema.enum !== void 0) {
    const enumValues = schema.enum;
    if (ctx.version === "openapi-3.0" && schema.nullable === true && enumValues.length === 1 && enumValues[0] === null) {
      return z.null();
    }
    if (enumValues.length === 0) {
      return z.never();
    }
    if (enumValues.length === 1) {
      return z.literal(enumValues[0]);
    }
    if (enumValues.every((v) => typeof v === "string")) {
      return z.enum(enumValues);
    }
    const literalSchemas = enumValues.map((v) => z.literal(v));
    if (literalSchemas.length < 2) {
      return literalSchemas[0];
    }
    return z.union([literalSchemas[0], literalSchemas[1], ...literalSchemas.slice(2)]);
  }
  if (schema.const !== void 0) {
    return z.literal(schema.const);
  }
  const type = schema.type;
  if (Array.isArray(type)) {
    const typeSchemas = type.map((t) => {
      const typeSchema = { ...schema, type: t };
      return convertBaseSchema(typeSchema, ctx);
    });
    if (typeSchemas.length === 0) {
      return z.never();
    }
    if (typeSchemas.length === 1) {
      return typeSchemas[0];
    }
    return z.union(typeSchemas);
  }
  if (!type) {
    return z.any();
  }
  let zodSchema;
  switch (type) {
    case "string": {
      let stringSchema = z.string();
      if (schema.format) {
        const format = schema.format;
        if (format === "email") {
          stringSchema = stringSchema.check(z.email());
        } else if (format === "uri" || format === "uri-reference") {
          stringSchema = stringSchema.check(z.url());
        } else if (format === "uuid" || format === "guid") {
          stringSchema = stringSchema.check(z.uuid());
        } else if (format === "date-time") {
          stringSchema = stringSchema.check(z.iso.datetime());
        } else if (format === "date") {
          stringSchema = stringSchema.check(z.iso.date());
        } else if (format === "time") {
          stringSchema = stringSchema.check(z.iso.time());
        } else if (format === "duration") {
          stringSchema = stringSchema.check(z.iso.duration());
        } else if (format === "ipv4") {
          stringSchema = stringSchema.check(z.ipv4());
        } else if (format === "ipv6") {
          stringSchema = stringSchema.check(z.ipv6());
        } else if (format === "mac") {
          stringSchema = stringSchema.check(z.mac());
        } else if (format === "cidr") {
          stringSchema = stringSchema.check(z.cidrv4());
        } else if (format === "cidr-v6") {
          stringSchema = stringSchema.check(z.cidrv6());
        } else if (format === "base64") {
          stringSchema = stringSchema.check(z.base64());
        } else if (format === "base64url") {
          stringSchema = stringSchema.check(z.base64url());
        } else if (format === "e164") {
          stringSchema = stringSchema.check(z.e164());
        } else if (format === "jwt") {
          stringSchema = stringSchema.check(z.jwt());
        } else if (format === "emoji") {
          stringSchema = stringSchema.check(z.emoji());
        } else if (format === "nanoid") {
          stringSchema = stringSchema.check(z.nanoid());
        } else if (format === "cuid") {
          stringSchema = stringSchema.check(z.cuid());
        } else if (format === "cuid2") {
          stringSchema = stringSchema.check(z.cuid2());
        } else if (format === "ulid") {
          stringSchema = stringSchema.check(z.ulid());
        } else if (format === "xid") {
          stringSchema = stringSchema.check(z.xid());
        } else if (format === "ksuid") {
          stringSchema = stringSchema.check(z.ksuid());
        }
      }
      if (typeof schema.minLength === "number") {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (typeof schema.maxLength === "number") {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      zodSchema = stringSchema;
      break;
    }
    case "number":
    case "integer": {
      let numberSchema = type === "integer" ? z.number().int() : z.number();
      if (typeof schema.minimum === "number") {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (typeof schema.maximum === "number") {
        numberSchema = numberSchema.max(schema.maximum);
      }
      if (typeof schema.exclusiveMinimum === "number") {
        numberSchema = numberSchema.gt(schema.exclusiveMinimum);
      } else if (schema.exclusiveMinimum === true && typeof schema.minimum === "number") {
        numberSchema = numberSchema.gt(schema.minimum);
      }
      if (typeof schema.exclusiveMaximum === "number") {
        numberSchema = numberSchema.lt(schema.exclusiveMaximum);
      } else if (schema.exclusiveMaximum === true && typeof schema.maximum === "number") {
        numberSchema = numberSchema.lt(schema.maximum);
      }
      if (typeof schema.multipleOf === "number") {
        numberSchema = numberSchema.multipleOf(schema.multipleOf);
      }
      zodSchema = numberSchema;
      break;
    }
    case "boolean": {
      zodSchema = z.boolean();
      break;
    }
    case "null": {
      zodSchema = z.null();
      break;
    }
    case "object": {
      const shape = {};
      const properties = schema.properties || {};
      const requiredSet = new Set(schema.required || []);
      for (const [key, propSchema] of Object.entries(properties)) {
        const propZodSchema = convertSchema(propSchema, ctx);
        shape[key] = requiredSet.has(key) ? propZodSchema : propZodSchema.optional();
      }
      if (schema.propertyNames) {
        const keySchema = convertSchema(schema.propertyNames, ctx);
        const valueSchema = schema.additionalProperties && typeof schema.additionalProperties === "object" ? convertSchema(schema.additionalProperties, ctx) : z.any();
        if (Object.keys(shape).length === 0) {
          zodSchema = z.record(keySchema, valueSchema);
          break;
        }
        const objectSchema2 = z.object(shape).passthrough();
        const recordSchema = z.looseRecord(keySchema, valueSchema);
        zodSchema = z.intersection(objectSchema2, recordSchema);
        break;
      }
      if (schema.patternProperties) {
        const patternProps = schema.patternProperties;
        const patternKeys = Object.keys(patternProps);
        const looseRecords = [];
        for (const pattern of patternKeys) {
          const patternValue = convertSchema(patternProps[pattern], ctx);
          const keySchema = z.string().regex(new RegExp(pattern));
          looseRecords.push(z.looseRecord(keySchema, patternValue));
        }
        const schemasToIntersect = [];
        if (Object.keys(shape).length > 0) {
          schemasToIntersect.push(z.object(shape).passthrough());
        }
        schemasToIntersect.push(...looseRecords);
        if (schemasToIntersect.length === 0) {
          zodSchema = z.object({}).passthrough();
        } else if (schemasToIntersect.length === 1) {
          zodSchema = schemasToIntersect[0];
        } else {
          let result = z.intersection(schemasToIntersect[0], schemasToIntersect[1]);
          for (let i = 2; i < schemasToIntersect.length; i++) {
            result = z.intersection(result, schemasToIntersect[i]);
          }
          zodSchema = result;
        }
        break;
      }
      const objectSchema = z.object(shape);
      if (schema.additionalProperties === false) {
        zodSchema = objectSchema.strict();
      } else if (typeof schema.additionalProperties === "object") {
        zodSchema = objectSchema.catchall(convertSchema(schema.additionalProperties, ctx));
      } else {
        zodSchema = objectSchema.passthrough();
      }
      break;
    }
    case "array": {
      const prefixItems = schema.prefixItems;
      const items = schema.items;
      if (prefixItems && Array.isArray(prefixItems)) {
        const tupleItems = prefixItems.map((item) => convertSchema(item, ctx));
        const rest = items && typeof items === "object" && !Array.isArray(items) ? convertSchema(items, ctx) : void 0;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (Array.isArray(items)) {
        const tupleItems = items.map((item) => convertSchema(item, ctx));
        const rest = schema.additionalItems && typeof schema.additionalItems === "object" ? convertSchema(schema.additionalItems, ctx) : void 0;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (items !== void 0) {
        const element = convertSchema(items, ctx);
        let arraySchema = z.array(element);
        if (typeof schema.minItems === "number") {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (typeof schema.maxItems === "number") {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        zodSchema = arraySchema;
      } else {
        zodSchema = z.array(z.any());
      }
      break;
    }
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
  return zodSchema;
}
function convertSchema(schema, ctx) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let baseSchema = convertBaseSchema(schema, ctx);
  const hasExplicitType = schema.type || schema.enum !== void 0 || schema.const !== void 0;
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.map((s) => convertSchema(s, ctx));
    const anyOfUnion = z.union(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, anyOfUnion) : anyOfUnion;
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const options = schema.oneOf.map((s) => convertSchema(s, ctx));
    const oneOfUnion = z.xor(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, oneOfUnion) : oneOfUnion;
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    if (schema.allOf.length === 0) {
      baseSchema = hasExplicitType ? baseSchema : z.any();
    } else {
      let result = hasExplicitType ? baseSchema : convertSchema(schema.allOf[0], ctx);
      const startIdx = hasExplicitType ? 0 : 1;
      for (let i = startIdx; i < schema.allOf.length; i++) {
        result = z.intersection(result, convertSchema(schema.allOf[i], ctx));
      }
      baseSchema = result;
    }
  }
  if (schema.nullable === true && ctx.version === "openapi-3.0") {
    baseSchema = z.nullable(baseSchema);
  }
  if (schema.readOnly === true) {
    baseSchema = z.readonly(baseSchema);
  }
  if (schema.default !== void 0) {
    baseSchema = baseSchema.default(schema.default);
  }
  const extraMeta = {};
  const coreMetadataKeys = ["$id", "id", "$comment", "$anchor", "$vocabulary", "$dynamicRef", "$dynamicAnchor"];
  for (const key of coreMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  const contentMetadataKeys = ["contentEncoding", "contentMediaType", "contentSchema"];
  for (const key of contentMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  for (const key of Object.keys(schema)) {
    if (!RECOGNIZED_KEYS.has(key)) {
      extraMeta[key] = schema[key];
    }
  }
  if (Object.keys(extraMeta).length > 0) {
    ctx.registry.add(baseSchema, extraMeta);
  }
  if (schema.description) {
    baseSchema = baseSchema.describe(schema.description);
  }
  return baseSchema;
}
function fromJSONSchema(schema, params) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let normalized;
  try {
    normalized = JSON.parse(JSON.stringify(schema));
  } catch {
    throw new Error("fromJSONSchema input is not valid JSON (possibly cyclic); use $defs/$ref for recursive schemas");
  }
  const version2 = detectVersion(normalized, params?.defaultTarget);
  const defs = normalized.$defs || normalized.definitions || {};
  const ctx = {
    version: version2,
    defs,
    refs: /* @__PURE__ */ new Map(),
    processing: /* @__PURE__ */ new Set(),
    rootSchema: normalized,
    registry: params?.registry ?? globalRegistry
  };
  return convertSchema(normalized, ctx);
}

// node_modules/zod/v4/classic/coerce.js
var coerce_exports = {};
__export(coerce_exports, {
  bigint: () => bigint3,
  boolean: () => boolean3,
  date: () => date4,
  number: () => number3,
  string: () => string3
});
function string3(params) {
  return _coercedString(ZodString, params);
}
function number3(params) {
  return _coercedNumber(ZodNumber, params);
}
function boolean3(params) {
  return _coercedBoolean(ZodBoolean, params);
}
function bigint3(params) {
  return _coercedBigint(ZodBigInt, params);
}
function date4(params) {
  return _coercedDate(ZodDate, params);
}

// node_modules/zod/v4/classic/external.js
config(en_default());

// vendor/understand-anything/core/languages/types.ts
var TreeSitterConfigSchema = external_exports.object({
  wasmPackage: external_exports.string(),
  wasmFile: external_exports.string()
});
var FilePatternConfigSchema = external_exports.object({
  entryPoints: external_exports.array(external_exports.string()),
  barrels: external_exports.array(external_exports.string()),
  tests: external_exports.array(external_exports.string()),
  config: external_exports.array(external_exports.string())
});
var LanguageConfigSchema = external_exports.object({
  id: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  extensions: external_exports.array(external_exports.string()),
  filenames: external_exports.array(external_exports.string()).optional(),
  treeSitter: TreeSitterConfigSchema.optional(),
  concepts: external_exports.array(external_exports.string()),
  filePatterns: FilePatternConfigSchema
});
var StrictLanguageConfigSchema = LanguageConfigSchema.refine(
  (c) => c.extensions.length > 0 || c.filenames !== void 0 && c.filenames.length > 0,
  { message: "LanguageConfig must have at least one extension or filename for detection" }
);
var FrameworkConfigSchema = external_exports.object({
  id: external_exports.string().min(1),
  displayName: external_exports.string().min(1),
  languages: external_exports.array(external_exports.string().min(1)).min(1),
  detectionKeywords: external_exports.array(external_exports.string()).min(1),
  manifestFiles: external_exports.array(external_exports.string()).min(1),
  promptSnippetPath: external_exports.string().min(1),
  entryPoints: external_exports.array(external_exports.string()).optional(),
  layerHints: external_exports.record(external_exports.string(), external_exports.string()).optional()
});

// vendor/understand-anything/core/languages/configs/typescript.ts
var typescriptConfig = {
  id: "typescript",
  displayName: "TypeScript",
  extensions: [".ts", ".tsx"],
  treeSitter: {
    wasmPackage: "tree-sitter-typescript",
    wasmFile: "tree-sitter-typescript.wasm"
  },
  concepts: [
    "generics",
    "type guards",
    "discriminated unions",
    "utility types",
    "decorators",
    "enums",
    "interfaces",
    "type inference",
    "mapped types",
    "conditional types",
    "template literal types"
  ],
  filePatterns: {
    entryPoints: ["src/index.ts", "src/main.ts", "src/App.tsx", "index.ts"],
    barrels: ["index.ts"],
    tests: ["*.test.ts", "*.spec.ts", "*.test.tsx"],
    config: ["tsconfig.json"]
  }
};

// vendor/understand-anything/core/languages/configs/javascript.ts
var javascriptConfig = {
  id: "javascript",
  displayName: "JavaScript",
  extensions: [".js", ".jsx", ".mjs", ".cjs"],
  treeSitter: {
    wasmPackage: "tree-sitter-javascript",
    wasmFile: "tree-sitter-javascript.wasm"
  },
  concepts: [
    "closures",
    "prototypes",
    "promises",
    "async/await",
    "event loop",
    "destructuring",
    "spread operator",
    "proxies",
    "generators",
    "modules (ESM/CJS)"
  ],
  filePatterns: {
    entryPoints: ["index.js", "src/index.js", "main.js"],
    barrels: ["index.js"],
    tests: ["*.test.js", "*.spec.js"],
    config: ["package.json", "jsconfig.json"]
  }
};

// vendor/understand-anything/core/languages/configs/python.ts
var pythonConfig = {
  id: "python",
  displayName: "Python",
  extensions: [".py", ".pyi"],
  treeSitter: {
    wasmPackage: "tree-sitter-python",
    wasmFile: "tree-sitter-python.wasm"
  },
  concepts: [
    "decorators",
    "list comprehensions",
    "generators",
    "context managers",
    "type hints",
    "dunder methods",
    "metaclasses",
    "dataclasses",
    "async/await",
    "descriptors",
    "protocols"
  ],
  filePatterns: {
    entryPoints: [
      "main.py",
      "manage.py",
      "app.py",
      "wsgi.py",
      "asgi.py",
      "run.py",
      "__main__.py"
    ],
    barrels: ["__init__.py"],
    tests: ["test_*.py", "*_test.py", "conftest.py"],
    config: [
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "requirements.txt",
      "Pipfile"
    ]
  }
};

// vendor/understand-anything/core/languages/configs/go.ts
var goConfig = {
  id: "go",
  displayName: "Go",
  extensions: [".go"],
  treeSitter: {
    wasmPackage: "tree-sitter-go",
    wasmFile: "tree-sitter-go.wasm"
  },
  concepts: [
    "goroutines",
    "channels",
    "interfaces",
    "struct embedding",
    "error handling patterns",
    "defer/panic/recover",
    "slices",
    "pointers",
    "concurrency patterns"
  ],
  filePatterns: {
    entryPoints: ["main.go", "cmd/*/main.go"],
    barrels: [],
    tests: ["*_test.go"],
    config: ["go.mod", "go.sum"]
  }
};

// vendor/understand-anything/core/languages/configs/rust.ts
var rustConfig = {
  id: "rust",
  displayName: "Rust",
  extensions: [".rs"],
  treeSitter: {
    wasmPackage: "tree-sitter-rust",
    wasmFile: "tree-sitter-rust.wasm"
  },
  concepts: [
    "ownership",
    "borrowing",
    "lifetimes",
    "traits",
    "pattern matching",
    "enums with data",
    "error handling (Result/Option)",
    "macros",
    "async/await",
    "unsafe blocks",
    "generics",
    "closures"
  ],
  filePatterns: {
    entryPoints: ["src/main.rs", "src/lib.rs"],
    barrels: ["mod.rs", "lib.rs"],
    tests: ["tests/*.rs"],
    config: ["Cargo.toml"]
  }
};

// vendor/understand-anything/core/languages/configs/java.ts
var javaConfig = {
  id: "java",
  displayName: "Java",
  extensions: [".java"],
  treeSitter: {
    wasmPackage: "tree-sitter-java",
    wasmFile: "tree-sitter-java.wasm"
  },
  concepts: [
    "generics",
    "annotations",
    "interfaces",
    "abstract classes",
    "streams API",
    "lambdas",
    "sealed classes",
    "records",
    "dependency injection",
    "checked exceptions"
  ],
  filePatterns: {
    entryPoints: [
      "**/Application.java",
      "**/Main.java",
      "src/main/java/**/App.java"
    ],
    barrels: [],
    tests: ["*Test.java", "*Tests.java", "*IT.java"],
    config: ["pom.xml", "build.gradle", "build.gradle.kts"]
  }
};

// vendor/understand-anything/core/languages/configs/ruby.ts
var rubyConfig = {
  id: "ruby",
  displayName: "Ruby",
  extensions: [".rb", ".rake"],
  treeSitter: {
    wasmPackage: "tree-sitter-ruby",
    wasmFile: "tree-sitter-ruby.wasm"
  },
  concepts: [
    "blocks and procs",
    "mixins",
    "metaprogramming",
    "duck typing",
    "DSLs",
    "monkey patching",
    "symbols",
    "method_missing",
    "open classes"
  ],
  filePatterns: {
    entryPoints: ["config.ru", "app.rb"],
    barrels: [],
    tests: ["*_test.rb", "*_spec.rb", "spec_helper.rb"],
    config: ["Gemfile", "Rakefile"]
  }
};

// vendor/understand-anything/core/languages/configs/php.ts
var phpConfig = {
  id: "php",
  displayName: "PHP",
  extensions: [".php"],
  treeSitter: {
    wasmPackage: "tree-sitter-php",
    wasmFile: "tree-sitter-php.wasm"
  },
  concepts: [
    "namespaces",
    "traits",
    "type declarations",
    "attributes",
    "enums",
    "fibers",
    "closures",
    "magic methods",
    "dependency injection",
    "middleware"
  ],
  filePatterns: {
    entryPoints: ["index.php", "public/index.php", "artisan"],
    barrels: [],
    tests: ["*Test.php", "tests/**/*.php"],
    config: ["composer.json", "php.ini"]
  }
};

// vendor/understand-anything/core/languages/configs/kotlin.ts
var kotlinConfig = {
  id: "kotlin",
  displayName: "Kotlin",
  extensions: [".kt", ".kts"],
  treeSitter: {
    wasmPackage: "@tree-sitter-grammars/tree-sitter-kotlin",
    wasmFile: "tree-sitter-kotlin.wasm"
  },
  concepts: [
    "coroutines",
    "data classes",
    "sealed classes",
    "extension functions",
    "null safety",
    "delegation",
    "DSL builders",
    "inline functions",
    "companion objects",
    "flow"
  ],
  filePatterns: {
    entryPoints: ["**/Application.kt", "**/Main.kt"],
    barrels: [],
    tests: ["*Test.kt", "*Tests.kt"],
    config: ["build.gradle.kts", "build.gradle"]
  }
};

// vendor/understand-anything/core/languages/configs/scala.ts
var scalaConfig = {
  id: "scala",
  displayName: "Scala",
  extensions: [".scala", ".sc"],
  treeSitter: {
    wasmPackage: "tree-sitter-scala",
    wasmFile: "tree-sitter-scala.wasm"
  },
  concepts: [
    "case classes",
    "pattern matching",
    "traits",
    "implicits / given instances",
    "type classes",
    "higher-kinded types",
    "for-comprehensions",
    "effect systems (Cats Effect, ZIO)",
    "companion objects",
    "sealed hierarchies (ADTs)"
  ],
  filePatterns: {
    entryPoints: ["**/Main.scala", "**/App.scala", "**/*Main.scala", "**/*App.scala"],
    barrels: ["**/package.scala"],
    tests: ["*Spec.scala", "*Suite.scala", "*Test.scala", "*Tests.scala"],
    config: ["build.sbt", "build.sc", "build.mill", "project/build.properties"]
  }
};

// vendor/understand-anything/core/languages/configs/c.ts
var cConfig = {
  id: "c",
  displayName: "C",
  extensions: [".c", ".h"],
  treeSitter: {
    wasmPackage: "tree-sitter-cpp",
    wasmFile: "tree-sitter-cpp.wasm"
  },
  concepts: [
    "pointers",
    "manual memory management",
    "structs",
    "unions",
    "function pointers",
    "preprocessor macros",
    "header files",
    "static vs dynamic linking"
  ],
  filePatterns: {
    entryPoints: ["main.c", "src/main.c"],
    barrels: [],
    tests: ["*_test.c", "test_*.c"],
    config: ["Makefile", "CMakeLists.txt", "meson.build"]
  }
};

// vendor/understand-anything/core/languages/configs/cpp.ts
var cppConfig = {
  id: "cpp",
  displayName: "C++",
  extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hxx"],
  treeSitter: {
    wasmPackage: "tree-sitter-cpp",
    wasmFile: "tree-sitter-cpp.wasm"
  },
  concepts: [
    "templates",
    "RAII",
    "smart pointers",
    "move semantics",
    "operator overloading",
    "virtual functions",
    "namespaces",
    "constexpr",
    "lambda expressions",
    "STL containers"
  ],
  filePatterns: {
    entryPoints: ["main.cpp", "src/main.cpp"],
    barrels: [],
    tests: ["*_test.cpp", "*_test.cc", "test_*.cpp"],
    config: ["CMakeLists.txt", "Makefile", "meson.build"]
  }
};

// vendor/understand-anything/core/languages/configs/csharp.ts
var csharpConfig = {
  id: "csharp",
  displayName: "C#",
  extensions: [".cs"],
  treeSitter: {
    wasmPackage: "tree-sitter-c-sharp",
    wasmFile: "tree-sitter-c_sharp.wasm"
  },
  concepts: [
    "LINQ",
    "async/await",
    "generics",
    "properties",
    "delegates and events",
    "attributes",
    "nullable reference types",
    "pattern matching",
    "records",
    "dependency injection"
  ],
  filePatterns: {
    entryPoints: ["Program.cs", "**/Program.cs"],
    barrels: [],
    tests: ["*Tests.cs", "*Test.cs"],
    config: ["*.csproj", "*.sln"]
  }
};

// vendor/understand-anything/core/languages/configs/lua.ts
var luaConfig = {
  id: "lua",
  displayName: "Lua",
  extensions: [".lua"],
  concepts: [
    "tables",
    "metatables",
    "coroutines",
    "closures",
    "prototype-based OOP",
    "varargs",
    "weak references",
    "environments"
  ],
  filePatterns: {
    entryPoints: ["main.lua", "init.lua"],
    barrels: [],
    tests: ["*_test.lua", "test_*.lua", "*_spec.lua"],
    config: [".luacheckrc", "rockspec"]
  }
};

// vendor/understand-anything/core/languages/configs/markdown.ts
var markdownConfig = {
  id: "markdown",
  displayName: "Markdown",
  extensions: [".md", ".mdx"],
  concepts: ["headings", "links", "code blocks", "front matter", "lists", "tables", "images"],
  filePatterns: {
    entryPoints: ["README.md"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/yaml.ts
var yamlConfig = {
  id: "yaml",
  displayName: "YAML",
  extensions: [".yaml", ".yml"],
  concepts: ["mappings", "sequences", "anchors", "aliases", "multi-document", "tags"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: ["*.yaml", "*.yml"]
  }
};

// vendor/understand-anything/core/languages/configs/json-config.ts
var jsonConfigConfig = {
  id: "json",
  displayName: "JSON",
  extensions: [".json", ".jsonc"],
  concepts: ["objects", "arrays", "nesting", "schema references", "comments (JSONC)"],
  filePatterns: {
    entryPoints: ["package.json"],
    barrels: [],
    tests: [],
    config: ["tsconfig.json", "package.json", ".eslintrc.json"]
  }
};

// vendor/understand-anything/core/languages/configs/toml.ts
var tomlConfig = {
  id: "toml",
  displayName: "TOML",
  extensions: [".toml"],
  concepts: ["tables", "inline tables", "arrays of tables", "key-value pairs", "dotted keys"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: ["Cargo.toml", "pyproject.toml", "netlify.toml"]
  }
};

// vendor/understand-anything/core/languages/configs/env.ts
var envConfig = {
  id: "env",
  displayName: "Environment Variables",
  extensions: [".env"],
  filenames: [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.example"],
  concepts: ["key-value pairs", "variable interpolation", "secrets", "environment-specific config"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: [".env", ".env.*"]
  }
};

// vendor/understand-anything/core/languages/configs/xml.ts
var xmlConfig = {
  id: "xml",
  displayName: "XML",
  extensions: [".xml", ".xsl", ".xsd", ".svg", ".plist"],
  concepts: ["elements", "attributes", "namespaces", "DTD", "XPath", "XSLT", "schemas"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: ["pom.xml", "web.xml", "AndroidManifest.xml"]
  }
};

// vendor/understand-anything/core/languages/configs/dockerfile.ts
var dockerfileConfig = {
  id: "dockerfile",
  displayName: "Dockerfile",
  extensions: [],
  filenames: ["Dockerfile", "Dockerfile.dev", "Dockerfile.prod", "Dockerfile.test"],
  concepts: ["multi-stage builds", "layers", "base images", "COPY/ADD", "EXPOSE", "ENTRYPOINT", "CMD", "ARG", "ENV"],
  filePatterns: {
    entryPoints: ["Dockerfile"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/sql.ts
var sqlConfig = {
  id: "sql",
  displayName: "SQL",
  extensions: [".sql"],
  concepts: ["tables", "columns", "indexes", "foreign keys", "views", "stored procedures", "triggers", "migrations"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/graphql.ts
var graphqlConfig = {
  id: "graphql",
  displayName: "GraphQL",
  extensions: [".graphql", ".gql"],
  concepts: ["types", "queries", "mutations", "subscriptions", "resolvers", "directives", "fragments", "schema"],
  filePatterns: {
    entryPoints: ["schema.graphql"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/protobuf.ts
var protobufConfig = {
  id: "protobuf",
  displayName: "Protocol Buffers",
  extensions: [".proto"],
  concepts: ["messages", "services", "enums", "oneof", "repeated fields", "maps", "packages", "imports"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/terraform.ts
var terraformConfig = {
  id: "terraform",
  displayName: "Terraform",
  extensions: [".tf", ".tfvars"],
  concepts: ["resources", "data sources", "variables", "outputs", "modules", "providers", "state", "workspaces"],
  filePatterns: {
    entryPoints: ["main.tf"],
    barrels: [],
    tests: [],
    config: ["terraform.tfvars", "variables.tf"]
  }
};

// vendor/understand-anything/core/languages/configs/github-actions.ts
var githubActionsConfig = {
  id: "github-actions",
  displayName: "GitHub Actions",
  extensions: [],
  concepts: ["workflows", "jobs", "steps", "actions", "triggers", "secrets", "matrix strategy", "artifacts"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: [".github/workflows/*.yml"]
  }
};

// vendor/understand-anything/core/languages/configs/makefile.ts
var makefileConfig = {
  id: "makefile",
  displayName: "Makefile",
  extensions: [".mk"],
  filenames: ["Makefile", "GNUmakefile", "makefile"],
  concepts: ["targets", "dependencies", "recipes", "variables", "pattern rules", "phony targets", "includes"],
  filePatterns: {
    entryPoints: ["Makefile"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/shell.ts
var shellConfig = {
  id: "shell",
  displayName: "Shell Script",
  extensions: [".sh", ".bash", ".zsh"],
  concepts: ["variables", "functions", "conditionals", "loops", "pipes", "redirection", "subshells", "exit codes"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: [".bashrc", ".zshrc", ".profile"]
  }
};

// vendor/understand-anything/core/languages/configs/html.ts
var htmlConfig = {
  id: "html",
  displayName: "HTML",
  extensions: [".html", ".htm"],
  concepts: ["elements", "attributes", "semantic tags", "forms", "meta tags", "scripts", "stylesheets", "accessibility"],
  filePatterns: {
    entryPoints: ["index.html"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/css.ts
var cssConfig = {
  id: "css",
  displayName: "CSS",
  extensions: [".css", ".scss", ".less"],
  concepts: ["selectors", "properties", "media queries", "flexbox", "grid", "variables", "animations", "specificity"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/openapi.ts
var openapiConfig = {
  id: "openapi",
  displayName: "OpenAPI",
  extensions: [],
  filenames: ["openapi.yaml", "openapi.json", "swagger.yaml", "swagger.json"],
  concepts: ["paths", "operations", "schemas", "parameters", "responses", "security schemes", "tags", "servers"],
  filePatterns: {
    entryPoints: ["openapi.yaml", "swagger.yaml"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/kubernetes.ts
var kubernetesConfig = {
  id: "kubernetes",
  displayName: "Kubernetes",
  extensions: [],
  concepts: ["deployments", "services", "pods", "configmaps", "secrets", "ingress", "volumes", "namespaces"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: ["k8s/*.yaml", "kubernetes/*.yaml"]
  }
};

// vendor/understand-anything/core/languages/configs/docker-compose.ts
var dockerComposeConfig = {
  id: "docker-compose",
  displayName: "Docker Compose",
  extensions: [],
  filenames: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"],
  concepts: ["services", "networks", "volumes", "ports", "environment", "depends_on", "build context", "healthchecks"],
  filePatterns: {
    entryPoints: ["docker-compose.yml", "compose.yml"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/json-schema.ts
var jsonSchemaConfig = {
  id: "json-schema",
  displayName: "JSON Schema",
  extensions: [],
  concepts: ["types", "properties", "required fields", "$ref", "$defs", "allOf/anyOf/oneOf", "patterns", "validation"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/csv.ts
var csvConfig = {
  id: "csv",
  displayName: "CSV",
  extensions: [".csv", ".tsv"],
  concepts: ["headers", "rows", "delimiters", "quoting", "escaping"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/restructuredtext.ts
var restructuredtextConfig = {
  id: "restructuredtext",
  displayName: "reStructuredText",
  extensions: [".rst"],
  concepts: ["headings", "directives", "roles", "cross-references", "toctree", "code blocks", "admonitions"],
  filePatterns: {
    entryPoints: ["index.rst"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/powershell.ts
var powershellConfig = {
  id: "powershell",
  displayName: "PowerShell",
  extensions: [".ps1", ".psm1", ".psd1"],
  concepts: ["cmdlets", "pipelines", "modules", "functions", "parameters", "variables", "error handling"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/batch.ts
var batchConfig = {
  id: "batch",
  displayName: "Batch Script",
  extensions: [".bat", ".cmd"],
  concepts: ["commands", "variables", "labels", "goto", "call", "echo", "set", "for loops", "if conditions"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/jenkinsfile.ts
var jenkinsfileConfig = {
  id: "jenkinsfile",
  displayName: "Jenkinsfile",
  extensions: [],
  filenames: ["Jenkinsfile"],
  concepts: ["pipeline", "stages", "steps", "agents", "environment", "post actions", "parallel execution", "shared libraries"],
  filePatterns: {
    entryPoints: ["Jenkinsfile"],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/plaintext.ts
var plaintextConfig = {
  id: "plaintext",
  displayName: "Plain Text",
  extensions: [".txt", ".text"],
  concepts: ["paragraphs", "lists", "sections"],
  filePatterns: {
    entryPoints: [],
    barrels: [],
    tests: [],
    config: []
  }
};

// vendor/understand-anything/core/languages/configs/index.ts
var builtinLanguageConfigs = [
  // Code languages
  typescriptConfig,
  javascriptConfig,
  pythonConfig,
  goConfig,
  rustConfig,
  javaConfig,
  rubyConfig,
  phpConfig,
  kotlinConfig,
  scalaConfig,
  luaConfig,
  cConfig,
  cppConfig,
  csharpConfig,
  // Non-code languages
  markdownConfig,
  yamlConfig,
  jsonConfigConfig,
  tomlConfig,
  envConfig,
  xmlConfig,
  dockerfileConfig,
  sqlConfig,
  graphqlConfig,
  protobufConfig,
  terraformConfig,
  githubActionsConfig,
  makefileConfig,
  shellConfig,
  htmlConfig,
  cssConfig,
  openapiConfig,
  kubernetesConfig,
  dockerComposeConfig,
  jsonSchemaConfig,
  csvConfig,
  restructuredtextConfig,
  powershellConfig,
  batchConfig,
  jenkinsfileConfig,
  plaintextConfig
];

// vendor/understand-anything/core/languages/language-registry.ts
var LanguageRegistry = class _LanguageRegistry {
  byId = /* @__PURE__ */ new Map();
  byExtension = /* @__PURE__ */ new Map();
  byFilename = /* @__PURE__ */ new Map();
  register(config2) {
    const parsed = LanguageConfigSchema.parse(config2);
    this.byId.set(parsed.id, parsed);
    for (const ext of parsed.extensions) {
      const key = ext.startsWith(".") ? ext : `.${ext}`;
      this.byExtension.set(key, parsed);
    }
    if (parsed.filenames) {
      for (const filename of parsed.filenames) {
        this.byFilename.set(filename.toLowerCase(), parsed);
      }
    }
  }
  getById(id) {
    return this.byId.get(id) ?? null;
  }
  getByExtension(ext) {
    const key = (ext.startsWith(".") ? ext : `.${ext}`).toLowerCase();
    return this.byExtension.get(key) ?? null;
  }
  getForFile(filePath) {
    const basename = filePath.split("/").pop() ?? filePath;
    const filenameMatch = this.byFilename.get(basename.toLowerCase());
    if (filenameMatch) return filenameMatch;
    const lastDot = filePath.lastIndexOf(".");
    if (lastDot === -1) return null;
    const ext = filePath.slice(lastDot).toLowerCase();
    return this.getByExtension(ext);
  }
  getAllLanguages() {
    return [...this.byId.values()];
  }
  /**
   * Create a registry pre-populated with all built-in language configs.
   */
  static createDefault() {
    const registry2 = new _LanguageRegistry();
    for (const config2 of builtinLanguageConfigs) {
      registry2.register(config2);
    }
    return registry2;
  }
};

// vendor/understand-anything/core/analyzer/graph-builder.ts
var KIND_TO_NODE_TYPE = {
  table: "table",
  view: "table",
  index: "table",
  message: "schema",
  type: "schema",
  enum: "schema",
  resource: "resource",
  module: "resource",
  service: "service",
  deployment: "service",
  job: "pipeline",
  stage: "pipeline",
  target: "pipeline",
  route: "endpoint",
  query: "endpoint",
  mutation: "endpoint",
  variable: "config",
  output: "config"
};
var GraphBuilder = class _GraphBuilder {
  nodes = [];
  edges = [];
  languages = /* @__PURE__ */ new Set();
  nodeIds = /* @__PURE__ */ new Set();
  edgeKeys = /* @__PURE__ */ new Set();
  projectName;
  gitHash;
  languageRegistry;
  constructor(projectName, gitHash, languageRegistry) {
    this.projectName = projectName;
    this.gitHash = gitHash;
    this.languageRegistry = languageRegistry ?? LanguageRegistry.createDefault();
  }
  detectLanguage(filePath) {
    return this.languageRegistry.getForFile(filePath)?.id ?? "unknown";
  }
  static basename(filePath) {
    return filePath.split("/").pop() ?? filePath;
  }
  addFile(filePath, meta3) {
    const lang = this.detectLanguage(filePath);
    if (lang !== "unknown") {
      this.languages.add(lang);
    }
    const name = _GraphBuilder.basename(filePath);
    const id = `file:${filePath}`;
    this.nodeIds.add(id);
    this.nodes.push({
      id,
      type: "file",
      name,
      filePath,
      summary: meta3.summary,
      tags: meta3.tags,
      complexity: meta3.complexity
    });
  }
  addFileWithAnalysis(filePath, analysis, meta3) {
    const lang = this.detectLanguage(filePath);
    if (lang !== "unknown") {
      this.languages.add(lang);
    }
    const fileName = _GraphBuilder.basename(filePath);
    const fileId = `file:${filePath}`;
    this.nodeIds.add(fileId);
    this.nodes.push({
      id: fileId,
      type: "file",
      name: fileName,
      filePath,
      summary: meta3.fileSummary,
      tags: meta3.tags,
      complexity: meta3.complexity
    });
    for (const fn of analysis.functions) {
      const funcId = `function:${filePath}:${fn.name}`;
      this.nodeIds.add(funcId);
      this.nodes.push({
        id: funcId,
        type: "function",
        name: fn.name,
        filePath,
        lineRange: fn.lineRange,
        summary: meta3.summaries[fn.name] ?? "",
        tags: [],
        complexity: meta3.complexity
      });
      this.edges.push({
        source: fileId,
        target: funcId,
        type: "contains",
        direction: "forward",
        weight: 1
      });
    }
    for (const cls of analysis.classes) {
      const classId = `class:${filePath}:${cls.name}`;
      this.nodeIds.add(classId);
      this.nodes.push({
        id: classId,
        type: "class",
        name: cls.name,
        filePath,
        lineRange: cls.lineRange,
        summary: meta3.summaries[cls.name] ?? "",
        tags: [],
        complexity: meta3.complexity
      });
      this.edges.push({
        source: fileId,
        target: classId,
        type: "contains",
        direction: "forward",
        weight: 1
      });
    }
  }
  addImportEdge(fromFile, toFile) {
    const key = `imports|file:${fromFile}|file:${toFile}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.edges.push({
      source: `file:${fromFile}`,
      target: `file:${toFile}`,
      type: "imports",
      direction: "forward",
      weight: 0.7
    });
  }
  addCallEdge(callerFile, callerFunc, calleeFile, calleeFunc) {
    const key = `calls|function:${callerFile}:${callerFunc}|function:${calleeFile}:${calleeFunc}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.edges.push({
      source: `function:${callerFile}:${callerFunc}`,
      target: `function:${calleeFile}:${calleeFunc}`,
      type: "calls",
      direction: "forward",
      weight: 0.8
    });
  }
  addNonCodeFile(filePath, meta3) {
    const lang = this.detectLanguage(filePath);
    if (lang !== "unknown") this.languages.add(lang);
    const name = _GraphBuilder.basename(filePath);
    const id = `${meta3.nodeType ?? "file"}:${filePath}`;
    this.nodeIds.add(id);
    this.nodes.push({
      id,
      type: meta3.nodeType,
      name,
      filePath,
      summary: meta3.summary,
      tags: meta3.tags,
      complexity: meta3.complexity
    });
    return id;
  }
  addNonCodeFileWithAnalysis(filePath, meta3) {
    const fileId = this.addNonCodeFile(filePath, meta3);
    for (const def of meta3.definitions ?? []) {
      this.addChildNode({
        id: `${def.kind}:${filePath}:${def.name}`,
        type: this.mapKindToNodeType(def.kind),
        name: def.name,
        filePath,
        lineRange: def.lineRange,
        summary: `${def.kind}: ${def.name} (${def.fields.length} fields)`,
        tags: [],
        complexity: meta3.complexity
      }, fileId);
    }
    for (const svc of meta3.services ?? []) {
      this.addChildNode({
        id: `service:${filePath}:${svc.name}`,
        type: "service",
        name: svc.name,
        filePath,
        summary: `Service ${svc.name}${svc.image ? ` (image: ${svc.image})` : ""}`,
        tags: [],
        complexity: meta3.complexity
      }, fileId);
    }
    for (const ep of meta3.endpoints ?? []) {
      const name = `${ep.method ?? ""} ${ep.path}`.trim();
      this.addChildNode({
        id: `endpoint:${filePath}:${ep.path}`,
        type: "endpoint",
        name,
        filePath,
        lineRange: ep.lineRange,
        summary: `Endpoint: ${name}`,
        tags: [],
        complexity: meta3.complexity
      }, fileId);
    }
    for (const step of meta3.steps ?? []) {
      this.addChildNode({
        id: `step:${filePath}:${step.name}`,
        type: "pipeline",
        name: step.name,
        filePath,
        lineRange: step.lineRange,
        summary: `Step: ${step.name}`,
        tags: [],
        complexity: meta3.complexity
      }, fileId);
    }
    for (const res of meta3.resources ?? []) {
      this.addChildNode({
        id: `resource:${filePath}:${res.name}`,
        type: "resource",
        name: res.name,
        filePath,
        lineRange: res.lineRange,
        summary: `Resource: ${res.name} (${res.kind})`,
        tags: [],
        complexity: meta3.complexity
      }, fileId);
    }
  }
  addChildNode(node, parentId) {
    if (this.nodeIds.has(node.id)) {
      console.warn(`[GraphBuilder] Duplicate node ID "${node.id}" \u2014 skipping`);
      return;
    }
    this.nodeIds.add(node.id);
    this.nodes.push(node);
    this.edges.push({ source: parentId, target: node.id, type: "contains", direction: "forward", weight: 1 });
  }
  mapKindToNodeType(kind) {
    const mapped = KIND_TO_NODE_TYPE[kind];
    if (!mapped) {
      console.warn(`[GraphBuilder] Unknown definition kind "${kind}" \u2014 falling back to "concept" node type`);
    }
    return mapped ?? "concept";
  }
  build() {
    return {
      version: "1.0.0",
      project: {
        name: this.projectName,
        languages: [...this.languages].sort((a, b) => a.localeCompare(b)),
        frameworks: [],
        description: "",
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString(),
        gitCommitHash: this.gitHash
      },
      nodes: [...this.nodes],
      edges: [...this.edges],
      layers: [],
      tour: []
    };
  }
};

// vendor/understand-anything/core/analyzer/layer-detector.ts
var LAYER_PATTERNS = [
  {
    patterns: ["routes", "controller", "handler", "endpoint", "api"],
    layerName: "API Layer",
    description: "HTTP endpoints, route handlers, and API controllers"
  },
  {
    patterns: ["service", "usecase", "use-case", "business"],
    layerName: "Service Layer",
    description: "Business logic and application services"
  },
  {
    patterns: ["model", "entity", "schema", "database", "db", "migration", "repository", "repo"],
    layerName: "Data Layer",
    description: "Data models, database access, and persistence"
  },
  {
    patterns: ["component", "view", "page", "screen", "layout", "widget", "ui"],
    layerName: "UI Layer",
    description: "User interface components and views"
  },
  {
    patterns: ["middleware", "interceptor", "guard", "filter", "pipe"],
    layerName: "Middleware Layer",
    description: "Request/response middleware and interceptors"
  },
  {
    patterns: ["client", "integration", "external", "sdk", "vendor", "adapter"],
    layerName: "External Services",
    description: "External service integrations, SDKs, and third-party adapters"
  },
  {
    patterns: ["worker", "job", "queue", "cron", "consumer", "processor", "scheduler", "background"],
    layerName: "Background Tasks",
    description: "Background workers, job processors, and scheduled tasks"
  },
  {
    patterns: ["util", "helper", "lib", "common", "shared"],
    layerName: "Utility Layer",
    description: "Shared utilities, helpers, and common libraries"
  },
  {
    patterns: ["test", "spec", "__test__", "__spec__", "__tests__", "__specs__"],
    layerName: "Test Layer",
    description: "Test files and test utilities"
  },
  {
    patterns: ["config", "setting", "env"],
    layerName: "Configuration Layer",
    description: "Application configuration and environment settings"
  }
];
function toLayerId(name) {
  return `layer:${name.toLowerCase().replace(/\s+/g, "-")}`;
}
function matchFileToLayer(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalizedPath.split("/");
  for (const { patterns, layerName } of LAYER_PATTERNS) {
    for (const segment of segments) {
      for (const pattern of patterns) {
        if (segment === pattern || segment === pattern + "s") {
          return layerName;
        }
      }
    }
  }
  return null;
}
function detectLayers(graph) {
  const layerMap = /* @__PURE__ */ new Map();
  const corePathless = [];
  for (const node of graph.nodes) {
    if (node.type !== "file") continue;
    if (!node.filePath) {
      corePathless.push(node.id);
      continue;
    }
    const layerName = matchFileToLayer(node.filePath) ?? "Core";
    const existing = layerMap.get(layerName) ?? [];
    existing.push(node.id);
    layerMap.set(layerName, existing);
  }
  if (corePathless.length > 0) {
    const existing = layerMap.get("Core") ?? [];
    for (const id of corePathless) existing.push(id);
    layerMap.set("Core", existing);
  }
  const layers = [];
  for (const [name, nodeIds] of layerMap) {
    const description = name === "Core" ? "Core application files" : LAYER_PATTERNS.find((p) => p.layerName === name)?.description ?? "";
    layers.push({
      id: toLayerId(name),
      name,
      description,
      nodeIds
    });
  }
  return layers;
}

// vendor/understand-anything/core/plugins/tree-sitter-plugin.ts
import { createRequire } from "node:module";
import { dirname, resolve, extname } from "node:path";

// vendor/understand-anything/core/plugins/extractors/base-extractor.ts
function getStringValue(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "string_fragment") {
      return child.text;
    }
  }
  return node.text.replace(/^['"`]|['"`]$/g, "");
}
function findChild(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}
function findChildren(node, type) {
  const result = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) result.push(child);
  }
  return result;
}

// vendor/understand-anything/core/plugins/extractors/typescript-extractor.ts
function extractParams(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (!child) continue;
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const ident = child.childForFieldName("pattern") ?? child.childForFieldName("name");
      if (ident) {
        params.push(ident.text);
      } else {
        for (let j = 0; j < child.childCount; j++) {
          const c = child.child(j);
          if (c && c.type === "identifier") {
            params.push(c.text);
            break;
          }
        }
      }
    } else if (child.type === "identifier") {
      params.push(child.text);
    } else if (child.type === "rest_pattern" || child.type === "rest_element") {
      const ident = child.children.find(
        (c) => c.type === "identifier"
      );
      if (ident) params.push("..." + ident.text);
    }
  }
  return params;
}
function extractReturnType(node) {
  const typeAnnotation = node.childForFieldName("return_type");
  if (typeAnnotation && typeAnnotation.type === "type_annotation") {
    const text = typeAnnotation.text;
    return text.startsWith(":") ? text.slice(1).trim() : text;
  }
  return void 0;
}
function extractImportSpecifiers(importClause) {
  const specifiers = [];
  for (let i = 0; i < importClause.childCount; i++) {
    const child = importClause.child(i);
    if (!child) continue;
    if (child.type === "named_imports") {
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j);
        if (spec && spec.type === "import_specifier") {
          const alias = spec.childForFieldName("alias");
          const name = spec.childForFieldName("name");
          specifiers.push(
            alias ? alias.text : name ? name.text : spec.text
          );
        }
      }
    } else if (child.type === "namespace_import") {
      const ident = child.children.find(
        (c) => c.type === "identifier"
      );
      if (ident) specifiers.push("* as " + ident.text);
    } else if (child.type === "identifier") {
      specifiers.push(child.text);
    }
  }
  return specifiers;
}
var TypeScriptExtractor = class {
  languageIds = ["typescript", "javascript"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    const exportedNames = /* @__PURE__ */ new Set();
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      this.processTopLevelNode(
        node,
        functions,
        classes,
        imports,
        exports,
        exportedNames
      );
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      const isFunctionLike = node.type === "function_declaration" || node.type === "method_definition" || node.type === "arrow_function" || node.type === "function_expression";
      let pushedName = false;
      if (isFunctionLike) {
        let name;
        if (node.type === "function_declaration") {
          name = (node.childForFieldName("name") ?? node.children.find((c) => c.type === "identifier"))?.text;
        } else if (node.type === "method_definition") {
          name = node.children.find(
            (c) => c.type === "property_identifier"
          )?.text;
        } else if (node.type === "arrow_function" || node.type === "function_expression") {
          const parent = node.parent;
          if (parent && parent.type === "variable_declarator") {
            name = parent.childForFieldName("name")?.text;
          }
        }
        if (name) {
          functionStack.push(name);
          pushedName = true;
        }
      }
      if (node.type === "call_expression") {
        const callee = node.childForFieldName("function");
        if (callee && functionStack.length > 0) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: callee.text,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private extraction helpers ----
  processTopLevelNode(node, functions, classes, imports, exports, exportedNames) {
    switch (node.type) {
      case "function_declaration":
        this.extractFunction(node, functions);
        break;
      case "abstract_class_declaration":
      case "class_declaration":
        this.extractClass(node, classes);
        break;
      case "lexical_declaration":
      case "variable_declaration":
        this.extractVariableDeclarations(node, functions);
        break;
      case "import_statement":
        this.extractImport(node, imports);
        break;
      case "export_statement":
        this.processExportStatement(
          node,
          functions,
          classes,
          imports,
          exports,
          exportedNames
        );
        break;
    }
  }
  extractFunction(node, functions) {
    const nameNode = node.childForFieldName("name") ?? node.children.find((c) => c.type === "identifier");
    if (!nameNode) return;
    const params = extractParams(
      node.childForFieldName("parameters") ?? node.children.find(
        (c) => c.type === "formal_parameters"
      ) ?? null
    );
    const returnType = extractReturnType(node);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
  }
  extractClass(node, classes) {
    const nameNode = node.children.find(
      (c) => c.type === "type_identifier" || c.type === "identifier"
    );
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const classBody = node.children.find(
      (c) => c.type === "class_body"
    );
    if (classBody) {
      for (let j = 0; j < classBody.childCount; j++) {
        const member = classBody.child(j);
        if (!member) continue;
        if (member.type === "method_definition" || member.type === "abstract_method_signature") {
          const methodName = member.children.find(
            (c) => c.type === "property_identifier"
          );
          if (methodName) methods.push(methodName.text);
        } else if (member.type === "public_field_definition" || member.type === "property_definition") {
          const propName = member.children.find(
            (c) => c.type === "property_identifier"
          );
          if (propName) properties.push(propName.text);
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
  }
  extractVariableDeclarations(node, functions) {
    for (let j = 0; j < node.childCount; j++) {
      const child = node.child(j);
      if (!child || child.type !== "variable_declarator") continue;
      const nameNode = child.childForFieldName("name");
      const valueNode = child.childForFieldName("value");
      if (nameNode && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function_expression" || valueNode.type === "function")) {
        const params = extractParams(
          valueNode.childForFieldName("parameters") ?? valueNode.children.find(
            (c) => c.type === "formal_parameters"
          ) ?? null
        );
        const returnType = extractReturnType(valueNode);
        functions.push({
          name: nameNode.text,
          lineRange: [
            node.startPosition.row + 1,
            node.endPosition.row + 1
          ],
          params,
          returnType
        });
      }
    }
  }
  extractImport(node, imports) {
    const sourceNode = node.children.find(
      (c) => c.type === "string"
    );
    if (!sourceNode) return;
    const source = getStringValue(sourceNode);
    const specifiers = [];
    const importClause = node.children.find(
      (c) => c.type === "import_clause"
    );
    if (importClause) {
      specifiers.push(...extractImportSpecifiers(importClause));
    }
    imports.push({
      source,
      specifiers,
      lineNumber: node.startPosition.row + 1
    });
  }
  processExportStatement(node, functions, classes, _imports, exports, exportedNames) {
    for (let j = 0; j < node.childCount; j++) {
      const child = node.child(j);
      if (!child) continue;
      switch (child.type) {
        case "function_declaration": {
          this.extractFunction(child, functions);
          const nameNode = child.childForFieldName("name") ?? child.children.find((c) => c.type === "identifier");
          const isDefault = node.children.some((c) => c.type === "default");
          if (nameNode && !exportedNames.has(nameNode.text)) {
            exports.push({
              name: nameNode.text,
              lineNumber: node.startPosition.row + 1,
              isDefault
            });
            exportedNames.add(nameNode.text);
          } else if (!nameNode && isDefault && !exportedNames.has("default")) {
            exports.push({
              name: "default",
              lineNumber: node.startPosition.row + 1,
              isDefault: true
            });
            exportedNames.add("default");
          }
          break;
        }
        case "abstract_class_declaration":
        case "class_declaration": {
          this.extractClass(child, classes);
          const nameNode = child.children.find(
            (c) => c.type === "type_identifier" || c.type === "identifier"
          );
          const isDefault = node.children.some(
            (c) => c.type === "default"
          );
          if (nameNode && !exportedNames.has(nameNode.text)) {
            const exportName = isDefault ? "default" : nameNode.text;
            exports.push({
              name: exportName,
              lineNumber: node.startPosition.row + 1,
              isDefault
            });
            exportedNames.add(exportName);
          }
          break;
        }
        case "lexical_declaration":
        case "variable_declaration": {
          this.extractVariableDeclarations(child, functions);
          for (let k = 0; k < child.childCount; k++) {
            const declarator = child.child(k);
            if (declarator && declarator.type === "variable_declarator") {
              const nameNode = declarator.childForFieldName("name");
              if (nameNode && !exportedNames.has(nameNode.text)) {
                exports.push({
                  name: nameNode.text,
                  lineNumber: node.startPosition.row + 1
                });
                exportedNames.add(nameNode.text);
              }
            }
          }
          break;
        }
        case "export_clause": {
          for (let k = 0; k < child.childCount; k++) {
            const spec = child.child(k);
            if (spec && spec.type === "export_specifier") {
              const alias = spec.childForFieldName("alias");
              const name = spec.childForFieldName("name");
              const exportName = alias ? alias.text : name ? name.text : spec.text;
              if (!exportedNames.has(exportName)) {
                exports.push({
                  name: exportName,
                  lineNumber: node.startPosition.row + 1
                });
                exportedNames.add(exportName);
              }
            }
          }
          break;
        }
      }
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/python-extractor.ts
function extractParams2(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (!child) continue;
    switch (child.type) {
      case "identifier":
        if (child.text !== "self" && child.text !== "cls") {
          params.push(child.text);
        }
        break;
      case "typed_parameter": {
        const ident = findChild(child, "identifier");
        if (ident && ident.text !== "self" && ident.text !== "cls") {
          params.push(ident.text);
        }
        break;
      }
      case "default_parameter": {
        const ident = findChild(child, "identifier");
        if (ident && ident.text !== "self" && ident.text !== "cls") {
          params.push(ident.text);
        }
        break;
      }
      case "typed_default_parameter": {
        const ident = findChild(child, "identifier");
        if (ident && ident.text !== "self" && ident.text !== "cls") {
          params.push(ident.text);
        }
        break;
      }
      case "list_splat_pattern": {
        const ident = findChild(child, "identifier");
        if (ident) params.push("*" + ident.text);
        break;
      }
      case "dictionary_splat_pattern": {
        const ident = findChild(child, "identifier");
        if (ident) params.push("**" + ident.text);
        break;
      }
    }
  }
  return params;
}
function extractReturnType2(node) {
  const returnType = node.childForFieldName("return_type");
  if (returnType) {
    return returnType.text;
  }
  return void 0;
}
function unwrapDecorated(node) {
  if (node.type === "decorated_definition") {
    const inner = findChild(node, "function_definition") ?? findChild(node, "class_definition");
    if (inner) return inner;
  }
  return node;
}
var PythonExtractor = class {
  languageIds = ["python"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      const inner = unwrapDecorated(node);
      switch (inner.type) {
        case "function_definition":
          this.extractFunction(inner, functions);
          this.addExport(inner, node, exports);
          break;
        case "class_definition":
          this.extractClass(inner, classes);
          this.addExport(inner, node, exports);
          break;
        case "import_statement":
          this.extractImport(inner, imports);
          break;
        case "import_from_statement":
          this.extractFromImport(inner, imports);
          break;
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "function_definition") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "call") {
        const calleeNode = node.children.find(
          (c) => c.type === "identifier" || c.type === "attribute"
        );
        if (calleeNode && functionStack.length > 0) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: calleeNode.text,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  extractFunction(node, functions) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams2(paramsNode ?? null);
    const returnType = extractReturnType2(node);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
  }
  extractClass(node, classes) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const member = body.child(i);
        if (!member) continue;
        const innerMember = unwrapDecorated(member);
        if (innerMember.type === "function_definition") {
          const methodName = innerMember.childForFieldName("name");
          if (methodName) methods.push(methodName.text);
        }
        if (member.type === "expression_statement") {
          const assignment = findChild(member, "assignment");
          if (assignment) {
            const typeNode = findChild(assignment, "type");
            const nameIdent = findChild(assignment, "identifier");
            if (typeNode && nameIdent) {
              properties.push(nameIdent.text);
            }
          }
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
  }
  extractImport(node, imports) {
    const dottedNames = findChildren(node, "dotted_name");
    const aliasedImports = findChildren(node, "aliased_import");
    for (const dn of dottedNames) {
      imports.push({
        source: dn.text,
        specifiers: [dn.text],
        lineNumber: node.startPosition.row + 1
      });
    }
    for (const ai of aliasedImports) {
      const dottedName = findChild(ai, "dotted_name");
      const alias = ai.children.find(
        (c) => c.type === "identifier"
      );
      if (dottedName) {
        imports.push({
          source: dottedName.text,
          specifiers: [alias ? alias.text : dottedName.text],
          lineNumber: node.startPosition.row + 1
        });
      }
    }
  }
  extractFromImport(node, imports) {
    const moduleNode = node.childForFieldName("module_name");
    const source = moduleNode ? moduleNode.text : "";
    const moduleNodeId = moduleNode?.id;
    const specifiers = [];
    const allDottedNames = findChildren(node, "dotted_name");
    for (const dn of allDottedNames) {
      if (dn.id === moduleNodeId) continue;
      specifiers.push(dn.text);
    }
    const aliasedImports = findChildren(node, "aliased_import");
    for (const ai of aliasedImports) {
      const alias = ai.children.find(
        (c) => c.type === "identifier"
      );
      if (alias) {
        specifiers.push(alias.text);
      }
    }
    if (findChild(node, "wildcard_import")) {
      specifiers.push("*");
    }
    imports.push({
      source,
      specifiers,
      lineNumber: node.startPosition.row + 1
    });
  }
  addExport(inner, outer, exports) {
    const nameNode = inner.childForFieldName("name");
    if (nameNode) {
      exports.push({
        name: nameNode.text,
        lineNumber: outer.startPosition.row + 1
      });
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/go-extractor.ts
function extractParams3(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  const declarations = findChildren(paramsNode, "parameter_declaration");
  for (const decl of declarations) {
    for (let i = 0; i < decl.childCount; i++) {
      const child = decl.child(i);
      if (child && child.type === "identifier") {
        params.push(child.text);
      }
    }
  }
  return params;
}
function extractResultType(node) {
  const result = node.childForFieldName("result");
  if (!result) return void 0;
  return result.text;
}
function extractReceiverType(receiverNode) {
  const decl = findChild(receiverNode, "parameter_declaration");
  if (!decl) return void 0;
  for (let i = 0; i < decl.childCount; i++) {
    const child = decl.child(i);
    if (!child) continue;
    if (child.type === "type_identifier") {
      return child.text;
    }
    if (child.type === "pointer_type") {
      const typeId = findChild(child, "type_identifier");
      if (typeId) return typeId.text;
    }
  }
  return void 0;
}
function isExported(name) {
  if (name.length === 0) return false;
  const first = name.charCodeAt(0);
  return first >= 65 && first <= 90;
}
var GoExtractor = class {
  languageIds = ["go"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    const methodsByReceiver = /* @__PURE__ */ new Map();
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "function_declaration":
          this.extractFunction(node, functions, exports);
          break;
        case "method_declaration":
          this.extractMethod(node, functions, exports, methodsByReceiver);
          break;
        case "type_declaration":
          this.extractTypeDeclaration(node, classes, exports);
          break;
        case "import_declaration":
          this.extractImportDeclaration(node, imports);
          break;
      }
    }
    for (const cls of classes) {
      const methods = methodsByReceiver.get(cls.name);
      if (methods) {
        cls.methods.push(...methods);
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "function_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      } else if (node.type === "method_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "call_expression") {
        const calleeNode = node.childForFieldName("function");
        if (calleeNode && functionStack.length > 0) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: calleeNode.text,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  extractFunction(node, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams3(paramsNode ?? null);
    const returnType = extractResultType(node);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    if (isExported(nameNode.text)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractMethod(node, functions, exports, methodsByReceiver) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams3(paramsNode ?? null);
    const returnType = extractResultType(node);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    const receiverNode = node.childForFieldName("receiver");
    if (receiverNode) {
      const receiverType = extractReceiverType(receiverNode);
      if (receiverType) {
        if (!methodsByReceiver.has(receiverType)) {
          methodsByReceiver.set(receiverType, []);
        }
        methodsByReceiver.get(receiverType).push(nameNode.text);
      }
    }
    if (isExported(nameNode.text)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractTypeDeclaration(node, classes, exports) {
    const typeSpec = findChild(node, "type_spec");
    if (!typeSpec) return;
    const nameNode = typeSpec.childForFieldName("name");
    const typeNode = typeSpec.childForFieldName("type");
    if (!nameNode || !typeNode) return;
    if (typeNode.type === "struct_type") {
      this.extractStruct(node, nameNode, typeNode, classes, exports);
    } else if (typeNode.type === "interface_type") {
      this.extractInterface(node, nameNode, typeNode, classes, exports);
    }
  }
  extractStruct(declNode, nameNode, structNode, classes, exports) {
    const properties = [];
    const fieldList = findChild(structNode, "field_declaration_list");
    if (fieldList) {
      const fields = findChildren(fieldList, "field_declaration");
      for (const field of fields) {
        for (let i = 0; i < field.childCount; i++) {
          const child = field.child(i);
          if (child && child.type === "field_identifier") {
            properties.push(child.text);
          }
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        declNode.startPosition.row + 1,
        declNode.endPosition.row + 1
      ],
      methods: [],
      // Methods are attached later from methodsByReceiver
      properties
    });
    if (isExported(nameNode.text)) {
      exports.push({
        name: nameNode.text,
        lineNumber: declNode.startPosition.row + 1
      });
    }
  }
  extractInterface(declNode, nameNode, interfaceNode, classes, exports) {
    const methods = [];
    const methodElems = findChildren(interfaceNode, "method_elem");
    for (const elem of methodElems) {
      const methName = elem.childForFieldName("name");
      if (methName) {
        methods.push(methName.text);
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        declNode.startPosition.row + 1,
        declNode.endPosition.row + 1
      ],
      methods,
      properties: []
      // Interfaces have no properties
    });
    if (isExported(nameNode.text)) {
      exports.push({
        name: nameNode.text,
        lineNumber: declNode.startPosition.row + 1
      });
    }
  }
  extractImportDeclaration(node, imports) {
    const specList = findChild(node, "import_spec_list");
    if (specList) {
      const specs = findChildren(specList, "import_spec");
      for (const spec of specs) {
        this.extractImportSpec(spec, imports);
      }
    } else {
      const spec = findChild(node, "import_spec");
      if (spec) {
        this.extractImportSpec(spec, imports);
      }
    }
  }
  extractImportSpec(spec, imports) {
    const pathNode = spec.childForFieldName("path");
    if (!pathNode) return;
    const pathContent = findChild(pathNode, "interpreted_string_literal_content");
    const source = pathContent ? pathContent.text : pathNode.text.replace(/^"|"$/g, "");
    const nameNode = spec.childForFieldName("name");
    let specifier;
    if (nameNode) {
      specifier = nameNode.text;
    } else {
      const parts = source.split("/");
      specifier = parts[parts.length - 1];
    }
    imports.push({
      source,
      specifiers: [specifier],
      lineNumber: spec.startPosition.row + 1
    });
  }
};

// vendor/understand-anything/core/plugins/extractors/rust-extractor.ts
function extractParams4(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (!child) continue;
    if (child.type === "parameter") {
      const pattern = child.childForFieldName("pattern");
      if (pattern) {
        params.push(pattern.text);
      }
    }
  }
  return params;
}
function extractReturnType3(node) {
  const returnType = node.childForFieldName("return_type");
  if (returnType) {
    return returnType.text;
  }
  return void 0;
}
function isPublic(node) {
  const visMod = findChild(node, "visibility_modifier");
  return visMod !== null && visMod.text.startsWith("pub");
}
function extractScopedPath(node) {
  if (node.type === "scoped_identifier") {
    const pathNode = node.childForFieldName("path");
    const nameNode = node.childForFieldName("name");
    const name = nameNode ? nameNode.text : "";
    const path = pathNode ? pathNode.text : "";
    return { path, name };
  }
  return { path: "", name: node.text };
}
var RustExtractor = class {
  languageIds = ["rust"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    const methodsByType = /* @__PURE__ */ new Map();
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "function_item":
          this.extractFunction(node, functions, exports);
          break;
        case "struct_item":
          this.extractStruct(node, classes, exports);
          break;
        case "enum_item":
          this.extractEnum(node, classes, exports);
          break;
        case "trait_item":
          this.extractTrait(node, classes, exports);
          break;
        case "impl_item":
          this.extractImpl(node, functions, exports, methodsByType);
          break;
        case "use_declaration":
          this.extractUseDeclaration(node, imports);
          break;
      }
    }
    for (const cls of classes) {
      const methods = methodsByType.get(cls.name);
      if (methods) {
        cls.methods.push(...methods);
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "function_item") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "call_expression") {
        if (functionStack.length > 0) {
          const callee = this.extractCalleeName(node);
          if (callee) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  /**
   * Extract the callee name from a call_expression.
   *
   * Handles:
   * - Plain function call: `check_port(x)` -> "check_port"
   * - Method call via field_expression: `self.validate()` -> "self.validate"
   * - Scoped call: `Vec::new()` -> "Vec::new"
   */
  extractCalleeName(callNode) {
    const funcNode = callNode.child(0);
    if (!funcNode) return null;
    if (funcNode.type === "identifier") {
      return funcNode.text;
    }
    if (funcNode.type === "field_expression") {
      const field = funcNode.childForFieldName("field");
      const value = funcNode.childForFieldName("value");
      if (field && value) {
        return value.text + "." + field.text;
      }
    }
    if (funcNode.type === "scoped_identifier") {
      return funcNode.text;
    }
    return funcNode.text;
  }
  extractFunction(node, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams4(paramsNode ?? null);
    const returnType = extractReturnType3(node);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    if (isPublic(node)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractStruct(node, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const properties = [];
    const body = node.childForFieldName("body");
    if (body && body.type === "field_declaration_list") {
      const fields = findChildren(body, "field_declaration");
      for (const field of fields) {
        const fieldName = findChild(field, "field_identifier");
        if (fieldName) {
          properties.push(fieldName.text);
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods: [],
      // Methods are attached later from methodsByType
      properties
    });
    if (isPublic(node)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractEnum(node, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const properties = [];
    const body = node.childForFieldName("body");
    if (body && body.type === "enum_variant_list") {
      const variants = findChildren(body, "enum_variant");
      for (const variant of variants) {
        const variantName = variant.childForFieldName("name");
        if (variantName) {
          properties.push(variantName.text);
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods: [],
      // Methods are attached later if there's an impl block
      properties
    });
    if (isPublic(node)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractTrait(node, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const body = findChild(node, "declaration_list");
    if (body) {
      const sigs = findChildren(body, "function_signature_item");
      for (const sig of sigs) {
        const sigName = findChild(sig, "identifier");
        if (sigName) {
          methods.push(sigName.text);
        }
      }
      const fns = findChildren(body, "function_item");
      for (const fn of fns) {
        const fnName = fn.childForFieldName("name");
        if (fnName) {
          methods.push(fnName.text);
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties: []
    });
    if (isPublic(node)) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractImpl(node, functions, exports, methodsByType) {
    const typeNode = node.childForFieldName("type");
    const typeName = typeNode ? typeNode.text : null;
    const body = node.childForFieldName("body");
    if (!body) return;
    const fns = findChildren(body, "function_item");
    for (const fn of fns) {
      const nameNode = fn.childForFieldName("name");
      if (!nameNode) continue;
      const paramsNode = fn.childForFieldName("parameters");
      const params = extractParams4(paramsNode ?? null);
      const returnType = extractReturnType3(fn);
      functions.push({
        name: nameNode.text,
        lineRange: [
          fn.startPosition.row + 1,
          fn.endPosition.row + 1
        ],
        params,
        returnType
      });
      if (typeName) {
        if (!methodsByType.has(typeName)) {
          methodsByType.set(typeName, []);
        }
        methodsByType.get(typeName).push(nameNode.text);
      }
      if (isPublic(fn)) {
        exports.push({
          name: nameNode.text,
          lineNumber: fn.startPosition.row + 1
        });
      }
    }
  }
  extractUseDeclaration(node, imports) {
    const argument = node.childForFieldName("argument");
    if (!argument) return;
    switch (argument.type) {
      case "identifier":
        imports.push({
          source: argument.text,
          specifiers: [argument.text],
          lineNumber: node.startPosition.row + 1
        });
        break;
      case "scoped_identifier": {
        const { path, name } = extractScopedPath(argument);
        imports.push({
          source: path,
          specifiers: [name],
          lineNumber: node.startPosition.row + 1
        });
        break;
      }
      case "scoped_use_list": {
        const pathNode = argument.childForFieldName("path");
        const listNode = argument.childForFieldName("list");
        const source = pathNode ? pathNode.text : "";
        const specifiers = [];
        if (listNode) {
          for (let j = 0; j < listNode.childCount; j++) {
            const ch = listNode.child(j);
            if (!ch) continue;
            if (ch.type === "self" || ch.type === "identifier") {
              specifiers.push(ch.text);
            } else if (ch.type === "scoped_identifier") {
              specifiers.push(ch.text);
            }
          }
        }
        imports.push({
          source,
          specifiers,
          lineNumber: node.startPosition.row + 1
        });
        break;
      }
      case "use_wildcard": {
        const scopedId = findChild(argument, "scoped_identifier");
        const source = scopedId ? scopedId.text : "";
        imports.push({
          source,
          specifiers: ["*"],
          lineNumber: node.startPosition.row + 1
        });
        break;
      }
      default: {
        imports.push({
          source: argument.text,
          specifiers: [argument.text],
          lineNumber: node.startPosition.row + 1
        });
        break;
      }
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/java-extractor.ts
function extractParams5(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  const declarations = findChildren(paramsNode, "formal_parameter");
  for (const decl of declarations) {
    const nameNode = decl.childForFieldName("name");
    if (nameNode) {
      params.push(nameNode.text);
    }
  }
  const spreadParams = findChildren(paramsNode, "spread_parameter");
  for (const spread of spreadParams) {
    const nameNode = spread.childForFieldName("name");
    if (nameNode) {
      params.push(nameNode.text);
    }
  }
  return params;
}
function extractReturnType4(node) {
  const typeNode = node.childForFieldName("type");
  if (!typeNode) return void 0;
  return typeNode.text;
}
function hasModifier(node, modifier) {
  const modifiers = findChild(node, "modifiers");
  if (!modifiers) return false;
  for (let i = 0; i < modifiers.childCount; i++) {
    const child = modifiers.child(i);
    if (child && child.text === modifier) return true;
  }
  return false;
}
function extractScopedIdentifierPath(node) {
  return node.text;
}
function lastComponent(path) {
  const parts = path.split(".");
  return parts[parts.length - 1];
}
var JavaExtractor = class {
  languageIds = ["java"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "import_declaration":
          this.extractImport(node, imports);
          break;
        case "class_declaration":
        case "enum_declaration":
        case "record_declaration":
          this.extractClass(node, functions, classes, exports);
          break;
        case "interface_declaration":
          this.extractInterface(node, functions, classes, exports);
          break;
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "method_declaration" || node.type === "constructor_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "method_invocation") {
        if (functionStack.length > 0) {
          const callee = this.extractMethodInvocationName(node);
          if (callee) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      if (node.type === "object_creation_expression") {
        if (functionStack.length > 0) {
          const typeNode = node.childForFieldName("type");
          if (typeNode) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee: `new ${typeNode.text}`,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  /**
   * Extract the callee name from a method_invocation node.
   *
   * Handles:
   * - Plain method call: `fetchFromDb(limit)` -> "fetchFromDb"
   * - Qualified call: `System.out.println(msg)` -> "System.out.println"
   */
  extractMethodInvocationName(node) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return null;
    const objectNode = node.childForFieldName("object");
    if (objectNode) {
      return `${objectNode.text}.${nameNode.text}`;
    }
    return nameNode.text;
  }
  extractImport(node, imports) {
    const hasAsterisk = findChild(node, "asterisk") !== null;
    const scopedId = findChild(node, "scoped_identifier");
    if (!scopedId) return;
    const fullPath = extractScopedIdentifierPath(scopedId);
    if (hasAsterisk) {
      imports.push({
        source: fullPath,
        specifiers: ["*"],
        lineNumber: node.startPosition.row + 1
      });
    } else {
      imports.push({
        source: fullPath,
        specifiers: [lastComponent(fullPath)],
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractClass(node, functions, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      this.extractClassBodyMembers(
        body,
        methods,
        properties,
        functions,
        exports
      );
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
    if (hasModifier(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractInterface(node, functions, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      const methodNodes = findChildren(body, "method_declaration");
      for (const methodNode of methodNodes) {
        const methNameNode = methodNode.childForFieldName("name");
        if (methNameNode) {
          methods.push(methNameNode.text);
        }
      }
      const fields = findChildren(body, "constant_declaration");
      for (const field of fields) {
        const declarators = findChildren(field, "variable_declarator");
        for (const decl of declarators) {
          const declName = decl.childForFieldName("name");
          if (declName) {
            properties.push(declName.text);
          }
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
    if (hasModifier(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  /**
   * Extract methods, constructors, and fields from a class_body node.
   */
  extractClassBodyMembers(body, methods, properties, functions, exports) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      switch (child.type) {
        case "enum_body_declarations":
          this.extractClassBodyMembers(
            child,
            methods,
            properties,
            functions,
            exports
          );
          break;
        case "method_declaration":
          this.extractMethod(child, methods, functions, exports);
          break;
        case "constructor_declaration":
          this.extractConstructor(child, methods, functions, exports);
          break;
        case "field_declaration":
          this.extractField(child, properties, exports);
          break;
      }
    }
  }
  extractMethod(node, methods, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams5(paramsNode ?? null);
    const returnType = extractReturnType4(node);
    methods.push(nameNode.text);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    if (hasModifier(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractConstructor(node, methods, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams5(paramsNode ?? null);
    methods.push(nameNode.text);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params
      // Constructors have no return type
    });
    if (hasModifier(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractField(node, properties, exports) {
    const declarators = findChildren(node, "variable_declarator");
    for (const decl of declarators) {
      const nameNode = decl.childForFieldName("name");
      if (nameNode) {
        properties.push(nameNode.text);
        if (hasModifier(node, "public")) {
          exports.push({
            name: nameNode.text,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/ruby-extractor.ts
var IMPORT_METHODS = /* @__PURE__ */ new Set(["require", "require_relative"]);
var ATTR_METHODS = /* @__PURE__ */ new Set(["attr_accessor", "attr_reader", "attr_writer"]);
function extractParams6(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i);
    if (!child) continue;
    switch (child.type) {
      case "identifier":
        params.push(child.text);
        break;
      case "optional_parameter": {
        const ident = child.childForFieldName("name");
        if (ident) params.push(ident.text);
        break;
      }
      case "splat_parameter": {
        const ident = child.childForFieldName("name");
        if (ident) params.push("*" + ident.text);
        break;
      }
      case "hash_splat_parameter": {
        const ident = child.childForFieldName("name");
        if (ident) params.push("**" + ident.text);
        break;
      }
      case "block_parameter": {
        const ident = child.childForFieldName("name");
        if (ident) params.push("&" + ident.text);
        break;
      }
    }
  }
  return params;
}
function extractAttrProperties(callNode) {
  const properties = [];
  const args = callNode.childForFieldName("arguments");
  if (!args) return properties;
  for (let i = 0; i < args.childCount; i++) {
    const child = args.child(i);
    if (child && child.type === "simple_symbol") {
      properties.push(child.text.slice(1));
    }
  }
  return properties;
}
function getStringContent(node) {
  const content = findChild(node, "string_content");
  if (content) return content.text;
  return node.text.replace(/^['"`]|['"`]$/g, "");
}
var RubyExtractor = class {
  languageIds = ["ruby"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "method":
          this.extractMethod(node, functions);
          exports.push({
            name: this.getMethodName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "singleton_method":
          this.extractSingletonMethod(node, functions);
          exports.push({
            name: "self." + this.getSingletonMethodName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "class":
          this.extractClass(node, classes, functions);
          exports.push({
            name: this.getClassName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "module":
          this.extractModule(node, classes, functions);
          exports.push({
            name: this.getModuleName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "call":
          this.extractTopLevelCall(node, imports);
          break;
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "method") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      } else if (node.type === "singleton_method") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push("self." + nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "call") {
        const methodNode = node.childForFieldName("method");
        if (methodNode && functionStack.length > 0) {
          const methodName = methodNode.text;
          if (!IMPORT_METHODS.has(methodName) && !ATTR_METHODS.has(methodName)) {
            const receiverNode = node.childForFieldName("receiver");
            const callee = receiverNode ? receiverNode.text + "." + methodName : methodName;
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      if (node.type === "identifier" && node.parent?.type === "body_statement" && functionStack.length > 0) {
        entries.push({
          caller: functionStack[functionStack.length - 1],
          callee: node.text,
          lineNumber: node.startPosition.row + 1
        });
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  getMethodName(node) {
    const nameNode = node.childForFieldName("name");
    return nameNode ? nameNode.text : "";
  }
  getSingletonMethodName(node) {
    const nameNode = node.childForFieldName("name");
    return nameNode ? nameNode.text : "";
  }
  getClassName(node) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return "";
    return nameNode.text;
  }
  getModuleName(node) {
    const nameNode = node.childForFieldName("name");
    return nameNode ? nameNode.text : "";
  }
  extractMethod(node, functions) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams6(paramsNode ?? null);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params
    });
  }
  extractSingletonMethod(node, functions) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams6(paramsNode ?? null);
    functions.push({
      name: "self." + nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params
    });
  }
  extractClass(node, classes, functions) {
    const name = this.getClassName(node);
    if (!name) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      this.extractClassBody(body, methods, properties, functions);
    }
    classes.push({
      name,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
  }
  extractModule(node, classes, functions) {
    const name = this.getModuleName(node);
    if (!name) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      this.extractClassBody(body, methods, properties, functions);
    }
    classes.push({
      name,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
  }
  /**
   * Extract methods and properties from a class/module body_statement.
   * Also pushes each method into the top-level functions array.
   */
  extractClassBody(body, methods, properties, functions) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      if (!member) continue;
      if (member.type === "method") {
        const nameNode = member.childForFieldName("name");
        if (nameNode) {
          methods.push(nameNode.text);
          this.extractMethod(member, functions);
        }
      } else if (member.type === "singleton_method") {
        const nameNode = member.childForFieldName("name");
        if (nameNode) {
          methods.push("self." + nameNode.text);
          this.extractSingletonMethod(member, functions);
        }
      } else if (member.type === "call") {
        const methodNode = member.childForFieldName("method");
        if (methodNode && ATTR_METHODS.has(methodNode.text)) {
          properties.push(...extractAttrProperties(member));
        }
      }
    }
  }
  /**
   * Handle top-level call nodes: extract require/require_relative as imports.
   */
  extractTopLevelCall(node, imports) {
    const methodNode = node.childForFieldName("method");
    if (!methodNode) return;
    if (IMPORT_METHODS.has(methodNode.text)) {
      const args = node.childForFieldName("arguments");
      if (!args) return;
      const firstArg = findChild(args, "string");
      if (firstArg) {
        const source = getStringContent(firstArg);
        imports.push({
          source,
          specifiers: [source],
          lineNumber: node.startPosition.row + 1
        });
      }
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/php-extractor.ts
function extractParams7(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  const simpleParams = findChildren(paramsNode, "simple_parameter");
  for (const param of simpleParams) {
    const varName = findChild(param, "variable_name");
    if (varName) {
      params.push(varName.text);
    }
  }
  return params;
}
function extractReturnType5(node) {
  let foundColon = false;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === ":" && child.text === ":") {
      foundColon = true;
      continue;
    }
    if (foundColon) {
      if (child.type === "primitive_type" || child.type === "named_type" || child.type === "optional_type" || child.type === "union_type") {
        return child.text;
      }
    }
  }
  return void 0;
}
function extractUseName(clause, prefix) {
  const qualifiedName = findChild(clause, "qualified_name");
  if (qualifiedName) {
    return qualifiedName.text;
  }
  const nameNode = findChild(clause, "name");
  if (nameNode && prefix) {
    return prefix + "\\" + nameNode.text;
  }
  if (nameNode) {
    return nameNode.text;
  }
  return clause.text;
}
function lastSegment(fqn) {
  const parts = fqn.split("\\");
  return parts[parts.length - 1];
}
var PhpExtractor = class {
  languageIds = ["php"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    this.walkStatements(rootNode, functions, classes, imports, exports);
    return { functions, classes, imports, exports };
  }
  /**
   * Walk top-level statements, extracting functions, classes, interfaces, and imports.
   * Handles both direct children and declarations nested inside block-scoped
   * `namespace_definition` nodes (`namespace Foo { class Bar {} }`).
   */
  walkStatements(parent, functions, classes, imports, exports) {
    for (let i = 0; i < parent.childCount; i++) {
      const node = parent.child(i);
      if (!node) continue;
      switch (node.type) {
        case "function_definition":
          this.extractFunction(node, functions);
          exports.push({
            name: this.getFunctionName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "class_declaration":
          this.extractClass(node, classes, functions);
          exports.push({
            name: this.getClassName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "interface_declaration":
          this.extractInterface(node, classes);
          exports.push({
            name: this.getInterfaceName(node),
            lineNumber: node.startPosition.row + 1
          });
          break;
        case "namespace_use_declaration":
          this.extractUseDeclaration(node, imports);
          break;
        case "namespace_definition": {
          const body = findChild(node, "compound_statement");
          if (body) {
            this.walkStatements(body, functions, classes, imports, exports);
          }
          break;
        }
      }
    }
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "function_definition" || node.type === "method_declaration") {
        const nameNode = findChild(node, "name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (functionStack.length > 0) {
        const caller = functionStack[functionStack.length - 1];
        if (node.type === "function_call_expression") {
          const nameNode = findChild(node, "name");
          if (nameNode) {
            entries.push({
              caller,
              callee: nameNode.text,
              lineNumber: node.startPosition.row + 1
            });
          }
        } else if (node.type === "member_call_expression") {
          const nameNode = findChild(node, "name");
          if (nameNode) {
            const firstChild = node.child(0);
            const receiver = firstChild ? firstChild.text : "";
            const callee = receiver ? receiver + "->" + nameNode.text : nameNode.text;
            entries.push({
              caller,
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        } else if (node.type === "scoped_call_expression") {
          const scopeNode = node.child(0);
          const methodNode = node.child(2);
          if (scopeNode && methodNode && methodNode.type === "name") {
            entries.push({
              caller,
              callee: scopeNode.text + "::" + methodNode.text,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  getFunctionName(node) {
    const nameNode = findChild(node, "name");
    return nameNode ? nameNode.text : "";
  }
  getClassName(node) {
    const nameNode = findChild(node, "name");
    return nameNode ? nameNode.text : "";
  }
  getInterfaceName(node) {
    const nameNode = findChild(node, "name");
    return nameNode ? nameNode.text : "";
  }
  extractFunction(node, functions) {
    const nameNode = findChild(node, "name");
    if (!nameNode) return;
    const paramsNode = findChild(node, "formal_parameters");
    const params = extractParams7(paramsNode);
    const returnType = extractReturnType5(node);
    functions.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      params,
      returnType
    });
  }
  extractClass(node, classes, functions) {
    const name = this.getClassName(node);
    if (!name) return;
    const methods = [];
    const properties = [];
    const declList = findChild(node, "declaration_list");
    if (declList) {
      this.extractDeclarationList(declList, methods, properties, functions);
    }
    classes.push({
      name,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties
    });
  }
  extractInterface(node, classes) {
    const name = this.getInterfaceName(node);
    if (!name) return;
    const methods = [];
    const properties = [];
    const declList = findChild(node, "declaration_list");
    if (declList) {
      const methodDecls = findChildren(declList, "method_declaration");
      for (const methodDecl of methodDecls) {
        const methodName = findChild(methodDecl, "name");
        if (methodName) {
          methods.push(methodName.text);
        }
      }
    }
    classes.push({
      name,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties
    });
  }
  /**
   * Extract methods and properties from a class `declaration_list`.
   * Also pushes each method into the top-level functions array.
   */
  extractDeclarationList(declList, methods, properties, functions) {
    for (let i = 0; i < declList.childCount; i++) {
      const member = declList.child(i);
      if (!member) continue;
      if (member.type === "method_declaration") {
        const nameNode = findChild(member, "name");
        if (nameNode) {
          methods.push(nameNode.text);
          const paramsNode = findChild(member, "formal_parameters");
          const params = extractParams7(paramsNode);
          const returnType = extractReturnType5(member);
          functions.push({
            name: nameNode.text,
            lineRange: [member.startPosition.row + 1, member.endPosition.row + 1],
            params,
            returnType
          });
        }
      } else if (member.type === "property_declaration") {
        const propElement = findChild(member, "property_element");
        if (propElement) {
          const varName = findChild(propElement, "variable_name");
          if (varName) {
            const dollarChild = findChild(varName, "name");
            if (dollarChild) {
              properties.push(dollarChild.text);
            } else {
              properties.push(varName.text.replace(/^\$/, ""));
            }
          }
        }
      }
    }
  }
  /**
   * Extract imports from a `namespace_use_declaration` node.
   *
   * Handles:
   * - Simple: `use App\Models\User;`
   * - Aliased: `use App\Contracts\Repository as Repo;`
   * - Grouped: `use App\Models\{User, Post};`
   */
  extractUseDeclaration(node, imports) {
    const useGroup = findChild(node, "namespace_use_group");
    if (useGroup) {
      const nsName = findChild(node, "namespace_name");
      const prefix = nsName ? nsName.text : "";
      const clauses2 = findChildren(useGroup, "namespace_use_clause");
      const specifiers = [];
      for (const clause of clauses2) {
        const name = extractUseName(clause, prefix);
        specifiers.push(lastSegment(name));
      }
      const source = prefix ? prefix + "\\{" + specifiers.join(", ") + "}" : specifiers.join(", ");
      imports.push({
        source,
        specifiers,
        lineNumber: node.startPosition.row + 1
      });
      return;
    }
    const clauses = findChildren(node, "namespace_use_clause");
    for (const clause of clauses) {
      const fqn = extractUseName(clause, "");
      const specifier = lastSegment(fqn);
      imports.push({
        source: fqn,
        specifiers: [specifier],
        lineNumber: node.startPosition.row + 1
      });
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/cpp-extractor.ts
function unwrapDeclaratorName(node) {
  if (node.type === "identifier" || node.type === "field_identifier") {
    return node.text;
  }
  const inner = node.childForFieldName("declarator");
  if (inner) {
    return unwrapDeclaratorName(inner);
  }
  const id = findChild(node, "identifier") ?? findChild(node, "field_identifier");
  return id ? id.text : null;
}
function extractFuncDeclName(funcDecl) {
  const declNode = funcDecl.childForFieldName("declarator");
  if (!declNode) return null;
  if (declNode.type === "identifier" || declNode.type === "field_identifier") {
    return { name: declNode.text, qualifier: null };
  }
  if (declNode.type === "qualified_identifier") {
    const nameNode = declNode.childForFieldName("name");
    const nsNode = findChild(declNode, "namespace_identifier");
    return {
      name: nameNode ? nameNode.text : declNode.text,
      qualifier: nsNode ? nsNode.text : null
    };
  }
  return { name: declNode.text, qualifier: null };
}
function extractParams8(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  const decls = findChildren(paramsNode, "parameter_declaration");
  for (const decl of decls) {
    const declNode = decl.childForFieldName("declarator");
    if (declNode) {
      const name = unwrapDeclaratorName(declNode);
      if (name) {
        params.push(name);
      }
    }
  }
  return params;
}
function extractReturnType6(node) {
  const typeNode = node.childForFieldName("type");
  if (typeNode) {
    return typeNode.text;
  }
  return void 0;
}
function isStatic(node) {
  const storage = findChild(node, "storage_class_specifier");
  return storage !== null && storage.text === "static";
}
var CppExtractor = class {
  languageIds = ["cpp", "c"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    const methodsByClass = /* @__PURE__ */ new Map();
    this.walkTopLevel(rootNode, functions, classes, imports, exports, methodsByClass);
    for (const cls of classes) {
      const methods = methodsByClass.get(cls.name);
      if (methods) {
        for (const m of methods) {
          if (!cls.methods.includes(m)) {
            cls.methods.push(m);
          }
        }
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "function_definition") {
        const name = this.extractFunctionName(node);
        if (name) {
          functionStack.push(name);
          pushedName = true;
        }
      }
      if (node.type === "call_expression") {
        if (functionStack.length > 0) {
          const callee = this.extractCalleeName(node);
          if (callee) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  /**
   * Walk top-level declarations. Recurses into namespace_definition bodies
   * to find nested declarations.
   */
  walkTopLevel(parentNode, functions, classes, imports, exports, methodsByClass) {
    for (let i = 0; i < parentNode.childCount; i++) {
      const node = parentNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "preproc_include":
          this.extractInclude(node, imports);
          break;
        case "class_specifier":
          this.extractClassOrStruct(node, "class", classes, functions, exports);
          break;
        case "struct_specifier":
          this.extractClassOrStruct(node, "struct", classes, functions, exports);
          break;
        case "function_definition":
          this.extractFunctionDef(node, functions, exports, methodsByClass);
          break;
        case "namespace_definition": {
          const body = findChild(node, "declaration_list");
          if (body) {
            this.walkTopLevel(body, functions, classes, imports, exports, methodsByClass);
          }
          break;
        }
        case "declaration": {
          const innerClass = findChild(node, "class_specifier");
          if (innerClass) {
            this.extractClassOrStruct(innerClass, "class", classes, functions, exports);
          }
          const innerStruct = findChild(node, "struct_specifier");
          if (innerStruct) {
            this.extractClassOrStruct(innerStruct, "struct", classes, functions, exports);
          }
          break;
        }
      }
    }
  }
  /**
   * Extract the simple function name from a function_definition.
   * For qualified names (e.g., Server::start), returns just the method name.
   */
  extractFunctionName(node) {
    const declNode = node.childForFieldName("declarator");
    if (!declNode || declNode.type !== "function_declarator") return null;
    const info = extractFuncDeclName(declNode);
    return info ? info.name : null;
  }
  /**
   * Extract #include directives and map them to the imports array.
   *
   * `preproc_include` has a `path` field that is either:
   * - `system_lib_string` for angle-bracket includes: `<iostream>`
   * - `string_literal` for quoted includes: `"myfile.h"`
   */
  extractInclude(node, imports) {
    const pathNode = node.childForFieldName("path");
    if (!pathNode) return;
    let source;
    if (pathNode.type === "system_lib_string") {
      source = pathNode.text.replace(/^<|>$/g, "");
    } else if (pathNode.type === "string_literal") {
      const content = findChild(pathNode, "string_content");
      source = content ? content.text : pathNode.text.replace(/^"|"$/g, "");
    } else {
      source = pathNode.text;
    }
    imports.push({
      source,
      specifiers: [source],
      lineNumber: node.startPosition.row + 1
    });
  }
  /**
   * Extract class_specifier or struct_specifier into the classes array.
   *
   * Processes:
   * - Properties (field_declaration without function_declarator)
   * - Method declarations (field_declaration with function_declarator)
   * - Method definitions (function_definition inside the class body)
   * - Access specifiers (public/private/protected)
   *
   * Public members of classes and all members of structs (default public)
   * are treated as exports.
   */
  extractClassOrStruct(node, kind, classes, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const className = nameNode.text;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body && body.type === "field_declaration_list") {
      let currentAccess = kind === "struct" ? "public" : "private";
      for (let j = 0; j < body.childCount; j++) {
        const member = body.child(j);
        if (!member) continue;
        if (member.type === "access_specifier") {
          const specChild = member.child(0);
          if (specChild) {
            currentAccess = specChild.text;
          }
          continue;
        }
        if (member.type === "field_declaration") {
          const declNode = member.childForFieldName("declarator");
          if (declNode && declNode.type === "function_declarator") {
            const info = extractFuncDeclName(declNode);
            if (info) {
              methods.push(info.name);
              if (currentAccess === "public") {
                exports.push({
                  name: info.name,
                  lineNumber: member.startPosition.row + 1
                });
              }
            }
          } else if (declNode) {
            const name = unwrapDeclaratorName(declNode);
            if (name) {
              properties.push(name);
            }
          }
        }
        if (member.type === "function_definition") {
          const funcDecl = member.childForFieldName("declarator");
          if (funcDecl && funcDecl.type === "function_declarator") {
            const info = extractFuncDeclName(funcDecl);
            if (info) {
              methods.push(info.name);
              const paramsNode = funcDecl.childForFieldName("parameters");
              functions.push({
                name: info.name,
                lineRange: [
                  member.startPosition.row + 1,
                  member.endPosition.row + 1
                ],
                params: extractParams8(paramsNode),
                returnType: extractReturnType6(member)
              });
              if (currentAccess === "public") {
                exports.push({
                  name: info.name,
                  lineNumber: member.startPosition.row + 1
                });
              }
            }
          }
        }
      }
    }
    classes.push({
      name: className,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
    exports.push({
      name: className,
      lineNumber: node.startPosition.row + 1
    });
  }
  /**
   * Extract a free function or out-of-class method definition.
   *
   * For qualified names (e.g., `void Server::start()`), the method is:
   * - Added to the functions array
   * - Tracked in methodsByClass for later association with the class
   * - Exported if non-static
   *
   * Static functions are NOT exported.
   */
  extractFunctionDef(node, functions, exports, methodsByClass) {
    const funcDecl = node.childForFieldName("declarator");
    if (!funcDecl || funcDecl.type !== "function_declarator") return;
    const info = extractFuncDeclName(funcDecl);
    if (!info) return;
    const paramsNode = funcDecl.childForFieldName("parameters");
    const params = extractParams8(paramsNode);
    const returnType = extractReturnType6(node);
    functions.push({
      name: info.name,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    if (info.qualifier) {
      if (!methodsByClass.has(info.qualifier)) {
        methodsByClass.set(info.qualifier, []);
      }
      methodsByClass.get(info.qualifier).push(info.name);
    }
    if (!isStatic(node)) {
      exports.push({
        name: info.name,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  /**
   * Extract the callee name from a call_expression.
   *
   * Handles:
   * - Plain function call: `printf(...)` -> "printf"
   * - Member call via field_expression: `p->method()` -> "p->method"
   * - Scoped call: `std::cout << ...` -> qualified name text
   */
  extractCalleeName(callNode) {
    const funcNode = callNode.child(0);
    if (!funcNode) return null;
    if (funcNode.type === "identifier") {
      return funcNode.text;
    }
    if (funcNode.type === "field_expression") {
      const field = funcNode.childForFieldName("field");
      return field ? field.text : funcNode.text;
    }
    if (funcNode.type === "qualified_identifier") {
      return funcNode.text;
    }
    return funcNode.text;
  }
};

// vendor/understand-anything/core/plugins/extractors/csharp-extractor.ts
function extractParams9(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  const paramNodes = findChildren(paramsNode, "parameter");
  for (const param of paramNodes) {
    const nameNode = param.childForFieldName("name");
    if (nameNode) {
      params.push(nameNode.text);
    }
  }
  return params;
}
function extractReturnType7(node) {
  const typeNode = node.childForFieldName("returns");
  if (!typeNode) return void 0;
  return typeNode.text;
}
function hasModifier2(node, modifier) {
  const modifierNodes = findChildren(node, "modifier");
  for (const mod of modifierNodes) {
    for (let i = 0; i < mod.childCount; i++) {
      const child = mod.child(i);
      if (child && child.text === modifier) return true;
    }
  }
  return false;
}
function extractUsingSource(node) {
  const hasEquals = findChild(node, "=") !== null;
  if (hasEquals) {
    const qualifiedName2 = findChild(node, "qualified_name");
    return qualifiedName2 ? qualifiedName2.text : null;
  }
  const qualifiedName = findChild(node, "qualified_name");
  if (qualifiedName) return qualifiedName.text;
  const identifier = findChild(node, "identifier");
  return identifier ? identifier.text : null;
}
function lastComponent2(path) {
  const parts = path.split(".");
  return parts[parts.length - 1];
}
function extractInvocationName(node) {
  const funcNode = node.childForFieldName("function");
  if (!funcNode) return null;
  return funcNode.text;
}
var CSharpExtractor = class {
  languageIds = ["csharp"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    this.walkTopLevel(rootNode, functions, classes, imports, exports);
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walkForCalls = (node) => {
      let pushedName = false;
      if (node.type === "method_declaration" || node.type === "constructor_declaration") {
        const nameNode = node.childForFieldName("name");
        if (nameNode) {
          functionStack.push(nameNode.text);
          pushedName = true;
        }
      }
      if (node.type === "invocation_expression") {
        if (functionStack.length > 0) {
          const callee = extractInvocationName(node);
          if (callee) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      if (node.type === "object_creation_expression") {
        if (functionStack.length > 0) {
          const typeNode = findChild(node, "identifier") ?? findChild(node, "generic_name");
          if (typeNode) {
            entries.push({
              caller: functionStack[functionStack.length - 1],
              callee: `new ${typeNode.text}`,
              lineNumber: node.startPosition.row + 1
            });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walkForCalls(child);
      }
      if (pushedName) {
        functionStack.pop();
      }
    };
    walkForCalls(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  /**
   * Walk the top-level nodes of a compilation_unit, recursing into
   * namespace bodies to find declarations.
   */
  walkTopLevel(node, functions, classes, imports, exports) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      switch (child.type) {
        case "using_directive":
          this.extractUsing(child, imports);
          break;
        case "namespace_declaration":
          this.walkNamespaceBody(child, functions, classes, imports, exports);
          break;
        case "file_scoped_namespace_declaration":
          break;
        case "class_declaration":
        case "record_declaration":
        case "struct_declaration":
          this.extractClass(child, functions, classes, exports);
          break;
        case "interface_declaration":
          this.extractInterface(child, functions, classes, exports);
          break;
      }
    }
  }
  /**
   * Walk into a namespace_declaration's body (declaration_list) to find
   * classes, interfaces, and nested namespaces.
   */
  walkNamespaceBody(nsNode, functions, classes, imports, exports) {
    const body = nsNode.childForFieldName("body");
    if (!body) return;
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      switch (child.type) {
        case "class_declaration":
        case "record_declaration":
        case "struct_declaration":
          this.extractClass(child, functions, classes, exports);
          break;
        case "interface_declaration":
          this.extractInterface(child, functions, classes, exports);
          break;
        case "namespace_declaration":
          this.walkNamespaceBody(child, functions, classes, imports, exports);
          break;
      }
    }
  }
  extractUsing(node, imports) {
    const source = extractUsingSource(node);
    if (!source) return;
    imports.push({
      source,
      specifiers: [lastComponent2(source)],
      lineNumber: node.startPosition.row + 1
    });
  }
  extractClass(node, functions, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      this.extractClassBodyMembers(body, methods, properties, functions, exports);
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
    if (hasModifier2(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractInterface(node, functions, classes, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const methods = [];
    const properties = [];
    const body = node.childForFieldName("body");
    if (body) {
      const methodNodes = findChildren(body, "method_declaration");
      for (const methodNode of methodNodes) {
        const methNameNode = methodNode.childForFieldName("name");
        if (methNameNode) {
          methods.push(methNameNode.text);
        }
      }
      const propNodes = findChildren(body, "property_declaration");
      for (const propNode of propNodes) {
        const propNameNode = propNode.childForFieldName("name");
        if (propNameNode) {
          properties.push(propNameNode.text);
        }
      }
    }
    classes.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      methods,
      properties
    });
    if (hasModifier2(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  /**
   * Extract methods, constructors, properties, and fields from a
   * class declaration_list body.
   */
  extractClassBodyMembers(body, methods, properties, functions, exports) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      switch (child.type) {
        case "method_declaration":
          this.extractMethod(child, methods, functions, exports);
          break;
        case "constructor_declaration":
          this.extractConstructor(child, methods, functions, exports);
          break;
        case "property_declaration":
          this.extractProperty(child, properties, exports);
          break;
        case "field_declaration":
          this.extractField(child, properties, exports);
          break;
      }
    }
  }
  extractMethod(node, methods, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams9(paramsNode ?? null);
    const returnType = extractReturnType7(node);
    methods.push(nameNode.text);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params,
      returnType
    });
    if (hasModifier2(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractConstructor(node, methods, functions, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    const paramsNode = node.childForFieldName("parameters");
    const params = extractParams9(paramsNode ?? null);
    methods.push(nameNode.text);
    functions.push({
      name: nameNode.text,
      lineRange: [
        node.startPosition.row + 1,
        node.endPosition.row + 1
      ],
      params
      // Constructors have no return type
    });
    if (hasModifier2(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractProperty(node, properties, exports) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;
    properties.push(nameNode.text);
    if (hasModifier2(node, "public")) {
      exports.push({
        name: nameNode.text,
        lineNumber: node.startPosition.row + 1
      });
    }
  }
  extractField(node, properties, exports) {
    const varDecl = findChild(node, "variable_declaration");
    if (!varDecl) return;
    const declarators = findChildren(varDecl, "variable_declarator");
    for (const decl of declarators) {
      const nameNode = findChild(decl, "identifier");
      if (nameNode) {
        properties.push(nameNode.text);
        if (hasModifier2(node, "public")) {
          exports.push({
            name: nameNode.text,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
    }
  }
};

// vendor/understand-anything/core/plugins/extractors/kotlin-extractor.ts
function extractVisibility(declNode) {
  const modifiers = findChild(declNode, "modifiers");
  if (!modifiers) return null;
  const visibility = findChild(modifiers, "visibility_modifier");
  if (!visibility) return null;
  return visibility.text;
}
function isExported2(declNode) {
  const visibility = extractVisibility(declNode);
  return visibility === null || visibility !== "private";
}
function extractDeclarationName(declNode) {
  for (let i = 0; i < declNode.childCount; i++) {
    const child = declNode.child(i);
    if (child && child.type === "identifier") return child.text;
  }
  return null;
}
function extractParams10(declNode) {
  const params = [];
  const valueParams = findChild(declNode, "function_value_parameters");
  if (!valueParams) return params;
  for (const param of findChildren(valueParams, "parameter")) {
    const id = findChild(param, "identifier");
    if (id) params.push(id.text);
  }
  return params;
}
function extractReturnType8(declNode) {
  let sawParams = false;
  for (let i = 0; i < declNode.childCount; i++) {
    const child = declNode.child(i);
    if (!child) continue;
    if (child.type === "function_value_parameters") {
      sawParams = true;
      continue;
    }
    if (sawParams && child.type === ":") {
      for (let j = i + 1; j < declNode.childCount; j++) {
        const next = declNode.child(j);
        if (next && next.isNamed) return next.text;
      }
    }
  }
  return void 0;
}
function collectClassBody(body, methods, properties, functions, exports) {
  for (let i = 0; i < body.childCount; i++) {
    const member = body.child(i);
    if (!member) continue;
    if (member.type === "function_declaration") {
      const name = extractDeclarationName(member);
      if (!name) continue;
      methods.push(name);
      functions.push({
        name,
        lineRange: [member.startPosition.row + 1, member.endPosition.row + 1],
        params: extractParams10(member),
        returnType: extractReturnType8(member)
      });
      if (isExported2(member)) {
        exports.push({ name, lineNumber: member.startPosition.row + 1 });
      }
    } else if (member.type === "property_declaration") {
      const name = extractPropertyName(member);
      if (name) properties.push(name);
      if (name && isExported2(member)) {
        exports.push({ name, lineNumber: member.startPosition.row + 1 });
      }
    } else if (member.type === "object_declaration") {
      const name = extractDeclarationName(member);
      if (name) properties.push(name);
    }
  }
}
function extractPropertyName(propNode) {
  const varDecl = findChild(propNode, "variable_declaration");
  if (!varDecl) return null;
  const id = findChild(varDecl, "identifier");
  return id ? id.text : null;
}
function collectPrimaryConstructorProperties(declNode, properties) {
  const primary = findChild(declNode, "primary_constructor");
  if (!primary) return;
  const params = findChild(primary, "class_parameters");
  if (!params) return;
  for (const param of findChildren(params, "class_parameter")) {
    let isProperty = false;
    for (let i = 0; i < param.childCount; i++) {
      const child = param.child(i);
      if (child && (child.type === "val" || child.type === "var")) {
        isProperty = true;
        break;
      }
    }
    if (!isProperty) continue;
    const id = findChild(param, "identifier");
    if (id) properties.push(id.text);
  }
}
var KotlinExtractor = class {
  languageIds = ["kotlin"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i);
      if (!node) continue;
      switch (node.type) {
        case "package_header":
          break;
        case "import":
          this.extractImport(node, imports);
          break;
        case "function_declaration":
          this.extractTopLevelFunction(node, functions, exports);
          break;
        case "class_declaration":
          this.extractClassDeclaration(node, classes, functions, exports);
          break;
        case "object_declaration":
          this.extractObjectDeclaration(node, classes, functions, exports);
          break;
      }
    }
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walk2 = (node) => {
      let pushed = false;
      if (node.type === "function_declaration") {
        const name = extractDeclarationName(node);
        if (name) {
          functionStack.push(name);
          pushed = true;
        }
      }
      if (node.type === "call_expression" && functionStack.length > 0) {
        const callee = this.extractCalleeName(node);
        if (callee) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk2(child);
      }
      if (pushed) functionStack.pop();
    };
    walk2(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  extractTopLevelFunction(declNode, functions, exports) {
    const name = extractDeclarationName(declNode);
    if (!name) return;
    functions.push({
      name,
      lineRange: [declNode.startPosition.row + 1, declNode.endPosition.row + 1],
      params: extractParams10(declNode),
      returnType: extractReturnType8(declNode)
    });
    if (isExported2(declNode)) {
      exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
    }
  }
  extractClassDeclaration(declNode, classes, functions, exports) {
    const name = extractDeclarationName(declNode);
    if (!name) return;
    const properties = [];
    const methods = [];
    collectPrimaryConstructorProperties(declNode, properties);
    const body = findChild(declNode, "class_body");
    if (body) {
      collectClassBody(body, methods, properties, functions, exports);
    }
    classes.push({
      name,
      lineRange: [declNode.startPosition.row + 1, declNode.endPosition.row + 1],
      methods,
      properties
    });
    if (isExported2(declNode)) {
      exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
    }
  }
  extractObjectDeclaration(declNode, classes, functions, exports) {
    const name = extractDeclarationName(declNode);
    if (!name) return;
    const properties = [];
    const methods = [];
    const body = findChild(declNode, "class_body");
    if (body) {
      collectClassBody(body, methods, properties, functions, exports);
    }
    classes.push({
      name,
      lineRange: [declNode.startPosition.row + 1, declNode.endPosition.row + 1],
      methods,
      properties
    });
    if (isExported2(declNode)) {
      exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
    }
  }
  /**
   * Extract a Kotlin import.
   *
   * The grammar gives us a single `qualified_identifier` child holding the
   * dotted module path. Three trailing variants must be distinguished:
   *
   * - `import foo.bar.Baz`            → source="foo.bar.Baz", specifier="Baz"
   * - `import foo.bar.*`              → source="foo.bar",     specifier="*"
   * - `import foo.bar.Baz as Quux`    → source="foo.bar.Baz", specifier="Quux"
   *
   * The grammar represents the wildcard as a trailing `*` token AFTER the
   * qualified_identifier (which holds the dotted prefix). The alias
   * appears as `as` + a top-level `identifier` sibling.
   */
  extractImport(declNode, imports) {
    const qualified = findChild(declNode, "qualified_identifier");
    if (!qualified) return;
    const parts = [];
    for (const id of findChildren(qualified, "identifier")) {
      parts.push(id.text);
    }
    if (parts.length === 0) return;
    const source = parts.join(".");
    let specifier = parts[parts.length - 1];
    let sawWildcardStar = false;
    let sawAs = false;
    for (let i = 0; i < declNode.childCount; i++) {
      const child = declNode.child(i);
      if (!child) continue;
      if (child.type === "*") sawWildcardStar = true;
      if (child.type === "as") sawAs = true;
      else if (sawAs && child.type === "identifier") {
        specifier = child.text;
        sawAs = false;
      }
    }
    if (sawWildcardStar) specifier = "*";
    imports.push({
      source,
      specifiers: [specifier],
      lineNumber: declNode.startPosition.row + 1
    });
  }
  /**
   * Extract the callee name from a Kotlin `call_expression`. Two shapes:
   *
   *   foo(...)              → first child is `identifier "foo"`
   *   target.method(...)    → first child is `navigation_expression` whose
   *                           last `navigation_suffix > identifier` is the
   *                           method name
   */
  extractCalleeName(callNode) {
    const first = callNode.child(0);
    if (!first) return null;
    if (first.type === "identifier") return first.text;
    if (first.type === "navigation_expression") {
      let lastIdentifier = null;
      for (let i = 0; i < first.childCount; i++) {
        const child = first.child(i);
        if (child && child.type === "identifier") {
          lastIdentifier = child.text;
        }
      }
      return lastIdentifier;
    }
    return null;
  }
};

// vendor/understand-anything/core/plugins/extractors/scala-extractor.ts
var TYPE_DEFINITION_KINDS = /* @__PURE__ */ new Set([
  "class_definition",
  "trait_definition",
  "object_definition",
  "package_object",
  "enum_definition"
]);
var FUNCTION_DEFINITION_KINDS = /* @__PURE__ */ new Set([
  "function_definition",
  "function_declaration"
]);
var FIELD_DEFINITION_KINDS = /* @__PURE__ */ new Set([
  "val_definition",
  "var_definition",
  "val_declaration",
  "var_declaration"
]);
function extractAccessModifier(declNode) {
  const modifiers = findChild(declNode, "modifiers");
  if (!modifiers) return null;
  const access = findChild(modifiers, "access_modifier");
  if (!access) return null;
  return access.text;
}
function isExported3(declNode) {
  const access = extractAccessModifier(declNode);
  return access === null || !access.startsWith("private");
}
function extractDeclarationName2(declNode) {
  for (let i = 0; i < declNode.childCount; i++) {
    const child = declNode.child(i);
    if (child && child.type === "identifier") return child.text;
  }
  return null;
}
function extractParams11(declNode) {
  const params = [];
  for (const paramList of findChildren(declNode, "parameters")) {
    for (const param of findChildren(paramList, "parameter")) {
      const id = findChild(param, "identifier");
      if (id) params.push(id.text);
    }
  }
  return params;
}
function extractReturnType9(declNode) {
  for (let i = 0; i < declNode.childCount; i++) {
    const child = declNode.child(i);
    if (!child || child.type !== ":") continue;
    for (let j = i + 1; j < declNode.childCount; j++) {
      const next = declNode.child(j);
      if (next && next.isNamed) return next.text;
    }
  }
  return void 0;
}
function isCaseDefinition(declNode) {
  for (let i = 0; i < declNode.childCount; i++) {
    const child = declNode.child(i);
    if (child && child.type === "case") return true;
    if (child && child.type === "identifier") break;
  }
  return false;
}
function collectClassParameterProperties(declNode, properties) {
  const caseClass = isCaseDefinition(declNode);
  for (const paramList of findChildren(declNode, "class_parameters")) {
    for (const param of findChildren(paramList, "class_parameter")) {
      let isProperty = caseClass;
      if (!isProperty) {
        for (let i = 0; i < param.childCount; i++) {
          const child = param.child(i);
          if (child && (child.type === "val" || child.type === "var")) {
            isProperty = true;
            break;
          }
        }
      }
      if (!isProperty) continue;
      const id = findChild(param, "identifier");
      if (id) properties.push(id.text);
    }
  }
}
function extractFieldName(fieldNode) {
  return extractDeclarationName2(fieldNode);
}
var ScalaExtractor = class {
  languageIds = ["scala"];
  extractStructure(rootNode) {
    const functions = [];
    const classes = [];
    const imports = [];
    const exports = [];
    this.walkTopLevel(rootNode, functions, classes, imports, exports);
    return { functions, classes, imports, exports };
  }
  extractCallGraph(rootNode) {
    const entries = [];
    const functionStack = [];
    const walk2 = (node) => {
      let pushed = false;
      if (node.type === "function_definition") {
        const name = extractDeclarationName2(node);
        if (name) {
          functionStack.push(name);
          pushed = true;
        }
      }
      if (functionStack.length > 0) {
        const callee = this.extractCallLikeName(node);
        if (callee) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee,
            lineNumber: node.startPosition.row + 1
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk2(child);
      }
      if (pushed) functionStack.pop();
    };
    walk2(rootNode);
    return entries;
  }
  // ---- Private helpers ----
  /**
   * Walk the direct children of the compilation unit (or of a braceless
   * `package foo { ... }` / top-level region) and dispatch declarations.
   */
  walkTopLevel(node, functions, classes, imports, exports) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      if (child.type === "package_clause") {
        this.walkTopLevel(child, functions, classes, imports, exports);
      } else if (child.type === "template_body") {
        this.walkTopLevel(child, functions, classes, imports, exports);
      } else if (child.type === "import_declaration") {
        this.extractImport(child, imports);
      } else if (child.type === "export_declaration") {
        this.extractExportDeclaration(child, exports);
      } else if (FUNCTION_DEFINITION_KINDS.has(child.type)) {
        this.extractFunction(child, functions, exports);
      } else if (TYPE_DEFINITION_KINDS.has(child.type)) {
        this.extractTypeDefinition(child, classes, functions, exports);
      } else if (FIELD_DEFINITION_KINDS.has(child.type)) {
        const name = extractFieldName(child);
        if (name && isExported3(child)) {
          exports.push({ name, lineNumber: child.startPosition.row + 1 });
        }
      } else if (child.type === "extension_definition") {
        this.extractExtensionDefinition(child, null, functions, exports);
      } else if (child.type === "given_definition") {
        const name = extractDeclarationName2(child);
        if (name && isExported3(child)) {
          exports.push({ name, lineNumber: child.startPosition.row + 1 });
        }
      }
    }
  }
  extractFunction(declNode, functions, exports, exportAllowed = true) {
    const name = extractDeclarationName2(declNode);
    if (!name) return;
    functions.push({
      name,
      lineRange: [declNode.startPosition.row + 1, declNode.endPosition.row + 1],
      params: extractParams11(declNode),
      returnType: extractReturnType9(declNode)
    });
    if (exportAllowed && isExported3(declNode)) {
      exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
    }
  }
  /**
   * Extract a class / trait / object / enum definition. Nested type
   * definitions inside the body (the companion-object ADT idiom:
   * `object Command { case class Create(...) }`) are recursed into and
   * surfaced as their own class entries.
   */
  extractTypeDefinition(declNode, classes, functions, exports, exportAllowed = true) {
    const name = extractDeclarationName2(declNode);
    if (!name) return;
    const properties = [];
    const methods = [];
    const memberExportAllowed = exportAllowed && isExported3(declNode);
    collectClassParameterProperties(declNode, properties);
    const body = findChild(declNode, "template_body") ?? findChild(declNode, "enum_body");
    if (body) {
      this.collectTemplateBody(
        body,
        methods,
        properties,
        classes,
        functions,
        exports,
        memberExportAllowed
      );
    }
    classes.push({
      name,
      lineRange: [declNode.startPosition.row + 1, declNode.endPosition.row + 1],
      methods,
      properties
    });
    if (memberExportAllowed) {
      exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
    }
  }
  /**
   * Walk a `template_body` / `enum_body` and collect member functions and
   * fields. Function entries are added to both the type's `methods` array
   * and the top-level `functions` array (matching the Go / Swift / Kotlin
   * extractor convention).
   */
  collectTemplateBody(body, methods, properties, classes, functions, exports, exportAllowed = true) {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i);
      if (!member) continue;
      if (FUNCTION_DEFINITION_KINDS.has(member.type)) {
        const name = extractDeclarationName2(member);
        if (!name) continue;
        methods.push(name);
        functions.push({
          name,
          lineRange: [member.startPosition.row + 1, member.endPosition.row + 1],
          params: extractParams11(member),
          returnType: extractReturnType9(member)
        });
        if (exportAllowed && isExported3(member)) {
          exports.push({ name, lineNumber: member.startPosition.row + 1 });
        }
      } else if (FIELD_DEFINITION_KINDS.has(member.type)) {
        const name = extractFieldName(member);
        if (!name) continue;
        properties.push(name);
        if (exportAllowed && isExported3(member)) {
          exports.push({ name, lineNumber: member.startPosition.row + 1 });
        }
      } else if (TYPE_DEFINITION_KINDS.has(member.type)) {
        this.extractTypeDefinition(member, classes, functions, exports, exportAllowed);
      } else if (member.type === "extension_definition") {
        this.extractExtensionDefinition(
          member,
          methods,
          functions,
          exports,
          exportAllowed
        );
      } else if (member.type === "enum_case_definitions") {
        for (let j = 0; j < member.childCount; j++) {
          const enumCase = member.child(j);
          if (!enumCase || !enumCase.isNamed) continue;
          const id = findChild(enumCase, "identifier");
          if (id) properties.push(id.text);
        }
      }
    }
  }
  /**
   * Extract a Scala import. The dotted prefix is a run of direct
   * `identifier` children; the trailing element decides the shape:
   *
   * - `import cats.effect.IO`          → source="cats.effect.IO", specifiers=["IO"]
   * - `import cats.effect._` / `.*`    → source="cats.effect",    specifiers=["*"]
   * - `import a.{B, C => D, E as F}`   → source="a",               specifiers=["B", "D", "F"]
   */
  extractImport(declNode, imports) {
    const itemChildren = [];
    let current = [];
    for (let i = 0; i < declNode.childCount; i++) {
      const child = declNode.child(i);
      if (!child) continue;
      if (child.type === ",") {
        if (current.length > 0) itemChildren.push(current);
        current = [];
      } else if (child.isNamed) {
        current.push(child);
      }
    }
    if (current.length > 0) itemChildren.push(current);
    for (const item of itemChildren) {
      this.extractImportItem(item, declNode.startPosition.row + 1, imports);
    }
  }
  extractImportItem(itemChildren, lineNumber, imports) {
    const parts = [];
    for (const child of itemChildren) {
      if (child.type === "identifier") parts.push(child.text);
    }
    const selectors = itemChildren.find((child) => child.type === "namespace_selectors");
    const wildcard = itemChildren.find((child) => child.type === "namespace_wildcard");
    let source;
    let specifiers;
    if (wildcard) {
      if (parts.length === 0) return;
      source = parts.join(".");
      specifiers = ["*"];
    } else if (selectors) {
      if (parts.length === 0) return;
      source = parts.join(".");
      specifiers = this.extractSelectorSpecifiers(selectors);
      if (specifiers.length === 0) specifiers = ["*"];
    } else {
      if (parts.length === 0) return;
      source = parts.join(".");
      specifiers = [parts[parts.length - 1]];
    }
    imports.push({
      source,
      specifiers,
      lineNumber
    });
  }
  /**
   * Extract the imported names from a `{ ... }` selector list. Renames
   * (`A => B` in Scala 2, `A as B` in Scala 3) surface the source name so
   * file resolution can still probe `A.scala`; excluded `A => _` selectors
   * are skipped. `given` / `*` selectors surface as "*".
   */
  extractSelectorSpecifiers(selectors) {
    const specifiers = [];
    for (let i = 0; i < selectors.childCount; i++) {
      const child = selectors.child(i);
      if (!child || !child.isNamed) continue;
      if (child.type === "identifier") {
        specifiers.push(child.text);
      } else if (child.type === "namespace_wildcard") {
        specifiers.push("*");
      } else {
        if (findChild(child, "wildcard")) continue;
        const ids = findChildren(child, "identifier");
        if (ids.length > 0) specifiers.push(ids[0].text);
      }
    }
    return specifiers;
  }
  extractExtensionDefinition(declNode, methods, functions, exports, exportAllowed = true) {
    for (const fn of findChildren(declNode, "function_definition")) {
      const name = extractDeclarationName2(fn);
      if (name && methods) methods.push(name);
      this.extractFunction(fn, functions, exports, exportAllowed);
    }
  }
  extractExportDeclaration(declNode, exports) {
    const selectors = findChild(declNode, "namespace_selectors");
    const names = selectors ? this.extractExportSelectorNames(selectors) : this.extractExportedPathName(declNode);
    for (const name of names) {
      if (name !== "*") {
        exports.push({ name, lineNumber: declNode.startPosition.row + 1 });
      }
    }
  }
  extractExportSelectorNames(selectors) {
    const names = [];
    for (let i = 0; i < selectors.childCount; i++) {
      const child = selectors.child(i);
      if (!child || !child.isNamed) continue;
      if (child.type === "identifier") {
        names.push(child.text);
      } else if (child.type === "namespace_wildcard") {
        names.push("*");
      } else if (!findChild(child, "wildcard")) {
        const ids = findChildren(child, "identifier");
        if (ids.length > 0) names.push(ids[ids.length - 1].text);
      }
    }
    return names;
  }
  extractExportedPathName(declNode) {
    let name = null;
    for (const id of findChildren(declNode, "identifier")) {
      name = id.text;
    }
    return name ? [name] : [];
  }
  /**
   * Extract the callee name from a Scala `call_expression`. Shapes:
   *
   *   foo(...)                → identifier "foo"
   *   target.method(...)      → field_expression whose last identifier is
   *                             the method name
   *   foo[T](...) / x.f[T](…) → generic_function wrapping either shape
   */
  extractCallLikeName(node) {
    if (node.type === "call_expression") return this.extractCalleeName(node);
    if (node.type === "infix_expression") return this.extractInfixName(node);
    if (node.type === "instance_expression") return this.extractConstructorName(node);
    return null;
  }
  extractCalleeName(callNode) {
    let target = callNode.child(0);
    if (!target) return null;
    if (target.type === "generic_function") {
      target = target.child(0);
      if (!target) return null;
    }
    if (target.type === "identifier") return target.text;
    if (target.type === "field_expression") {
      let lastIdentifier = null;
      for (let i = 0; i < target.childCount; i++) {
        const child = target.child(i);
        if (child && child.type === "identifier") {
          lastIdentifier = child.text;
        }
      }
      return lastIdentifier;
    }
    return null;
  }
  extractInfixName(infixNode) {
    const identifiers = [];
    for (let i = 0; i < infixNode.childCount; i++) {
      const child = infixNode.child(i);
      if (child && child.type === "identifier") identifiers.push(child.text);
    }
    return identifiers[1] ?? identifiers[0] ?? null;
  }
  extractConstructorName(instanceNode) {
    for (let i = 0; i < instanceNode.childCount; i++) {
      const child = instanceNode.child(i);
      if (child && (child.type === "type_identifier" || child.type === "identifier")) {
        return child.text;
      }
    }
    return null;
  }
};

// vendor/understand-anything/core/plugins/extractors/index.ts
var builtinExtractors = [
  new TypeScriptExtractor(),
  new PythonExtractor(),
  new GoExtractor(),
  new RustExtractor(),
  new JavaExtractor(),
  new RubyExtractor(),
  new PhpExtractor(),
  new CppExtractor(),
  new CSharpExtractor(),
  new KotlinExtractor(),
  new ScalaExtractor()
];

// vendor/understand-anything/core/plugins/tree-sitter-plugin.ts
var require2 = createRequire(import.meta.url);
var TreeSitterPlugin = class _TreeSitterPlugin {
  name = "tree-sitter";
  languages;
  configs;
  /**
   * Neo modification.
   *
   * Upstream locates grammar `.wasm` files with `require.resolve(...)` against
   * the analyzer's own `node_modules`. Neo runs this bundled inside an
   * agent-server sandbox, where the grammars are uploaded next to the bundle
   * and there is no installed package tree to resolve against. When supplied,
   * this resolver is used instead; when omitted, upstream behaviour is
   * unchanged.
   */
  wasmResolver;
  // Pre-loaded parser constructor and languages (set by init())
  _ParserClass = null;
  _languages = /* @__PURE__ */ new Map();
  _extensionToLang = /* @__PURE__ */ new Map();
  // One reusable parser per language key. web-tree-sitter parsers are reusable
  // across parse() calls (only the Tree is per-parse, and it's still deleted);
  // creating + setLanguage + delete on every call wasted an allocation and a
  // WASM setLanguage on every file. Cached here, created lazily on first use.
  _parsers = /* @__PURE__ */ new Map();
  _initialized = false;
  // Language-specific extractors (keyed by language id)
  extractors = /* @__PURE__ */ new Map();
  /**
   * Create a TreeSitterPlugin with the given language configs.
   * Only configs that have a `treeSitter` field will be loaded.
   * If no configs are provided, defaults to TypeScript and JavaScript.
   *
   * @param configs Language configurations to load
   * @param extractors Optional language extractors; if none provided, registers all builtin extractors
   * @param wasmResolver Neo modification — see `wasmResolver` below.
   */
  constructor(configs, extractors, wasmResolver) {
    this.wasmResolver = wasmResolver;
    if (configs) {
      this.configs = configs.filter((c) => c.treeSitter);
    } else {
      this.configs = [];
    }
    const langs = [];
    for (const config2 of this.configs) {
      langs.push(config2.id);
      for (const ext of config2.extensions) {
        const key = ext.startsWith(".") ? ext : `.${ext}`;
        this._extensionToLang.set(key, config2.id);
      }
    }
    if (langs.length === 0) {
      langs.push("typescript", "javascript");
      this._extensionToLang.set(".ts", "typescript");
      this._extensionToLang.set(".tsx", "typescript");
      this._extensionToLang.set(".js", "javascript");
      this._extensionToLang.set(".mjs", "javascript");
      this._extensionToLang.set(".cjs", "javascript");
      this._extensionToLang.set(".jsx", "javascript");
    }
    this.languages = langs;
    if (extractors && extractors.length > 0) {
      for (const extractor of extractors) {
        this.registerExtractor(extractor);
      }
    } else {
      for (const extractor of builtinExtractors) {
        this.registerExtractor(extractor);
      }
    }
  }
  registerExtractor(extractor) {
    for (const id of extractor.languageIds) {
      this.extractors.set(id, extractor);
    }
  }
  getExtractor(langKey) {
    const key = langKey === "tsx" ? "typescript" : langKey;
    return this.extractors.get(key) ?? null;
  }
  languageKeyFromPath(filePath) {
    const ext = extname(filePath).toLowerCase();
    if (ext === ".tsx") return "tsx";
    return this._extensionToLang.get(ext) ?? null;
  }
  /**
   * Neo modification — routes grammar lookup through the injected
   * resolver when one was supplied, falling back to upstream's
   * `require.resolve` otherwise.
   */
  resolveWasm(wasmPackage, wasmFile) {
    if (this.wasmResolver) return this.wasmResolver(wasmPackage, wasmFile);
    return require2.resolve(`${wasmPackage}/${wasmFile}`);
  }
  /**
   * Initialize the plugin by loading the WASM module and all language grammars.
   * Must be called (and awaited) before any synchronous methods.
   */
  async init() {
    if (this._initialized) return;
    const mod = await import("web-tree-sitter");
    const ParserCls = mod.Parser;
    const LanguageCls = mod.Language;
    await ParserCls.init();
    this._ParserClass = ParserCls;
    if (this.configs.length > 0) {
      const loadPromises = [];
      for (const config2 of this.configs) {
        if (!config2.treeSitter) continue;
        const loadGrammar = async () => {
          try {
            const wasmPath = this.resolveWasm(
              config2.treeSitter.wasmPackage,
              config2.treeSitter.wasmFile
            );
            const lang = await LanguageCls.load(wasmPath);
            this._languages.set(config2.id, lang);
            if (config2.id === "typescript") {
              try {
                const tsxWasm = this.resolveWasm(
                  config2.treeSitter.wasmPackage,
                  "tree-sitter-tsx.wasm"
                );
                const tsxLang = await LanguageCls.load(tsxWasm);
                this._languages.set("tsx", tsxLang);
              } catch {
              }
            }
          } catch {
            console.debug?.(
              `tree-sitter: Could not load grammar for ${config2.id}, skipping structural analysis`
            );
          }
        };
        loadPromises.push(loadGrammar());
      }
      await Promise.all(loadPromises);
    } else {
      const tsWasm = this.resolveWasm(
        "tree-sitter-typescript",
        "tree-sitter-typescript.wasm"
      );
      const tsxWasm = this.resolveWasm(
        "tree-sitter-typescript",
        "tree-sitter-tsx.wasm"
      );
      const jsWasm = this.resolveWasm(
        "tree-sitter-javascript",
        "tree-sitter-javascript.wasm"
      );
      const [tsLang, tsxLang, jsLang] = await Promise.all([
        LanguageCls.load(tsWasm),
        LanguageCls.load(tsxWasm),
        LanguageCls.load(jsWasm)
      ]);
      this._languages.set("typescript", tsLang);
      this._languages.set("tsx", tsxLang);
      this._languages.set("javascript", jsLang);
    }
    this._initialized = true;
  }
  /**
   * Create a parser set to the appropriate language for the given file.
   * This is synchronous because all languages are pre-loaded during init().
   */
  getParser(filePath) {
    if (!this._initialized || !this._ParserClass) {
      throw new Error(
        "TreeSitterPlugin.init() must be called before use"
      );
    }
    const langKey = this.languageKeyFromPath(filePath);
    if (!langKey) return null;
    const lang = this._languages.get(langKey);
    if (!lang) {
      return null;
    }
    let parser = this._parsers.get(langKey);
    if (!parser) {
      parser = new this._ParserClass();
      parser.setLanguage(lang);
      this._parsers.set(langKey, parser);
    }
    return parser;
  }
  // Fresh object AND fresh arrays on every call — a shared static would leak
  // the same array instances to every caller, so one caller mutating its
  // result would corrupt everyone else's.
  static emptyStructure() {
    return { functions: [], classes: [], imports: [], exports: [] };
  }
  analyzeFile(filePath, content) {
    const parser = this.getParser(filePath);
    if (!parser) {
      return { functions: [], classes: [], imports: [], exports: [] };
    }
    const tree = parser.parse(content);
    if (!tree) {
      return { functions: [], classes: [], imports: [], exports: [] };
    }
    const langKey = this.languageKeyFromPath(filePath);
    const extractor = langKey ? this.getExtractor(langKey) : null;
    let result;
    if (extractor) {
      result = extractor.extractStructure(tree.rootNode);
    } else {
      result = { functions: [], classes: [], imports: [], exports: [] };
    }
    tree.delete();
    return result;
  }
  /**
   * Parse the file ONCE and return both structural analysis and the call
   * graph. `extract-structure.mjs` runs `analyzeFile` then `extractCallGraph`
   * on every code file — two full tree-sitter parses of identical content.
   * Both extractors are pure functions of the same rootNode, so a single
   * parse yields byte-identical results (verified) at ~40% less parse work
   * on the indexing hot path. Callers without this method fall back to the
   * two separate calls.
   */
  analyzeFileFull(filePath, content) {
    const parser = this.getParser(filePath);
    if (!parser) {
      return { structure: _TreeSitterPlugin.emptyStructure(), callGraph: [] };
    }
    const tree = parser.parse(content);
    if (!tree) {
      return { structure: _TreeSitterPlugin.emptyStructure(), callGraph: [] };
    }
    const langKey = this.languageKeyFromPath(filePath);
    const extractor = langKey ? this.getExtractor(langKey) : null;
    const structure = extractor ? extractor.extractStructure(tree.rootNode) : _TreeSitterPlugin.emptyStructure();
    const callGraph = extractor ? extractor.extractCallGraph(tree.rootNode) : [];
    tree.delete();
    return { structure, callGraph };
  }
  resolveImports(filePath, content) {
    const analysis = this.analyzeFile(filePath, content);
    const dir = dirname(filePath);
    return analysis.imports.map((imp) => {
      let resolvedPath;
      if (imp.source.startsWith("./") || imp.source.startsWith("../")) {
        resolvedPath = resolve(dir, imp.source);
      } else {
        resolvedPath = imp.source;
      }
      return {
        source: imp.source,
        resolvedPath,
        specifiers: imp.specifiers
      };
    });
  }
  extractCallGraph(filePath, content) {
    const parser = this.getParser(filePath);
    if (!parser) return [];
    const tree = parser.parse(content);
    if (!tree) {
      return [];
    }
    const langKey = this.languageKeyFromPath(filePath);
    const extractor = langKey ? this.getExtractor(langKey) : null;
    const result = extractor ? extractor.extractCallGraph(tree.rootNode) : [];
    tree.delete();
    return result;
  }
};

// vendor/understand-anything/core/ignore-filter.ts
var import_ignore = __toESM(require_ignore(), 1);

// vendor/understand-anything/core/schema.ts
var EdgeTypeSchema = external_exports.enum([
  "imports",
  "exports",
  "contains",
  "inherits",
  "implements",
  // Structural
  "calls",
  "subscribes",
  "publishes",
  "middleware",
  // Behavioral
  "reads_from",
  "writes_to",
  "transforms",
  "validates",
  // Data flow
  "depends_on",
  "tested_by",
  "configures",
  // Dependencies
  "related",
  "similar_to",
  // Semantic
  "deploys",
  "serves",
  "provisions",
  "triggers",
  // Infrastructure
  "migrates",
  "documents",
  "routes",
  "defines_schema",
  // Schema/Data
  "contains_flow",
  "flow_step",
  "cross_domain",
  // Domain
  "cites",
  "contradicts",
  "builds_on",
  "exemplifies",
  "categorized_under",
  "authored_by",
  // Knowledge
  "instance_of",
  "variant_of",
  "uses_token"
  // Design
]);
var DomainMetaSchema = external_exports.object({
  entities: external_exports.array(external_exports.string()).optional(),
  businessRules: external_exports.array(external_exports.string()).optional(),
  crossDomainInteractions: external_exports.array(external_exports.string()).optional(),
  entryPoint: external_exports.string().optional(),
  entryType: external_exports.enum(["http", "cli", "event", "cron", "manual"]).optional()
}).passthrough();
var KnowledgeMetaSchema = external_exports.object({
  wikilinks: external_exports.array(external_exports.string()).optional(),
  backlinks: external_exports.array(external_exports.string()).optional(),
  category: external_exports.string().optional(),
  content: external_exports.string().optional()
}).passthrough();
var FigmaMetaSchema = external_exports.object({
  fileKey: external_exports.string().optional(),
  nodeId: external_exports.string().optional(),
  figmaType: external_exports.string().optional(),
  thumbnailUrl: external_exports.string().optional(),
  dimensions: external_exports.object({ width: external_exports.number(), height: external_exports.number() }).optional(),
  tokenKind: external_exports.enum(["color", "type", "spacing", "effect", "grid"]).optional(),
  tokenValue: external_exports.string().optional(),
  prototypeTargets: external_exports.array(external_exports.string()).optional(),
  componentKey: external_exports.string().optional()
}).passthrough();
var GraphNodeSchema = external_exports.object({
  id: external_exports.string(),
  type: external_exports.enum([
    "file",
    "function",
    "class",
    "module",
    "concept",
    "config",
    "document",
    "service",
    "table",
    "endpoint",
    "pipeline",
    "schema",
    "resource",
    "domain",
    "flow",
    "step",
    "article",
    "entity",
    "topic",
    "claim",
    "source",
    "page",
    "screen",
    "component",
    "componentSet",
    "instance",
    "token"
  ]),
  name: external_exports.string(),
  filePath: external_exports.string().optional(),
  lineRange: external_exports.tuple([external_exports.number(), external_exports.number()]).optional(),
  summary: external_exports.string(),
  tags: external_exports.array(external_exports.string()),
  complexity: external_exports.enum(["simple", "moderate", "complex"]),
  languageNotes: external_exports.string().optional(),
  domainMeta: DomainMetaSchema.optional(),
  knowledgeMeta: KnowledgeMetaSchema.optional(),
  figmaMeta: FigmaMetaSchema.optional()
}).passthrough();
var GraphEdgeSchema = external_exports.object({
  source: external_exports.string(),
  target: external_exports.string(),
  type: EdgeTypeSchema,
  direction: external_exports.enum(["forward", "backward", "bidirectional"]),
  description: external_exports.string().optional(),
  weight: external_exports.number().min(0).max(1)
});
var LayerSchema = external_exports.object({
  id: external_exports.string(),
  name: external_exports.string(),
  description: external_exports.string(),
  nodeIds: external_exports.array(external_exports.string())
});
var TourStepSchema = external_exports.object({
  order: external_exports.number(),
  title: external_exports.string(),
  description: external_exports.string(),
  nodeIds: external_exports.array(external_exports.string()),
  languageLesson: external_exports.string().optional()
});
var ProjectMetaSchema = external_exports.object({
  name: external_exports.string(),
  languages: external_exports.array(external_exports.string()),
  frameworks: external_exports.array(external_exports.string()),
  description: external_exports.string(),
  analyzedAt: external_exports.string(),
  gitCommitHash: external_exports.string()
});
var KnowledgeGraphSchema = external_exports.object({
  version: external_exports.string(),
  kind: external_exports.enum(["codebase", "knowledge", "design"]).optional(),
  project: ProjectMetaSchema,
  nodes: external_exports.array(GraphNodeSchema),
  edges: external_exports.array(GraphEdgeSchema),
  layers: external_exports.array(LayerSchema),
  tour: external_exports.array(TourStepSchema)
});

// vendor/understand-anything/core/ignore-filter.ts
var DEFAULT_IGNORE_PATTERNS = [
  // Dependency directories
  "node_modules/",
  ".git/",
  "vendor/",
  "venv/",
  ".venv/",
  "__pycache__/",
  // Build output
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".next/",
  ".cache/",
  ".turbo/",
  "target/",
  "obj/",
  // Lock files
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  // Binary/asset files
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.svg",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.mp3",
  "*.mp4",
  "*.pdf",
  "*.zip",
  "*.tar",
  "*.gz",
  // Generated files
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.generated.*",
  // IDE/editor
  ".idea/",
  ".vscode/",
  // Misc
  "LICENSE",
  ".gitignore",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc*",
  "*.log"
];

// vendor/understand-anything/dashboard/utils/louvain.ts
var import_graphology = __toESM(require_graphology_cjs(), 1);
var import_graphology_communities_louvain = __toESM(require_graphology_communities_louvain(), 1);
function detectCommunities(nodeIds, edges) {
  const ids = new Set(nodeIds);
  const g = new import_graphology.default({ type: "undirected", multi: false });
  for (const id of nodeIds) g.addNode(id);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if (e.source === e.target) continue;
    if (g.hasEdge(e.source, e.target)) continue;
    g.addEdge(e.source, e.target);
  }
  const result = (0, import_graphology_communities_louvain.default)(g);
  const map2 = /* @__PURE__ */ new Map();
  for (const id of nodeIds) {
    map2.set(id, result[id] ?? -1);
  }
  let maxCommunity = -1;
  for (const v of map2.values()) {
    if (v >= 0 && v > maxCommunity) maxCommunity = v;
  }
  let next = maxCommunity + 1;
  for (const [id, c] of map2) {
    if (c === -1) {
      map2.set(id, next++);
    }
  }
  return map2;
}

// vendor/understand-anything/dashboard/utils/containers.ts
var MIN_BUCKET_COUNT = 2;
var MAX_CONCENTRATION = 0.7;
var MIN_NODES_FOR_SUPPRESSION = 3;
var ROOT_BUCKET = "~";
function commonPrefix(paths) {
  if (paths.length === 0) return "";
  const dirs = paths.map((p) => {
    const slash = p.lastIndexOf("/");
    return slash >= 0 ? p.slice(0, slash) : "";
  });
  let prefix = dirs[0];
  for (const d of dirs) {
    while (!d.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : "";
}
function firstSegment(path) {
  const slash = path.indexOf("/");
  return slash >= 0 ? path.slice(0, slash) : path;
}
function groupByFolder(nodes) {
  const withPath = nodes.filter((n) => n.filePath);
  const lcp = commonPrefix(withPath.map((n) => n.filePath));
  const groups = /* @__PURE__ */ new Map();
  const rooted = [];
  for (const n of nodes) {
    if (!n.filePath) {
      rooted.push(n.id);
      continue;
    }
    const stripped = n.filePath.slice(lcp.length);
    if (!stripped.includes("/")) {
      rooted.push(n.id);
      continue;
    }
    const seg = firstSegment(stripped);
    const arr = groups.get(seg) ?? [];
    arr.push(n.id);
    groups.set(seg, arr);
  }
  return { groups, rooted };
}
function shouldFallbackToCommunity(groups, rooted, totalNodes) {
  const bucketCount = groups.size + (rooted.length > 0 ? 1 : 0);
  if (bucketCount < MIN_BUCKET_COUNT) return true;
  for (const ids of groups.values()) {
    if (ids.length / totalNodes > MAX_CONCENTRATION) return true;
  }
  if (rooted.length / totalNodes > MAX_CONCENTRATION) return true;
  return false;
}
function deriveContainers(nodes, edges) {
  if (nodes.length === 0) {
    return { containers: [], ungrouped: [] };
  }
  const { groups, rooted } = groupByFolder(nodes);
  const useCommunity = shouldFallbackToCommunity(groups, rooted, nodes.length);
  let containers;
  if (useCommunity) {
    const communities = detectCommunities(
      nodes.map((n) => n.id),
      edges
    );
    const byCommunity = /* @__PURE__ */ new Map();
    for (const [nodeId, cid] of communities) {
      const arr = byCommunity.get(cid) ?? [];
      arr.push(nodeId);
      byCommunity.set(cid, arr);
    }
    const sorted = [...byCommunity.entries()].sort((a, b) => a[0] - b[0]);
    containers = sorted.map(([cid, ids], i) => ({
      id: `container:cluster-${cid}`,
      // A-Z for the first 26, then numeric. Avoids `String.fromCharCode(65+i)`
      // wrapping into `[`, `\`, `]` ... once the cluster count exceeds 26.
      name: i < 26 ? `Cluster ${String.fromCharCode(65 + i)}` : `Cluster ${i + 1}`,
      nodeIds: ids,
      strategy: "community"
    }));
  } else {
    containers = [...groups.entries()].map(([seg, ids]) => ({
      id: `container:${seg}`,
      name: seg,
      nodeIds: ids,
      strategy: "folder"
    }));
    if (rooted.length > 0) {
      containers.push({
        id: `container:${ROOT_BUCKET}`,
        name: ROOT_BUCKET,
        nodeIds: rooted,
        strategy: "folder"
      });
    }
  }
  const ungrouped = [];
  if (nodes.length >= MIN_NODES_FOR_SUPPRESSION) {
    containers = containers.filter((c) => {
      if (c.nodeIds.length === 1) {
        ungrouped.push(c.nodeIds[0]);
        return false;
      }
      return true;
    });
  }
  return { containers, ungrouped };
}

// src/lib/codegraph/hierarchy.ts
var SYMBOL_TYPES = /* @__PURE__ */ new Set(["function", "step"]);
var MAX_LEVEL_CHILDREN = 24;
var MAX_AGGREGATE_FILE_PATHS = 50;
var ROOT = "";
function isSymbol(node) {
  return SYMBOL_TYPES.has(node.type);
}
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed";
}
function normalizePath(path) {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}
function dirOf(path) {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}
function commonDirPrefix(paths) {
  if (paths.length === 0) return "";
  const dirs = paths.map(dirOf);
  let prefix = dirs[0];
  for (const dir of dirs) {
    while (prefix && !(dir === prefix || dir.startsWith(`${prefix}/`))) {
      const slash = prefix.lastIndexOf("/");
      prefix = slash >= 0 ? prefix.slice(0, slash) : "";
    }
    if (!prefix) return "";
  }
  return prefix ? `${prefix}/` : "";
}
var HINT_LABEL_OVERLAP_THRESHOLD = 0.5;
function relabelBucketsWithHints(buckets, hints) {
  if (!hints.length) return;
  const hintFileSets = hints.map((hint) => ({
    title: hint.title,
    files: new Set(hint.filePaths.map(normalizePath))
  })).filter((hint) => hint.files.size > 0);
  if (!hintFileSets.length) return;
  for (const bucket of buckets.values()) {
    const bucketFiles = bucket.nodes.map((node) => node.filePath ? normalizePath(node.filePath) : null).filter((path) => path !== null);
    if (!bucketFiles.length) continue;
    let best = null;
    for (const hint of hintFileSets) {
      const matched = bucketFiles.filter((path) => hint.files.has(path)).length;
      const overlap = matched / bucketFiles.length;
      if (overlap >= HINT_LABEL_OVERLAP_THRESHOLD && (!best || overlap > best.overlap)) {
        best = { title: hint.title, overlap };
      }
    }
    if (best) bucket.name = best.title;
  }
}
function aggregateFilePaths(nodes) {
  const seen = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    for (const path of node.filePaths) {
      if (seen.size >= MAX_AGGREGATE_FILE_PATHS) return [...seen];
      seen.add(path);
    }
  }
  return [...seen];
}
function toCodeGraphNode(node, level, childCount, layer) {
  return {
    id: node.id,
    level,
    type: node.type,
    name: node.name,
    summary: node.summary ?? "",
    complexity: node.complexity ?? "simple",
    tags: node.tags ?? [],
    ...node.filePath ? { filePath: normalizePath(node.filePath) } : {},
    ...node.lineRange ? { lineRange: node.lineRange } : {},
    childCount,
    filePaths: node.filePath ? [normalizePath(node.filePath)] : [],
    ...layer ? { layerId: layer.id, layerName: layer.name } : {}
  };
}
function liftEdges(edges, ancestorOf) {
  const merged = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const source = ancestorOf(edge.source);
    const target = ancestorOf(edge.target);
    if (!source || !target || source === target) continue;
    const key = `${source} ${target} ${edge.type}`;
    const existing = merged.get(key);
    if (existing) {
      existing.weight = Math.min(1, existing.weight + (edge.weight ?? 0));
      existing.count = (existing.count ?? 1) + 1;
    } else {
      merged.set(key, {
        source,
        target,
        type: edge.type,
        ...edge.description ? { description: edge.description } : {},
        weight: edge.weight ?? 0.5,
        count: 1
      });
    }
  }
  return [...merged.values()];
}
function mapSymbolsToUnits(symbols, units, edges) {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const unitsByPath = /* @__PURE__ */ new Map();
  for (const unit of units) {
    if (!unit.filePath) continue;
    const path = normalizePath(unit.filePath);
    const existing = unitsByPath.get(path);
    if (!existing || existing.type === "file" && unit.type === "class") {
      unitsByPath.set(path, unit);
    }
  }
  const owner = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (edge.type !== "contains") continue;
    if (!unitById.has(edge.source)) continue;
    owner.set(edge.target, edge.source);
  }
  const result = /* @__PURE__ */ new Map();
  for (const symbol2 of symbols) {
    const viaEdge = owner.get(symbol2.id);
    if (viaEdge) {
      result.set(symbol2.id, viaEdge);
      continue;
    }
    if (symbol2.filePath) {
      const unit = unitsByPath.get(normalizePath(symbol2.filePath));
      if (unit) result.set(symbol2.id, unit.id);
    }
  }
  return result;
}
function attachUnit(ctx, unit, parentId, chain) {
  const owned = ctx.symbolsByUnit.get(unit.id) ?? [];
  const unitNode = toCodeGraphNode(
    unit,
    "unit",
    owned.length,
    ctx.layerOf.get(unit.id)
  );
  ctx.nodesById[unit.id] = unitNode;
  ctx.parentById[unit.id] = parentId;
  (ctx.childrenByParent[parentId] ??= []).push(unit.id);
  ctx.ancestry.set(unit.id, [...chain, unit.id]);
  ctx.childrenByParent[unit.id] ??= [];
  for (const symbol2 of owned) {
    const symbolNode = toCodeGraphNode(
      symbol2,
      "symbol",
      0,
      ctx.layerOf.get(symbol2.id)
    );
    ctx.nodesById[symbol2.id] = symbolNode;
    ctx.parentById[symbol2.id] = unit.id;
    ctx.childrenByParent[unit.id].push(symbol2.id);
    ctx.ancestry.set(symbol2.id, [...chain, unit.id, symbol2.id]);
  }
  return unitNode;
}
function buildModuleTree(ctx, units, parentId, chain, depth) {
  ctx.childrenByParent[parentId] ??= [];
  const withPath = units.filter((unit) => unit.filePath);
  const withoutPath = units.filter((unit) => !unit.filePath);
  const created = [];
  if (withoutPath.length > 0) {
    if (withoutPath.length <= MAX_LEVEL_CHILDREN || depth > 6) {
      for (const unit of withoutPath) {
        created.push(attachUnit(ctx, unit, parentId, chain));
      }
    } else {
      const { containers, ungrouped } = deriveContainers(
        withoutPath,
        ctx.allEdges
      );
      const byId = new Map(withoutPath.map((unit) => [unit.id, unit]));
      for (const container of containers) {
        const moduleId = `${parentId}/module:${slug(container.name)}`;
        const members = container.nodeIds.map((id) => byId.get(id)).filter((unit) => Boolean(unit));
        const children = buildModuleTree(
          ctx,
          members,
          moduleId,
          [...chain, moduleId],
          depth + 1
        );
        created.push(
          registerAggregate(
            ctx,
            moduleId,
            container.name,
            "module",
            parentId,
            children
          )
        );
      }
      for (const id of ungrouped) {
        const unit = byId.get(id);
        if (unit) created.push(attachUnit(ctx, unit, parentId, chain));
      }
    }
  }
  if (withPath.length === 0) return created;
  if (withPath.length <= MAX_LEVEL_CHILDREN || depth > 8) {
    for (const unit of withPath) {
      created.push(attachUnit(ctx, unit, parentId, chain));
    }
    return created;
  }
  const prefix = commonDirPrefix(
    withPath.map((unit) => normalizePath(unit.filePath))
  );
  const groups = /* @__PURE__ */ new Map();
  const direct = [];
  for (const unit of withPath) {
    const rest = normalizePath(unit.filePath).slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      direct.push(unit);
      continue;
    }
    const segment = rest.slice(0, slash);
    const bucket = groups.get(segment) ?? [];
    bucket.push(unit);
    groups.set(segment, bucket);
  }
  for (const [segment, members] of [...groups].sort(
    (a, b) => a[0].localeCompare(b[0])
  )) {
    if (members.length === 1) {
      created.push(attachUnit(ctx, members[0], parentId, chain));
      continue;
    }
    const moduleId = `${parentId}/module:${slug(`${prefix}${segment}`)}`;
    const children = buildModuleTree(
      ctx,
      members,
      moduleId,
      [...chain, moduleId],
      depth + 1
    );
    created.push(
      registerAggregate(ctx, moduleId, segment, "module", parentId, children)
    );
  }
  if (direct.length > MAX_LEVEL_CHILDREN) {
    created.push(...bucketAlphabetically(ctx, direct, parentId, chain, depth));
  } else {
    for (const unit of direct) {
      created.push(attachUnit(ctx, unit, parentId, chain));
    }
  }
  return created;
}
function bucketAlphabetically(ctx, units, parentId, chain, depth) {
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name));
  const bucketCount = Math.min(
    MAX_LEVEL_CHILDREN,
    Math.ceil(sorted.length / MAX_LEVEL_CHILDREN)
  );
  const perBucket = Math.ceil(sorted.length / bucketCount);
  const created = [];
  for (let i = 0; i < sorted.length; i += perBucket) {
    const members = sorted.slice(i, i + perBucket);
    const label = `${members[0].name.charAt(0).toUpperCase()}\u2013${members[members.length - 1].name.charAt(0).toUpperCase()}`;
    const moduleId = `${parentId}/range:${slug(label)}-${i}`;
    const children = buildModuleTree(
      ctx,
      members,
      moduleId,
      [...chain, moduleId],
      depth + 1
    );
    created.push(
      registerAggregate(ctx, moduleId, label, "module", parentId, children)
    );
  }
  return created;
}
function registerAggregate(ctx, id, name, level, parentId, children) {
  const descendantFiles = /* @__PURE__ */ new Set();
  for (const child of children) {
    for (const path of child.filePaths) descendantFiles.add(path);
  }
  const node = {
    id,
    level,
    type: level === "subsystem" ? "service" : "module",
    name,
    summary: level === "subsystem" ? `${descendantFiles.size} files across ${children.length} modules` : `${children.length} items`,
    complexity: "moderate",
    tags: [],
    childCount: children.length,
    filePaths: aggregateFilePaths(children),
    ...children[0]?.layerId ? { layerId: children[0].layerId, layerName: children[0].layerName } : {}
  };
  ctx.nodesById[id] = node;
  ctx.parentById[id] = parentId;
  ctx.childrenByParent[id] ??= [];
  if (parentId !== null) {
    (ctx.childrenByParent[parentId] ??= []).push(id);
  }
  return node;
}
function buildHierarchy(graph, hints = []) {
  const allNodes = graph.nodes ?? [];
  const allEdges = graph.edges ?? [];
  const symbols = allNodes.filter(isSymbol);
  const units = allNodes.filter((node) => !isSymbol(node));
  const symbolOwner = mapSymbolsToUnits(symbols, units, allEdges);
  const orphanSymbols = symbols.filter((symbol2) => !symbolOwner.has(symbol2.id));
  const placedUnits = [...units, ...orphanSymbols];
  const symbolsByUnit = /* @__PURE__ */ new Map();
  for (const symbol2 of symbols) {
    const unitId = symbolOwner.get(symbol2.id);
    if (!unitId) continue;
    const bucket = symbolsByUnit.get(unitId) ?? [];
    bucket.push(symbol2);
    symbolsByUnit.set(unitId, bucket);
  }
  const layerOf = /* @__PURE__ */ new Map();
  (graph.layers ?? []).forEach((layer) => {
    layer.nodeIds.forEach(
      (id) => layerOf.set(id, { id: layer.id, name: layer.name })
    );
  });
  const buckets = /* @__PURE__ */ new Map();
  const push = (key, name, node) => {
    const bucket = buckets.get(key) ?? { name, nodes: [] };
    bucket.nodes.push(node);
    buckets.set(key, bucket);
  };
  const layerless = [];
  for (const unit of placedUnits) {
    const layer = layerOf.get(unit.id);
    if (layer) push(`subsystem:layer-${slug(layer.id)}`, layer.name, unit);
    else layerless.push(unit);
  }
  const layerlessWithPath = layerless.filter((unit) => unit.filePath);
  const layerlessWithoutPath = layerless.filter((unit) => !unit.filePath);
  for (const unit of layerlessWithoutPath) push("subsystem:other", "Other", unit);
  const DERIVE_CONTAINERS_MIN_NODES = 4;
  if (layerlessWithPath.length >= DERIVE_CONTAINERS_MIN_NODES) {
    const { containers, ungrouped } = deriveContainers(
      layerlessWithPath,
      allEdges
    );
    const byId = new Map(layerlessWithPath.map((unit) => [unit.id, unit]));
    for (const container of containers) {
      for (const nodeId of container.nodeIds) {
        const unit = byId.get(nodeId);
        if (!unit) continue;
        push(`subsystem:folder-${slug(container.id)}`, container.name, unit);
      }
    }
    for (const nodeId of ungrouped) {
      const unit = byId.get(nodeId);
      if (unit) push("subsystem:other", "Other", unit);
    }
  } else {
    for (const unit of layerlessWithPath) {
      const path = normalizePath(unit.filePath);
      const segment = path.includes("/") ? path.slice(0, path.indexOf("/")) : "";
      if (segment) push(`subsystem:folder-${slug(segment)}`, segment, unit);
      else push("subsystem:other", "Other", unit);
    }
  }
  relabelBucketsWithHints(buckets, hints);
  const ctx = {
    nodesById: {},
    childrenByParent: { [ROOT]: [] },
    parentById: {},
    ancestry: /* @__PURE__ */ new Map(),
    symbolsByUnit,
    layerOf,
    allEdges
  };
  for (const [subsystemId, bucket] of buckets) {
    const children = buildModuleTree(
      ctx,
      bucket.nodes,
      subsystemId,
      [subsystemId],
      0
    );
    registerAggregate(
      ctx,
      subsystemId,
      bucket.name,
      "subsystem",
      null,
      children
    );
    ctx.childrenByParent[ROOT].push(subsystemId);
  }
  const levels = [];
  for (const [parentId, childIds] of Object.entries(ctx.childrenByParent)) {
    if (childIds.length === 0) continue;
    const visible = new Set(childIds);
    const edges = liftEdges(allEdges, (nodeId) => {
      const chain = ctx.ancestry.get(nodeId);
      if (!chain) return void 0;
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        if (visible.has(chain[i])) return chain[i];
      }
      return void 0;
    });
    levels.push({
      parentId: parentId === ROOT ? null : parentId,
      nodes: childIds.map((id) => ctx.nodesById[id]).filter(Boolean),
      edges
    });
  }
  return {
    nodesById: ctx.nodesById,
    childrenByParent: ctx.childrenByParent,
    parentById: ctx.parentById,
    levels,
    fileCount: new Set(
      allNodes.map((node) => node.filePath).filter((p) => Boolean(p))
    ).size,
    symbolCount: symbols.length
  };
}
function breadcrumbsFor(nodeId, nodesById, parentById) {
  const trail = [];
  let cursor = nodeId;
  const guard = /* @__PURE__ */ new Set();
  while (cursor) {
    if (guard.has(cursor)) break;
    guard.add(cursor);
    const node = nodesById[cursor];
    if (!node) break;
    trail.unshift({ id: cursor, name: node.name });
    cursor = parentById[cursor] ?? null;
  }
  return [{ id: null, name: "System" }, ...trail];
}

// src/lib/codegraph/shard-name.ts
function base64url3(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function shortHash(value) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 + code, 2246822507) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}
var MAX_ENCODED_LENGTH = 100;
function shardName(parentId) {
  if (parentId === null) return "root";
  const encoded = base64url3(parentId);
  if (encoded.length <= MAX_ENCODED_LENGTH) return encoded;
  return `${encoded.slice(0, MAX_ENCODED_LENGTH)}-${shortHash(parentId)}`;
}

// src/lib/codegraph/analyzer-entry.ts
function parseArgs(argv) {
  const get = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  const required2 = (name) => {
    const value = get(name);
    if (!value) throw new Error(`Missing required argument --${name}`);
    return value;
  };
  return {
    repo: required2("repo"),
    out: required2("out"),
    commitSha: required2("commit"),
    workspaceId: required2("workspace"),
    repositoryId: required2("repository"),
    hints: get("hints"),
    grammars: get("grammars") ?? "grammars",
    maxFiles: Number(get("max-files") ?? "8000")
  };
}
function progress(phase, detail = {}) {
  process.stdout.write(
    `${JSON.stringify({ __codegraph: phase, ...detail })}
`
  );
}
var IGNORED_DIRS = new Set(
  DEFAULT_IGNORE_PATTERNS.filter((p) => p.endsWith("/")).map(
    (p) => p.replace(/\/$/, "")
  )
);
function walk(root, limit) {
  const files = [];
  const stack = [root];
  while (stack.length > 0 && files.length < limit) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".github") continue;
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (stats.isFile()) {
        files.push(full);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolvePath(args.repo);
  const grammarDir = resolvePath(args.grammars);
  progress("analyzing");
  const plugin = new TreeSitterPlugin(
    builtinLanguageConfigs,
    void 0,
    (_wasmPackage, wasmFile) => join(grammarDir, wasmFile)
  );
  await plugin.init();
  const supported = new Set(
    builtinLanguageConfigs.flatMap(
      (config2) => config2.extensions.map((ext) => ext.startsWith(".") ? ext : `.${ext}`)
    )
  );
  const allFiles = walk(repoRoot, args.maxFiles);
  const codeFiles = allFiles.filter((file2) => {
    const dot = file2.lastIndexOf(".");
    return dot >= 0 && supported.has(file2.slice(dot).toLowerCase());
  });
  const builder = new GraphBuilder(
    repoRoot.split("/").filter(Boolean).pop() ?? "repository",
    args.commitSha
  );
  const analysed = [];
  for (const absolute of codeFiles) {
    const path = relative(repoRoot, absolute);
    let content;
    try {
      content = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (content.length > 4e5) continue;
    let full;
    try {
      full = plugin.analyzeFileFull(path, content);
    } catch {
      continue;
    }
    const { structure, callGraph } = full;
    if (structure.functions.length === 0 && structure.classes.length === 0 && structure.imports.length === 0) {
      continue;
    }
    builder.addFileWithAnalysis(path, structure, {
      // Node prose is intentionally left empty here. Neo fills summaries
      // from the DeepWiki pages it already generated for this same commit
      // rather than prompting an LLM a second time — see deepwiki-bridge.ts.
      summary: "",
      fileSummary: "",
      summaries: {},
      tags: [],
      complexity: content.length > 4e4 ? "complex" : content.length > 8e3 ? "moderate" : "simple"
    });
    analysed.push({
      path,
      functions: structure.functions.map((fn) => fn.name),
      imports: structure.imports.map((imp) => ({ source: imp.source })),
      calls: callGraph.map((entry) => ({
        caller: entry.caller,
        callee: entry.callee
      }))
    });
  }
  progress("relationships", { fileCount: analysed.length });
  const byPath = new Map(analysed.map((file2) => [file2.path, file2]));
  const functionOwner = /* @__PURE__ */ new Map();
  for (const file2 of analysed) {
    for (const name of file2.functions) {
      if (!functionOwner.has(name)) functionOwner.set(name, file2.path);
    }
  }
  const resolveImport = (fromPath, source) => {
    if (!source.startsWith(".")) return null;
    const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    const joined = resolvePath("/", fromDir, source).slice(1);
    const candidates = [
      joined,
      ...[".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"].flatMap(
        (ext) => [`${joined}${ext}`, `${joined}/index${ext}`]
      )
    ];
    return candidates.find((candidate) => byPath.has(candidate)) ?? null;
  };
  for (const file2 of analysed) {
    for (const imp of file2.imports) {
      const target = resolveImport(file2.path, imp.source);
      if (target && target !== file2.path)
        builder.addImportEdge(file2.path, target);
    }
    for (const call of file2.calls) {
      const calleeFile = functionOwner.get(call.callee);
      if (!calleeFile) continue;
      builder.addCallEdge(file2.path, call.caller, calleeFile, call.callee);
    }
  }
  const graph = builder.build();
  graph.layers = detectLayers(graph);
  let hints = [];
  if (args.hints) {
    try {
      hints = JSON.parse(readFileSync(args.hints, "utf8"));
    } catch {
      hints = [];
    }
  }
  const hierarchy = buildHierarchy(graph, hints);
  progress("mapped", {
    fileCount: hierarchy.fileCount,
    symbolCount: hierarchy.symbolCount
  });
  const outDir = resolvePath(args.out);
  mkdirSync(join(outDir, "levels"), { recursive: true });
  const meta3 = {
    workspaceId: args.workspaceId,
    repositoryId: args.repositoryId,
    commitSha: args.commitSha,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    fileCount: hierarchy.fileCount,
    symbolCount: hierarchy.symbolCount,
    languages: graph.project.languages,
    frameworks: graph.project.frameworks
  };
  for (const level of hierarchy.levels) {
    writeFileSync(
      join(outDir, "levels", `${shardName(level.parentId)}.json`),
      JSON.stringify({
        ...level,
        // Breadcrumbs travel with the shard so navigating straight to a deep
        // level never needs the full parent index client-side.
        crumbs: breadcrumbsFor(
          level.parentId,
          hierarchy.nodesById,
          hierarchy.parentById
        )
      })
    );
  }
  const searchIndex = Object.values(hierarchy.nodesById).map((node) => [
    node.id,
    node.name,
    node.type,
    node.filePath ?? "",
    hierarchy.parentById[node.id] ?? "",
    node.level
  ]);
  writeFileSync(join(outDir, "search.json"), JSON.stringify(searchIndex));
  writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta3));
  progress("ready", {
    subsystemCount: hierarchy.childrenByParent[""]?.length ?? 0
  });
}
main().catch((error51) => {
  progress("failed", {
    reason: error51 instanceof Error ? error51.message : String(error51)
  });
  process.exitCode = 1;
});
