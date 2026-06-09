"use strict";
(() => {
  // addons/wsdk/src/c3runtime/conditions.ts
  var Conditions = {
    GameLoadedEvent() {
      return true;
    },
    MuteAudioEvent() {
      return true;
    },
    UnmuteAudioEvent() {
      return true;
    },
    InterstitialAdStarted() {
      return true;
    },
    InterstitialAdFinished() {
      return true;
    },
    RewardedAdStarted() {
      return true;
    },
    RewardedAdFinished() {
      return true;
    },
    RewardedAdEarned(tag) {
      return this.lastRewardedAdTag === tag;
    }
  };
  globalThis.C3.Plugins.WeLoPlay_WSDK.Cnds = Conditions;
})();
