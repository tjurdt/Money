/* ===== 分類/付款 chips ===== */
const getKind=()=>document.querySelector('input[name=kind]:checked').value;
function catOrder(list){const a=[],b=[];(list||[]).forEach(c=>{(c==='其他'||c==='其他收入')?b.push(c):a.push(c);});return a.concat(b);}
function renderChipSelectors(){const catList=catOrder(getKind()==='income'?catsIncome:catsExpense);
  $('#catChips').innerHTML=(catList.length?catList.map(c=>`<button data-v="${esc(c)}" class="${selCat===c?'on':''}" style="${selCat===c?`background:${catColor(c)};border-color:${catColor(c)};color:#fff`:`color:${catColor(c)};border-color:${colorBg(catColor(c),.35)};background:${colorBg(catColor(c),.08)}`}">${esc(c)}</button>`).join(''):`<span class="none">尚無分類，點右方新增 →</span>`)+`<button class="add" data-add="cat">＋ 新增</button>`;
  $('#payChips').innerHTML=(payments.length?payments.map(p=>`<button data-v="${esc(p)}" class="${selPay===p?'on':''}">${esc(p)}</button>`).join(''):`<span class="none">尚無付款方式 →</span>`)+`<button class="add" data-add="pay">＋ 新增</button>`;
  $('#catChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.add)return addOption('cat');selCat=selCat===b.dataset.v?null:b.dataset.v;selSub=null;renderChipSelectors();renderSubChips();});
  $('#payChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.add)return addOption('pay');selPay=selPay===b.dataset.v?null:b.dataset.v;renderChipSelectors();});
  if(typeof syncCompactChoiceLabels==='function')syncCompactChoiceLabels();
}
function renderSubChips(){const show=getKind()==='expense'&&catMode==='whole'&&selCat&&(subcats[selCat]&&subcats[selCat].length);
  $('#fld-sub').classList.toggle('hidden',!show);$('#fld-sub').parentElement?.classList.toggle('sub-hidden',!show);if(!show){updateMrtQuick();if(typeof syncCompactChoiceLabels==='function')syncCompactChoiceLabels();return;}
  $('#subChips').innerHTML=subcats[selCat].map(s=>`<button data-v="${esc(s)}" class="${selSub===s?'on':''}" style="${selSub===s?`background:${catColor(selCat)};border-color:${catColor(selCat)};color:#fff`:''}">${esc(s)}</button>`).join('')+`<button class="add" data-add="sub">＋ 新增</button>`;
  $('#subChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.add){const v=(prompt('新增子分類到「'+selCat+'」')||'').trim();if(v){(subcats[selCat]=subcats[selCat]||[]).push(v);save(K.sub,subcats);selSub=v;renderSubChips();}return;}selSub=selSub===b.dataset.v?null:b.dataset.v;renderSubChips();});updateMrtQuick();if(typeof syncCompactChoiceLabels==='function')syncCompactChoiceLabels();
}
function addOption(type){const v=(prompt(type==='cat'?'新增分類名稱':'新增付款方式')||'').trim();if(!v)return;
  if(type==='cat'){const list=getKind()==='income'?catsIncome:catsExpense;if(!list.includes(v)){list.push(v);if(!catColors[v])catColors[v]=CAT_COLORS[Object.keys(catColors).length%CAT_COLORS.length];save(getKind()==='income'?K.ci:K.ce,list);save(K.cc,catColors);}selCat=v;refreshItemCatSelects();renderSubChips();}
  else{if(!payments.includes(v)){payments.push(v);save(K.pay,payments);}selPay=v;}renderChipSelectors();}

