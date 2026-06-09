var TrollObbyElevator = pc.createScript('trollObbyElevator');

// initialize code called once per entity
TrollObbyElevator.prototype.initialize = function() {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this.cabin = this.entity.findByName("Cabin");
    this.counter = this.entity.findByName("Counter").element;
    this.counter.enabled = false;

    this.pos0 = new pc.Vec3(0,0,0);
    this.pos1 = this.entity.findByName("EndPoint").getLocalPosition().clone();

    this.id = "Elevator" + this.getRandomId();
    this.idAd = this.id + "AdYes";
    this.serverId = this.id + "Server";

    this.idNo = this.id + "AdNo";

    this.button = this.entity.findByName("Button").script.trollObbyButton;
    setTimeout(()=>{this.button.setup(this.id, false, false);}, 500);

    this.app.on(this.id, this.onTrigger, this);
    this.app.on(this.serverId, this.runElevator, this);
    this.on(this.idAd, this.onAdYes, this);
    this.on(this.idNo, this.onAdNo, this);

    this.on('destroy', function () {
        this.app.off(this.serverId);
        this.app.off(this.id);
    }, this);

    this.active = false;
};

TrollObbyElevator.prototype.onAdYes = function(){
    this.app.adRewarder.watchAd(()=> this.networkManager.fire(this.serverId, true));
    this.active = true;
    console.log("on yes");
};

TrollObbyElevator.prototype.onAdNo = function(){
    this.app.trollObbyNetworkManager.room.send("Client:Attackable", { attackable: true });
};

TrollObbyElevator.prototype.runElevator = function(){
    console.log("run elavator");
    this.active = true; 

    this.counter.enabled = true;
    this.counter.text = "5";
    setTimeout(()=>{this.counter.text = "4";}, 1000);
    setTimeout(()=>{this.counter.text = "3";}, 2000);
    setTimeout(()=>{this.counter.text = "2";}, 3000);
    setTimeout(()=>{this.counter.text = "1";}, 4000);
    setTimeout(()=>{this.counter.text = "0";}, 5000);
    setTimeout(()=>{
        this.counter.enabled = false;
        // ileri
        this.app.trollObbyNetworkManager.room.send("Client:Attackable", { attackable: true });
        
        this.cabin
            .tween(this.cabin.getLocalPosition())
            .to(this.pos1, 4, pc.SineInOut)
            .onComplete(() => {

                // geri
                setTimeout(()=>{

                    this.counter.enabled = true;
                    this.counter.text = "5";
                    setTimeout(()=>{this.counter.text = "4";}, 1000);
                    setTimeout(()=>{this.counter.text = "3";}, 2000);
                    setTimeout(()=>{this.counter.text = "2";}, 3000);
                    setTimeout(()=>{this.counter.text = "1";}, 4000);
                    setTimeout(()=>{this.counter.text = "0";}, 5000);

                    setTimeout(()=>{
                        this.counter.enabled = false;
                        this.cabin
                            .tween(this.cabin.getLocalPosition())
                            .to(this.pos0, 4, pc.SineInOut)
                            .onComplete(() => {
                                this.active = false;
                            })
                            .start();
                    }, 6000);
                }, 3 * 1000);

            })
            .start();
    }, 6000);

}

TrollObbyElevator.prototype.onTrigger = function(){
    if (this.active) return;

    this.app.trollObbyPopupController.showPopup("Ad Brake?", "Would you like to watch an ad to run the elevator?", true, this, this.idAd, this.idNo, null, true, true);
    //setTimeout(()=>{
    //}, 600)

    this.app.trollObbyNetworkManager.room.send("Client:Attackable", { attackable: false });
}

TrollObbyElevator.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
}