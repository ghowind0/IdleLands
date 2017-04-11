"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const server_1 = require("../../primus/server");
exports.sendMessage = (messageObject, fromExtChat = false) => {
    if (_.includes(messageObject.route, ':pm:')) {
        const users = messageObject.route.split(':')[2].split('|');
        server_1.primus.forEach((spark, next) => {
            if (!_.includes(users, spark.playerName))
                return next();
            spark.write(messageObject);
            next();
        }, () => { });
    }
    else {
        server_1.primus.room(messageObject.route).write(messageObject);
        if (messageObject.route === 'chat:channel:General' && server_1.primus.extChat && !fromExtChat) {
            server_1.primus.extChat.sendMessage(messageObject);
        }
    }
};
