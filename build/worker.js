/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/* eslint-env es6, worker */
	/* eslint no-console: 0 */

	'use strict';

	const World3D = __webpack_require__(3);
	const Constraint3D = __webpack_require__(16);
	const Point3D = __webpack_require__(20);
	const timeFactor = 1;
	const vec3 = {
		create: __webpack_require__(4),
		add: __webpack_require__(5),
		// dot: require('gl-vec3/dot'),
		subtract: __webpack_require__(7),
		scale: __webpack_require__(8),
		distance: __webpack_require__(18),
		length: __webpack_require__(22)
	};

	const p3DPrototype = new Point3D().constructor.prototype;
	p3DPrototype.intersects = function (p) {
		return vec3.distance(this.position, p.position) <= this.radius + p.radius;
	};
	p3DPrototype.distanceFrom = function (p) {
		return vec3.distance(this.position, p.position);
	};

	class VerletThreePoint {
		constructor({
			position = { x: 0, y: 0, z: 0 },
			radius = 1,
			mass = 1,
			attraction = 0,
			velocity = { x: 0, y: 0, z: 0 }
		}) {
			this.initialRadius = radius;
			this.initialMass = mass;
			this.attraction = attraction;

			this.verletPoint = new Point3D({
				position: [position.x, position.y, position.z],
				mass,
				radius,
				attraction
			}).addForce([velocity.x, velocity.y, velocity.z]);
		}
	}

	function MyVerlet(options = {}) {

		this.points = [];
		this.constraints = [];

		this.addPoint = options => {
			const p = new VerletThreePoint(options);
			p.id = this.points.push(p) - 1;

			// if a point is attractive add a pulling force
			this.points.forEach(p0 => {
				if (p.attraction || p0.attraction && p !== p0) {
					this.connect(p, p0, {
						stiffness: (p.attraction || 0) + (p0.attraction || 0),
						restingDistance: p.radius + p0.radius
					});
				}
			});

			return p;
		};

		this.connect = (p1, p2, options) => {
			if (!options) options = {
				stiffness: 0.05,
				restingDistance: p1.radius + p2.radius
			};

			const c = new Constraint3D([p1.verletPoint, p2.verletPoint], options);
			this.constraints.push(c);
			return this.constraints.indexOf(c);
		};

		this.size = options.size || {
			x: 10,
			y: 10,
			z: 10
		};

		this.world = new World3D({
			gravity: options.gravity ? [0, -9.8, 0] : undefined,
			min: [-this.size.x / 2, -this.size.y / 2, -this.size.z / 2],
			max: [this.size.x / 2, this.size.y / 2, this.size.z / 2],
			friction: 0.99
		});

		let oldT = 0;

		this.animate = function animate() {
			const t = Date.now();

			// don't bother calculating many times in a single batch
			if (t - oldT < 3) {
				return;
			}

			const dT = Math.min(0.032, (t - oldT) / 1000);
			const vP = this.points.map(p => p.verletPoint);

			this.constraints.forEach(c => c.solve());

			this.world.integrate(vP, dT * timeFactor);
			oldT = t;
		};
	}

	let verlet;

	// Recieve messages from the client and reply back onthe same port
	self.addEventListener('message', function (event) {

		const data = event.data;
		Promise.all(data.map(({ message, id }) => new Promise(function (resolve) {
			const i = message;

			switch (i.action) {
				case 'init':
					verlet = new MyVerlet(i.options);
					return resolve();

				case 'getPoints':
					const transfer = i.byteData;
					verlet.animate();
					for (let i = 0, l = verlet.points.length; i < l; i++) {
						const p = verlet.points[i];
						const j = i * 5;
						transfer[j + 0] = p.id;
						transfer[j + 1] = p.verletPoint.radius;
						transfer[j + 2] = p.verletPoint.position[0];
						transfer[j + 3] = p.verletPoint.position[1];
						transfer[j + 4] = p.verletPoint.position[2];
					}

					return resolve({ byteData: transfer });

				case 'connectPoints':
					const p1 = verlet.points[i.options.p1.id];
					const p2 = verlet.points[i.options.p2.id];
					return resolve({
						constraintId: verlet.connect(p1, p2, i.options.constraintOptions)
					});

				case 'updateConstraint':
					const c = verlet.constraints[i.options.constraintId];
					if (i.options.stiffness !== undefined) c.stiffness = i.options.stiffness;
					if (i.options.restingDistance !== undefined) c.restingDistance = i.options.restingDistance;
					return resolve();

				case 'addPoint':
					return resolve({
						point: verlet.addPoint(i.pointOptions)
					});

				case 'updatePoint':
					const d = i.pointOptions;
					const p3 = verlet.points[d.id];
					if (d.position !== undefined) p3.verletPoint.place([d.position.x, d.position.y, d.position.z]);
					if (d.velocity !== undefined) p3.verletPoint.addForce([d.velocity.x, d.velocity.y, d.velocity.z]);
					if (d.mass !== undefined) p3.verletPoint.mass = d.mass;
					if (d.radius !== undefined) p3.verletPoint.radius = d.radius;
					return resolve();

				case 'reset':
					verlet.points.splice(0);
					return resolve();

				default:
					throw Error('Invalid Action');
			}
		}).then(function (o = {}) {
			o.id = id;
			return o;
		}, function (err) {
			console.log(err);
			const o = { id };
			if (err) {
				o.error = err.message ? err.message : err;
			}
			return o;
		}))).then(function (response) {

			// deliver data by transfering data
			event.ports[0].postMessage(response, response.byteData ? [response.byteData] : undefined);
		});
	});

