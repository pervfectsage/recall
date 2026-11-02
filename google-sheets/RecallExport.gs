/** @OnlyCurrentDoc */
function onOpen(){SpreadsheetApp.getUi().createMenu('Recall').addItem('Assign IDs to new cards','assignRecallIds').addItem('Export card data','exportRecallData').addSeparator().addItem('Configure publishing','configureRecallPublishing').addItem('Publish to Recall','publishRecall').addToUi();}
function assignRecallIds(){
 const lock=LockService.getDocumentLock();lock.waitLock(10000);
 try{const s=SpreadsheetApp.getActive().getSheetByName('Cards');const v=s.getDataRange().getValues();for(let i=1;i<v.length;i++){if(!v[i][6])continue;if(!v[i][0])s.getRange(i+1,1).setValue('F-'+Utilities.getUuid());if(!v[i][1])s.getRange(i+1,2).setValue('T-'+Utilities.getUuid());}}finally{lock.releaseLock();}
}
function getRecallExport(){
 assignRecallIds();const s=SpreadsheetApp.getActive().getSheetByName('Cards'),v=s.getDataRange().getValues();const heads=v.shift().slice(0,15),seen=new Set(),topics=new Set();
 const rows=v.filter(r=>r.slice(0,15).some(x=>x!==''));
 rows.forEach((r,i)=>{if(!['Draft','Published'].includes(r[12]))throw Error('Row '+(i+2)+': choose Draft or Published');if(seen.has(r[0])||topics.has(r[1]))throw Error('Duplicate IDs in row '+(i+2));seen.add(r[0]);topics.add(r[1]);if(r[12]==='Published'){if(!r[6]||!r[7])throw Error('Row '+(i+2)+': topic and answer required');}});
 return JSON.stringify({heads:heads,rows:rows.map(r=>r.slice(0,15))},null,2);
}
function exportRecallData(){
 const html=HtmlService.createHtmlOutput('<!doctype html><html><body style="font:14px Arial;padding:20px"><p id="state">Preparing card data…</p><a id="save" hidden download="Recall_Sheet_Export.json">Download export</a><script>google.script.run.withSuccessHandler(function(data){var a=document.getElementById("save");a.href=URL.createObjectURL(new Blob([data],{type:"application/json"}));a.hidden=false;document.getElementById("state").textContent="Download, then run the release builder. This does not publish the website.";}).withFailureHandler(function(e){document.getElementById("state").textContent=e.message;}).getRecallExport();</script></body></html>').setWidth(460).setHeight(200);
 SpreadsheetApp.getUi().showModalDialog(html,'Recall export');
}

// Configure these non-secret values after creating the Recall repository.
const RECALL_GITHUB_OWNER = 'pervfectsage';
const RECALL_GITHUB_REPO = 'recall';
const RECALL_GITHUB_BRANCH = 'main';
function configureRecallPublishing(){
 const ui=SpreadsheetApp.getUi();
 const response=ui.prompt('Recall publishing token','Enter a fine-grained GitHub token restricted to the Recall repository, with Contents: Read and write. It is stored in your private User Properties, not in sheet cells. Do not share it in chat.',ui.ButtonSet.OK_CANCEL);
 if(response.getSelectedButton()!==ui.Button.OK)return;
 const token=response.getResponseText().trim();if(!token)throw Error('No token entered');
 PropertiesService.getUserProperties().setProperty('RECALL_GITHUB_TOKEN',token);
 ui.alert('Token saved for your Google account. Publish only after the repository and workflow are installed.');
}
function publishRecall(){
 const ui=SpreadsheetApp.getUi(),token=PropertiesService.getUserProperties().getProperty('RECALL_GITHUB_TOKEN');
 if(!token){ui.alert('Run Recall > Configure publishing first.');return;}
 // Validation and permanent ID assignment happen before any GitHub write.
 const payload=JSON.parse(getRecallExport());validateRecallRelease(payload);
 const count=payload.rows.filter(r=>r[12]==='Published').length;
 if(ui.alert('Publish to Recall','Release '+count+' cards to '+RECALL_GITHUB_OWNER+'/'+RECALL_GITHUB_REPO+'?',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
 const url='https://api.github.com/repos/'+encodeURIComponent(RECALL_GITHUB_OWNER)+'/'+encodeURIComponent(RECALL_GITHUB_REPO)+'/contents/data/sheet-export.json';
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const current=UrlFetchApp.fetch(url+'?ref='+encodeURIComponent(RECALL_GITHUB_BRANCH),{headers:headers,muteHttpExceptions:true});
 const code=current.getResponseCode();if(code!==200&&code!==404)throw Error('Cannot read repository snapshot (HTTP '+code+'). Check repository access and token.');
 const body={message:'Publish Recall card data from Google Sheets',branch:RECALL_GITHUB_BRANCH,content:Utilities.base64Encode(JSON.stringify(payload,null,2),Utilities.Charset.UTF_8)};
 if(code===200)body.sha=JSON.parse(current.getContentText()).sha;
 const result=UrlFetchApp.fetch(url,{method:'put',headers:headers,contentType:'application/json',payload:JSON.stringify(body),muteHttpExceptions:true});
 if(![200,201].includes(result.getResponseCode()))throw Error('Publish was not accepted (HTTP '+result.getResponseCode()+'). No retry was made. Check access or simultaneous edits.');
 const data=JSON.parse(result.getContentText());ui.alert('Submitted '+count+' cards. GitHub Actions will validate and deploy them. Check the Actions tab for completion. Commit: '+data.commit.sha.slice(0,7));
}
function validateRecallRelease(payload){
 const ix={};payload.heads.forEach((h,i)=>ix[h]=i);const seenOrder=new Set(),chapters={},sections={};let count=0;
 for(const r of payload.rows){if(r[ix.Status]!=='Published')continue;count++;const get=k=>r[ix[k]];
 for(const k of ['Card ID','Topic ID','Chapter Name','Section No','Section Name','Topic','Answer Points'])if(!String(get(k)||'').trim())throw Error('Missing '+k+' for '+get('Card ID'));
 for(const k of ['Chapter No','Eligible Papers','Order'])if(!Number.isInteger(Number(get(k)))||Number(get(k))<1)throw Error('Invalid '+k+' for '+get('Card ID'));
 const p=Number(get('Papers')),e=Number(get('Eligible Papers'));if(get('Papers')===''||!Number.isInteger(p)||p<0||p>e)throw Error('Invalid evidence counts for '+get('Card ID'));
 const ch=String(get('Chapter No')),sk=ch+'|'+get('Section No'),order=ch+'|'+get('Order');if(seenOrder.has(order))throw Error('Duplicate order in chapter '+ch);seenOrder.add(order);
 if(chapters[ch]&&chapters[ch]!==get('Chapter Name'))throw Error('Conflicting chapter name');chapters[ch]=get('Chapter Name');
 if(sections[sk]&&sections[sk]!==get('Section Name'))throw Error('Conflicting section name');sections[sk]=get('Section Name');
 }if(!count)throw Error('No Published cards; release refused');
}
