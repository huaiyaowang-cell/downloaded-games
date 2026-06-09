var TrollObbyMarketItem = pc.createScript('trollObbyMarketItem');

TrollObbyMarketItem.attributes.add("type", {
    type: "number",
    enum: [
        { "TROLL_DEFAULT": 0 },
        { "TROLL_RIGHTBROTHERS": 1 },
        { "TROLL_WHICHESBROOM": 2 },
        { "TROLL_BOMBARDINO": 3 },
        { "TROLL_UFO": 4 },
        { "TROLL_TOILET": 5 },
    ],
    default: 0
})

// ad texture 218530348
// coin texture 218530382

TrollObbyMarketItem.prototype.updateSlot = function () {
    if (!TrollObbyTrollManager.isOwnsTroll(this.type)) {
        if (TrollObbyItemDataBase[this.type].price > 0) {
            this._priceLabel.enabled = true;
            this._priceImage.element.textureAsset = this.app.assets.get(218530382);
            this._priceText.element.text = TrollObbyItemDataBase[this.type].price
        };
    } else {
        this._priceLabel.enabled = false;
    }

    if (TrollObby_Utils.getItem("TROLLOBBY_TrollID") * 1 == this.type) {
        this._checkMark.enabled = true;
    } else { this._checkMark.enabled = false; }
}

TrollObbyMarketItem.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this._imageBoat = this.entity.findByName("ImageBoat")
    this._priceLabel = this.entity.findByName("PriceLabel")
    this._priceImage = this.entity.findByName("PriceImage")
    this._priceText = this.entity.findByName("PriceText")
    this._checkMark = this.entity.findByName("CheckMark")

    this._imageBoat.element.textureAsset = this.app.assets.get(TrollObbyItemDataBase[this.type].image);

    this.updateSlot();

    this.entity.button.on('click', function (event) {
        if (TrollObbyTrollManager.isOwnsTroll(this.type)) {
            console.log("1")
            TrollObby_Utils.setItem("TROLLOBBY_TrollID", this.type);
            this.app.fire("trollIdChanged");
        } else {
            if (TrollObby_Utils.getItem("TROLLOBBY_Coin") * 1 >= TrollObbyItemDataBase[this.type].price) {
                TrollObby_Utils.setItem("TROLLOBBY_TrollID", this.type);
                this.app.fire("giveItem", this.type);
                //this.entity.sound.play("Buy");

                console.log("net", this.networkManager)
                this.networkManager.decreaseCoin(TrollObbyItemDataBase[this.type].price);
                TrollObby_Utils.setItem("TROLLOBBY_Coin", TrollObby_Utils.getItem("TROLLOBBY_Coin") * 1 - TrollObbyItemDataBase[this.type].price);
                this._priceLabel.enabled = false;
            }
        }
        this.app.fire("updateMarketSlots")
    }, this);

    this.app.on("updateMarketSlots", () => {
        this.updateSlot();
    })

    this.on('destroy', function () {
        this.app.off("updateMarketSlots");
    }, this);
}
