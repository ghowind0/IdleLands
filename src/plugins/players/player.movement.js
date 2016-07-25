
import _ from 'lodash';
import { GameState } from '../../core/game-state';

import { ProfessionChange } from '../events/eventtypes/ProfessionChange';
import * as Events from '../events/eventtypes/_all';

import { SETTINGS } from '../../static/settings';
import { Logger } from '../../shared/logger';
import { emitter } from './_emitter';

import Chance from 'chance';
const chance = new Chance(Math.random);

export class PlayerMovement {

  static num2dir(dir, x, y) {
    switch(dir) {
      case 1:  return { x: x - 1, y: y - 1 };
      case 2:  return { x: x, y: y - 1 };
      case 3:  return { x: x + 1, y: y - 1 };
      case 4:  return { x: x - 1, y: y };
      case 6:  return { x: x + 1, y: y };
      case 7:  return { x: x - 1, y: y + 1 };
      case 8:  return { x: x, y: y + 1 };
      case 9:  return { x: x + 1, y: y + 1 };

      default: return { x: x, y: y };
    }
  }

  // TODO https://github.com/IdleLands/IdleLandsOld/blob/master/src/character/player/Player.coffee#L478
  static canEnterTile(player, tile) {
    const properties = _.get(tile, 'object.properties');
    if(properties) {
      if(properties.requireMap)         return player.$statistics.getStat(`Character.Maps.${properties.requireMap}`) > 0;
      if(properties.requireRegion)      return player.$statistics.getStat(`Character.Regions.${properties.requireRegion}`) > 0;
      if(properties.requireBoss)        return false;
      if(properties.requireClass)       return player.professionName === properties.requireClass;
      if(properties.requireAchievement) return false;
      if(properties.requireCollectible) return false;
    }
    return !tile.blocked && tile.terrain !== 'Void';
  }

  // TODO https://github.com/IdleLands/IdleLandsOld/blob/master/src/character/player/Player.coffee#L347
  static handleTile(player, tile) {
    const type = _.get(tile, 'object.type');

    const forceEvent = _.get(tile, 'object.properties.forceEvent', '');
    if(forceEvent) {
      if(!Events[forceEvent]) {
        Logger.error('PlayerMovement', `forceEvent ${forceEvent} does not exist at ${player.x}, ${player.y} in ${player.map}`);
        return;
      }
      Events[forceEvent].operateOn(player);
    }

    if(!type || !this[`handleTile${type}`]) return;
    this[`handleTile${type}`](player, tile);
  }

  static handleTileTrainer(player, tile) {
    if(player.stepCooldown > 0) return;
    player.stepCooldown = 10;

    const professionName = tile.object.name;
    const trainerName = tile.object.properties.realName ?
      `${tile.object.properties.realName}, the ${professionName} trainer` :
      `the ${professionName} trainer`;
    ProfessionChange.operateOn(player, { professionName, trainerName });
  }

  static handleTileTeleport(player, tile, force = false) {
    if(!force) {
      if(player.stepCooldown > 0) return;
      player.stepCooldown = 30;
    }

    const dest = tile.object.properties;
    dest.x = +dest.destx;
    dest.y = +dest.desty;

    if(dest.movementType === 'ascend' && player.$personalities.isActive('Delver')) return;
    if(dest.movementType === 'descend' && player.$personalities.isActive('ScaredOfTheDark')) return;

    if(!dest.map && !dest.toLoc) {
      Logger.error('PlayerMovement', new Error(`No dest.map at ${player.x}, ${player.y} in ${player.map}`));
      return;
    }

    if(!dest.movementType) {
      Logger.error('PlayerMovement', new Error(`No dest.movementType at ${player.x}, ${player.y} in ${player.map}`));
      return;
    }

    if(!dest.fromName) dest.fromName = player.map;
    if(!dest.destName) dest.destName = dest.map;

    if(dest.toLoc) {
      const toLocData = SETTINGS.locToTeleport(dest.toLoc);
      dest.x = toLocData.x;
      dest.y = toLocData.y;
      dest.map = toLocData.map;
      dest.destName = toLocData.formalName;
    }

    player.map = dest.map;
    player.x = dest.x;
    player.y = dest.y;

    player.oldRegion = player.mapRegion;
    player.mapRegion = tile.region;

    player.$statistics.incrementStat(`Character.Movement.${_.capitalize(dest.movementType)}`);

    emitter.emit('player:transfer', { player, dest });
  }

  static handleTileCollectible(player, tile) {

    const collectible = tile.object;
    const collectibleName = collectible.name;
    const collectibleRarity = _.get(collectible, 'properties.rarity', 'basic');

    if(player.$collectibles.hasCollectible(collectibleName)) return;

    const collectibleObj = {
      name: collectibleName,
      map: player.map,
      region: player.mapRegion,
      rarity: collectibleRarity,
      description: collectible.properties.flavorText,
      storyline: collectible.properties.storyline,
      foundAt: Date.now()
    };

    player.$collectibles.addCollectible(collectibleObj);

    emitter.emit('player:collectible', { player, collectible: collectibleObj });
  }

  static getTileAt(map, x, y) {
    return GameState.getInstance().world.maps[map].getTile(x, y);
  }

  static pickFollowTile(player, target) {
    return [{ x: target.x, y: target.y }, target.lastDir];
  }

  static pickRandomTile(player, overrideFollow = false) {
    if(!player.stepCooldown) player.stepCooldown = 0;

    if(player.partyName && !overrideFollow) {
      const party = player.party;
      const follow = party.getFollowTarget(player);
      if(follow) {
        return this.pickFollowTile(player, follow);
      }
    }

    const directions = [1,  2,  3,  4,  5,  6,  7,  8,  9];
    const weight     = [10, 10, 10, 10, 10, 10, 10, 10, 10];

    const MAX_DRUNK = 10;
    const drunkFromPersonality = player.$personalities.isActive('Drunk') ? 7 : 0;
    const drunk = Math.max(0, Math.min(MAX_DRUNK, drunkFromPersonality));

    // this is a lot of math that someone smarter than me(?) wrote, ported directly from OldIdleLands
    if(player.lastDir) {
      const point1 = [player.lastDir % 3, Math.floor(player.lastDir / 3)]; // list -> matrix
      _.each(directions, num => {
        const point2 = [num % 3, Math.floor(num / 3)]; // list -> matrix
        const distance = Math.abs(point1[0] - point2[0]) + Math.abs(point1[1] - point2[1]);
        if(distance === 0) {
          weight[num - 1] = 40 - 3.6 * drunk;
        } else {
          weight[num - 1] = Math.max(1, 4 - distance * (1 - drunk / MAX_DRUNK)); // each point of drunkenness makes the distance matter less
        }
      });
    }

    const randomDir = () => chance.weighted(directions, weight);
    const dir = randomDir();

    return [this.num2dir(dir, player.x, player.y), dir];

  }
}