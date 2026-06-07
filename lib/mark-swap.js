/**
 * lib/mark-swap.js
 * Brand mark everywhere: visually replaces every ◆ (U+25C6) glyph in page text with
 * the MainCharacter M-mark PNG (public/maincharacter-mark-3d.png — transparent, same
 * asset as the header), injected into every page's <head> (see server.js servePage).
 *
 * Why a runtime DOM swap rather than editing the source: ◆ appears 130+ times across
 * ~30 files, in 50+ test assertions and inside many <script> strings. Swapping the
 * rendered text node keeps the source (and the tests) untouched, stays consistent on
 * every surface, and is reversible by removing this one injection. Size is a single
 * CSS value (img.mc-ico height) so it can be tuned without touching markup.
 */

const STYLE = `<style id="mc-ico-style">img.mc-ico{height:1em;width:auto;display:inline-block;vertical-align:-0.14em;margin:0 .05em;}</style>`;

const SCRIPT = `<script>(function(){
var SRC='/maincharacter-mark-3d.png', D='\\u25C6';
function swap(){
  try{
    if(!document.body) return;
    var walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode:function(n){
      if(!n.nodeValue || n.nodeValue.indexOf(D)<0) return NodeFilter.FILTER_REJECT;
      var p=n.parentNode; if(!p) return NodeFilter.FILTER_REJECT;
      var t=p.nodeName;
      if(t==='SCRIPT'||t==='STYLE'||t==='TEXTAREA'||t==='OPTION'||t==='TITLE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    var list=[],n; while(n=walker.nextNode()) list.push(n);
    list.forEach(function(node){
      var parts=node.nodeValue.split(D);
      var frag=document.createDocumentFragment();
      for(var i=0;i<parts.length;i++){
        if(i>0){ var img=document.createElement('img'); img.className='mc-ico'; img.src=SRC; img.alt=''; img.setAttribute('aria-hidden','true'); frag.appendChild(img); }
        if(parts[i]) frag.appendChild(document.createTextNode(parts[i]));
      }
      if(node.parentNode) node.parentNode.replaceChild(frag,node);
    });
  }catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',swap); else swap();
// idempotent re-runs catch ◆ that scripts inject after first paint
setTimeout(swap,400); setTimeout(swap,1400);
}());</script>`;

/**
 * @returns {string} the style + runtime that swaps ◆ glyphs for the brand mark.
 */
function markSwapHead() {
  return STYLE + SCRIPT;
}

module.exports = { markSwapHead };
