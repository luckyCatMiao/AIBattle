'use strict';
const http=require('node:http'),path=require('node:path'),{spawn}=require('node:child_process');
const port=8794,url=`http://127.0.0.1:${port}/?replay=latest`;
function open(){spawn('cmd.exe',['/c','start','',url.replace('&','^&')],{windowsHide:true,detached:true,stdio:'ignore'}).unref();}
const req=http.get(`http://127.0.0.1:${port}/api/health`,res=>{res.resume();if(res.statusCode===200)open();else console.error('回放端口被其他服务占用');});
req.on('error',()=>{const {createServer}=require('../server');createServer().listen(port,'127.0.0.1',open);});
req.setTimeout(2000,()=>req.destroy());
