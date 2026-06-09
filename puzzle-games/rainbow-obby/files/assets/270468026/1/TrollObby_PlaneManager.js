var TrollObbyTrollManager = pc.createScript('trollObbyTrollManager');

TrollObbyTrollManager.attributes.add('bulletAsset', { type: 'asset', title: 'BulletAsset' });
TrollObbyTrollManager.attributes.add('tntAsset', { type: 'asset', title: 'TntAsset' });

TrollObbyTrollType = {
    TROLL_DEFAULT: 0,
    TROLL_RIGHTBROTHERS: 1,
    TROLL_WHICHESBROOM: 2,
    TROLL_BOMBARDINO: 3,
    TROLL_UFO: 4,
    TROLL_TOILET: 5,
    JETPACK: 6,
    FLYING_CARPET: 7,
    TNT: 8,
};

TrollObbyItems = {
    JETPACK: 0,
    FLYING_CARPET: 1,
    TNT: 2,
}

TrollObbyTrollManager.attributes.add("items", {
    type: "json", schema: [
        {
            name: "id",
            type: "number",
            enum: [
                { 'Jetpack': TrollObbyItems.JETPACK },
                { 'Fyling Carpet': TrollObbyItems.FLYING_CARPET },
                { 'TNT': TrollObbyItems.TNT },
            ],
        },
        {
            name: "name",
            type: "string",
        },
        {
            name: "texture",
            type: "string",
        },
    ], array: true
});

TrollObbyOwnedTrolls = [TrollObbyTrollType.TROLL_DEFAULT];

// initialize code called once per entity
TrollObbyTrollManager.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;
    //this.playerController = ;
    this.trolls = {};
    this.app.trollObbyTrollManager = this;

    this.app.on("Connected", this.onConnected, this);
    this.offlineTroll = null;

    this.currentSkinId = null;

    this.app.localTrollId = null;
    this.app.shouldAutoGetIn = false;

    this.trollTemplateId = 267752097;


    if (TrollObby_Utils.getItem("TROLLOBBY_OwnedTrolls")) {
        TrollObbyOwnedTrolls = Array.from(JSON.parse(TrollObby_Utils.getItem("TROLLOBBY_OwnedTrolls")));
    } else {
        TrollObby_Utils.setItem("TROLLOBBY_OwnedTrolls", JSON.stringify(TrollObbyOwnedTrolls));
    };

    if (TrollObby_Utils.getItem("TROLLOBBY_TrollID")) {
        this.currentSkinId = TrollObby_Utils.getItem("TROLLOBBY_TrollID") * 1
    } else {
        TrollObby_Utils.setItem("TROLLOBBY_TrollID", TrollObbyTrollType.TROLL_DEFAULT);
        this.currentSkinId = TrollObbyTrollType.TROLL_DEFAULT;
    };

    //TrollObby_Utils.getItem("TROLLOBBY_TrollID") * 1

    this.app.on("giveItem", (itemID) => {
        if (TrollObbyItemDataBase[itemID].type == "troll") {
            TrollObby_Utils.setItem("TROLLOBBY_TrollID", itemID)
            this.currentSkinId = itemID;
            console.log("inTroll", this.app.inTroll)
            this.trollIdChanged();

            if (TrollObbyTrollManager.isOwnsTroll(itemID) == false) {
                TrollObbyOwnedTrolls.push(itemID)
            }
            TrollObby_Utils.setItem("TROLLOBBY_OwnedTrolls", JSON.stringify(TrollObbyOwnedTrolls))

            this.app.fire("updateMarketSlots")
        } else if (TrollObbyItemDataBase[itemID].type == "item") {
            switch (itemID) {
                case TrollObbyTrollType.JETPACK: this.app.playerPowerUp.setValue(TrollObbyItems.JETPACK, this.app.playerPowerUp.jetpack.fuelMax); break
                case TrollObbyTrollType.FLYING_CARPET: this.app.playerPowerUp.setValue(TrollObbyItems.FLYING_CARPET, this.app.playerPowerUp.flyingCarpet.remainingMax); break
                case TrollObbyTrollType.TNT: this.app.playerPowerUp.setValue(TrollObbyItems.TNT, this.app.playerPowerUp.tnt.amountMax); break
            }
        }
    })

    this.app.on("trollIdChanged", this.trollIdChanged, this);

    this.on('destroy', function () {
        this.app.off("giveItem");
        this.app.off("trollIdChanged");
        this.app.off("Connected");
    }, this);
};

TrollObbyTrollManager.prototype.trollIdChanged = function () {
    this.currentSkinId = TrollObby_Utils.getItem("TROLLOBBY_TrollID") * 1;
    if (this.app.localTrollId != null && !this.app.inTroll) {
        if (this.networkManager.room) {
            this.removeTroll(this.app.localTrollId);
        } else {
            this._removeTrollOffline(this.app.localTrollId);
        }
    }
}

TrollObbyTrollManager.prototype.destroy = function () {
    this.app.off("Connected", this.onConnected, this);
    this.app.off("trollIdChanged", this.trollIdChanged, this);
};