/***/ },
/* 1 */,
/* 2 */,
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	var vec3 = {
	    create: __webpack_require__(4),
	    add: __webpack_require__(5),
	    multiply: __webpack_require__(6),
	    sub: __webpack_require__(7),
	    scale: __webpack_require__(8),
	    copy: __webpack_require__(9),
	    sqrLen: __webpack_require__(10),
	    fromValues: __webpack_require__(11),
	}
	module.exports = __webpack_require__(12)(vec3)

/***/ },
/* 4 */
/***/ function(module, exports) {

	module.exports = create;

	/**
	 * Creates a new, empty vec3
	 *
	 * @returns {vec3} a new 3D vector
	 */
	function create() {
	    var out = new Float32Array(3)
	    out[0] = 0
	    out[1] = 0
	    out[2] = 0
	    return out
	}

/***/ },
/* 5 */
/***/ function(module, exports) {

	module.exports = add;

	/**
	 * Adds two vec3's
	 *
	 * @param {vec3} out the receiving vector
	 * @param {vec3} a the first operand
	 * @param {vec3} b the second operand
	 * @returns {vec3} out
	 */
	function add(out, a, b) {
	    out[0] = a[0] + b[0]
	    out[1] = a[1] + b[1]
	    out[2] = a[2] + b[2]
	    return out
	}

/***/ },
/* 6 */
/***/ function(module, exports) {

	module.exports = multiply;

	/**
	 * Multiplies two vec3's
	 *
	 * @param {vec3} out the receiving vector
	 * @param {vec3} a the first operand
	 * @param {vec3} b the second operand
	 * @returns {vec3} out
	 */
	function multiply(out, a, b) {
	    out[0] = a[0] * b[0]
	    out[1] = a[1] * b[1]
	    out[2] = a[2] * b[2]
	    return out
	}

/***/ },
/* 7 */
/***/ function(module, exports) {

	module.exports = subtract;

	/**
	 * Subtracts vector b from vector a
	 *
	 * @param {vec3} out the receiving vector
	 * @param {vec3} a the first operand
	 * @param {vec3} b the second operand
	 * @returns {vec3} out
	 */
	function subtract(out, a, b) {
	    out[0] = a[0] - b[0]
	    out[1] = a[1] - b[1]
	    out[2] = a[2] - b[2]
	    return out
	}

/***/ },
/* 8 */
/***/ function(module, exports) {

	module.exports = scale;

	/**
	 * Scales a vec3 by a scalar number
	 *
	 * @param {vec3} out the receiving vector
	 * @param {vec3} a the vector to scale
	 * @param {Number} b amount to scale the vector by
	 * @returns {vec3} out
	 */
	function scale(out, a, b) {
	    out[0] = a[0] * b
	    out[1] = a[1] * b
	    out[2] = a[2] * b
	    return out
	}

/***/ },
/* 9 */
/***/ function(module, exports) {

	module.exports = copy;

	/**
	 * Copy the values from one vec3 to another
	 *
	 * @param {vec3} out the receiving vector
	 * @param {vec3} a the source vector
	 * @returns {vec3} out
	 */
	function copy(out, a) {
	    out[0] = a[0]
	    out[1] = a[1]
	    out[2] = a[2]
	    return out
	}

/***/ },
/* 10 */
/***/ function(module, exports) {

	module.exports = squaredLength;

	/**
	 * Calculates the squared length of a vec3
	 *
	 * @param {vec3} a vector to calculate squared length of
	 * @returns {Number} squared length of a
	 */
	function squaredLength(a) {
	    var x = a[0],
	        y = a[1],
	        z = a[2]
	    return x*x + y*y + z*z
	}

/***/ },
/* 11 */
/***/ function(module, exports) {

	module.exports = fromValues;

	/**
	 * Creates a new vec3 initialized with the given values
	 *
	 * @param {Number} x X component
	 * @param {Number} y Y component
	 * @param {Number} z Z component
	 * @returns {vec3} a new 3D vector
	 */
	function fromValues(x, y, z) {
	    var out = new Float32Array(3)
	    out[0] = x
	    out[1] = y
	    out[2] = z
	    return out
	}

/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	var number = __webpack_require__(13)
	var clamp = __webpack_require__(14)
	var createCollider = __webpack_require__(15)

	module.exports = function create(vec) {
	    
	    var collide = createCollider(vec)

	    var velocity = vec.create()
	    var tmp = vec.create()
	    var zero = vec.create()
	    
	    function VerletSystem(opt) {
	        if (!(this instanceof VerletSystem))
	            return new VerletSystem(opt)
	        
	        opt = opt||{}

	        this.gravity = opt.gravity || vec.create()
	        this.friction = number(opt.friction, 0.98)
	        this.min = opt.min
	        this.max = opt.max
	        this.bounce = number(opt.bounce, 1)
	    }
	    
	    VerletSystem.prototype.collision = function(p, velocity) {
	        collide(p, velocity, this.min, this.max, this.bounce)
	    }

	    VerletSystem.prototype.integratePoint = function(point, delta) {
	        var mass = typeof point.mass === 'number' ? point.mass : 1

	        //if mass is zero, assume body is static / unmovable
	        if (mass === 0) {
	            this.collision(point, zero)
	            vec.copy(point.acceleration, zero)
	            return
	        }

	        vec.add(point.acceleration, point.acceleration, this.gravity)
	        vec.scale(point.acceleration, point.acceleration, mass)
	            
	        //difference in positions
	        vec.sub(velocity, point.position, point.previous)

	        //dampen velocity
	        vec.scale(velocity, velocity, this.friction)

	        //handle custom collisions in 2D or 3D space
	        this.collision(point, velocity)

	        //set last position
	        vec.copy(point.previous, point.position)
	        var tSqr = delta * delta
	            
	        //integrate
	        vec.scale(tmp, point.acceleration, 0.5 * tSqr)
	        vec.add(point.position, point.position, velocity)
	        vec.add(point.position, point.position, tmp)

	        //reset acceleration
	        vec.copy(point.acceleration, zero)
	    }

	    VerletSystem.prototype.integrate = function(points, delta) {
	        for (var i=0; i<points.length; i++) {
	            this.integratePoint(points[i], delta)
	        }
	    }

	    return VerletSystem
	}

/***/ },
/* 13 */
/***/ function(module, exports) {

	module.exports = function numtype(num, def) {
		return typeof num === 'number'
			? num 
			: (typeof def === 'number' ? def : 0)
	}

/***/ },
/* 14 */
/***/ function(module, exports) {

	module.exports = clamp

	function clamp(value, min, max) {
	  return min < max
	    ? (value < min ? min : value > max ? max : value)
	    : (value < max ? max : value > min ? min : value)
	}


/***/ },
/* 15 */
/***/ function(module, exports) {

	module.exports = function(vec) {
	    var negInfinity = vec.fromValues(-Infinity, -Infinity, -Infinity)
	    var posInfinity = vec.fromValues(Infinity, Infinity, Infinity)
	    var ones = vec.fromValues(1, 1, 1)
	    var reflect = vec.create()
	    var EPSILON = 0.000001

	    return function collider(p, velocity, min, max, friction) {
	        if (!min && !max)
	            return
	            
	        //reset reflection 
	        vec.copy(reflect, ones)

	        min = min || negInfinity
	        max = max || posInfinity

	        var i = 0,
	            n = p.position.length,
	            hit = false,
	            radius = p.radius || 0

	        //bounce and clamp
	        for (i=0; i<n; i++)
	            if (typeof min[i] === 'number' && p.position[i]-radius < min[i]) {
	                reflect[i] = -1
	                p.position[i] = min[i]+radius
	                hit = true
	            }
	        for (i=0; i<n; i++)
	            if (typeof max[i] === 'number' && p.position[i]+radius > max[i]) {
	                reflect[i] = -1
	                p.position[i] = max[i]-radius
	                hit = true
	            }

	        //no bounce
	        var len2 = vec.sqrLen(velocity)
	        if (!hit || len2 <= EPSILON)
	            return

	        var m = Math.sqrt(len2)
	        if (m !== 0) 
	            vec.scale(velocity, velocity, 1/m)

	        //scale bounce by friction
	        vec.scale(reflect, reflect, m * friction)

	        //bounce back
	        vec.multiply(velocity, velocity, reflect)
	    }
	}

/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	var vec3 = {
	    create: __webpack_require__(4),
	    add: __webpack_require__(5),
	    dot: __webpack_require__(17),
	    sub: __webpack_require__(7),
	    scale: __webpack_require__(8),
	    distance: __webpack_require__(18)
	}
	module.exports = __webpack_require__(19)(vec3)

/***/ },
/* 17 */
/***/ function(module, exports) {

	module.exports = dot;

	/**
	 * Calculates the dot product of two vec3's
	 *
	 * @param {vec3} a the first operand
	 * @param {vec3} b the second operand
	 * @returns {Number} dot product of a and b
	 */
	function dot(a, b) {
	    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
	}

/***/ },
/* 18 */
/***/ function(module, exports) {

	module.exports = distance;

	/**
	 * Calculates the euclidian distance between two vec3's
	 *
	 * @param {vec3} a the first operand
	 * @param {vec3} b the second operand
	 * @returns {Number} distance between a and b
	 */
	function distance(a, b) {
	    var x = b[0] - a[0],
	        y = b[1] - a[1],
	        z = b[2] - a[2]
	    return Math.sqrt(x*x + y*y + z*z)
	}

/***/ },
/* 19 */
/***/ function(module, exports) {

	module.exports = function(vec) {
	    var delta = vec.create()
	    var scaled = vec.create()

	    function Constraint(points, opt) {
	        if (!points || points.length !== 2)
	            throw new Error('two points must be specified for the constraint')
	        if (!points[0].position || !points[1].position)
	            throw new Error('must specify verlet-point or similar, with { position }')
	        this.points = points
	        this.stiffness = 1.0
	        if (opt && typeof opt.stiffness === 'number')
	            this.stiffness = opt.stiffness

	        if (opt && typeof opt.restingDistance === 'number')
	            this.restingDistance = opt.restingDistance
	        else
	            this.restingDistance = vec.distance(this.points[0].position, this.points[1].position)
	    }

	    Constraint.prototype.solve = function() {
	        //distance formula
	        var p1 = this.points[0],
	            p2 = this.points[1],
	            p1vec = p1.position,
	            p2vec = p2.position,
	            p1mass = typeof p1.mass === 'number' ? p1.mass : 1,
	            p2mass = typeof p2.mass === 'number' ? p2.mass : 1

	        vec.sub(delta, p1vec, p2vec)
	        var d = Math.sqrt(vec.dot(delta, delta))

	        //ratio for resting distance
	        var restingRatio = d===0 ? this.restingDistance : (this.restingDistance - d) / d
	        var scalarP1, 
	            scalarP2

	        //handle zero mass a little differently
	        if (p1mass == 0 && p2mass == 0) {
	            scalarP1 = 0
	            scalarP2 = 0
	        } else if (p1mass == 0 && p2mass > 0) {
	            scalarP1 = 0
	            scalarP2 = this.stiffness
	        } else if (p1mass > 0 && p2mass == 0) {
	            scalarP1 = this.stiffness
	            scalarP2 = 0
	        } else {
	            //invert mass quantities
	            var im1 = 1.0 / p1mass
	            var im2 = 1.0 / p2mass
	            scalarP1 = (im1 / (im1 + im2)) * this.stiffness
	            scalarP2 = this.stiffness - scalarP1
	        }
	        
	        //push/pull based on mass
	        vec.scale(scaled, delta, scalarP1 * restingRatio)
	        vec.add(p1vec, p1vec, scaled)
	        
	        vec.scale(scaled, delta, scalarP2 * restingRatio)
	        vec.sub(p2vec, p2vec, scaled)

	        return d
	    }

	    return function(p1, p2, opt) {
	        return new Constraint(p1, p2, opt)
	    }
	}


/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	var vec3 = {
	    create: __webpack_require__(4),
	    sub: __webpack_require__(7),
	    copy: __webpack_require__(9)
	}
	module.exports = __webpack_require__(21)(vec3)

/***/ },
/* 21 */
/***/ function(module, exports) {

	module.exports = function(vec) {
	    function Point(opt) {
	        this.position = vec.create()
	        this.previous = vec.create()
	        this.acceleration = vec.create()
	        this.mass = 1.0
	        this.radius = 0

	        if (opt && typeof opt.mass === 'number')
	            this.mass = opt.mass
	        if (opt && typeof opt.radius === 'number')
	            this.radius = opt.radius

	        if (opt && opt.position) 
	            vec.copy(this.position, opt.position)
	        
	        if (opt && (opt.previous||opt.position)) 
	            vec.copy(this.previous, opt.previous || opt.position)
	        
	        if (opt && opt.acceleration)
	            vec.copy(this.acceleration, opt.acceleration)
	    }

	    Point.prototype.addForce = function(v) {
	        vec.sub(this.previous, this.previous, v)
	        return this
	    }

	    Point.prototype.place = function(v) {
	        vec.copy(this.position, v)
	        vec.copy(this.previous, v)
	        return this
	    }

	    return function(opt) {
	        return new Point(opt)
	    }
	}

/***/ },
/* 22 */
/***/ function(module, exports) {

	module.exports = length;

	/**
	 * Calculates the length of a vec3
	 *
	 * @param {vec3} a vector to calculate length of
	 * @returns {Number} length of a
	 */
	function length(a) {
	    var x = a[0],
	        y = a[1],
	        z = a[2]
	    return Math.sqrt(x*x + y*y + z*z)
	}

/***/ }
/******/ ]);