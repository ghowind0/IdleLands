
import _ from 'lodash';

import dbPromise from '../../shared/db-wrapper';
import { MESSAGES } from '../../static/messages';

import { Player } from './player';

import { getStatistics, saveStatistics } from '../statistics/statistics.db';

export const getPlayer = async (userId) => {
  const db = await dbPromise();
  const players = db.collection('players');

  return new Promise((resolve, reject) => {
    players.find({ userId }).limit(1).next(async (err, doc) => {

      if(err) {
        return reject({ err, msg: MESSAGES.GENERIC });
      }

      if(!doc) {
        return reject({ err, msg: MESSAGES.NO_PLAYER });
      }

      const player = new Player(doc);

      if(!player.statisticsLink) {
        const newStatistics = await saveStatistics({ _id: player.name, stats: {} });
        player.statisticsLink = newStatistics._id;
        player.$statistics = newStatistics;
      } else {
        player.$statistics = await getStatistics(player.statisticsLink);
      }

      resolve(player);
    });
  });
};

export const savePlayer = async (playerObject) => {
  const savePlayerObject = _.omitBy(playerObject, (val, key) => _.startsWith(key, '$'));
  const db = await dbPromise();
  const players = db.collection('players');

  return new Promise((resolve) => {
    players.findOneAndUpdate({ _id: savePlayerObject._id }, savePlayerObject, { upsert: true }).then(() => {
      resolve(playerObject);
    });
  });
};