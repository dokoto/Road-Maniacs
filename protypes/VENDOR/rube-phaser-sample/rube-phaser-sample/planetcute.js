
// General Phaser stuff
var game;   
var upKey;
var leftKey;
var rightKey;

// The Box2D world, and some important things in it  
var world;
var playerBody;
var playerFixture;
var footSensorFixture;
var shadowImage;

// We keep track of current contacts with the ground by
// adding them to an array in BeginContact and removing
// them in EndContact. The jumpTimeout is used to avoid
// jumping in multiple consecutive timesteps which can
// happen because the foot sensor takes a little while
// to actually break contact with the ground.
var footContacts = [];
var jumpTimeout = 0;

// An array to store which pickups were touched. Pickup
// fixtures are added to this array inside BeginContact,
// because we can't immediately change the physics world
// inside the callback. After the world step is finished,
// the processPickups function goes through this list to
// remove the pickups from the world, play sounds etc.
var pickupsToProcess = [];

// Some constants used to identify the type of a pickup.
// In the RUBE scene, these values are given to fixtures
// as a custom integer property.
var PICKUPTYPE_GEM  = 0;
var PICKUPTYPE_STAR = 1;

// Some sprites that show text.
var instructionsImage1 = null;
var instructionsImage2 = null;
var instructionsImage3 = null;

// Some sounds
var sound_jump;
var sound_pickupgem;
var sound_pickupstar;

// To wobble the pickups around, we need to keep them in
// an array. The timePassed is incremented each frame to
// use as a parameter for sin/cos to update positions.
var wobblyBodies = [];
var timePassed = 0;

// To demonstrate ray-casting, we will update the position
// of a shadow sprite below the player. This callback will
// be needed to detect things the player can stand on.
var raycastCallback;

////////////////////////////////////////////////////////////////////////////////////////

