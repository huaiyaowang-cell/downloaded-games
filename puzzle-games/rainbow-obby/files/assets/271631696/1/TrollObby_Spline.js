var TrollObbySpline = pc.createScript('trollObbySpline');

TrollObbySpline.attributes.add('nodeRoot', {type: 'entity',description: 'Spline Nodes Root'});
TrollObbySpline.attributes.add('closed', {type: 'boolean', description: 'Closed Spline'});
TrollObbySpline.attributes.add('splineIndex', {type: 'number', description: 'Spline Index'});

TrollObbySpline.prototype.initialize = function () {
    if (!this.app.splines){this.app.splines = [];}
    this.app.splines[this.splineIndex] = this;
    this.createPath();

    this.lastUp = new pc.Vec3(0, 1, 0);
    this.distance = 0;
};


TrollObbySpline.prototype.getPosition = function(t){
    return new pc.Vec3(this.px.value(t), this.py.value(t)+1, this.pz.value(t));
}

TrollObbySpline.prototype.getLookAt = function(t){
    return new pc.Vec3(this.tx.value(t), this.ty.value(t), this.tz.value(t));
}
TrollObbySpline.prototype.getUp = function(t){
    return new pc.Vec3(this.ux.value(t), this.uy.value(t), this.uz.value(t));
}


TrollObbySpline.prototype.getRotation = function (t) {
    let prevT = Math.max(0, t - 0.000001);
    let prevPos = this.getPosition(prevT);
    let currPos = this.getPosition(t);

    // Forward yönü (hareket yönü)
    let forward = currPos.clone().sub(prevPos).normalize();

    // Up yönünü node'lardan al
    // Bu spline'ın nodeRoot altında node'ları olduğunu varsayıyoruz
    // ve t değerine göre yakın olan node'un up yönünü referans alıyoruz.
    let up = new pc.Vec3(0, 1, 0);
    if (this.nodeRoot && this.nodeRoot.children.length > 0) {
        // t’ye göre hangi node’a yakınsa onu bul
        let nodeCount = this.nodeRoot.children.length;
        let nodeIndex = Math.min(nodeCount - 1, Math.floor(t * (nodeCount - 1)));
        let node = this.nodeRoot.children[nodeIndex];
        if (node) {
            up = node.up.clone().normalize();
        }
    }

    // LookAt ile rotasyon oluştur
    let mat = new pc.Mat4();
    mat.setLookAt(prevPos, currPos.clone().add(forward), up);

    let quat = new pc.Quat();
    quat.setFromMat4(mat);

    return quat;
};
 




TrollObbySpline.prototype.createPath = function () {
    let curveMode = pc.CURVE_CARDINAL;
    
    // Create curves for position
    this.px = new pc.Curve(); 
    this.px.type = curveMode;
    
    this.py = new pc.Curve(); 
    this.py.type = curveMode;    
    
    this.pz = new pc.Curve(); 
    this.pz.type = curveMode;
    
    // Create curves for target look at position
    this.tx = new pc.Curve();
    this.tx.type = curveMode;
    
    this.ty = new pc.Curve();
    this.ty.type = curveMode;
    
    this.tz = new pc.Curve();
    this.tz.type = curveMode;
    
    // Create curves for the 'up' vector for use with the lookAt function to 
    // allow for roll and avoid gimbal lock
    this.ux = new pc.Curve();
    this.ux.type = curveMode;
    
    this.uy = new pc.Curve();
    this.uy.type = curveMode;
    
    this.uz = new pc.Curve();
    this.uz.type = curveMode;
    
    let nodes = this.nodeRoot.children;  
    
    // Get the total linear distance of the path (this isn't correct but gives a decent approximation in length)
    let pathLength = 0;
    
    // Store the distance from the start of the path for each path node
    let nodePathLength = [];
    
    // For use when calculating the distance between two nodes on the path
    let distanceBetween = new pc.Vec3();
    
    // Push 0 as we are starting our loop from 1 for ease
    nodePathLength.push(0);

    if (this.closed && nodes.length > 1) {
        nodes.push(nodes[0].clone());
    }
    
    for (i = 1; i < nodes.length; i++) {
        let prevNode = nodes[i-1];
        let nextNode = nodes[i];
        
        // Work out the distance between the current node and the one before in the path
        distanceBetween.sub2(prevNode.getPosition(), nextNode.getPosition());
        pathLength += distanceBetween.length();
        
        nodePathLength.push(pathLength);
    }
        
    for (i = 0; i < nodes.length; i++) {
        // Calculate the time for the curve key based on the distance of the path to the node
        // and the total path length so the speed of the camera travel stays relatively
        // consistent throughout
        let t = nodePathLength[i] / pathLength;
        
        let node = nodes[i];
        
        let pos = node.getPosition();
        this.px.add(t, pos.x);
        this.py.add(t, pos.y);
        this.pz.add(t, pos.z);
        
        // Create and store a lookAt position based on the node position and the forward direction
        let lookAt = pos.clone().add(node.forward);
        this.tx.add(t, lookAt.x);
        this.ty.add(t, lookAt.y);
        this.tz.add(t, lookAt.z);
        
        let up = node.up;
        this.ux.add(t, up.x);
        this.uy.add(t, up.y);
        this.uz.add(t, up.z);
    }
};

TrollObbySpline.prototype.getValue = function (pos, lastT = 0.5) {
    // Local search radius (adjust as needed)
    let range = 0.01;
    let samples = 200; // much lower than 2000

    let bestT = lastT;
    let bestDist = Infinity;

    // Clamp range to 0–1
    let start = Math.max(0, lastT - range);
    let end = Math.min(1, lastT + range);

    for (let i = 0; i <= samples; i++) {
        let t = start + (i / samples) * (end - start);
        let pt = this.getPosition(t);
        let dist = pt.distance(pos);
        if (dist < bestDist) {
            bestDist = dist;
            bestT = t;
        }
    }

    // Optional fallback: if it's too far (maybe player teleported)
    if (bestDist > 5.0) {
        // fallback to global search, rarely used
        let globalBestT = 0;
        let globalBestDist = Infinity;
        let globalSamples = 400; // smaller than 2000 still
        for (let i = 0; i <= globalSamples; i++) {
            let t = i / globalSamples;
            let pt = this.getPosition(t);
            let dist = pt.distance(pos);
            if (dist < globalBestDist) {
                globalBestDist = dist;
                globalBestT = t;
            }
        }
        bestT = globalBestT;
    }

    this.distance = bestDist;
    return bestT;
};

/* TrollObbySpline.prototype.getValue = function (pos) {
    // Find nearest node (rough, can refine with sampling)
    let bestT = 0;
    let bestDist = Infinity;
    let samples = 2000; // increase for accuracy

    for (let i = 0; i <= samples; i++) {
        let t = i / samples;
        let pt = this.getPosition(t);
        let dist = pt.distance(pos);
        if (dist < bestDist) {
            bestDist = dist;
            bestT = t;
        }
    }
    return bestT;
};
 */