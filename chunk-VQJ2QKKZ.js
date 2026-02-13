import{a as I}from"./chunk-BC7WZKGI.js";import{$a as d,$b as C,Ca as a,Da as _,Sa as x,Ua as l,Va as k,Za as n,_a as e,ac as D,ca as w,cb as P,db as b,dc as N,eb as p,ka as f,la as u,mb as s,nb as c,ob as m,pb as h,sa as T,vb as S,wb as E}from"./chunk-2TFJQIGG.js";var J=()=>[1,2,3,4,5,6,7,8,9,10,11,12];function Q(o,g){if(o&1&&(n(0,"span",40),s(1),e()),o&2){let t=p(2);a(),c(t.formatAssemblyPath(t.firstTag==null?null:t.firstTag.assembly))}}function q(o,g){if(o&1&&d(0,"div",41),o&2){let t=g.$implicit;k("width",t%3===0?2:1,"px")}}function R(o,g){if(o&1){let t=P();n(0,"div",2)(1,"div",3)(2,"div",4)(3,"div",5)(4,"h5",6),d(5,"i",7),s(6,"Print Part Tags "),e(),n(7,"button",8),b("click",function(){f(t);let r=p();return u(r.onSkip())}),e()(),n(8,"div",9)(9,"p",10),s(10),e(),n(11,"div",11)(12,"div",12),s(13),e(),n(14,"div",13)(15,"div",14)(16,"div",15)(17,"div",16)(18,"div",17)(19,"span",18),s(20),e(),x(21,Q,2,1,"span",19),e(),n(22,"span",20),s(23),e()(),n(24,"div",21),s(25),e(),n(26,"div",21),s(27),e(),n(28,"div",22)(29,"span",23),s(30),e(),n(31,"span",24),s(32),e()()(),n(33,"div",25)(34,"div",26)(35,"div",27),x(36,q,1,2,"div",28),e(),n(37,"span",29),s(38,"BARCODE"),e()()()()()(),n(39,"div",30)(40,"div")(41,"div",31),s(42,"Tags to Print"),e(),n(43,"div",32),s(44),e()(),n(45,"span",33),s(46),e()(),n(47,"p",34),s(48," Select the Brother QL500 printer in the print dialog "),e()(),n(49,"div",35)(50,"button",36),b("click",function(){f(t);let r=p();return u(r.onSkip())}),d(51,"i",37),s(52,"Skip "),e(),n(53,"button",38),b("click",function(){f(t);let r=p();return u(r.onPrint())}),d(54,"i",39),s(55),e()()()()()}if(o&2){let t=p();a(10),h(" Print ",t.totalTags," tag",t.totalTags!==1?"s":""," for the picked parts "),a(3),m(' Tag Preview (0.66" x 3.4")',t.totalTags>1?" - showing 1 of "+t.totalTags:""," "),a(7),c(t.firstTag==null?null:t.firstTag.partNumber),a(),l("ngIf",t.firstTag==null?null:t.firstTag.assembly),a(2),m("Qty: ",t.firstTag==null?null:t.firstTag.qtyPicked,""),a(2),c((t.firstTag==null?null:t.firstTag.location)||"N/A"),a(2),c((t.firstTag==null?null:t.firstTag.description)||"-"),a(3),h("",t.firstTag==null?null:t.firstTag.soNumber," / ",t.firstTag==null?null:t.firstTag.toolNumber,""),a(2),h("",t.firstTag==null?null:t.firstTag.pickedBy," ",t.formatShortDate(t.firstTag==null?null:t.firstTag.pickedAt),""),a(4),l("ngForOf",E(18,J)),a(8),m(" ",t.totalTags===1?(t.firstTag==null?null:t.firstTag.partNumber)+" for "+(t.firstTag==null?null:t.firstTag.toolNumber):(t.firstTag==null?null:t.firstTag.partNumber)+" for "+t.totalTags+" tools"," "),a(2),c(t.totalTags),a(4),l("disabled",t.isPrinting),a(3),l("disabled",t.isPrinting),a(2),m(" ",t.isPrinting?"Opening Print...":"Print "+t.totalTags+" Tag"+(t.totalTags!==1?"s":"")," ")}}function W(o,g){o&1&&d(0,"div",42)}var it=(()=>{class o{set tagData(t){t?this.tagsArray=Array.isArray(t)?t:[t]:this.tagsArray=[]}constructor(t){this.toast=t,this.isOpen=!1,this.close=new T,this.tagsArray=[],this.isPrinting=!1}get totalTags(){return this.tagsArray.length}get firstTag(){return this.tagsArray[0]}formatShortDate(t){if(!t)return"";let i=new Date(t);return`${i.getMonth()+1}/${i.getDate()}`}formatAssemblyPath(t){if(!t)return"";let i=t.split(" > ");return i.reverse()," < "+i.join(" < ")}onSkip(){this.close.emit()}onPrint(){this.isPrinting=!0;try{let t=window.open("","_blank","width=600,height=400");if(!t){this.toast.warning("Please allow popups to print tags"),this.isPrinting=!1;return}let i=this.generateTagsHTML();t.document.write(i),t.document.close(),t.onload=()=>{t.print(),t.onafterprint=()=>{t.close()}}}finally{this.isPrinting=!1,this.close.emit()}}generateTagsHTML(){let t=this.tagsArray.map((r,A)=>{let{partNumber:$,description:j,location:z,soNumber:O,toolNumber:H,qtyPicked:M,pickedBy:V,pickedAt:B,assembly:F}=r,v=new Date(B),L=`${v.getMonth()+1}/${v.getDate()}`,y=this.formatAssemblyPath(F);return`
        <div class="tag">
          <div class="tag-content">
            <div class="tag-text">
              <div class="tag-row-top">
                <div class="part-number-container">
                  <span class="part-number">${this.escapeHtml($)}</span>
                  ${y?`<span class="assembly-path">${this.escapeHtml(y)}</span>`:""}
                </div>
                <span class="tag-count">Qty: ${M}</span>
              </div>
              <div class="tag-row-location">
                <span class="location">${this.escapeHtml(z||"N/A")}</span>
              </div>
              <div class="tag-row-middle">
                <span class="description">${this.escapeHtml(j||"-")}</span>
              </div>
              <div class="tag-row-bottom">
                <span class="order-info">${this.escapeHtml(O)} / ${this.escapeHtml(H)}</span>
                <span class="picked-info">${this.escapeHtml(V)} ${L}</span>
              </div>
            </div>
            <div class="barcode-container">
              <svg class="barcode" id="barcode-${A}"></svg>
            </div>
          </div>
        </div>
      `}),i=this.tagsArray.map(r=>r.partNumber);return`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Part Tags - ${this.tagsArray[0]?.partNumber||"Tags"}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <style>
          @page {
            size: 3.4in 0.66in;
            margin: 0;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: Arial, sans-serif;
            font-size: 10px;
            line-height: 1.1;
          }

          .tag {
            width: 3.4in;
            height: 0.66in;
            padding: 0.04in 0.06in 0.04in 0.12in;
            page-break-after: always;
          }

          .tag:last-child {
            page-break-after: auto;
          }

          .tag-content {
            display: flex;
            height: 100%;
            gap: 0.08in;
          }

          .tag-text {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-width: 0;
          }

          .barcode-container {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .barcode {
            height: 0.5in;
            width: auto;
          }

          .tag-row-top {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 0.05in;
          }

          .part-number-container {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;
            flex: 1;
            overflow: hidden;
          }

          .assembly-path {
            font-size: 9px;
            color: #444;
            white-space: nowrap;
          }

          .tag-row-location {
            font-size: 8px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tag-row-middle {
            font-size: 8px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
          }

          .tag-row-bottom {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 7px;
          }

          .part-number {
            font-weight: 900;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            white-space: nowrap;
          }


          .location {
            color: #444;
          }

          .tag-count {
            color: #666;
            font-size: 9px;
            font-weight: 500;
            flex-shrink: 0;
          }

          .description {
            color: #333;
          }

          .order-info {
            color: #444;
          }

          .picked-info {
            color: #666;
            white-space: nowrap;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        ${t.join("")}
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            const partNumbers = ${JSON.stringify(i)};
            partNumbers.forEach(function(partNumber, index) {
              try {
                JsBarcode("#barcode-" + index, partNumber, {
                  format: "CODE128",
                  width: 1.5,
                  height: 35,
                  displayValue: false,
                  margin: 0
                });
              } catch (e) {
                console.error('Barcode generation failed:', e);
              }
            });
          });
        <\/script>
      </body>
      </html>
    `}escapeHtml(t){let i=document.createElement("div");return i.textContent=t,i.innerHTML}static{this.\u0275fac=function(i){return new(i||o)(_(I))}}static{this.\u0275cmp=w({type:o,selectors:[["app-print-tag-dialog"]],inputs:{isOpen:"isOpen",tagData:"tagData"},outputs:{close:"close"},standalone:!0,features:[S],decls:2,vars:2,consts:[["class","modal fade show d-block","tabindex","-1",4,"ngIf"],["class","modal-backdrop fade show",4,"ngIf"],["tabindex","-1",1,"modal","fade","show","d-block"],[1,"modal-dialog","modal-dialog-centered"],[1,"modal-content"],[1,"modal-header"],[1,"modal-title"],[1,"bi","bi-tag","me-2"],["type","button",1,"btn-close",3,"click"],[1,"modal-body"],[1,"text-muted","small","mb-3"],[1,"border","rounded","mb-3"],[1,"bg-light","px-3","py-2","border-bottom","small","text-muted"],[1,"p-3"],[1,"border","bg-white","p-2","d-flex","gap-2",2,"width","340px","height","66px","font-size","10px","font-family","Arial, sans-serif","margin","0 auto"],[1,"flex-grow-1","d-flex","flex-column","justify-content-between","overflow-hidden"],[1,"d-flex","justify-content-between","align-items-baseline","gap-1"],[1,"d-flex","align-items-baseline","gap-1","text-truncate"],[1,"fw-bold","font-monospace",2,"font-size","11px"],["class","text-muted","style","font-size: 9px;",4,"ngIf"],[1,"text-muted","fw-medium","flex-shrink-0",2,"font-size","9px"],[1,"text-truncate","text-secondary",2,"font-size","8px"],[1,"d-flex","justify-content-between","align-items-end",2,"font-size","7px"],[1,"text-secondary"],[1,"text-muted"],[1,"flex-shrink-0","d-flex","align-items-center","justify-content-center","border-start","ps-2",2,"width","64px"],[1,"d-flex","flex-column","align-items-center"],[1,"d-flex","gap-0"],["class","bg-black","style","height: 28px;",3,"width",4,"ngFor","ngForOf"],[1,"text-muted","mt-1",2,"font-size","6px"],[1,"d-flex","align-items-center","justify-content-between","p-3","bg-light","rounded","mb-3"],[1,"fw-medium"],[1,"small","text-muted"],[1,"badge","bg-secondary","fs-5","px-3","py-2"],[1,"small","text-muted","text-center","mb-0"],[1,"modal-footer"],["type","button",1,"btn","btn-outline-secondary",3,"click","disabled"],[1,"bi","bi-x","me-1"],["type","button",1,"btn","btn-primary",3,"click","disabled"],[1,"bi","bi-printer","me-1"],[1,"text-muted",2,"font-size","9px"],[1,"bg-black",2,"height","28px"],[1,"modal-backdrop","fade","show"]],template:function(i,r){i&1&&x(0,R,56,19,"div",0)(1,W,1,0,"div",1),i&2&&(l("ngIf",r.isOpen),a(),l("ngIf",r.isOpen))},dependencies:[N,C,D],styles:[".modal.show[_ngcontent-%COMP%]{display:block}"]})}}return o})();export{it as a};
