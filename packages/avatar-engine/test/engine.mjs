import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateAvatar,renderAvatarSvg,avatarOrFallback,isAvatarSpec,AVATAR_OPTIONS} from '../dist/index.js';
test('same seed and configuration give reproducible safe vector output',()=>{
 const a=generateAvatar('circle-seed-01');assert.deepEqual(a,generateAvatar('circle-seed-01'));assert.equal(renderAvatarSvg(a),renderAvatarSvg(JSON.parse(JSON.stringify(a))));
 const reversed={...a,config:Object.fromEntries(Object.entries(a.config).reverse())};assert.equal(renderAvatarSvg(a),renderAvatarSvg(reversed));assert.ok(isAvatarSpec(a));
});
test('large seeded space is varied and includes every modular attribute',()=>{
 const looks=new Set();for(let i=0;i<1000;i++){const s=generateAvatar('identity-'+i);assert.ok(isAvatarSpec(s));looks.add(JSON.stringify(s.config));}assert.equal(looks.size,1000);
 assert.equal(Object.keys(AVATAR_OPTIONS).length,9);
});
test('all layer options render as standalone circles without external resources',()=>{
 const base=generateAvatar('layer-test');for(const [field,options]of Object.entries(AVATAR_OPTIONS))for(const o of options){const spec={...base,config:{...base.config,[field]:o.id}};assert.ok(isAvatarSpec(spec));const svg=renderAvatarSvg(spec);assert.match(svg,/clipPath/);assert.doesNotMatch(svg,/<script|<foreignObject|<image|href=|https:\/\//);}
});
test('invalid/older specs fall back safely and never interpolate arbitrary markup',()=>{
 const bad={...generateAvatar('safe'),config:{...generateAvatar('safe').config,hairColor:'<script>alert(1)</script>'}};assert.equal(isAvatarSpec(bad),false);assert.doesNotMatch(renderAvatarSvg(bad),/script|alert/);
 assert.equal(avatarOrFallback({...bad,version:99},'old-seed').version,1);assert.ok(isAvatarSpec(generateAvatar('<unsafe seed>')));
});