TrollObbyTrollManager.isOwnsTroll = function (trollID) {
    return TrollObbyOwnedTrolls.includes(trollID);
}

const TrollObbyItemDataBase = {
    [TrollObbyTrollType.TROLL_DEFAULT]: {
        image: 268278098,
        price: 10,
        ads: 1,
        responsiveness: 1,
        bulletSkin: 0,
        type: "troll"
    },

    [TrollObbyTrollType.TROLL_RIGHTBROTHERS]: {
        image: 268278097,
        price: 20,
        ads: 1,
        responsiveness: 1.25,
        bulletSkin: 1,
        type: "troll"
    },

    [TrollObbyTrollType.TROLL_WHICHESBROOM]: {
        image: 268278099,
        price: 30,
        ads: 1,
        responsiveness: 1.5,
        bulletSkin: 2,
        type: "troll"
    },

    [TrollObbyTrollType.TROLL_BOMBARDINO]: {
        image: 268278100,
        price: 40,
        ads: 1,
        responsiveness: 2,
        bulletSkin: 3,
        type: "troll"
    },

    [TrollObbyTrollType.TROLL_TOILET]: {
        image: 268278101,
        price: 50,
        ads: 1,
        responsiveness: 3,
        bulletSkin: 5,
        type: "troll"
    },

    [TrollObbyTrollType.TROLL_UFO]: {
        image: 268278096,
        price: 60,
        ads: 1,
        responsiveness: 4,
        bulletSkin: 4,
        type: "troll"
    },

    [TrollObbyTrollType.JETPACK]: {
        ads: 1,
        type: "item",
    },

    [TrollObbyTrollType.FLYING_CARPET]: {
        ads: 1,
        type: "item",
    },

    [TrollObbyTrollType.TNT]: {
        ads: 1,
        type: "item",
    },
}

TrollObbyTrollManager.prototype.onConnected = function () {
    if (this.networkManager.room) {
        this.networkManager.room.state.trolls.onAdd((troll, trollID) => {
            let _troll_template = this.app.assets.get(this.trollTemplateId);
            let _instance = _troll_template.resource.instantiate();
            _instance.setLocalPosition(new pc.Vec3(troll.x, troll.y, troll.z))
            _instance.script.trollObbyTroll.trollData = troll;
            this.app.root.addChild(_instance);
            this.trolls[trollID] = _instance;


            // 🔹 Troll pozisyon değiştiğinde güncelle
            troll.onChange(() => {
                let target = this.trolls[trollID];
                if (!target) return;
                if (target.script.trollObbyTroll) {
                    target.script.trollObbyTroll.targetPosition = new pc.Vec3(troll.x, troll.y, troll.z);
                    target.script.trollObbyTroll.targetRotation = new pc.Vec3(troll.rotX, troll.rotY, troll.rotZ);
                } else {
                    //target.setLocalPosition(troll.x, troll.y, troll.z);
                }
            });

            troll.listen("isNitro", (isNitro) => {
                if (!this.trolls[troll.id]) return;
                if (isNitro) { this.trolls[troll.id].script.trollObbyTroll.nitro.particle.play(); }
                else { this.trolls[troll.id].script.trollObbyTroll.nitro.particle.stop(); }

                //console.log("isNitro:",isNitro);
            })
        }, false)

        this.networkManager.room.state.trolls.onRemove((troll, trollID) => {
            if (this.trolls[trollID]) {
                //other player destroys his own troll
                if (!this.trolls[trollID].script.trollObbyTroll.isLocal && this.networkManager.playerEntities[troll.ownerId]) {
                    this.networkManager.playerEntities[troll.ownerId].reparent(this.app.root);
                }
                //other player got destroyed as a passanger
                if (!this.trolls[trollID].script.trollObbyTroll.isLocal && this.networkManager.playerEntities[troll.passengerId]) {
                    this.networkManager.playerEntities[troll.passengerId].reparent(this.app.root);
                }
                if (!this.trolls[trollID].script.trollObbyTroll.isLocal && (this.networkManager.playerEntities[this.networkManager.room.sessionId].networkData.guestTrollId == trollID || troll.passengerId == this.networkManager.room.sessionId)) {
                    if (this.networkManager.playerController.troll && this.networkManager.playerController.troll.isLocal) {
                        //oyuncu diger troll de degil kendi troll ini suruyor o yuzden elleme
                    } else {
                        this.networkManager.playerEntities[this.networkManager.room.sessionId].reparent(this.app.root);
                        //ucakta degilsek bizi oldurme
                        if (this.networkManager.playerController.troll != null)
                            this.app.fire("playerDie");
                    }
                }
                if (this.trolls[trollID].script.trollObbyTroll.isLocal) {
                    this.app.localTrollId = null;
                    this.networkManager.playerEntities[this.networkManager.room.sessionId].reparent(this.app.root);
                }
                console.log("XXX TROLL DESTROYED", troll)
                const savePlayer = this.trolls[trollID].findByName("Player");
                const saveOtherPlayer = this.trolls[trollID].findByName("RemotePlayer");
                if (savePlayer) {
                    savePlayer.reparent(this.app.root);
                }
                if (saveOtherPlayer) {
                    saveOtherPlayer.reparent(this.app.root);
                }
                this.trolls[trollID].destroy();
                delete this.trolls[trollID];
            }
        }, false);
    }
}

