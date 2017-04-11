"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_1 = require("../event");
const adventure_log_1 = require("../../../shared/adventure-log");
const GoldBlessParty_1 = require("./GoldBlessParty");
exports.WEIGHT = 216;
// Gain 10-1000 Gold
class GoldBless extends event_1.Event {
    static operateOn(player) {
        if (player.party && event_1.Event.chance.bool({ likelihood: 70 })) {
            GoldBlessParty_1.GoldBlessParty.operateOn(player);
            return player.party.members;
        }
        let value = event_1.Event.chance.integer({ min: 10, max: 350 * player.level });
        if (event_1.Event.chance.bool({ likelihood: 1 })) {
            const maxGoldGained = Math.max(1000, Math.round(player.gold * 0.02));
            const baseGold = Math.floor(event_1.Event.chance.integer({ min: 10, max: maxGoldGained }));
            value = baseGold;
        }
        const goldMod = player.gainGold(value);
        const eventText = this.eventText('blessGold', player, { gold: goldMod });
        this.emitMessage({ affected: [player], eventText: `${eventText} [+${goldMod.toLocaleString()} gold]`, category: adventure_log_1.MessageCategories.GOLD });
        return [player];
    }
}
GoldBless.WEIGHT = exports.WEIGHT;
exports.GoldBless = GoldBless;
