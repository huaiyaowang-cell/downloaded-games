var TrollObbyAdRewarder = pc.createScript('trollObbyAdRewarder');

// initialize code called once per entity
TrollObbyAdRewarder.prototype.initialize = function () {
    this.app.adRewarder = this
};

TrollObbyAdRewarder.prototype.watchAd = function (eventSuccess, adCount = 1) {
    watchRewarded(() => eventSuccess(), adCount);

    //setTimeout(()=> eventSuccess(), 200);
}

