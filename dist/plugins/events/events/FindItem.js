"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const event_1 = require("../event");
const equipment_1 = require("../../../core/base/equipment");
const item_generator_1 = require("../../../shared/item-generator");
const adventure_log_1 = require("../../../shared/adventure-log");
exports.WEIGHT = 306;
// Get given the opportunity to change items
class FindItem extends event_1.Event {
    static disposeOfItem(player, item) {
        const playerItem = player.equipment[item.type];
        const text = playerItem.score > item.score ? 'weak' : 'strong';
        if (player.$personalities.isActive('Salvager') && player.hasGuild) {
            let message = `%player came across %item, but it was too ${text} for %himher, but it was unsalvageable.`;
            const salvageResult = player.getSalvageValues(item);
            const { wood, clay, stone, astralium } = salvageResult;
            if (wood > 0 || clay > 0 || stone > 0 || astralium > 0) {
                player.incrementSalvageStatistics(salvageResult);
                message = `%player came across %item, but it was too ${text} for %himher, so %she salvaged it for %wood wood, %clay clay, %stone stone, and %astralium astralium.`;
            }
            const parsedMessage = this._parseText(message, player, { wood, clay, stone, astralium, item: item.fullname });
            this.emitMessage({ affected: [player], eventText: parsedMessage, category: adventure_log_1.MessageCategories.ITEM });
            return;
        }
        const message = `%player came across %item, but it was too ${text} for %himher, so %she sold it for %gold gold.`;
        const gold = player.sellItem(item);
        const parsedMessage = this._parseText(message, player, { gold, item: item.fullname });
        player.$statistics.incrementStat('Character.Item.Unequippable');
        this.emitMessage({ affected: [player], eventText: parsedMessage, category: adventure_log_1.MessageCategories.ITEM });
    }
    static operateOn(player, opts = {}, forceItem) {
        let item = forceItem;
        if (!forceItem) {
            item = item_generator_1.ItemGenerator.generateItem(null, player.calcLuckBonusFromValue(player.stats.luk), player.level);
            if (!player.canEquip(item) || item.score <= 0) {
                return this.disposeOfItem(player, item);
            }
        }
        const id = event_1.Event.chance.guid();
        const message = `Would you like to equip «${item.fullname}»?`;
        const eventText = this.eventText('findItem', player, { item: item.fullname });
        const extraData = { item, eventText };
        const choices = ['Yes', 'No'];
        if (player.$pets.activePet) {
            choices.push('Pet');
        }
        player.addChoice({ id, message, extraData, event: 'FindItem', choices });
        return [player];
    }
    static makeChoice(player, id, response) {
        const choice = _.find(player.choices, { id });
        const item = new equipment_1.Equipment(choice.extraData.item);
        if (response === 'No') {
            return this.disposeOfItem(player, item);
        }
        if ((!_.includes(choice.choices, 'Pet') && response === 'Pet'))
            return event_1.Event.feedback(player, 'Invalid choice. Cheater.');
        if (response === 'Pet') {
            const pet = player.$pets.activePet;
            if (pet.inventoryFull())
                return event_1.Event.feedback(player, 'Pet inventory full.');
            pet.addToInventory(item);
            const eventText = this._parseText('%player gave a fancy %item to %pet!', player, { item: item.fullname });
            this.emitMessage({ affected: [player], eventText, category: adventure_log_1.MessageCategories.ITEM });
        }
        if (response === 'Yes') {
            player.equip(item);
            this.emitMessage({ affected: [player], eventText: choice.extraData.eventText, category: adventure_log_1.MessageCategories.ITEM });
        }
    }
}
FindItem.WEIGHT = exports.WEIGHT;
exports.FindItem = FindItem;