TrollObbyTrollManager.prototype._createTrollOffline = function (_position = new pc.Vec3(), getIn = false) {
    let trollPosition = _position;
    this.app.shouldAutoGetIn = getIn;

    if (this.offlineTroll != null) return;
    let _troll_template = this.app.assets.get(this.trollTemplateId);
    let _instance = _troll_template.resource.instantiate();
    _instance.setLocalPosition(new pc.Vec3(trollPosition.x, trollPosition.y, trollPosition.z))
    _instance.script.trollObbyTroll.trollData = {
        id: this.getRandomId(),
        skin: this.currentSkinId,
    };
    this.offlineTroll = _instance;
    this.app.root.addChild(_instance);
    this.trolls[0] = _instance;

    console.log("createOffline")
}

TrollObbyTrollManager.prototype._removeTrollOffline = function () {
    if (this.offlineTroll == null) return;
    this.trolls[0].destroy();
    delete this.trolls[0];
    this.offlineTroll = null;
    this.app.localTrollId = null;
}


TrollObbyTrollManager.prototype.damagePart = function (_id, _damage, _part) {
    console.log("damagePart", _id, _damage, _part);
    if (this.trolls[_id]) {
        this.trolls[_id].script.trollObbyTroll.damagePart(_damage, _part, true);
    }
}

TrollObbyTrollManager.prototype.destroyPart = function (_id, _part) {
    console.log("destroyPart", _id, _part);
    if (this.trolls[_id]) {
        this.trolls[_id].script.trollObbyTroll.destroyPart(_part, true);
    }
}

TrollObbyTrollManager.prototype.destroyTroll = function (_id) {
    console.log("destroyTroll", _id);
    console.log("2")
    if (this.trolls[_id]) {
        console.log("3")
        this.trolls[_id].script.trollObbyTroll.destroyTroll(true);
    }
}

TrollObbyTrollManager.prototype.expoEffect = function (_id) {
    if (this.trolls[_id]) {
        this.trolls[_id].script.trollObbyTroll.expoEffect();
    }
}

TrollObbyTrollManager.prototype.createTroll = function (_position = new pc.Vec3(), getIn = false) {
    this.app.shouldAutoGetIn = getIn;
    if (this.app.localTrollId != null) {
        if (this.networkManager.room) { this.removeTroll(this.app.localTrollId); }
        else { this._removeTrollOffline(); }
    }
    if (this.networkManager.room) {
        this.networkManager.room.send("Client:TrollCreate", {
            id: this.getRandomId(),
            skin: this.currentSkinId,
            x: _position.x,
            y: _position.y,
            z: _position.z,
        });
    } else {
        this._createTrollOffline(_position);
    }
}

TrollObbyTrollManager.prototype.removeTroll = function (_id) {
    if (this.networkManager.room) {
        this.networkManager.room.send("Client:TrollRemove", { id: _id });
    } else {
        this._removeTrollOffline();
    }
}

TrollObbyTrollManager.prototype.getRandomId = function () {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}


TrollObbyTrollManager.prototype.spawnBomb = function (ownerId, position, rotation, force) {
    if (!this.bombAsset || !this.bombAsset.resource) return;
    let bomb = this.bombAsset.resource.instantiate();
    bomb.script.trollObbyBomb.bombData = { position: position, rotation: rotation, ownerId: ownerId, force: force };

    this.app.root.addChild(bomb);
    //bomb.setPosition(new pc.Vec3(position.x, position.y, position.z));
    //bomb.setRotation(new pc.Vec3(rotation.x, rotation.y, rotation.z));
}

TrollObbyTrollManager.prototype.spawnTnt = function (ownerId, position) {
    if (!this.tntAsset || !this.tntAsset.resource) return;
    let tnt = this.tntAsset.resource.instantiate();
    //tnt.script.trollObbyTnt.tntData = { position: position, ownerId: ownerId };

    tnt.setPosition(new pc.Vec3(position.x, position.y, position.z));
    tnt.script.trollObbyTnt.ownerId = ownerId;


    this.app.root.addChild(tnt);
}

TrollObbyTrollManager.prototype.spawnBullet = function (ownerId, position, rotation, skin) {
    //console.log("ownerId", ownerId, "position", position, "rotation", rotation);

    if (!this.bulletAsset || !this.bulletAsset.resource) return;
    let bullet = this.bulletAsset.resource.instantiate();

    bullet.setPosition(new pc.Vec3(position.x, position.y, position.z));
    bullet.setEulerAngles(new pc.Vec3(rotation.x, rotation.y, rotation.z));
    bullet.script.trollObbyBullet.ownerId = ownerId;
    bullet.script.trollObbyBullet.skin = skin;

    this.app.root.addChild(bullet);
}

