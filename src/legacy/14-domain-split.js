/* ===== 分帳 ===== */
let splitPayer='me',splitPreset='even',splitCustomMode='amount';
$('#splitToggle').addEventListener('change',e=>{$('#splitBody').classList.toggle('show',e.target.checked);updateSplitPreview();});
$('#payerSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{splitPayer=b.dataset.p;$('#payerSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));updateSplitPreview();});
$('#shareSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{splitPreset=b.dataset.s;$('#shareSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));const own=splitPreset==='own';$('#f-myshare').style.display=own?'block':'none';$('#splitCustomModeSeg').style.display=own?'flex':'none';updateSplitPreview();});
$('#splitCustomModeSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{splitCustomMode=b.dataset.cm;$('#splitCustomModeSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));$('#f-myshare').placeholder=splitCustomMode==='ratio'?'我負擔的比例 %（例如 30）':'我應負擔的金額';updateSplitPreview();});
$('#f-myshare').addEventListener('input',updateSplitPreview);
function normalizedSplitPreset(p){return p==='all'?'mine':p==='none'?'theirs':p==='custom'?'own':(p||'even');}
function currentMyShare(total){if(splitPreset==='even')return total/2;if(splitPreset==='mine')return total;if(splitPreset==='theirs')return 0;const v=parseFloat($('#f-myshare').value)||0;return splitCustomMode==='ratio'?total*Math.max(0,Math.min(100,v))/100:v;}
function updateSplitPreview(){if(!$('#splitToggle').checked){$('#splitPreview').textContent='';return;}
  const total=parseFloat($('#f-total').value)||0;
  const ms=Math.max(0,Math.min(currentMyShare(total),total)),partner=$('#f-partner').value.trim()||'對方';
  const presetText={even:'均分',own:'自訂分攤',mine:'我請客',theirs:'對方請客'}[splitPreset]||'自訂';
  let line=`${presetText} · 我的實際負擔 ${nf(ms)}`;
  if(splitPayer==='me'){const owe=total-ms;line+=owe>0.5?`　${esc(partner)}應補我 ${nf(owe)}`:'　無需結算';}
  else{line+=ms>0.5?`　我應補${esc(partner)} ${nf(ms)}`:'　無需結算';line=`${esc(partner)}先付 ${nf(total)}　`+line;}
  $('#splitPreview').textContent=line;
}
function recomputeTotalValue(){let t=0;$('#itemRows').querySelectorAll('.i-price').forEach(i=>t+=parseFloat(i.value)||0);return t;}

