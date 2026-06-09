var TrollObbyAuraManager = pc.createScript('trollObbyAuraManager');

TrollObbyAuraManager.attributes.add("sigmaScreen", { type: "entity" });
TrollObbyAuraManager.attributes.add("sigmaImage", { type: "entity" });
TrollObbyAuraManager.attributes.add("sigmaText", { type: "entity" });

// initialize code called once per entity
TrollObbyAuraManager.prototype.initialize = function () {
    this.editDelay = 0.25;
    this.editDuration = 3;

    this.app.aura = 0;
    this.app.auraManager = this;
    this.app.isEdit = false;
    this.lastAttacker = null;

    this.app.on("Connected", this.onConnected, this);

    this.entity.on("destroy", () => {
        this.app.off("Connected");
    }, this)

    this.faceScale = 1;
};

TrollObbyAuraManager.prototype.update = function () {
    this.faceScale = pc.math.lerp(this.faceScale, 1, .3);
    this.sigmaImage.setLocalScale(this.faceScale, this.faceScale, this.faceScale);
}

TrollObbyAuraManager.prototype.setAura = function (newAura) {
    this.app.aura = newAura;
    TrollObby_Utils.setItem("TROLLOBBY_Aura", newAura);
}

TrollObbyAuraManager.prototype.reset = function () {
    if (!this.app.trollObbyNetworkManager.room) return;
    this.app.trollObbyNetworkManager.room.send("Client:SetAura", { aura: 0 });
}

TrollObbyAuraManager.prototype.onConnected = function () {
    if (!this.app.trollObbyNetworkManager.room) return;

    if (TrollObby_Utils.getItem("TROLLOBBY_Aura")) {
        this.app.trollObbyNetworkManager.room.send("Client:SetAura", { aura: TrollObby_Utils.getItem("TROLLOBBY_Aura") * 1 });
    } else {
        TrollObby_Utils.setItem("TROLLOBBY_Aura", 0);
        this.app.trollObbyNetworkManager.room.send("Client:SetAura", { aura: 0 });
    };
}

TrollObbyAuraManager.prototype.edit = function (target, isAttacker, isRevenge) {
    this.app.isEdit = true;

    if (this.app.trollObbyNetworkManager.room) {
        this.app.trollObbyNetworkManager.room.send("Client:SetFrozen", { isFrozen: true });
    }

    this.sigmaScreen.enabled = true;
    this.editSFX();
    this.toggleCameraFilters(true);

    this.app.root.findByName("InventorySlots").enabled = false;

    if (isRevenge) {
        this.sigmaText.element.text = "REVENGE";
    } else if (target?.type === "bee") {
        this.sigmaText.element.text = isAttacker ? "BEE UNALIVER" : "NOOB";
    } else {
        this.sigmaText.element.text = isAttacker ? `Sigma. (+${((this.app.rebirth+1)*2)} Aura)` : "Noob."; 
    }

    if (target?.type === "player") {
        let otherController = this.app.trollObbyNetworkManager.playerEntities[target.id]?.script.trollObbyOtherPlayerController;

        if (isAttacker) {
            this.app.trollObbyPlayerController.faceAttacker.enabled = true;
            otherController.faceTarget.enabled = true;
        } else {
            this.app.trollObbyPlayerController.faceTarget.enabled = true;
            otherController.faceAttacker.enabled = true;
        }
    }

    if (target?.type === "bee") {
        let bee = this.app.bees[target.id];
        if (isAttacker) {
            this.app.trollObbyPlayerController.faceAttacker.enabled = true;
            bee.setTrollFace("target");
        } else {
            this.app.trollObbyPlayerController.faceTarget.enabled = true;
            bee.setTrollFace("attacker");
        }
    }

    this.app.fire("bee:setFrozen", true, (target?.type === "bee" ? target.id : null));

    this.faceScaleAnimate();

    setTimeout(() => {
        this.cleanupEdit(target);
    }, this.editDuration * 1000);
}

TrollObbyAuraManager.prototype.cleanupEdit = function (target) {
    this.sigmaScreen.enabled = false;

    if (this.app.trollObbyNetworkManager.room) {
        this.app.trollObbyNetworkManager.room.send("Client:SetFrozen", { isFrozen: false });
        this.app.trollObbyNetworkManager.room.send("Client:Attackable", { attackable: true });
    }

    this.app.isEdit = false;
    this.entity.sound.stop();
    this.toggleCameraFilters(false);
    this.app.root.findByName("InventorySlots").enabled = true;

    this.app.trollObbyPlayerController.faceTarget.enabled = false;
    this.app.trollObbyPlayerController.faceAttacker.enabled = false;

    if (target?.type === "player") {
        let other = this.app.trollObbyNetworkManager.playerEntities[target.id]?.script.trollObbyOtherPlayerController;

        if (other) {
            other.faceAttacker.enabled = false;
            other.faceTarget.enabled = false;
        }
    }

    if (target?.type === "bee") {
        let bee = this.app.bees[target.id];

        if (bee) {
            bee.setTrollFace(null);
        }
    }

    this.app.fire("bee:setFrozen", false, null, true);
}



TrollObbyAuraManager.prototype.slapSFX = function () {
    this.entity.sound.play("slap");
}

TrollObbyAuraManager.prototype.editSFX = function () {
    let rand = Math.floor(Math.random() * 5);
    this.entity.sound.play("sigma" + rand);
}

TrollObbyAuraManager.prototype.toggleCameraFilters = function (toggle) {
    this.app.root.findByName("Camera").script.brightnessContrast.enabled = toggle;
    this.app.root.findByName("Camera").script.hueSaturation.enabled = toggle;
}

TrollObbyAuraManager.prototype.faceScaleAnimate = function () {
    this.faceScale = 1.2;

    setTimeout(() => { this.faceScale = 1.2; }, 200);
    //setTimeout(()=>{this.faceScale = 1.2;}, 300);
    //setTimeout(()=>{this.faceScale = 1.2;}, 500);
    setTimeout(() => { this.faceScale = 1.3; }, 550);
    setTimeout(() => { this.faceScale = 1.2; }, 700);
    //setTimeout(()=>{this.faceScale = 1.2;}, 850);
    setTimeout(() => { this.faceScale = 1.3; }, 900);
    //setTimeout(()=>{this.faceScale = 1.2;}, 1100);
    setTimeout(() => { this.faceScale = 1.2; }, 1250);
    setTimeout(() => { this.faceScale = 1.2; }, 1300);
    //setTimeout(()=>{this.faceScale = 1.2;}, 1400);
    setTimeout(() => { this.faceScale = 1.3; }, 1550);
    //setTimeout(()=>{this.faceScale = 1.2;}, 1700);
    setTimeout(() => { this.faceScale = 1.2; }, 1750);
    setTimeout(() => { this.faceScale = 1.2; }, 1800);
    //setTimeout(()=>{this.faceScale = 1.2;}, 2000);
    setTimeout(() => { this.faceScale = 1.3; }, 2100);
    //setTimeout(()=>{this.faceScale = 1.2;}, 2250);
    setTimeout(() => { this.faceScale = 1.2; }, 2500);
    //setTimeout(()=>{this.faceScale = 1.2;}, 2700);
    setTimeout(() => { this.faceScale = 1.3; }, 2850);
}
