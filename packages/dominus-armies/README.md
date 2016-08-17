last_move_at is store in army and paths
it's stored in paths so that moveArmyToHex does not have to get army
moveArmyToHex is the only place that last_move_at should be set to new date
if path does not have last_move_at it should get it from army

TODO
---
* change army speed to be in ms instead of minutes
* remove expired pastMoves, create job
* shields in left panel when army is on building

* fix hiring soldiers
* moving to village
* right panel not showing up on mac
* join building when army arrives on one
* combine armies, write test
* show army path in rp_info_army
* disband army
* show paths in minimap
* show time til arrival in left panel
* write test for split armies
* write test for army join building

* speed and last_move_at are stored in army and paths
  * should find a way to store them in only one place

* speed updates every time number of soldiers in army changes
* distance updates every time army moves or paths change
* time updates every time distance or speed change
* speed is stored in army and each path
* total distance is stored in army
* distance is stored in each path
* total time is stored in army
* time is store in each path

* hooks
  * army soldiers changed
  * army position changed
  * paths changed




movement
---
* army movement
* when entering a new country
* keep track of which country castle/village/armies are in


* get current country and hexes
* draw line where army wants to go
* sample along line until hex is not in country
* get new country, if can't get country keep sampling along line until a country is found
* check if country is neighbor of current country
* if so
* get hexes in current country and next counrty
* pathfind to hex
* if not neighbors
* get neighbor countries and hexes
* pathfind using direction until in another country

* what if the only path contains a building
* if is in same country and can't find a path
* pathfind again without avoiding buildings

* armies do not have google maps or gps.  only compasses
* can only see current and next country
* will avoid buildings unless only path is through a building

* if about to move onto a building recompute?


Everytime soldiers in army changes call dArmies.updatePathMoveSpeed
