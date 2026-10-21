// 以 shim 方式加载 simulation.js（其导出引用了未定义的 bot）
const fs = require('fs'), path = require('path'), Module = require('module');
const file = path.join(__dirname, '..', 'simulation.js');
const src = fs.readFileSync(file, 'utf8') + '\nfunction bot(){}\n';
const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(src, file);
module.exports = m.exports;
