'use strict';
const brain = require('../../brain.js');
module.exports = { decide: obs => brain.decide(obs).frames };
