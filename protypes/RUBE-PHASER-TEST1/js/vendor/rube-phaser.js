/*
* Author: Chris Campbell - www.iforce2d.net
*
* This software is provided 'as-is', without any express or implied
* warranty.  In no event will the authors be held liable for any damages
* arising from the use of this software.
* Permission is granted to anyone to use this software for any purpose,
* including commercial applications, and to alter it and redistribute it
* freely, subject to the following restrictions:
* 1. The origin of this software must not be misrepresented; you must not
* claim that you wrote the original software. If you use this software
* in a product, an acknowledgment in the product documentation would be
* appreciated but is not required.
* 2. Altered source versions must be plainly marked as such, and must not be
* misrepresented as being the original software.
*/

var sceneText;
var sceneJso;   
var myDebugDraw;
var bmData;
var PTM;
var canvasOffset = { x: 0, y: 0 };
var imagesLoaded = false;
var lastMousePosPixel = { x: 0, y: 0 };
var mousePosWorld = { x: 0, y: 0 };
var mouseDownQueryCallback;
var mouseJointGroundBody;
var mouseJoint = null;
var haveAnyTouch = false;
var haveMultiTouch = false;
var touchPos0;
var touchPos1;
var pinchZoomStartMidpoint = { x: 0, y: 0 };
var pinchZoomStartSeparation;


function getWorldPointFromPixelPoint(pixelPoint) {
    return {                
        x: (pixelPoint.x - canvasOffset.x)/PTM,
        y: (-pixelPoint.y + canvasOffset.y)/PTM
    };
}

function getPixelPointFromWorldPoint(worldPoint) {
    return {                
        x: (worldPoint.x * PTM) + canvasOffset.x,
        y: -((worldPoint.y * PTM) -canvasOffset.y)
    };
}

function getViewCenterWorld() {
    return getWorldPointFromPixelPoint( {x:game.width/2,y:game.height/2} );
}

function setViewCenterWorld(worldPos) {
    var currentViewCenterWorld = getViewCenterWorld();
    var toMoveX = worldPos.x - currentViewCenterWorld.x;
    var toMoveY = worldPos.y - currentViewCenterWorld.y;
    canvasOffset.x -= toMoveX * PTM;
    canvasOffset.y += toMoveY * PTM;
}

function updateMousePos(event) {
    var mousePixel;
    
    if ( event.offsetX ) {
        mousePosPixel = {
            x: event.offsetX,
            y: event.offsetY
        };
    }
    else if ( event.x ) {
        mousePosPixel = {
            x: event.x,
            y: event.y
        };
    }
    else {
        mousePosPixel = {
            x: event.clientX,
            y: event.clientY
        };
        if ( event.target && event.target.offsetLeft )
            mousePosPixel.x -= event.target.offsetLeft;
        if ( event.target && event.target.offsetTop ) 
            mousePosPixel.y -= event.target.offsetTop;
    }
    
    mousePosWorld = getWorldPointFromPixelPoint(mousePosPixel);        
}

var MouseDownQueryCallback = function() {
    this.m_fixture = null;
    this.m_point = new b2Vec2();
}
MouseDownQueryCallback.prototype.ReportFixture = function(fixture) {
    if(fixture.GetBody().GetType() == 2) { //dynamic bodies only
        if ( fixture.TestPoint(this.m_point) ) {
            this.m_fixture = fixture;
            return false;
        }
    }
    return true;
};

