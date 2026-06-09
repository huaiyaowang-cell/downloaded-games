var TrollObbyItemDatabase = pc.createScript('trollObbyItemDatabase');

TrollObbyItems = {
    SlapHand        : 0,
    SlapBalloon     : 1,
    SlapBat         : 2,
    SlapCandy       : 3,
    SlapLollipop    : 4,
    JETPACK         : 5,
    FLYING_CARPET   : 6,
    Shield          : 7,
    Rebirth         : 8,
}

TrollObbyItemDatabase.attributes.add("items", {
    type: "json", schema: [
        {
            name: "id",
            type: "number",
            enum: [
                { 'SlapHand':       TrollObbyItems.SlapHand         },
                { 'SlapBalloon':    TrollObbyItems.SlapBalloon      },
                { 'SlapBat':        TrollObbyItems.SlapBat          },
                { 'SlapCandy':      TrollObbyItems.SlapCandy        },
                { 'SlapLollipop':   TrollObbyItems.SlapLollipop     },
                { 'Jetpack':        TrollObbyItems.JETPACK          },
                { 'Fyling Carpet':  TrollObbyItems.FLYING_CARPET    },
                { 'Shield':         TrollObbyItems.Shield           },
                { 'Rebirth':        TrollObbyItems.Rebirth          },
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
        {
            name: "priceAd",
            type: "number",
        },
        {
            name: "priceAura",
            type: "number",
        },
        {
            name: "repurchasable",
            type: "boolean"
        },
    ], array: true
});
