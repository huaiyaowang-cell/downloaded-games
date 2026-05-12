"use strict";
(() => {
  // addons/wsdk/src/c3runtime/actions.ts
  var Actions = {
    /** @deprecated */
    CreateLoadingTag(trigger) {
    },
    /** @deprecated */
    FullfillLoadingTag(trigger) {
    },
    GameplayStart() {
      this._postToDOMMaybeSync("gameplay-start");
    },
    GameplayEnd() {
      this._postToDOMMaybeSync("gameplay-end");
    },
    ShowInterstitialAd() {
      this._postToDOMMaybeSync("show-interstitial-ad");
    },
    ShowRewardedAd(tag, sizeIndex) {
      this._postToDOMMaybeSync("show-rewarded-ad", {
        tag,
        size: ["small", "medium", "large"][sizeIndex]
      });
    },
    HideLoader() {
      this._postToDOMMaybeSync("hide-loader");
    },
    LoadingFinished() {
      this._postToDOMMaybeSync("loading-finished");
    },
    SetLoaderProgress(value) {
      this._postToDOMMaybeSync("set-loader-progress", value);
    }
  };
  globalThis.C3.Plugins.WeLoPlay_WSDK.Acts = Actions;
})();
