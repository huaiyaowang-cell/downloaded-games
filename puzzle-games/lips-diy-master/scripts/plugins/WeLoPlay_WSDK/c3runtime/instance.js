"use strict";
(() => {
  // addons/wsdk/src/utils/bindMethods.ts
  function bindMethods(methods, instance) {
    return Object.keys(methods).reduce((api, key) => {
      api[key] = methods[key].bind(instance);
      return api;
    }, {});
  }

  // addons/wsdk/src/utils/parseProperties.ts
  function parseInitProperties(properties) {
    return {
      automaticLoaderProgress: properties[0]
    };
  }

  // addons/wsdk/src/c3runtime/instance.ts
  var C3 = globalThis.C3;
  var GlobalWSDKInstance = class extends globalThis.ISDKInstanceBase {
    constructor() {
      super({ domComponentId: "WeLoPlay_SDK_DOMMessaging" });
      this.#actions = C3.Plugins.WeLoPlay_WSDK.Acts;
      this.#conditions = C3.Plugins.WeLoPlay_WSDK.Cnds;
      this.#expressions = C3.Plugins.WeLoPlay_WSDK.Exps;
      this.actions = bindMethods(this.#actions, this);
      this.conditions = bindMethods(this.#conditions, this);
      this.expressions = bindMethods(this.#expressions, this);
      this.lastRewardedAdTag = "";
      this.props = parseInitProperties(this._getInitProperties());
      this._postToDOMMaybeSync("init-properties", this._getInitProperties());
      this._postToDOMMaybeSync("runtime-loading-progress", this.runtime.loadingProgress);
      this.runtime.addEventListener("loadingprogress", () => {
        this._postToDOMMaybeSync("runtime-loading-progress", this.runtime.loadingProgress);
      });
      this._addDOMMessageHandler("mute-audio-event", () => {
        this._trigger(this.#conditions.MuteAudioEvent);
      });
      this._addDOMMessageHandler("unmute-audio-event", () => {
        this._trigger(this.#conditions.UnmuteAudioEvent);
      });
      this._addDOMMessageHandler("interstitial-ad-started", () => {
        this._trigger(this.#conditions.InterstitialAdStarted);
      });
      this._addDOMMessageHandler("interstitial-ad-finished", () => {
        this._trigger(this.#conditions.InterstitialAdFinished);
      });
      this._addDOMMessageHandler("rewarded-ad-started", () => {
        this._trigger(this.#conditions.RewardedAdStarted);
      });
      this._addDOMMessageHandler("rewarded-ad-finished", () => {
        this._trigger(this.#conditions.RewardedAdFinished);
      });
      this._addDOMMessageHandler("rewarded-ad-earned", (tag) => {
        this.lastRewardedAdTag = tag;
        this._trigger(this.#conditions.RewardedAdEarned);
      });
    }
    #actions;
    #conditions;
    #expressions;
    _release() {
      super._release();
    }
    _saveToJson() {
      return {};
    }
    _loadFromJson(o) {
    }
  };
  C3.Plugins.WeLoPlay_WSDK.Instance = GlobalWSDKInstance;
})();
