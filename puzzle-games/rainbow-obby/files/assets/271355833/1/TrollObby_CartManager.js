var TrollObbyCartManager = pc.createScript('trollObbyCartManager');

// initialize code called once per entity
TrollObbyCartManager.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;
    //this.playerController = ;
    this.carts = {};
    this.app.trollObbyCartManager = this;

    this.app.on("Connected", this.onConnected, this);
    this.offlineCart = null;

    this.currentSkinId = null;

    this.app.localCartId = null;
    this.app.shouldAutoGetIn = false;

    //TrollObby_Utils.getItem("TROLLOBBY_CartID") * 1

    this.app.on("cartIdChanged", this.cartIdChanged, this);

    this.on('destroy', function () {
        this.app.off("cartIdChanged");
        this.app.off("Connected");
    }, this);

};

TrollObbyCartManager.prototype.cartIdChanged = function () {
    this.currentSkinId = TrollObby_Utils.getItem("TROLLOBBY_CartID") * 1;
    if (this.app.localCartId != null && !this.app.inCart) {
        if (this.networkManager.room) {
            this.removeCart(this.app.localCartId);
        } else {
            this._removeCartOffline(this.app.localCartId);
        }
    }
}

TrollObbyCartManager.prototype.destroy = function () {
    this.app.off("Connected", this.onConnected, this);
    this.app.off("cartIdChanged", this.cartIdChanged, this);
};

TrollObbyCartManager.prototype.onConnected = function () {
    if (this.networkManager.room) {
        this.networkManager.room.state.carts.onAdd((cart, cartID) => {
            let _cart_template = this.app.assets.get(271629320);
            let _instance = _cart_template.resource.instantiate();
            _instance.setLocalPosition(new pc.Vec3(cart.x, cart.y, cart.z))
            _instance.script.trollObbyCart.cartData = cart;
            this.app.root.addChild(_instance);
            this.carts[cartID] = _instance;


            // 🔹 Cart pozisyon değiştiğinde güncelle
            cart.onChange(() => {
                let target = this.carts[cartID];
                if (!target) return;
                if (target.script.trollObbyCart) {
                    target.script.trollObbyCart.targetPosition = new pc.Vec3(cart.x, cart.y, cart.z);
                } else {
                    //target.setLocalPosition(cart.x, cart.y, cart.z);
                }
            });
        }, false)

        this.networkManager.room.state.carts.onRemove((cart, cartID) => {
            if (this.carts[cartID]) {
                if (!this.carts[cartID].script.trollObbyCart.isLocal && this.networkManager.playerEntities[cart.ownerId]) {
                    this.networkManager.playerEntities[cart.ownerId].reparent(this.app.root);
                } else if (this.carts[cartID].script.trollObbyCart.isLocal){
                    this.app.localCartId = null;
                }

                this.carts[cartID].destroy();
                delete this.carts[cartID];
            }
        }, false);
    }
}

TrollObbyCartManager.prototype._createCartOffline = function (_position = new pc.Vec3(), splineIndex = 0, getIn = false, spawnValue = null) {
    let cartPosition = _position;
    if (spawnValue != null) { cartPosition = this.app.splines[splineIndex].getPosition(spawnValue); }
    this.app.shouldAutoGetIn = getIn;

    if (this.offlineCart != null) return;
    let _cart_template = this.app.assets.get(CartObbyItemDataBase[this.currentSkinId].template);
    let _instance = _cart_template.resource.instantiate();
    _instance.setLocalPosition(new pc.Vec3(cartPosition.x, cartPosition.y, cartPosition.z))
    _instance.script.trollObbyCart.cartData = {
        id: this.getRandomId(),
        splineIndex: splineIndex,
        skin: this.currentSkinId,
    };
    this.offlineCart = _instance;
    this.app.root.addChild(_instance);
    this.carts[0] = _instance;
}

TrollObbyCartManager.prototype._removeCartOffline = function () {
    if (this.offlineCart == null) return;
    this.carts[0].destroy();
    delete this.carts[0];
    this.offlineCart = null;
    this.app.localCartId = null;
}

TrollObbyCartManager.prototype.destroyCart = function (_id) {
    console.log("destroyCart", _id);
    if (this.carts[_id]) {
        this.carts[_id].script.trollObbyCart.destroyCart(true);
    }
}

TrollObbyCartManager.prototype.expoEffect = function (_id) {
    if (this.carts[_id]) {
        this.carts[_id].script.trollObbyCart.expoEffect();
    }
}

TrollObbyCartManager.prototype.createCart = function (_position = new pc.Vec3(), splineIndex = 0, getIn = false, spawnValue = null) {
    let cartPosition = _position;

    if (this.app.localCartId != null) {
        if (this.networkManager.room) { this.removeCart(this.app.localCartId); }
        else { this._removeCartOffline(); }
    }
    if (this.networkManager.room) {
        this.networkManager.room.send("Client:CartCreate", {
            id: this.getRandomId(),
            skin: this.currentSkinId,
            x: cartPosition.x,
            y: cartPosition.y,
            z: cartPosition.z,
            splineIndex: splineIndex,
        });
    } else {
        this._createCartOffline(cartPosition, splineIndex);
    }
}

TrollObbyCartManager.prototype.removeCart = function (_id) {
    this.networkManager.room.send("Client:CartRemove", { id: _id });
}

TrollObbyCartManager.prototype.getRandomId = function () {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}


TrollObbyCartManager.prototype.spawnBomb = function (ownerId, position, rotation, force) {
    if (!this.bombAsset || !this.bombAsset.resource) return;
    let bomb = this.bombAsset.resource.instantiate();
    bomb.script.cartObbyBomb.bombData = { position: position, rotation: rotation, ownerId: ownerId, force: force };

    this.app.root.addChild(bomb);
    //bomb.setPosition(new pc.Vec3(position.x, position.y, position.z));
    //bomb.setRotation(new pc.Vec3(rotation.x, rotation.y, rotation.z));
}

TrollObbyCartManager.prototype.spawnTnt = function (ownerId, position) {
    if (!this.tntAsset || !this.tntAsset.resource) return;
    let tnt = this.tntAsset.resource.instantiate();
    tnt.script.cartObbyTnt.tntData = { position: position, ownerId: ownerId };

    this.app.root.addChild(tnt);
}

