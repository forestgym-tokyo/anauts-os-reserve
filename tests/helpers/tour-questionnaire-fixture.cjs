const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function fixture(overrides={}){
 const guests=[{name:'見学 太郎',phone:'09012345678',email:'one@example.invalid'},{name:'見学 花子',phone:'08012345678',email:'two@example.invalid'}];
 const reservation={reservation_id:'TOUR_TEST_1',service_code:'TOUR',customer_name:guests[0].name,customer_phone:guests[0].phone,customer_email:guests[0].email,postal_code:'2760045',address:'絶対に印刷しない既存住所',reservation_date:'2026-11-01',start_time:'09:00',end_time:'10:00',note:'見学人数：2名\nTFG_TOUR_DATA:'+JSON.stringify({guests}),...overrides};
 const cells={F3:'前の氏名',G4:'前の郵便番号',F5:'前の住所',F6:'前の電話',F7:'前のメール',D39:'前の日時'},printed=[],files=new Map(),cache=new Map(),errors=[];
 let fileId=0;
 const page1={getRangeList:keys=>({clearContent(){for(const key of keys)cells[key]='';}}),getRange:key=>({setValue(value){cells[key]=value;return this;},setNumberFormat(){return this;},setHorizontalAlignment(){return this;}})};
 const exportSheet={getId:()=> 'export-fixture',getSheetByName:name=>name==='アンケート_1'?page1:{}};
 const context={console,APP_CONFIG:{TIMEZONE:'Asia/Tokyo'},Utilities:{formatDate:()=> '20261101_090000'},LockService:{getDocumentLock:()=>({waitLock(){},releaseLock(){}})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value)})},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({})}),flush(){}},ScriptApp:{getOAuthToken:()=> 'fixture-only'},UrlFetchApp:{fetch(){printed.push({...cells});return {getResponseCode:()=>200,getBlob:()=>({setContentType(){return this;},setName(value){this.name=value;return this;}})};}},DriveApp:{getFileById:id=>files.get(id)},findReservationRowById_:id=>id===reservation.reservation_id?{record:reservation}:null,successResponse:data=>({ok:true,data}),errorResponse:(message,code,detail)=>({ok:false,message,code,detail}),logInfo(){},logError:(...args)=>errors.push(args)};
 vm.createContext(context);
 for(const name of ['46_TourQuestionnairePrint.js','46_1_TourQuestionnairePrintFast.gs'])vm.runInContext(fs.readFileSync(path.join(root,'gas',name),'utf8'),context,{filename:name});
 const folder={isTrashed:()=>false,getId:()=> 'folder',getUrl:()=> 'https://drive.google.com/drive/folders/fixture',createFile(blob){const id='pdf-'+(++fileId),file={getId:()=>id,isTrashed:()=>false,setName(name){this.name=name;},blob};files.set(id,file);return file;}};
 context.getOrCreateTourFastPrintExportSpreadsheet_=()=>exportSheet;context.getOrCreateTourPrintFolder_=()=>folder;
 return {context,reservation,guests,cells,printed,files,cache,errors,run:(params={})=>context.generateTourQuestionnairePdfFast({reservation_id:reservation.reservation_id,request_id:'same-browser-request',...params})};
}

module.exports={fixture};
