System.register([], function (_export, _context) {
  "use strict";

  var cc, Application;
  function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
  function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
  function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
  function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
  function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
  function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
  return {
    setters: [],
    execute: function () {
      _export("Application", Application = /*#__PURE__*/function () {
        function Application() {
          _classCallCheck(this, Application);
          this.settingsPath = 'src/settings.json'; // settings.json file path, usually passed in by the editor when building, you can also specify your own path
          this.showFPS = false; // Whether or not to open the profiler, usually passed in when the editor is built, but you can also specify the value you want
        }
        _createClass(Application, [{
          key: "init",
          value: function init(engine) {
            cc = engine;
            cc.game.onPostBaseInitDelegate.add(this.onPostInitBase.bind(this)); // Listening for engine start process events onPostBaseInitDelegate
            cc.game.onPostSubsystemInitDelegate.add(this.onPostSystemInit.bind(this)); // Listening for engine start process events onPostSubsystemInitDelegate
            cc.game.onPostProjectInitDelegate.add(this.onProjectDataEvent.bind(this));

            //inform the poki sdk that the game is loading.
            PokiSDK.gameLoadingStart();
          }
        }, {
          key: "onPostInitBase",
          value: function onPostInitBase() {
            // cc.settings.overrideSettings('assets', 'server', '');

            //Set the debug value in pokisdk based on the build settings.
            PokiSDK.setDebug(cc.settings.debug);
          }
        }, {
          key: "onPostSystemInit",
          value: function onPostSystemInit() {
            // Implement some custom logic
            console.log("OnPostSystemInit");
          }
        }, {
          key: "onProjectDataEvent",
          value: function onProjectDataEvent() {
            console.log("Project Data Loaded");
          }
        }, {
          key: "start",
          value: function start() {
            return cc.game.init({
              // Run the engine with the required parameters
              debugMode: false ? cc.DebugMode.INFO : cc.DebugMode.ERROR,
              settingsPath: this.settingsPath,
              // Pass in the settings.json path
              overrideSettings: {
                // Override part of the data in the configuration file, this field will be described in detail below
                // assets: {
                //      preloadBundles: [{ bundle: 'main', version: 'xxx' }],
                // }
                profiling: {
                  showFPS: this.showFPS
                }
              }
            }).then(function () {
              cc.game.run(function () {
                //Inform PokiSDK that we have finished loading the game.
                PokiSDK.gameLoadingFinished();
              });
            });
          }
        }]);
        return Application;
      }());
    }
  };
});