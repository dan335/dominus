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
    dTest.addSuite('method contracts: chat (server/chatContractTests.js)', function(run, t) {
      var assert = t.assert;
      var equal = t.equal;
      var expectError = dTest.expectError;

      var w = dTest.buildGameWorld({players: 4});
      var clients = w.users.map(function(user) { return dTest.ddp.connect(user._id); });
      var pid = function(i) { return w.players[i]._id; };
      var name = function(i) { return w.players[i].username; };
      var chatCollections = [Rooms, Roomchats, Recentchats, Alerts];

      // a room inserted directly, the way dChat.createChatroom makes them
      function insertRoom(owner, members, admins, type) {
        return Rooms.insert({gameId: w.gameId, name: 'Test room', type: type || 'normal',
          members: members.map(pid), admins: (admins || []).map(pid), owner: owner === null ? null : pid(owner),
          memberData: members.map(function(i) { return {_id: pid(i), username: name(i)}; }), created_at: new Date()});
      }

      function room(id) {
        return Rooms.findOne(id);
      }

      function ids(list) {
        return (list || []).slice().sort().join(',');
      }

      function players() {
        return ids(_.map(arguments, pid));
      }

      function alertsFor(type, i) {
        return Alerts.find({gameId: w.gameId, type: type, 'playerIds.playerId': pid(i)}).count();
      }

      var test = dTest.contractTest(run, function() {
        Rooms.remove({gameId: w.gameId});
        Roomchats.remove({gameId: w.gameId});
        Recentchats.remove({gameId: w.gameId});
        Reports.remove({gameId: w.gameId});
        Alerts.remove({gameId: w.gameId});
      });


      try {

        // --- addChatToRoom ---

        test('addChatToRoom: a member\'s chat is saved and the room is marked as active', function() {
          var roomId = insertRoom(0, [0, 1]);
          equal(clients[1].call('addChatToRoom', w.gameId, roomId, '  hello there  '), undefined, 'returns nothing');
          var chat = Roomchats.findOne({room_id: roomId});
          assert(chat, 'chat saved');
          equal(chat.text, 'hello there', 'text trimmed');
          equal(chat.playerId + ',' + chat.user_id, pid(1) + ',' + w.users[1]._id, 'who said it');
          assert(room(roomId).latestChatDate, 'room latestChatDate set');
          var recent = Recentchats.findOne({room_id: roomId});
          assert(recent && recent.gameId == w.gameId, 'recent chats updated');
        });

        test('addChatToRoom: anyone in the game can chat in the everyone room', function() {
          var roomId = insertRoom(null, [0], [], 'everyone');
          clients[2].call('addChatToRoom', w.gameId, roomId, 'hi all');
          equal(Roomchats.find({room_id: roomId, playerId: pid(2)}).count(), 1, 'chat saved for a player not in members');
        });

        test('addChatToRoom: not a member, empty, too long, or reported is refused', function() {
          var roomId = insertRoom(0, [0, 1]);
          var before = dTest.snapshot(w.gameId, chatCollections);
          expectError(function() { return clients[2].call('addChatToRoom', w.gameId, roomId, 'let me in'); },
            'not-authorized', null, 'not a member');
          expectError(function() { return clients[1].call('addChatToRoom', w.gameId, roomId, '   '); }, 'validation', null, 'empty');
          expectError(function() { return clients[1].call('addChatToRoom', w.gameId, roomId, 'x'.repeat(401)); }, 'validation', null, 'too long');
          Reports.insert({gameId: w.gameId, playerId: pid(1), active: true, reason: 'test', createdAt: new Date()});
          expectError(function() { return clients[1].call('addChatToRoom', w.gameId, roomId, 'am I muted'); }, 'reported', null, 'reported');
          dTest.assertUnchanged(w.gameId, before, 'a refused chat changed the game', chatCollections);
        });

        test('addChatToRoom: a reported owner can still chat in their room', function() {
          var roomId = insertRoom(0, [0, 1]);
          Reports.insert({gameId: w.gameId, playerId: pid(0), active: true, reason: 'test', createdAt: new Date()});
          clients[0].call('addChatToRoom', w.gameId, roomId, 'owner here');
          equal(Roomchats.find({room_id: roomId}).count(), 1, 'chat saved');
        });

        test('addChatToRoom: a 7th chat within 5 seconds is refused with too-many-requests', function() {
          var roomId = insertRoom(0, [0, 1]);
          for (var n = 0; n < 6; n++) clients[0].call('addChatToRoom', w.gameId, roomId, 'chat ' + n);
          expectError(function() { return clients[0].call('addChatToRoom', w.gameId, roomId, 'one too many'); }, 'too-many-requests', null, '7th');
          equal(Roomchats.find({room_id: roomId}).count(), 6, 'six saved');
        });


        // --- startChatroomWith ---

        test('startChatroomWith: makes a room for the two of you, owned by you', function() {
          var roomId = clients[0].call('startChatroomWith', w.gameId, name(1).toUpperCase());
          var doc = room(roomId);
          assert(doc, 'returns the room id');
          equal(doc.type, 'normal', 'normal room');
          equal(doc.name, name(0) + ' and ' + name(1), 'room name');
          equal(doc.owner, pid(0), 'owner');
          equal(ids(doc.members), players(0, 1), 'members');
          equal(ids(_.pluck(doc.memberData, '_id')), players(0, 1), 'member data');
          equal(alertsFor('alert_addedToChatroom', 1), 1, 'the other player is alerted');
        });

        test('startChatroomWith: yourself, nobody, or a second room with the same player is refused', function() {
          clients[0].call('startChatroomWith', w.gameId, name(1));
          var before = dTest.snapshot(w.gameId, chatCollections);
          expectError(function() { return clients[0].call('startChatroomWith', w.gameId, name(0)); }, 'Can\'t chat with yourself.', null, 'yourself');
          expectError(function() { return clients[0].call('startChatroomWith', w.gameId, 'nobody_by_this_name'); },
            'Can\'t find a player named nobody_by_this_name.', null, 'nobody');
          expectError(function() { return clients[0].call('startChatroomWith', w.gameId, name(1)); },
            'You already have a chatroom with ' + name(1) + '.', null, 'second room');
          dTest.assertUnchanged(w.gameId, before, 'a refused room changed the game', chatCollections);
        });

        test('startChatroomWith: the name is matched as a regular expression (known bug)', function() {
          var pattern = name(1).slice(0, -1) + '.';
          var roomId = clients[0].call('startChatroomWith', w.gameId, pattern);
          equal(ids(room(roomId).members), players(0, 1), 'a pattern finds the player');
        });


        // --- leaveChatroom ---

        test('leaveChatroom: a member leaving is removed from members, member data and admins', function() {
          var roomId = insertRoom(0, [0, 1, 2], [1]);
          clients[1].call('leaveChatroom', w.gameId, roomId);
          var doc = room(roomId);
          equal(ids(doc.members), players(0, 2), 'members');
          equal(ids(_.pluck(doc.memberData, '_id')), players(0, 2), 'member data');
          equal(ids(doc.admins), '', 'admins');
        });

        test('leaveChatroom: the owner leaving stays owner of a room they\'re not in (known bug: removeOwnerFromRoom is passed the game id)', function() {
          var roomId = insertRoom(0, [0, 1]);
          clients[0].call('leaveChatroom', w.gameId, roomId);
          var doc = room(roomId);
          assert(doc, 'room still exists');
          equal(ids(doc.members), players(1), 'owner left the members');
          equal(doc.owner, pid(0), 'but is still the owner');

          var alone = insertRoom(0, [0]);
          clients[0].call('leaveChatroom', w.gameId, alone);
          assert(room(alone), 'an empty room is not removed either');
        });

        test('leaveChatroom: the everyone room, or a room you\'re not in, is refused', function() {
          var everyone = insertRoom(null, [0, 1], [], 'everyone');
          var other = insertRoom(1, [1, 2]);
          var before = dTest.snapshot(w.gameId, chatCollections);
          expectError(function() { return clients[0].call('leaveChatroom', w.gameId, everyone); }, 'Can\'t find room.', null, 'everyone room');
          expectError(function() { return clients[0].call('leaveChatroom', w.gameId, other); }, 'Can\'t find room.', null, 'not in it');
          dTest.assertUnchanged(w.gameId, before, 'a refused leave changed the game', chatCollections);
        });


        // --- renameChatroom ---

        test('renameChatroom: the owner can rename it, within 34 characters', function() {
          var roomId = insertRoom(0, [0, 1], [1]);
          equal(clients[0].call('renameChatroom', w.gameId, roomId, 'War Room'), true, 'returns true');
          equal(room(roomId).name, 'War Room', 'renamed');
          var before = dTest.snapshot(w.gameId, chatCollections);
          expectError(function() { return clients[1].call('renameChatroom', w.gameId, roomId, 'Admin Room'); },
            'Only the owner can rename a chatroom.', null, 'an admin');
          expectError(function() { return clients[0].call('renameChatroom', w.gameId, roomId, ''); }, 'New name is not long enough.', null, 'empty');
          expectError(function() { return clients[0].call('renameChatroom', w.gameId, roomId, 'x'.repeat(35)); },
            'Must be less than 35 characters.', null, '35 characters');
          dTest.assertUnchanged(w.gameId, before, 'a refused rename changed the game', chatCollections);
        });


        // --- inviteToChatroom ---

        test('inviteToChatroom: the owner or an admin can add a player by name', function() {
          var roomId = insertRoom(0, [0, 1], [1]);
          clients[0].call('inviteToChatroom', w.gameId, roomId, name(2));
          equal(ids(room(roomId).members), players(0, 1, 2), 'owner invited');
          equal(alertsFor('alert_addedToChatroom', 2), 1, 'invited player alerted');
          clients[1].call('inviteToChatroom', w.gameId, roomId, name(3));
          equal(ids(room(roomId).members), players(0, 1, 2, 3), 'admin invited');
          assert(_.findWhere(room(roomId).memberData, {_id: pid(3)}), 'member data added');
        });

        test('inviteToChatroom: a plain member, someone already in, or an unknown name is refused', function() {
          var roomId = insertRoom(0, [0, 1, 2]);
          var before = dTest.snapshot(w.gameId, chatCollections);
          expectError(function() { return clients[1].call('inviteToChatroom', w.gameId, roomId, name(3)); },
            'Only the room owner and admins can invite users.', null, 'plain member');
          expectError(function() { return clients[0].call('inviteToChatroom', w.gameId, roomId, name(2)); },
            name(2) + ' is already in this chatroom.', null, 'already in');
          expectError(function() { return clients[0].call('inviteToChatroom', w.gameId, roomId, name(3).toUpperCase()); },
            'Can\'t find anyone named ' + name(3).toUpperCase() + '.', null, 'wrong case: invites match the exact name');
          dTest.assertUnchanged(w.gameId, before, 'a refused invite changed the game', chatCollections);
        });


        // --- owner and admins ---

        test('chatroomMakeOwner: the owner hands the room to a member and becomes an admin', function() {
          var roomId = insertRoom(0, [0, 1, 2], [1]);
          clients[0].call('chatroomMakeOwner', w.gameId, roomId, pid(1));
          var doc = room(roomId);
          equal(doc.owner, pid(1), 'new owner');
          equal(ids(doc.admins), players(0), 'old owner is an admin, new owner is not');
          equal(alertsFor('alert_chatroomNowOwner', 1), 1, 'new owner alerted');
        });

        test('chatroomMakeOwner: someone who isn\'t the owner, or a non-member, changes nothing', function() {
          var roomId = insertRoom(0, [0, 1, 2], [1]);
          var before = dTest.snapshot(w.gameId, chatCollections);
          equal(clients[1].call('chatroomMakeOwner', w.gameId, roomId, pid(1)), undefined, 'an admin: no error');
          equal(clients[0].call('chatroomMakeOwner', w.gameId, roomId, pid(3)), false, 'a non-member: false');
          dTest.assertUnchanged(w.gameId, before, 'a refused hand-over changed the game', chatCollections);
        });

        test('chatroomMakeAdmin and chatroomRemoveAdmin: the owner manages admins', function() {
          var roomId = insertRoom(0, [0, 1, 2]);
          clients[0].call('chatroomMakeAdmin', w.gameId, roomId, pid(1));
          equal(ids(room(roomId).admins), players(1), 'made admin');
          equal(alertsFor('alert_chatroomMadeAdmin', 1), 1, 'alerted');
          // an admin can make admins too
          clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(2));
          equal(ids(room(roomId).admins), players(1, 2), 'admin made an admin');

          var before = dTest.snapshot(w.gameId, chatCollections);
          equal(clients[1].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2)), false, 'an admin can\'t remove admins');
          clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(0));
          dTest.assertUnchanged(w.gameId, before, 'an admin changed what only the owner can', chatCollections);

          clients[0].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2));
          equal(ids(room(roomId).admins), players(1), 'admin removed');
          equal(alertsFor('alert_chatroomRemovedFromAdmin', 2), 1, 'alerted');
          equal(clients[0].call('chatroomRemoveAdmin', w.gameId, roomId, pid(2)), false, 'not an admin: false');
        });

        test('chatroomMakeAdmin: a plain member changes nothing', function() {
          var roomId = insertRoom(0, [0, 1, 2]);
          var before = dTest.snapshot(w.gameId, chatCollections);
          clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(2));
          equal(clients[1].call('chatroomMakeAdmin', w.gameId, roomId, pid(3)), false, 'a non-member: false');
          dTest.assertUnchanged(w.gameId, before, 'a plain member made an admin', chatCollections);
        });


        // --- kickFromChatroom ---

        test('kickFromChatroom: the owner kicks anyone, an admin kicks plain members', function() {
          var roomId = insertRoom(0, [0, 1, 2, 3], [1, 2]);
          clients[0].call('kickFromChatroom', w.gameId, roomId, pid(2));
          equal(ids(room(roomId).members), players(0, 1, 3), 'owner kicked an admin');
          equal(ids(room(roomId).admins), players(1), 'and they are no longer an admin');
          equal(alertsFor('alert_kickedFromChatroom', 2), 1, 'kicked player alerted');
          clients[1].call('kickFromChatroom', w.gameId, roomId, pid(3));
          equal(ids(room(roomId).members), players(0, 1), 'admin kicked a member');
          assert(!_.findWhere(room(roomId).memberData, {_id: pid(3)}), 'member data removed');
        });

        test('kickFromChatroom: a kick that isn\'t allowed leaves the room alone but still alerts the player (known bug)', function() {
          var roomId = insertRoom(0, [0, 1, 2, 3], [1, 2]);
          var before = dTest.snapshot(w.gameId, [Rooms]);
          clients[1].call('kickFromChatroom', w.gameId, roomId, pid(2));
          clients[3].call('kickFromChatroom', w.gameId, roomId, pid(0));
          dTest.assertUnchanged(w.gameId, before, 'a kick that isn\'t allowed changed the room', [Rooms]);
          equal(alertsFor('alert_kickedFromChatroom', 2), 1, 'the admin an admin tried to kick is told they were kicked');
          equal(alertsFor('alert_kickedFromChatroom', 0), 1, 'the owner a member tried to kick is told they were kicked');
        });

      } finally {
        clients.forEach(function(client) { client.close(); });
        dTest.waitForJobs();
        w.cleanup();
        dTest.ddp.resetRateLimits();
      }
    });
  });
}
