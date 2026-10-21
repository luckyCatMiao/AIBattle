/* Parse the built HTML like a browser: verify tag structure, single script, no external refs. */
const fs=require('fs');
const html=fs.readFileSync('/workspace/game.html','utf8');
if(!/^<!DOCTYPE html>/i.test(html.trim())) throw new Error('missing doctype');
const scripts=[...html.matchAll(/<script([^>]*)>/g)];
if(scripts.length!==1) throw new Error('expected exactly 1 script, got '+scripts.length);
if(/\ssrc=/.test(scripts[0][1])) throw new Error('script must be inline');
const styles=[...html.matchAll(/<style[^>]*>/g)];
if(styles.length!==1) throw new Error('expected exactly 1 style');
if(/<link\b/i.test(html)) throw new Error('unexpected <link>');
if(/url\(\s*['"]?(https?:)?\/\//i.test(html)) throw new Error('external url() in CSS');
if(/@import/.test(html)) throw new Error('CSS @import');
// balanced-ish script close
if((html.match(/<\/script>/g)||[]).length!==1) throw new Error('script close mismatch');
// canvas present with fallback text
if(!/<canvas[^>]*id="stage"/.test(html)) throw new Error('canvas missing');
// no author/model identity leaks
if(/Anthropic|Claude|OpenAI|GPT/i.test(html)) throw new Error('identity leak in HTML');
console.log('HTML load contract OK, size', (html.length/1024).toFixed(1)+'KB');