function tryStartMouseJoint() {
    
    if ( mouseJoint != null )
        return;
    
    // Make a small box.
    var aabb = new b2AABB();
    var d = 0.001;
    aabb.lowerBound.Set(mousePosWorld.x - d, mousePosWorld.y - d);
    aabb.upperBound.Set(mousePosWorld.x + d, mousePosWorld.y + d);
    
    // Query the world for overlapping shapes.            
    mouseDownQueryCallback.m_fixture = null;
    mouseDownQueryCallback.m_point.Set(mousePosWorld.x, mousePosWorld.y);
    world.QueryAABB(mouseDownQueryCallback, aabb);
    if (mouseDownQueryCallback.m_fixture)
    {
        var body = mouseDownQueryCallback.m_fixture.GetBody();
        var md = new b2MouseJointDef();
        md.bodyA = mouseJointGroundBody;
        md.bodyB = body;
        md.target.Set(mousePosWorld.x, mousePosWorld.y);
        md.maxForce = 1000 * body.GetMass();
        md.collideConnected = true;
        
        mouseJoint = world.CreateJoint(md);
        body.SetAwake(true);                    
    }
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
    return "0x" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

onRubeImagesLoaded = function() {
    console.log("Images loaded");
    for (var i = 0; i < world.images.length; i++) {
        var img = world.images[i];
        img.sprite = game.add.sprite(10, 10, 'tempImage'+i);
        img.sprite.anchor.set(0.5,0.5);
        img.sprite.tint = rgbToHex(img.colorTint[0], img.colorTint[1], img.colorTint[2]);
        img.sprite.alpha = img.opacity * (img.colorTint[3] / 255);
        
        // Apparently, setting the scale of a sprite clobbers the dimension
        // values so we need to keep a copy of what the height originally was.
        img.pixelHeight = img.sprite.height;
    }
    imagesLoaded = true;
    
    if ( typeof afterImagesLoaded != 'undefined' ) {
        afterImagesLoaded();
    }
}


function preload_rube (sceneFile) {
    game.load.text('sceneText', sceneFile);
}

function create_rube () {    
    bmData = game.add.bitmapData(game.width, game.height);
    this.game.add.sprite(0, 0, bmData);
    
    myDebugDraw = new b2DebugDraw();
    myDebugDraw.SetSprite(bmData.context);
    myDebugDraw.SetDrawScale(1.0);
    myDebugDraw.SetFillAlpha(0.5);
    myDebugDraw.SetLineThickness(1.0);
    myDebugDraw.SetXFormScale(0.25);
    myDebugDraw.SetFlags(b2DebugDraw.e_shapeBit);
    
    world = new b2World( {x:0, y:-10} );
    world.SetDebugDraw(myDebugDraw);
    
    sceneJso = JSON.parse(game.cache.getText('sceneText'));
    
    if ( loadSceneIntoWorld(sceneJso, world) )
        console.log("RUBE scene loaded successfully.");
    else
        console.log("Failed to load RUBE scene");
    
    if ( world.images ) {
        console.log("Loading " + world.images.length + " images");
        var imageLoader = new Phaser.Loader(game);
        for (var i = 0; i < world.images.length; i++) {
            imageLoader.image('tempImage'+i, world.images[i].file);
        }
        imageLoader.onLoadComplete.addOnce(onRubeImagesLoaded);
        imageLoader.start();
    }
        
    mouseJointGroundBody = world.CreateBody( new b2BodyDef() );
    mouseDownQueryCallback = new MouseDownQueryCallback();
    
    game.input.mouse.mouseWheelCallback = mouseWheelCallback;            
    game.input.onDown.add(onPointerDown, this);
    game.input.moveCallback = onPointerMove;
    game.input.onUp.add(onPointerUp, this);
    
    game.input.pointer1.move = onMultitouchMove;
    game.input.pointer2.move = onMultitouchMove;
    
    PTM = 20;
    setViewCenterWorld( {x:0, y:0} );
}

function pointMidpoint(pt0, pt1) {
    var mx = 0.5 * (touchPos0.x + touchPos1.x);
    var my = 0.5 * (touchPos0.y + touchPos1.y);
    return { x:mx, y:my };
}

function pointSeparation(pt0, pt1) {
    var dx = pt0.x - pt1.x;
    var dy = pt0.y - pt1.y;
    return Math.sqrt( dx*dx + dy*dy );
}

function onMultitouchMove(event) {
    
    switch ( event.identifier ) {
        case 0: touchPos0 = { x:event.clientX, y:event.clientY }; break;
        case 1: touchPos1 = { x:event.clientX, y:event.clientY }; break;
    }
    
    var hadAnyTouchBefore = haveAnyTouch;
    var hadMultiTouchBefore = haveMultiTouch;
    haveMultiTouch = game.input.pointer1.isDown && game.input.pointer2.isDown;
    haveAnyTouch =   game.input.pointer1.isDown || game.input.pointer2.isDown;
    
    if ( !hadMultiTouchBefore && haveMultiTouch ) {
        // starting multitouch
        pinchZoomStartMidpoint = pointMidpoint( touchPos0, touchPos1 );
        pinchZoomStartSeparation = pointSeparation( touchPos0, touchPos1 );
        if ( mouseJoint ) {
            world.DestroyJoint(mouseJoint);
            mouseJoint = null;
        }
    }
    else if ( hadMultiTouchBefore && haveMultiTouch ) {
        // continuing multitouch
        var currentPinchZoomMidpoint = pointMidpoint( touchPos0, touchPos1 );
        var currentPinchZoomSeparation = pointSeparation( touchPos0, touchPos1 );
        
        var midPointWorld = getWorldPointFromPixelPoint( currentPinchZoomMidpoint );
        PTM *= currentPinchZoomSeparation / pinchZoomStartSeparation;
        var midPointPixelAfter = getPixelPointFromWorldPoint( midPointWorld );
        
        canvasOffset.x -= midPointPixelAfter.x - currentPinchZoomMidpoint.x;
        canvasOffset.y -= midPointPixelAfter.y - currentPinchZoomMidpoint.y;
        
        canvasOffset.x += currentPinchZoomMidpoint.x - pinchZoomStartMidpoint.x;
        canvasOffset.y += currentPinchZoomMidpoint.y - pinchZoomStartMidpoint.y;
        
        pinchZoomStartMidpoint = currentPinchZoomMidpoint;
        pinchZoomStartSeparation = currentPinchZoomSeparation;
    }
    else if ( hadMultiTouchBefore && !haveMultiTouch ) {
        // finishing multitouch
    }
    else if ( !hadMultiTouchBefore && !haveMultiTouch ) {
        // single touch moving
        if ( !hadAnyTouchBefore )
            onPointerDown(event); // feed the touch event to onPointerDown
        onPointerMove(event);
    }
    
    if ( event.identifier == 0 ) 
        lastMousePosPixel = { x:event.clientX, y:event.clientY };
}

function onPointerDown(event) {
    
    if ( event.clientX < 0 ) 
        return;
    
    updateMousePos(event);
    
    tryStartMouseJoint();
    
    if ( event.identifier == 0 ) 
        lastMousePosPixel = { x:event.clientX, y:event.clientY };
}

function onPointerMove(event) {
    updateMousePos(event);
    
    haveMultiTouch = game.input.pointer1.isDown && game.input.pointer2.isDown;
    haveAnyTouch =   game.input.pointer1.isDown || game.input.pointer2.isDown;
    
    if (game.input.activePointer.isDown || haveAnyTouch) {
        if ( mouseJoint != null ) {
            // move mouse joint
            if ( event.identifier == 0 ) {
                mouseJoint.SetTarget( mousePosWorld );
            }
        }
        else {
            // pan view
            if ( event.identifier == 0 && !haveMultiTouch ) {
                canvasOffset.x += event.clientX - lastMousePosPixel.x;
                canvasOffset.y += event.clientY - lastMousePosPixel.y;
            }
        }
    }
    
    if ( event.identifier == 0 ) 
        lastMousePosPixel = { x:event.clientX, y:event.clientY };
}

function onPointerUp(event) {
    
    haveMultiTouch = game.input.pointer1.isDown && game.input.pointer2.isDown;
    haveAnyTouch =   game.input.pointer1.isDown || game.input.pointer2.isDown;
    
    if ( mouseJoint ) {
        world.DestroyJoint(mouseJoint);
        mouseJoint = null;
    }
}

function mouseWheelCallback(event){
    
    if (typeof event.offsetX != 'undefined')
        updateMousePos(event);
        
    var mousePosWorldBefore = mousePosWorld;
    if ( game.input.mouse.wheelDelta > 0 ) {
        PTM *= 1.1;
    }
    else if ( game.input.mouse.wheelDelta < 0 ) {
        PTM /= 1.1;
    }
    
    if (typeof event.offsetX != 'undefined')
        updateMousePos(event);
        
    canvasOffset.x -= (mousePosWorldBefore.x - mousePosWorld.x) * PTM;
    canvasOffset.y += (mousePosWorldBefore.y - mousePosWorld.y) * PTM;
}

function positionImages() {
    if ( world.images ) {
        for (var i = 0; i < world.images.length; i++) {
            var image = world.images[i];
            var sprite = image.sprite;
            sprite.rotation = -image.angle;
            var imageScale = PTM / image.pixelHeight * image.scale;
            sprite.scale.set(image.aspectScale * imageScale, imageScale);
            if ( image.flip ) {
                sprite.scale.x *= -1;
            }
            
            if ( image.body ) {
                var imageWorldCenter = image.body.GetWorldPoint( image.center );
                sprite.position.x = imageWorldCenter.x;
                sprite.position.y = -imageWorldCenter.y;
                sprite.rotation += -image.body.GetAngle();
            }
            else {
                // no body
                sprite.position.x = image.center.x;
                sprite.position.y = -image.center.y;
            }
            
            sprite.position.x *= PTM;
            sprite.position.y *= PTM;
            sprite.position.x += canvasOffset.x;
            sprite.position.y += canvasOffset.y;
        }
    }
}

function update_rube(fps) {
    world.Step(1/fps, 8, 3);
    world.ClearForces();
    if ( imagesLoaded ) {
        positionImages();
    }
}

function drawDebugData() {
    var context = bmData.context;
    
    context.fillStyle = 'rgb(0,0,0)';
    context.fillRect( 0, 0, game.width, game.height );
    
    context.save();
        context.translate(canvasOffset.x, canvasOffset.y);
        context.scale(1,-1);
        context.scale(PTM,PTM);
        context.lineWidth = 1 / PTM;
        
        world.DrawDebugData();                
    
        if ( mouseJoint ) {                    
            var p1 = mouseJoint.GetAnchorB();
            var p2 = mouseJoint.GetTarget();
            context.strokeStyle = 'rgb(204,204,204)';
            context.beginPath();
            context.moveTo(p1.x,p1.y);
            context.lineTo(p2.x,p2.y);
            context.stroke();
        }                
        
    context.restore();
}

// remove the body and all related images/sprites
function removeBodyFromScene(body) {
    var imagesToRemove = [];
    for (i = 0; i < world.images.length; i++) {
        if ( world.images[i].body == body )
            imagesToRemove.push(world.images[i]);
    }
    for (var i = 0; i < imagesToRemove.length; i++) {
        imagesToRemove[i].sprite.destroy();
        removeFromArray(world.images, imagesToRemove[i]);
    }
    world.DestroyBody( body );
}

// remove an image/sprite from the scene
function removeImageFromScene(image) {
    images.sprite.destroy();
    removeFromArray(world.images, image);
}



