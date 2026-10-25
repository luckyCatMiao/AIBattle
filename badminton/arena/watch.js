'use strict';
const http = require('node:http');
const port = Number(process.env.BADMINTON_WATCH_PORT || 8809);
const url = `http://127.0.0.1:${port}/?replay=latest`;
const open = () => require('node:child_process').exec(`cmd.exe /d /c start "" "${url}"`);
const req = http.get(`http://127.0.0.1:${port}/api/health`, res => {
  res.resume();
  if (res.statusCode === 200) open();
  else console.error('回放端口被其他服务占用');
});
req.on('error', () => {
  const { createServer } = require('../server');
  createServer().listen(port, '127.0.0.1', open);
});
