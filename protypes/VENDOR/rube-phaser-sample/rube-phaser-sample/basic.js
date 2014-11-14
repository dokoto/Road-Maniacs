
var game;

window.onload = function() {

    game = new Phaser.Game(800, 600, Phaser.AUTO, 'phaser-container', { preload: preload, create: create, update: update, render: render });
        
    function preload () {
        preload_rube('basic.json');
    }
    
    function create () {
        create_rube();
        
        PTM = 18;
        setViewCenterWorld( {x:0, y:1} );        
    }
    
    function update() {
        update_rube(45); //fps
    }

    function render() {
        //drawDebugData(); // only works correctly with Phaser.CANVAS
    }
};
