/* ===== 儲存層 ===== */
let memStore={},storageOK=true;
try{localStorage.setItem('__t__','1');localStorage.removeItem('__t__');}catch(e){storageOK=false;}
function load(k,f){try{if(!storageOK)return k in memStore?memStore[k]:f;const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch(e){return f;}}
function save(k,v){try{if(!storageOK){memStore[k]=v;}else localStorage.setItem(k,JSON.stringify(v));}catch(e){memStore[k]=v;}if(window.__ledgerCloudMutationHook)window.__ledgerCloudMutationHook(k);}
const K={rec:'ledger.v2.records',ce:'ledger.v2.catsExpense',ci:'ledger.v2.catsIncome',pay:'ledger.v2.payments',trips:'ledger.v2.trips',scope:'ledger.v2.scope',set:'ledger.v2.settings',sub:'ledger.v2.subcats',prices:'ledger.v2.prices',twse:'ledger.v2.twse',cc:'ledger.v2.catColors'};

