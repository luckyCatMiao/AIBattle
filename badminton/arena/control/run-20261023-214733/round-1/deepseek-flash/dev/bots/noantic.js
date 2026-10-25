'use strict';
// 关闭预判的同一套 brain（作为对照对手）
const brain = require('../../brain.js');
module.exports = { decide: obs => brain.decide({ ...obs, __noantic: true }).frames };
