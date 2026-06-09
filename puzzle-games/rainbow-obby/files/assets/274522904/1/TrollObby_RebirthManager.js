var TrollObbyRebirthManager = pc.createScript('trollObbyRebirthManager');

// initialize code called once per entity
TrollObbyRebirthManager.prototype.initialize = function() {
    this.app.rebirth = 0;
    this.app.rebirthManager = this;

    this.app.on("Connected", this.onConnected, this);
    this.app.on("giveRebirth", this.giveRebirth, this);


    this.entity.on("destroy", ()=>{
        this.app.off("Connected");
        this.app.off("giveRebirth");
    }, this)
};

TrollObbyRebirthManager.prototype.setRebirth = function(newRebirth){
    this.app.rebirth = newRebirth;
    TrollObby_Utils.setItem("TROLLOBBY_Rebirth", newRebirth);
}

TrollObbyRebirthManager.prototype.giveRebirth = function(){
    if (!this.app.trollObbyNetworkManager.room) return;
    this.app.trollObbyNetworkManager.room.send("Client:GiveRebirth", {rebirth: 1});   
}

TrollObbyRebirthManager.prototype.onConnected = function(){
    if (!this.app.trollObbyNetworkManager.room) return;

    if (TrollObby_Utils.getItem("TROLLOBBY_Rebirth")) {
        this.app.trollObbyNetworkManager.room.send("Client:SetRebirth", {rebirth: TrollObby_Utils.getItem("TROLLOBBY_Rebirth")*1});
    } else {
        TrollObby_Utils.setItem("TROLLOBBY_Rebirth", 0);
    };
}