window.onload = function() {


    game = new Phaser.Game(800, 600, Phaser.AUTO, 'phaser-container', { preload: preload, create: create, update: update, render: render });

   
    // Preload the scene .json and the sound resources
    function preload () {
        preload_rube('planetcute.json');
        
        game.load.audio('sound_jump_file',       'sounds/jump.wav');
        game.load.audio('sound_pickupgem_file',  'sounds/pickupgem.wav');
        game.load.audio('sound_pickupstar_file', 'sounds/pickupstar.wav');
    }
    
    
    // Create the scene using the loaded .json file. The create_rube
    // uses a loader to load the images, which runs asynchronosly.
    // When the loader has finished loading the images, it will call
    // the afterImagesLoaded function below, and then all is complete.
    function create () {
        create_rube();
        
        // Assign sounds
        sound_jump = game.add.audio('sound_jump_file');
        sound_pickupgem = game.add.audio('sound_pickupgem_file');
        sound_pickupstar = game.add.audio('sound_pickupstar_file');
        
        // Set up a contact listener
        var contactListener = new b2ContactListener();
        contactListener.BeginContact = onBeginContact;
        contactListener.EndContact = onEndContact;
        world.SetContactListener(contactListener);
        
        // Create the ray cast callback instance to reuse
        raycastCallback = new raycastCallback_closestStandable();
        
        // Find references to some important things in the scene
        playerBody = getNamedBody(world, 'player');
        playerFixture = getNamedFixture(world, 'player');
        footSensorFixture = getNamedFixture(world, 'footsensor');
        shadowImage = getNamedImage(world, 'shadow');
        instructionsImage1 = getNamedImage(world, 'instructions1');
        instructionsImage2 = getNamedImage(world, 'instructions2');
        instructionsImage3 = getNamedImage(world, 'instructions3');
        
        // Record the original scale of the shadow image, because
        // we will want to modify it in the updateShadowSprite function.
        shadowImage.originalScale = shadowImage.scale;
        
        // Find all fixtures called "pickup" and use their custom properties
        // as given in RUBE to assign them a pickupType property. We also
        // make a list of their bodies so that they can be wobbled around.
        var pickupFixtures = getNamedFixtures(world, 'pickup');
        for (var i = 0; i < pickupFixtures.length; i++) {
            var fixture = pickupFixtures[i];
            
            fixture.isPickup = true;                
            fixture.pickupType = getCustomProperty(fixture, "int", "pickuptype", 0);
            
            var body = fixture.GetBody();
            body.originalPosition = body.GetPosition().Copy();
            body.bounceSpeedH = getCustomProperty(fixture, "float", "horizontalbouncespeed", 0);
            body.bounceSpeedV = getCustomProperty(fixture, "float", "verticalbouncespeed", 0);
            body.bounceWidth  = getCustomProperty(fixture, "float", "bouncewidth", 0);
            body.bounceHeight = getCustomProperty(fixture, "float", "bounceheight", 0);
            body.bounceDeltaH = Math.random() * 2 * Math.PI;
            body.bounceDeltaV = Math.random() * 2 * Math.PI;
            wobblyBodies.push(body);
        }
        
        // Define which keys to use for input
        upKey = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
        leftKey = game.input.keyboard.addKey(Phaser.Keyboard.J);
        rightKey = game.input.keyboard.addKey(Phaser.Keyboard.K)
        
        // Set the starting zoom and view center location
        PTM = 48;
        setViewCenterWorld( {x:0, y:3} );
    }
    
    
    // This will be called after all images/sprites have been loaded.
    // Set some of the instruction sprites to be invisible on startup.
    afterImagesLoaded = function() {
        if ( instructionsImage2 ) 
            instructionsImage2.sprite.alpha = 0;
        if ( instructionsImage3 ) 
            instructionsImage3.sprite.alpha = 0;
    }
    
    
    // Find the horizontal speed of whatever the player is standing on.
    // This is necessary to know what target speed we should aim for when
    // moving the player. 
    function getSurfaceLateralVelocity() {
        
        if ( footContacts.length < 1 ) 
            return 0;
        
        // Here we want to look at all contacts with the player's foot sensor
        // and get the average of the velocities of the other body, at the point
        // where they contact.
        // The foot sensor is a sensor (duh) so it will not generate any collision
        // response, and the contact will not have any manifold that we can use to
        // get contact points from.
        // Instead, we will just use the position of the foot sensor itself, since
        // it's small enough that any contacts with it will be close to its center.
        
        // m_p is the center of a circle shape
        var footSensorCenter = playerBody.GetWorldPoint( footSensorFixture.m_shape.m_p );
        
        var total = 0;
        var count = 0;
        
        for (var i = 0; i < footContacts.length; i++) {
            var contact = footContacts[i];
            var fA = contact.GetFixtureA();
            var fB = contact.GetFixtureB();
            var otherFixture = (fA == footSensorFixture ? fB : fA);
            total += otherFixture.GetBody().GetLinearVelocityFromWorldPoint( footSensorCenter ).x;
            count++;
        }
        
        return total / count;
    }
    
    
    // Called each frame to move the player according to user input.
    function updatePlayerMovement() {
     
        // Decrement the jump timer - when this gets to zero the player can jump again
        jumpTimeout--;
     
        // Define the sideways force that the player can move with
        var maxSpeed = 4;
        var maxForce = 10;
        
        var surfaceVelX = getSurfaceLateralVelocity();
        
        // Determine whether the player should be moved left or right depending
        // on which input keys are currently active.
        // When no inputs are active, the player wants to stay in the same place.
        // In other words, we want to move along with whatever we are standing on.
        var desiredSpeedX = surfaceVelX;
        
        // When inputs are active, the desired speed is modified accordingly
        if ( leftKey.isDown && !rightKey.isDown ) {
            desiredSpeedX -= maxSpeed;
        }
        else if ( !leftKey.isDown && rightKey.isDown ) {
            desiredSpeedX += maxSpeed;
        }
        
        // Decide which way to apply force to meet desired speed
        var currentVelocity = playerBody.GetLinearVelocity();
        var velocityChange = desiredSpeedX - currentVelocity.x;        
        var force = velocityChange > 0 ? maxForce : -maxForce;
        
        // Notice that the above line results in a full strength force in 
        // one direction or the other. That will give us a jittering problem
        // when the current speed and desired speed are very close, which is
        // usually most noticeable when the player is standing still. We can
        // take into account how close current speed already is to the desired
        // speed, and scale the force down when desired and current speed
        // are close. Note that we don't want the force to get larger, only
        // smaller, so we limit the scale value to a maximum of 1.
        // The value 10 here is something you can tweak to your liking. It will
        // determine how close the current and desired speeds need to be for
        // the scaling to have an effect (the larger the value, the closer the
        // current and desired speeds must be for scaling to occur).
        var forceScale = Math.abs(velocityChange) * 10;
        if ( forceScale > 1 ) 
            forceScale = 1;
        force *= forceScale;
        
        // Finally, reduce force when player is not touching the ground
        if ( footContacts.length < 1 )
            force *= 0.5;
            
        // Apply whatever force we decided on above...
        playerBody.ApplyForce( { x:force, y:0 }, playerBody.GetWorldCenter(), true );
        
        // If all the conditions are met to allow a jump, use ApplyLinearImpulse to 
        // "hit" the player body upward.
        if ( upKey.isDown && footContacts.length > 0 && jumpTimeout <= 0 ) {
            playerBody.ApplyImpulse( {x:0,y:4}, playerBody.GetWorldCenter(), true );
            jumpTimeout = 15; // 1/4 second at 60 fps (prevents repeated jumps while the foot sensor is still touching the ground)
            sound_jump.play();            
        }
    }
    
    
    // Called each frame to move the 'camera'
    function updateViewPosition() {
        
        // Decide on a new point for the camera center. Look at where the player
        // will be 2 seconds in the future if they keep moving in the current
        // direction, and move the camera a little bit toward that point.
        var smooth = 0.012;
        var viewCenter = getViewCenterWorld();
        var currentPosition = playerBody.GetPosition();
        var currentVelocity = playerBody.GetLinearVelocity();
        var playerPositionSoonX = currentPosition.x + 2 * currentVelocity.x; //position 2 seconds from now
        var playerPositionSoonY = currentPosition.y + 2 * currentVelocity.y; //position 2 seconds from now
        var newCameraCenterX = (1 - smooth) * viewCenter.x + smooth * playerPositionSoonX;
        var newCameraCenterY = (1 - smooth) * viewCenter.y + smooth * playerPositionSoonY;
        setViewCenterWorld( {x:newCameraCenterX, y:newCameraCenterY} );
    }
    
    
    // Called each frame to check if the instructions sprites need to be
    // hidden or shown.
    function updateInstructionSprites() {
        
        // If we are moving, the user no longer needs to see the "how to move" message,
        // so we can remove it from the scene. We also show the "how to jump" sprite.
        if ( instructionsImage1 && (leftKey.isDown || rightKey.isDown) ) {
            instructionsImage1.sprite.alpha = 0;
            instructionsImage1 = null;
            if ( instructionsImage2 )
                instructionsImage2.sprite.alpha = 1; // show by setting alpha to full
        }
        
        // If jump timeout is > 0 then the player has just jumped. The user
        // no longer needs to see the "how to jump" sprite, so remove it.
        if ( instructionsImage2 && jumpTimeout > 0 ) {
            instructionsImage2.sprite.alpha = 0;
            instructionsImage2 = null;
        }
    }
    
    
    // Called each frame to wobble the pickups around a bit.
    function updateWobblyBodies() {
        for (var i = 0; i < wobblyBodies.length; i++) {
            var body = wobblyBodies[i];
            body.bounceDeltaH += body.bounceSpeedH;
            body.bounceDeltaV += body.bounceSpeedV;
            var px = body.originalPosition.x + body.bounceWidth * Math.sin(body.bounceDeltaH);
            var py = body.originalPosition.y + body.bounceHeight * Math.sin(body.bounceDeltaV);
            body.SetPosition( {x:px, y:py} );
        }
    }
    
    
    // This class will be used in updateShadowSprite to cast a ray.
    // It is customized to only detect things the player can stand on.
    var raycastCallback_closestStandable = function() {
        this.m_hit = false;
    }
    raycastCallback_closestStandable.prototype.ReportFixture = function(fixture,point,normal,fraction) {
        
        // Can't stand on sensor fixtures
        if ( fixture.IsSensor() ) 
            return -1;
        
        // Can't stand on fixtures that dont match the 
        // player collision filter settings
        var filter1 = fixture.GetFilterData();
        var filter2 = playerFixture.GetFilterData();
        var collide = (filter1.maskBits & filter2.categoryBits) != 0 && (filter1.categoryBits & filter2.maskBits) != 0;
        if ( !collide )
            return -1;
        
        // If we get to here, the reported fixture is something the
        // player can stand on and is a candidate for shadow placement
        this.m_hit = true;
        this.m_point = point;
        this.m_normal = normal;
        return fraction;
    };
    
    
    // To demonstrate raycasting, we will cast a ray directly downward
    // from the player, and move a shadow sprite there. This will look
    // a bit strange in some situations, but it's just for an example.
    function updateShadowSprite() {
        if ( !shadowImage || !shadowImage.sprite ) 
            return;
        var rayStart = playerBody.GetPosition();
        var rayEnd = { x:rayStart.x, y:rayStart.y - 100 };
        
        // We are reusing a single instance of the raycast callback so
        // it must be reset to clear the values from last time
        raycastCallback.m_hit = false;
        
        // See if there is somewhere to put the shadow
        world.RayCast(raycastCallback, rayStart, rayEnd);
        if ( raycastCallback.m_hit ) {
            // Inside the update_rube function, all sprites will be
            // repositioned to follow their physics bodies. So if we
            // changed the sprite properties directly it would not
            // have any effect. We should change the image properties.
            shadowImage.center.x = raycastCallback.m_point.x;
            shadowImage.center.y = raycastCallback.m_point.y;
            shadowImage.angle = Math.atan2( -raycastCallback.m_normal.x, raycastCallback.m_normal.y );
            
            // We can also make the shadow smaller when the ground is further away
            var dx = rayStart.x - raycastCallback.m_point.x;
            var dy = rayStart.y - raycastCallback.m_point.y;
            var distanceToGround = Math.sqrt(dx*dx + dy*dy);
            shadowImage.scale = shadowImage.originalScale * (1 - 0.25 * distanceToGround);
        }
        else {
            // Umm... nothing detected below. We can move the shadoe
            // to somewhere out of the view, otherwise it will stay
            // visible in the last place we put it - not cool.
            shadowImage.center.x = -1000;
        }
    }
    
    
    // Called when two fixtures begin touching. Note that this occurs
    // within the update_rube function.
    onBeginContact = function(contact) {        
        var fA = contact.GetFixtureA();
        var fB = contact.GetFixtureB();
    
        // If the contact was between the player foot sensor and something else,
        // add the contact to a list to keep track of what we are standing on.
        if ( fA == footSensorFixture || fB == footSensorFixture ) {
            footContacts.push(contact);
        }
    
        // If the contact was between the player body and a pickup, add the
        // contact to the pickupsToProcess list so we can deal with it after
        // the Box2D time step has finished. (This function is called by the
        // physics engine, during the world step. We cannot change anything
        // in the physics world right now.)
        if ( fA.isPickup && fB == playerFixture ) {
            pickupsToProcess.push( fA );
        }
        if ( fB.isPickup && fA == playerFixture ) {
            pickupsToProcess.push( fB );
        }
    }
    

    // Called when two fixtures finish touching. Note that this occurs
    // within the update_rube function.    
    onEndContact = function(contact) {        
        var fA = contact.GetFixtureA();
        var fB = contact.GetFixtureB();
    
        // If the contact was between the player foot sensor and something else,
        // remove the contact from the list to keep track of what we are standing on.
        if ( fA == footSensorFixture || fB == footSensorFixture ) {
            removeFromArray(footContacts,contact);
        }
    }
    
    
    // Called each frame after doing update_rube, to see if the player
    // touched any pickups. If so, we need to remove them from the world
    // and play the appropriate sound.
    function processPickups() {
        
        if (pickupsToProcess.length < 1) 
            return;
        
        // Make sure the list does not contain duplicates. In this
        // simple scene, there is only one player fixture that does
        // contacts with pickups, so we can never pick up the same
        // pickup more than once in the same frame, but in the more
        // awesome and complex scenes you will make, this is a must.
        pickupsToProcess = arrayUnique( pickupsToProcess );
        
        for (var i = 0; i < pickupsToProcess.length; i++) {
            var pickup = pickupsToProcess[i];
            
            if ( pickup.pickupType == PICKUPTYPE_STAR ) {
                sound_pickupstar.play();
                
                // Show the "well done" sprite
                if ( instructionsImage3 ) 
                    instructionsImage3.sprite.alpha = 1;
            }
            else if ( pickup.pickupType == PICKUPTYPE_GEM ) {
                sound_pickupgem.play();
            }
            
            // Remove the reference to the body from any lists we might
            // be keeping track of it with, and remove it from the scene.
            removeFromArray( wobblyBodies, pickup.GetBody() );
            removeBodyFromScene( pickup.GetBody() );
        }
        
        pickupsToProcess = [];
    }
    
    
    // Update the game
    function update() {
        update_rube(60); // Does physics step and positions sprites
        processPickups();
        updatePlayerMovement();
        updateViewPosition();
        updateInstructionSprites();
        updateWobblyBodies();
        updateShadowSprite();
        timePassed += 1 / 60;
    }
    

    // Extra render display. To view the debug draw properly, you will
    // need to change the rendering type to Phaser.CANVAS. For this scene,
    // you will also need to remove the large blue image that covers the
    // background, otherwise you will not be able to see any debug display.
    // (If you don't have RUBE, you could try replacing the image with
    // a fully transparent one.)
    function render() {
        //drawDebugData();
    }
    
};

