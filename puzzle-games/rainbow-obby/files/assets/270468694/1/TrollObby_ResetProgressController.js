/*TrollObbyResetProgressController script that clears all the progress saved on local storage by Emre Şahin - emolingo games */
var TrollObbyResetProgressController = pc.createScript('trollObbyResetProgressController');

TrollObbyResetProgressController.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;
    this.app.on("resetData", this.resetData, this);
    this.on('destroy', function () {
        this.app.off("resetData", this.resetData, this);
    }, this);
};

TrollObbyResetProgressController.prototype.resetData = async function () {
    if (this.networkManager.room)
        await this.networkManager.room.leave();

    TrollObby_Utils.clear();
    this.app.scenes.changeScene("TrollObby");
};