var game, cursors;
var mode = {DEBUG:0, RELEASE: 1};


var ball;

$(document).ready(function(){

	runGame(mode.DEBUG);

});


function runGame(mmode) 
{
	game = new Phaser.Game(320, 240, (mmode === mode.DEBUG) ? Phaser.CANVAS : Phaser.AUTO, 'phaser-container', { preload: preload, create: create, update: update, render: render });
        
    function preload () {
        preload_rube('assets/data/rube/test2.json');        
    }
    
    function create () {
        create_rube();        
        PTM = 18;
        setViewCenterWorld( {x:0, y:1} );        
        ball = getNamedBody(world, 'circle');
        cursors = game.input.keyboard.createCursorKeys();    	
    }
    
    function update() {
    	if (cursors.left.isDown) {

    	}
    	else if (cursors.right.isDown) {
            var i = 10;
    	}

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