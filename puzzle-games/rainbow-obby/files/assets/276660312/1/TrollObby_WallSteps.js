var TrollObbyWallSteps = pc.createScript('trollObbyWallSteps');

TrollObbyWallSteps.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this.tweenTime = 1;
    this.recloseTime = 6;

    this.steps = this.entity.findByName("Steps");
    this.startPoint = this.steps.getLocalPosition().clone();
    this.targetPoint = this.entity.findByName("TargetPoint");

    this.id = "WallSteps" + this.getRandomId();
    this.serverId = this.id + "Server";

    this.button = this.entity.findByName("Button").script.trollObbyButton;

    setTimeout(() => { this.button.setup(this.id, false, true); }, 500);

    this.app.on(this.id, this.onTrigger, this);
    this.app.on(this.serverId, this.open, this);
    this.isOpen = false;

    this.on('destroy', function () {
        this.app.off(this.id);
        this.app.off(this.serverId);
    }, this);
};

TrollObbyWallSteps.prototype.open = function () {
    //this.entity.sound.play("open");

    this.isOpen = true;

    setTimeout(() => {
        this.close();
        this.isOpen = false;
    }, this.recloseTime * 1000)

    // Sol kapı sola (-2)
    this.steps
        .tween(this.steps.getLocalPosition())
        .to(this.targetPoint.getLocalPosition().clone(), this.tweenTime, pc.SineInOut)   // curved easing
        .start();
};

TrollObbyWallSteps.prototype.onTrigger = function () {
    this.networkManager.fire(this.serverId, true);
}

TrollObbyWallSteps.prototype.close = function () {
    //this.entity.sound.play("close");

    // Sol kapıyı x = 0
    this.steps
        .tween(this.steps.getLocalPosition())
        .to(this.startPoint, this.tweenTime, pc.SineInOut)
        .start();

};


TrollObbyWallSteps.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
}