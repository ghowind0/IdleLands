
import * as _ from 'lodash';
import * as jwt from 'jsonwebtoken';

import { Player } from './player';
import { PlayerDb } from './player.db';
import { emitter } from './_emitter';

import { Logger } from '../../shared/logger';
import { constitute } from '../../shared/di-wrapper';
import { MESSAGES } from '../../static/messages';

import { GameState } from '../../core/game-state';

const AUTH0_SECRET = process.env.AUTH0_SECRET;
const SERVER_ID = _.isNaN(+process.env.INSTANCE_NUMBER) ? 0 : +process.env.INSTANCE_NUMBER;

import { PlayerForceLogout } from '../scaler/redis';

export const event = 'plugin:player:login';
export const description = 'Log in or register a new character. Login only requires userId.';
export const args = 'name, gender, professionName, token, userId';
export const socket = (socket, primus, respond) => {

  const login = async({ name, gender, professionName, token, userId }) => {

    if(_.isUndefined(process.env.INSTANCE_NUMBER)) {
      Logger.info('Socket:Player:Login', 'No instance number, killing login.');
      socket.end(undefined, { reconnect: true });
      return;
    }

    let player = null;
    let event = '';
    const playerDb = constitute(PlayerDb);
    Logger.info('Socket:Player:Login', `Attempted login from (${socket.address.ip}, ${userId}).`);

    if(!playerDb) {
      Logger.error('Login', new Error('playerDb could not be resolved.'));
      return respond({ msg: MESSAGES.GENERIC });
    }

    const validateToken = (process.env.NODE_ENV === 'production' && !process.env.ALLOW_LOCAL) || !_.includes(userId, 'local|');
    if(validateToken) {
      if(AUTH0_SECRET) {
        try {
          jwt.verify(token, new Buffer(AUTH0_SECRET, 'base64'), { algorithms: ['HS256'] });
        } catch(e) {
          // Logger.error('Login', e, { token });
          return respond(MESSAGES.INVALID_TOKEN);
        }
      } else {
        Logger.error('Login', new Error('Token needs to be validated, but no AUTH0_TOKEN is present.'));
      }
    }

    const gameState = GameState.getInstance();

    const oldPlayer = _.find(gameState.players, { userId });

    if(!oldPlayer) {

      try {
        player = await playerDb.getPlayer({ userId });
        event = 'player:login';

      } catch(e) {

        // 20 char name is reasonable
        name = _.truncate(name, { length: 20 }).trim().replace(/[^\w\dÀ-ÿ ]/gm, '');
        name = name.split(' the ').join('');
        name = name.trim();

        if(name.length === 0) {
          return respond(MESSAGES.INVALID_NAME);
        }

        // sensible defaults
        if(!_.includes(['male', 'female'], gender)) gender = 'male';
        if(!_.includes(['Generalist', 'Mage', 'Cleric', 'Fighter'], professionName)) professionName = 'Generalist';

        let playerObject = {};
        try {
          playerObject = constitute(Player);
        } catch(e) {
          Logger.error('Login', e);
          return respond(MESSAGES.GENERIC);
        }

        playerObject.init({ _id: name, name, gender, professionName, userId }, false);

        try {
          await playerDb.createPlayer(playerObject.buildSaveObject());
        } catch(e) {
          return respond(MESSAGES.PLAYER_EXISTS);
        }

        try {
          player = await playerDb.getPlayer({ userId, name });
        } catch(e) {
          Logger.error('Login', e);
          respond(MESSAGES.GENERIC);
        }

        event = 'player:register';
      }

      if(player.isBanned) {
        const msg = _.clone(MESSAGES.BANNED);
        msg.alreadyLoggedIn = true;
        respond(msg);
        socket.end();
        return;
      }

    } else {
      if(gameState._hasTimeout(oldPlayer.name)) {
        gameState._clearTimeout(oldPlayer.name);
      }
      Logger.info('Login', `${oldPlayer.name} semi-login (server ${SERVER_ID}).`);
      event = 'player:semilogin';
    }

    const loggedInPlayerName = (oldPlayer || player).name;

    try {
      socket.authToken = { playerName: loggedInPlayerName, token };
      socket.playerName = loggedInPlayerName;
    } catch(e) {
      Logger.error('login.socket.auth/name', e);
      return respond(MESSAGES.GENERIC);
    }

    // closed
    if(socket.readyState === 2) return;

    Logger.info('Socket:Player:Login', `${socket.playerName} (${socket.address.ip}, ${userId}) logging in (server ${SERVER_ID}).`);
    
    primus.addPlayer(loggedInPlayerName, socket);
    primus.joinGuildChat(player);

    emitter.emit(event, { playerName: loggedInPlayerName, fromIp: socket.address.ip });

    PlayerForceLogout(loggedInPlayerName);

    const msg = _.clone(MESSAGES.LOGIN_SUCCESS);
    msg.ok = true;
    return respond(msg);
  };

  socket.on(event, login);
};