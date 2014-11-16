var game, cursors, spaceBar;
var mode = {DEBUG:0, RELEASE: 1};


var body;

$(document).ready(function(){

	runGame(mode.DEBUG);

});


function runGame(mmode)
{
	game = new Phaser.Game(600, 480, (mmode === mode.DEBUG) ? Phaser.CANVAS : Phaser.AUTO, 'phaser-container', { preload: preload, create: create, update: update, render: render });
        
    function preload () {
        preload_rube('assets/data/rube/test1.json');       
    }
    
    function create () {
        create_rube();
        PTM = 18;
        setViewCenterWorld( {x:0, y:1} );    
        body = getNamedBody(world, 'chasis');
        cursors = game.input.keyboard.createCursorKeys();
        spaceBar = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
    }
    
    function update() {
    	if (cursors.right.isDown) {
            body.ApplyForce(new b2Vec2(16, 0), body.GetWorldCenter());
    	} else if (cursors.left.isDown) {
            body.ApplyForce(new b2Vec2(-3, 0), body.GetWorldCenter());
        }
        
        if (spaceBar.isDown) {
            var center = body.GetWorldCenter();
            body.ApplyImpulse(new b2Vec2(2, 0), new b2Vec2(center.x, center.y-0.5));
        }
        setViewCenterWorld( {x:body.GetPosition().x, y:body.GetPosition().y} );
        update_rube(45); //fps
    }

    function render() {
    	if (mmode === mode.DEBUG) {
        	drawDebugData(); // only works correctly with Phaser.CANVAS
        }
        else if (mmode === mode.RELEASE) {
        	alert('There is not a RELEASE mode yet');
        	game.destroy();
        }
        else {
        	alert('Unknown mode : ' + mmode);
        	game.destroy();
        }
    }
}