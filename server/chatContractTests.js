// Method contracts: chat (Oct 2026).
//
// Same approach as server/armyContractTests.js: each method is called over a
// real DDP connection as a player in a real started game, and the tests pin
// down what a successful call changes and that a refused call changes
// nothing. A test named "known bug" describes a bug in today's code.
//
// They run as part of runAllTests (server/lib/testRunner.js), so the
// same rule applies: only against a local development database.

if (Meteor.isServer) {

  Meteor.startup(function() {
    dTest.addSuite('method contracts: chat (server/chatContractTests.js)', async function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = await dTest.buildGameWorld({players: 4});
      var clients = await dTest.mapAsync(w.users, function(user) { return dTest.ddp.connect(user._id); });
      var pid = function(i) { return w.players[i]._id; };
      var name = function(i) { return w.players[i].username; };
      var chatCollections = [Rooms, Roomchats, Recentchats, Alerts];

      // a room inserted directly, the way dChat.createChatroom makes them
      async function insertRoom(owner, members, admins, type) {
        return await Rooms.insertAsync({gameId: w.gameId, name: 'Test room', type: type || 'normal',
          members: members.map(pid), admins: (admins || []).map(pid), owner: owner === null ? null : pid(owner),
          memberData: members.map(function(i) { return {_id: pid(i), username: name(i)}; }), created_at: new Date()});
      }

      async function room(id) {
        return await Rooms.findOneAsync(id);
      }

      function ids(list) {
        return (list || []).slice().sort().join(',');
      }

      function players() {
        return ids(_.map(arguments, pid));
      }

      async function alertsFor(type, i) {
        return await Alerts.find({gameId: w.gameId, type: type, 'playerIds.playerId': pid(i)}).countAsync();
      }

      var test = dTest.contractTest(run, async function() {
        await Rooms.removeAsync({gameId: w.gameId});
        await Roomchats.removeAsync({gameId: w.gameId});
        await Recentchats.removeAsync({gameId: w.gameId});
        await Reports.removeAsync({gameId: w.gameId});
        await Alerts.removeAsync({gameId: w.gameId});
      });


      try {

        // --- addChatToRoom ---

        await test('addChatToRoom: a member\'s chat is saved and the room is marked as active', async function() {
          var roomId = await insertRoom(0, [0, 1]);
          equal(await clients[1].call('addChatToRoom', w.gameId, roomId, '  hello there  '), undefined, 'returns nothing');
          var chat = await Roomchats.findOneAsync({room_id: roomId});
          assert(chat, 'chat saved');
          equal(chat.text, 'hello there', 'text trimmed');
          equal(chat.playerId + ',' + chat.user_id, pid(1) + ',' + w.users[1]._id, 'who said it');
          assert((await room(roomId)).latestChatDate, 'room latestChatDate set');
          var recent = await Recentchats.findOneAsync({room_id: roomId});
          assert(recent && recent.gameId == w.gameId, 'recent chats updated');
        });

        await test('addChatToRoom: anyone in the game can chat in the everyone room', async function() {
          var roomId = await insertRoom(null, [0], [], 'everyone');
          await clients[2].call('addChatToRoom', w.gameId, roomId, 'hi all');
          equal(await Roomchats.find({room_id: roomId, playerId: pid(2)}).countAsync(), 1, 'chat saved for a player not in members');
        });

        await test('addChatToRoom: not a member, empty, too long, or reported is refused', async function() {
          var roomId = await insertRoom(0, [0, 1]);
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await expectError(async function() { return await clients[2].call('addChatToRoom', w.gameId, roomId, 'let me in'); },
            'not-authorized', null, 'not a member');
          await expectError(async function() { return await clients[1].call('addChatToRoom', w.gameId, roomId, '   '); }, 'validation', null, 'empty');
          await expectError(async function() { return await clients[1].call('addChatToRoom', w.gameId, roomId, 'x'.repeat(401)); }, 'validation', null, 'too long');
          await Reports.insertAsync({gameId: w.gameId, playerId: pid(1), active: true, reason: 'test', createdAt: new Date()});
          await expectError(async function() { return await clients[1].call('addChatToRoom', w.gameId, roomId, 'am I muted'); }, 'reported', null, 'reported');
          await dTest.assertUnchanged(w.gameId, before, 'a refused chat changed the game', chatCollections);
        });

        await test('addChatToRoom: a reported owner can still chat in their room', async function() {
          var roomId = await insertRoom(0, [0, 1]);
          await Reports.insertAsync({gameId: w.gameId, playerId: pid(0), active: true, reason: 'test', createdAt: new Date()});
          await clients[0].call('addChatToRoom', w.gameId, roomId, 'owner here');
          equal(await Roomchats.find({room_id: roomId}).countAsync(), 1, 'chat saved');
        });

        await test('addChatToRoom: a 7th chat within 5 seconds is refused with too-many-requests', async function() {
          var roomId = await insertRoom(0, [0, 1]);
          for (var n = 0; n < 6; n++) await clients[0].call('addChatToRoom', w.gameId, roomId, 'chat ' + n);
          await expectError(async function() { return await clients[0].call('addChatToRoom', w.gameId, roomId, 'one too many'); }, 'too-many-requests', null, '7th');
          equal(await Roomchats.find({room_id: roomId}).countAsync(), 6, 'six saved');
        });


        await test('addChatToRoom simulation: sync, and saves the chat the real call does', async function() {
          var handler = Meteor.server.method_handlers.addChatToRoom;
          var invocation = function(i, isSimulation) {
            return {userId: i === null ? null : w.users[i]._id, isSimulation: isSimulation, connection: null,
              unblock: function() {}, setUserId: function() {}};
          };
          var roomId = await insertRoom(0, [0, 1]);
          var returned = handler.apply(invocation(1, true), [w.gameId, roomId, '  from the simulation  ']);
          assert(!dTest.isPromise(returned), 'the simulation is sync');
          equal(returned, undefined, 'and returns nothing');
          await clients[1].call('addChatToRoom', w.gameId, roomId, '  from the server  ');

          var chats = await Roomchats.find({room_id: roomId}, {sort: {text: 1}}).fetchAsync();
          equal(_.pluck(chats, 'text').join('|'), 'from the server|from the simulation', 'both saved, trimmed');
          var rest = function(chat) { return JSON.stringify(_.omit(chat, '_id', 'created_at', 'text')); };
          equal(rest(chats[1]), rest(chats[0]), 'the same chat apart from its text and time');
          equal(await Recentchats.find({room_id: roomId}).countAsync(), 1, 'one recent chats entry');

          // refused the same way, and changing nothing
          var before = await dTest.snapshot(w.gameId, chatCollections);
          var refusal = async function(i, text) {
            var error = await dTest.throws(function() { return handler.apply(invocation(i, true), [w.gameId, roomId, text]); });
            return error && error.error;
          };
          equal(await refusal(2, 'let me in'), 'not-authorized', 'not a member');
          equal(await refusal(1, '   '), 'validation', 'empty');
          equal(await refusal(1, 'x'.repeat(401)), 'validation', 'too long');
          equal(handler.apply(invocation(null, true), [w.gameId, roomId, 'hi']), false, 'logged out: false');
          equal(handler.apply(invocation(3, true), ['noSuchGame', roomId, 'hi']), false, 'not in the game: false');
          await Reports.insertAsync({gameId: w.gameId, playerId: pid(1), active: true, reason: 'test', createdAt: new Date()});
          equal(await refusal(1, 'am I muted'), 'reported', 'reported');
          await dTest.assertUnchanged(w.gameId, before, 'a refused simulation changed the game', chatCollections);

          // the server's part is a promise, and a refusal rejects it
          var serverPart = handler.apply(invocation(2, false), [w.gameId, roomId, 'let me in']);
          assert(dTest.isPromise(serverPart), 'the server\'s part is a promise');
          var error = await dTest.throws(function() { return serverPart; });
          equal(error && error.error, 'not-authorized', 'refused');
        });


        // --- startChatroomWith ---

        await test('startChatroomWith: makes a room for the two of you, owned by you', async function() {
          var roomId = await clients[0].call('startChatroomWith', w.gameId, name(1).toUpperCase());
          var doc = await room(roomId);
          assert(doc, 'returns the room id');
          equal(doc.type, 'normal', 'normal room');
          equal(doc.name, name(0) + ' and ' + name(1), 'room name');
          equal(doc.owner, pid(0), 'owner');
          equal(ids(doc.members), players(0, 1), 'members');
          equal(ids(_.pluck(doc.memberData, '_id')), players(0, 1), 'member data');
          equal(await alertsFor('alert_addedToChatroom', 1), 1, 'the other player is alerted');
        });

        await test('startChatroomWith: yourself, nobody, or a second room with the same player is refused', async function() {
          await clients[0].call('startChatroomWith', w.gameId, name(1));
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await expectError(async function() { return await clients[0].call('startChatroomWith', w.gameId, name(0)); }, 'Can\'t chat with yourself.', null, 'yourself');
          await expectError(async function() { return await clients[0].call('startChatroomWith', w.gameId, 'nobody_by_this_name'); },
            'Can\'t find a player named nobody_by_this_name.', null, 'nobody');
          await expectError(async function() { return await clients[0].call('startChatroomWith', w.gameId, name(1)); },
            'You already have a chatroom with ' + name(1) + '.', null, 'second room');
          await dTest.assertUnchanged(w.gameId, before, 'a refused room changed the game', chatCollections);
        });

        await test('startChatroomWith: the name is matched as a regular expression (known bug)', async function() {
          var pattern = name(1).slice(0, -1) + '.';
          var roomId = await clients[0].call('startChatroomWith', w.gameId, pattern);
          equal(ids((await room(roomId)).members), players(0, 1), 'a pattern finds the player');
        });


        // --- leaveChatroom ---

        await test('leaveChatroom: a member leaving is removed from members, member data and admins', async function() {
          var roomId = await insertRoom(0, [0, 1, 2], [1]);
          await clients[1].call('leaveChatroom', w.gameId, roomId);
          var doc = await room(roomId);
          equal(ids(doc.members), players(0, 2), 'members');
          equal(ids(_.pluck(doc.memberData, '_id')), players(0, 2), 'member data');
          equal(ids(doc.admins), '', 'admins');
        });

        await test('leaveChatroom: the owner leaving stays owner of a room they\'re not in (known bug: removeOwnerFromRoom is passed the game id)', async function() {
          var roomId = await insertRoom(0, [0, 1]);
          await clients[0].call('leaveChatroom', w.gameId, roomId);
          var doc = await room(roomId);
          assert(doc, 'room still exists');
          equal(ids(doc.members), players(1), 'owner left the members');
          equal(doc.owner, pid(0), 'but is still the owner');

          var alone = await insertRoom(0, [0]);
          await clients[0].call('leaveChatroom', w.gameId, alone);
          assert(await room(alone), 'an empty room is not removed either');
        });

        await test('leaveChatroom: the everyone room, or a room you\'re not in, is refused', async function() {
          var everyone = await insertRoom(null, [0, 1], [], 'everyone');
          var other = await insertRoom(1, [1, 2]);
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await expectError(async function() { return await clients[0].call('leaveChatroom', w.gameId, everyone); }, 'Can\'t find room.', null, 'everyone room');
          await expectError(async function() { return await clients[0].call('leaveChatroom', w.gameId, other); }, 'Can\'t find room.', null, 'not in it');
          await dTest.assertUnchanged(w.gameId, before, 'a refused leave changed the game', chatCollections);
        });


        // --- renameChatroom ---

        await test('renameChatroom: the owner can rename it, within 34 characters', async function() {
          var roomId = await insertRoom(0, [0, 1], [1]);
          equal(await clients[0].call('renameChatroom', w.gameId, roomId, 'War Room'), true, 'returns true');
          equal((await room(roomId)).name, 'War Room', 'renamed');
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await expectError(async function() { return await clients[1].call('renameChatroom', w.gameId, roomId, 'Admin Room'); },
            'Only the owner can rename a chatroom.', null, 'an admin');
          await expectError(async function() { return await clients[0].call('renameChatroom', w.gameId, roomId, ''); }, 'New name is not long enough.', null, 'empty');
          await expectError(async function() { return await clients[0].call('renameChatroom', w.gameId, roomId, 'x'.repeat(35)); },
            'Must be less than 35 characters.', null, '35 characters');
          await dTest.assertUnchanged(w.gameId, before, 'a refused rename changed the game', chatCollections);
        });


        // --- inviteToChatroom ---

        await test('inviteToChatroom: the owner or an admin can add a player by name', async function() {
          var roomId = await insertRoom(0, [0, 1], [1]);
          await clients[0].call('inviteToChatroom', w.gameId, roomId, name(2));
          equal(ids((await room(roomId)).members), players(0, 1, 2), 'owner invited');
          equal(await alertsFor('alert_addedToChatroom', 2), 1, 'invited player alerted');
          await clients[1].call('inviteToChatroom', w.gameId, roomId, name(3));
          equal(ids((await room(roomId)).members), players(0, 1, 2, 3), 'admin invited');
          assert(_.findWhere((await room(roomId)).memberData, {_id: pid(3)}), 'member data added');
        });

        await test('inviteToChatroom: a plain member, someone already in, or an unknown name is refused', async function() {
          var roomId = await insertRoom(0, [0, 1, 2]);
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await expectError(async function() { return await clients[1].call('inviteToChatroom', w.gameId, roomId, name(3)); },
            'Only the room owner and admins can invite users.', null, 'plain member');
          await expectError(async function() { return await clients[0].call('inviteToChatroom', w.gameId, roomId, name(2)); },
            name(2) + ' is already in this chatroom.', null, 'already in');
          await expectError(async function() { return await clients[0].call('inviteToChatroom', w.gameId, roomId, name(3).toUpperCase()); },
            'Can\'t find anyone named ' + name(3).toUpperCase() + '.', null, 'wrong case: invites match the exact name');
          await dTest.assertUnchanged(w.gameId, before, 'a refused invite changed the game', chatCollections);
        });


        // --- owner and admins ---

        await test('chatroomMakeOwner: the owner hands the room to a member and becomes an admin', async function() {
          var roomId = await insertRoom(0, [0, 1, 2], [1]);
          await clients[0].call('chatroomMakeOwner', w.gameId, roomId, pid(1));
          var doc = await room(roomId);
          equal(doc.owner, pid(1), 'new owner');
          equal(ids(doc.admins), players(0), 'old owner is an admin, new owner is not');
          equal(await alertsFor('alert_chatroomNowOwner', 1), 1, 'new owner alerted');
        });

        await test('chatroomMakeOwner: someone who isn\'t the owner, or a non-member, changes nothing', async function() {
          var roomId = await insertRoom(0, [0, 1, 2], [1]);
          var before = await dTest.snapshot(w.gameId, chatCollections);
          equal(await clients[1].call('chatroomMakeOwner', w.gameId, roomId, pid(1)), undefined, 'an admin: no error');
          equal(await clients[0].call('chatroomMakeOwner', w.gameId, roomId, pid(3)), false, 'a non-member: false');
          await dTest.assertUnchanged(w.gameId, before, 'a refused hand-over changed the game', chatCollections);
        });

        await test('chatroomMakeAdmin and chatroomRemoveAdmin: the owner manages admins', async function() {
          var roomId = await insertRoom(0, [0, 1, 2]);
          await clients[0].call('chatroomMakeAdmin', w.gameId, roomId, pid(1));
          equal(ids((await room(roomId)).admins), players(1), 'made admin');
          equal(await alertsFor('alert_chatroomMadeAdmin', 1), 1, 'alerted');
          // an admin can make admins too
          await clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(2));
          equal(ids((await room(roomId)).admins), players(1, 2), 'admin made an admin');

          var before = await dTest.snapshot(w.gameId, chatCollections);
          equal(await clients[1].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2)), false, 'an admin can\'t remove admins');
          await clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(0));
          await dTest.assertUnchanged(w.gameId, before, 'an admin changed what only the owner can', chatCollections);

          await clients[0].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2));
          equal(ids((await room(roomId)).admins), players(1), 'admin removed');
          equal(await alertsFor('alert_chatroomRemovedFromAdmin', 2), 1, 'alerted');
          equal(await clients[0].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2)), false, 'not an admin: false');
        });

        await test('chatroomMakeAdmin: a plain member changes nothing', async function() {
          var roomId = await insertRoom(0, [0, 1, 2]);
          var before = await dTest.snapshot(w.gameId, chatCollections);
          await clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(2));
          equal(await clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(3)), false, 'a non-member: false');
          await dTest.assertUnchanged(w.gameId, before, 'a plain member made an admin', chatCollections);
        });


        // --- kickFromChatroom ---

        await test('kickFromChatroom: the owner kicks anyone, an admin kicks plain members', async function() {
          var roomId = await insertRoom(0, [0, 1, 2, 3], [1, 2]);
          await clients[0].call('kickFromChatroom', w.gameId, roomId, pid(2));
          equal(ids((await room(roomId)).members), players(0, 1, 3), 'owner kicked an admin');
          equal(ids((await room(roomId)).admins), players(1), 'and they are no longer an admin');
          equal(await alertsFor('alert_kickedFromChatroom', 2), 1, 'kicked player alerted');
          await clients[1].call('kickFromChatroom', w.gameId, roomId, pid(3));
          equal(ids((await room(roomId)).members), players(0, 1), 'admin kicked a member');
          assert(!_.findWhere((await room(roomId)).memberData, {_id: pid(3)}), 'member data removed');
        });

        await test('kickFromChatroom: a kick that isn\'t allowed leaves the room alone but still alerts the player (known bug)', async function() {
          var roomId = await insertRoom(0, [0, 1, 2, 3], [1, 2]);
          var before = await dTest.snapshot(w.gameId, [Rooms]);
          await clients[1].call('kickFromChatroom', w.gameId, roomId, pid(2));
          await clients[3].call('kickFromChatroom', w.gameId, roomId, pid(0));
          await dTest.assertUnchanged(w.gameId, before, 'a kick that isn\'t allowed changed the room', [Rooms]);
          equal(await alertsFor('alert_kickedFromChatroom', 2), 1, 'the admin an admin tried to kick is told they were kicked');
          equal(await alertsFor('alert_kickedFromChatroom', 0), 1, 'the owner a member tried to kick is told they were kicked');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        await dTest.waitForJobs();
        await w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
