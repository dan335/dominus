// settings per game



if (Meteor.settings.public.GAME_ID == 'speed' || Meteor.settings.public.GAME_ID == 'katar' || Meteor.settings.public.GAME_ID == 'andor') {
    s.battle_interval = 1000 * 60 * 1;
    s.resource.gained_at_hex = 4;

    s.army.stats.footmen.speed = Math.round(s.army.stats.footmen.speed * 3);
    s.army.stats.archers.speed = Math.round(s.army.stats.archers.speed * 3);
    s.army.stats.pikemen.speed = Math.round(s.army.stats.pikemen.speed * 3);
    s.army.stats.cavalry.speed = Math.round(s.army.stats.cavalry.speed * 3);
    s.army.stats.catapults.speed = Math.round(s.army.stats.catapults.speed * 3);

    s.village.cost.level1.timeToBuild = s.village.cost.level1.timeToBuild / 3
    s.village.cost.level2.timeToBuild = s.village.cost.level2.timeToBuild / 3
    s.village.cost.level3.timeToBuild = s.village.cost.level3.timeToBuild / 3
}
