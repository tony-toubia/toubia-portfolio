// StudForge library and studio controller.
document.addEventListener('DOMContentLoaded', async () => {
    const $ = id => document.getElementById(id);
    const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const library = window.StudForgeLibrary;
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    const state = library.readState(storage);
    const status = message => { $('app-status').textContent = message; };
    const persist = () => { if (!library.saveState(storage,state)) $('progress-note').textContent = 'Browser storage unavailable. Progress lasts for this visit.'; };
    if (window.self !== window.top) document.body.classList.add('in-iframe');
    let viewer;
    try { viewer = new window.StudForgeViewer('viewport-3d'); }
    catch { status('The 3D viewer could not start. Enable WebGL and reload to explore models.'); return; }
    const generator = new window.BrickGenerator();
    const originals = window.INSPIRATION_MODELS.map(model => ({...model,thumbnail:`thumbnails/${model.id}.png`,pieceCount:model.bricks.length}));
    let models = originals, currentModel = null, bomParts = [], theme = '', favoritesOnly = false, request = 0, checklist = new Set(), loading = false;

    function renderFilters() {
        $('theme-filters').innerHTML = ['',...new Set(models.map(model=>model.category))].map(value=>`<button class="theme-chip ${theme===value?'active':''}" data-theme="${esc(value)}" aria-pressed="${theme===value}">${esc(value||'All builds')}</button>`).join('');
    }
    function renderLibrary() {
        const matches = library.filterModels(models,$('library-search').value,theme,favoritesOnly,state.favorites);
        $('library-count').textContent = `${matches.length} / ${models.length}`;
        $('library-empty').hidden = matches.length > 0;
        $('library-grid').innerHTML = matches.map(model=>{
            const favorite = state.favorites.includes(model.id);
            return `<article class="model-card ${currentModel?.id===model.id?'selected':''}"><button class="card-open" data-model="${esc(model.id)}" aria-label="Explore ${esc(model.name)}" aria-pressed="${currentModel?.id===model.id}"><img src="${esc(model.thumbnail)}" alt="" loading="lazy" width="320" height="250"><span class="card-theme">${esc(model.category)}</span><strong>${esc(model.name)}</strong><span class="card-meta">${model.setNumber?`#${esc(model.setNumber.split('-')[0])} · `:''}${model.pieceCount||model.bricks?.length||'—'} pieces</span><span class="card-badge">${model.format==='ldraw'?'3D SET MODEL':'MICRO BUILD'}</span></button><button class="card-favorite ${favorite?'saved':''}" data-favorite="${esc(model.id)}" aria-label="${favorite?'Remove':'Add'} ${esc(model.name)} ${favorite?'from':'to'} favorites" aria-pressed="${favorite}">${favorite?'♥':'♡'}</button></article>`;
        }).join('');
    }
    $('theme-filters').addEventListener('click',event=>{ const button=event.target.closest('[data-theme]'); if(button){theme=button.dataset.theme;renderFilters();renderLibrary();} });
    $('library-search').addEventListener('input',renderLibrary);
    $('favorites-filter').addEventListener('click',()=>{favoritesOnly=!favoritesOnly;$('favorites-filter').setAttribute('aria-pressed',String(favoritesOnly));renderLibrary();});
    $('library-grid').addEventListener('click',event=>{
        const favorite=event.target.closest('[data-favorite]');
        if(favorite){ const id=favorite.dataset.favorite; state.favorites=state.favorites.includes(id)?state.favorites.filter(value=>value!==id):[...state.favorites,id];persist();renderLibrary();return; }
        const card=event.target.closest('[data-model]'); if(card)loadBlueprint(models.find(model=>model.id===card.dataset.model));
    });
    $('btn-library').addEventListener('click',()=>{
        const expanded=$('btn-library').getAttribute('aria-expanded')!=='true';
        $('btn-library').setAttribute('aria-expanded',String(expanded));$('library-panel').hidden=!expanded;
        document.querySelector('.studio-grid').classList.toggle('library-closed',!expanded);
    });
    function enrich(bricks){
        return bricks.map(brick=>{
            const part=window.LEGO_PARTS[brick.partId], color=window.LEGO_COLORS[brick.color];
            return {...brick,partName:brick.partName||part?.name||brick.partId,colorName:brick.colorName||color?.name||brick.color,colorHex:brick.colorHex||color?.hex||'#cccccc',blColorId:color?.blId};
        });
    }
    function renderBOM(){
        bomParts=library.inventory(currentModel.bricks);
        $('bom-table-body').innerHTML=bomParts.map(part=>`<tr><td><div class="part-preview-cell"><span class="color-dot" style="background:${esc(part.colorHex)}"></span><div class="part-info"><span class="part-name">${esc(part.partName)}</span><span class="part-meta">${esc(part.partId)} · ${esc(part.colorName)}</span></div></div></td><td class="text-right"><span class="qty-badge">×${part.quantity}</span></td></tr>`).join('');
        $('total-unique-parts').textContent=`${bomParts.length} unique elements`;
        $('total-pieces-count').textContent=`${currentModel.bricks.length} model pieces`;
    }
    function saveProgress(){
        if(!currentModel||!models.some(model=>model.id===currentModel.id))return;
        state.progress[currentModel.id]={step:viewer.currentStep,checks:[...checklist],inspecting:viewer.isStepMode};state.lastModel=currentModel.id;
        $('progress-note').textContent='Progress saved on this device.';persist();
    }
    function renderStep(){
        const noun=currentModel.stepKind==='steps'?'STEP':'LAYER';
        $('slider-step').value=viewer.currentStep;
        $('val-step').textContent=`${noun} ${viewer.currentStep+1} / ${viewer.maxLayer+1}`;
        $('btn-prev-step').disabled=loading||(viewer.isStepMode&&viewer.currentStep===0);
        $('btn-next-step').disabled=loading||viewer.currentStep===viewer.maxLayer;
        $('btn-full-model').disabled=loading||!viewer.isStepMode;
        $('step-mode-label').textContent=currentModel.stepKind==='steps'?'🛠️ MODEL ASSEMBLY STEPS':'🛠️ INSPECT LAYERS';
        $('btn-start-build').textContent=currentModel.stepKind==='steps'?'START BUILDING':'START INSPECTING';
        if(!viewer.isStepMode){
            $('step-summary').textContent=currentModel.stepKind==='steps'?'Start to highlight new pieces and fade previous steps.':currentModel.instructionsUrl?'Inspect bottom-to-top layers. Use original instructions for assembly.':'Inspect this concept layer by layer before building.';
            $('step-checklist').replaceChildren();return;
        }
        const parts=library.inventory(currentModel.bricks.filter(brick=>brick.layer===viewer.currentStep));
        $('step-summary').textContent=`${parts.reduce((sum,part)=>sum+part.quantity,0)} highlighted pieces · previous pieces are faded`;
        $('step-checklist').innerHTML=parts.map(part=>{
            const key=`${viewer.currentStep}|${part.partId}|${part.color}`;
            return `<label class="checklist-row"><input type="checkbox" data-check="${esc(key)}" ${checklist.has(key)?'checked':''}><span>${esc(part.partName)}<small>${esc(part.colorName)}</small></span><b>×${part.quantity}</b></label>`;
        }).join('');
    }
    $('step-checklist').addEventListener('change',event=>{const key=event.target.dataset.check;if(!key)return;if(event.target.checked)checklist.add(key);else checklist.delete(key);saveProgress();});
    function showStep(step){if(!currentModel||loading)return;viewer.setStep(step);renderStep();saveProgress();}
    $('slider-step').addEventListener('input',event=>showStep(Number(event.target.value)));
    $('btn-prev-step').addEventListener('click',()=>showStep(viewer.isStepMode?viewer.currentStep-1:0));
    $('btn-next-step').addEventListener('click',()=>showStep(viewer.currentStep+1));
    $('btn-start-build').addEventListener('click',()=>showStep(0));
    $('btn-full-model').addEventListener('click',()=>{if(loading)return;viewer.isStepMode=false;viewer.currentStep=viewer.maxLayer;viewer.updatePieceAppearance();renderStep();saveProgress();});
    $('slider-explode').addEventListener('input',event=>{if(loading)return;const value=Number(event.target.value);$('val-explode').textContent=`${Math.round(value*100)}%`;viewer.setExplode(value);window.studForgeAudio.playRatchetClick();});

    async function loadBlueprint(model){
        if(!model)return;
        const token=++request;loading=true;
        $('model-loading').hidden=false;$('model-loading').textContent=`Loading ${model.name}…`;$('viewport-3d').setAttribute('aria-busy','true');
        ['btn-export-xml','btn-copy-bom','btn-start-build','btn-full-model','btn-prev-step','btn-next-step','slider-step','slider-explode','btn-print-card'].forEach(id=>{$(id).disabled=true;});
        try{
            const loaded=await viewer.loadModel(model);if(token!==request||!loaded)return;
            currentModel={...loaded,bricks:enrich(loaded.bricks)};
            $('model-title').textContent=model.name;$('model-desc').textContent=model.description;
            $('model-badge').textContent=`${model.icon} ${model.category.toUpperCase()}`;$('model-piece-count').textContent=`${loaded.bricks.length} PIECES`;
            $('model-est-time').textContent=model.setNumber?`SET #${model.setNumber.split('-')[0]}`:`⏱ ${model.estTime}`;
            $('parts-subtitle').textContent=model.format==='ldraw'?'LDRAW MODEL INVENTORY · NO SPARE PIECES':'MICRO-BUILD INVENTORY';
            $('slider-explode').value=0;$('val-explode').textContent='0%';$('slider-step').max=viewer.maxLayer;
            const saved=state.progress[model.id];checklist=new Set(Array.isArray(saved?.checks)?saved.checks.filter(value=>typeof value==='string'):[]);
            const step=library.resumeStep(saved?.step,viewer.maxLayer);if(saved?.inspecting===true&&step!==null)viewer.setStep(step);
            $('progress-note').textContent=saved?'Restored your progress on this device.':'Progress saves automatically on this device.';
            $('btn-instructions').hidden=!model.instructionsUrl;$('btn-model-file').hidden=model.format!=='ldraw';
            if(model.instructionsUrl)$('btn-instructions').href=model.instructionsUrl;if(model.format==='ldraw')$('btn-model-file').href=model.modelUrl;
            $('model-attribution').innerHTML=model.sourceUrl?`<a href="${esc(model.sourceUrl)}" target="_blank" rel="noopener noreferrer">Community model by ${esc(model.author)}</a><p>${esc(model.license.replace(' : see CAreadme.txt',''))}</p><p>${model.missing.length?`Source notes: missing ${esc(model.missing.join(', ').toLowerCase())}.`:'Source reports no missing parts, patterns or stickers.'}</p><p>Model piece count excludes spares; it may differ from the boxed set.</p>`:'Original StudForge micro-build. Inspect before building with real bricks.';
            renderBOM();state.lastModel=models.some(item=>item.id===model.id)?model.id:state.lastModel;
            persist();renderLibrary();status(`${model.name} loaded. ${loaded.bricks.length} pieces ready to explore.`);
        }catch(error){if(token!==request)return;status(`Could not load ${model.name}. Your previous model is still available. Select the card to retry.`);console.error(error);}
        finally{
            if(token===request){
                loading=false;$('model-loading').hidden=true;$('viewport-3d').setAttribute('aria-busy','false');
                ['btn-export-xml','btn-copy-bom','btn-start-build','slider-step','slider-explode','btn-print-card'].forEach(id=>{$(id).disabled=!currentModel;});
                if(currentModel){const imported=currentModel.format==='ldraw';$('btn-export-xml').textContent=imported?'↓ PARTS CSV':'🛒 BRICKLINK XML';$('btn-export-xml').title=imported?'Download LDraw identifiers and colors. BrickLink IDs require separate verification.':'Download BrickLink Wanted List XML';renderStep();}
            }
        }
    }
    async function handleGenerate(){
        const query=$('input-prompt').value.trim();if(!query)return;
        const exact=models.find(model=>model.name.toLowerCase()===query.toLowerCase()||model.setNumber===query||model.setNumber?.split('-')[0]===query);
        await loadBlueprint(exact||generator.generateFromPrompt(query));
    }
    $('btn-generate').addEventListener('click',handleGenerate);$('input-prompt').addEventListener('keydown',event=>{if(event.key==='Enter')handleGenerate();});
    ['iso','front','top','side'].forEach(view=>$(`btn-cam-${view}`).addEventListener('click',()=>viewer.setPresetView(view)));
    $('btn-cam-reset').addEventListener('click',()=>viewer.resetView());
    $('btn-audio').addEventListener('click',()=>{$('btn-audio').textContent=window.studForgeAudio.toggleMute()?'🔇':'🔊';});
    function download(text,type,suffix){const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`StudForge_${currentModel.id}.${suffix}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    $('btn-export-xml').addEventListener('click',()=>{
        if(!currentModel||loading)return;
        if(currentModel.format==='ldraw'){
            const csv=value=>`"${String(value).replaceAll('"','""')}"`;
            download('LDraw Part ID,Part,Color Code,Color,Quantity\n'+bomParts.map(part=>[part.partId,part.partName,part.color,part.colorName,part.quantity].map(csv).join(',')).join('\n'),'text/csv;charset=utf-8','csv');return;
        }
        if(bomParts.some(part=>!Number.isInteger(part.blColorId))){status('A color lacks a verified BrickLink ID. Export is unavailable.');return;}
        download(`<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n${bomParts.map(part=>`  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${esc(part.partId)}</ITEMID><COLOR>${part.blColorId}</COLOR><MINQTY>${part.quantity}</MINQTY><CONDITION>N</CONDITION></ITEM>`).join('\n')}\n</INVENTORY>\n`,'application/xml','xml');
    });
    $('btn-copy-bom').addEventListener('click',async()=>{
        if(!currentModel||loading)return;
        const text=`${currentModel.name} — ${currentModel.bricks.length} model pieces\n${currentModel.format==='ldraw'?'Identifiers: LDraw (not verified BrickLink IDs)\n':''}${bomParts.map(part=>`${part.quantity} × ${part.partName} | ${part.partId} | ${part.colorName}`).join('\n')}${currentModel.sourceUrl?`\nSource: ${currentModel.sourceUrl}\nModel by ${currentModel.author}\n${currentModel.license}`:''}`;
        try{await navigator.clipboard.writeText(text);status('Parts list copied.');}catch{status('Clipboard access unavailable. Download the parts list instead.');}
    });
    $('btn-print-card').addEventListener('click',()=>window.print());
    renderFilters();renderLibrary();
    try{
        const responses=await Promise.all([fetch('models/catalog.json'),fetch('models/parts.json')]);if(responses.some(response=>!response.ok))throw new Error('Catalog unavailable');
        const [sets,parts]=await Promise.all(responses.map(response=>response.json()));window.LDRAW_PARTS=parts;models=[...sets,...originals];renderFilters();renderLibrary();
    }catch{status('The set library could not load. Micro-builds are available; reload to try again.');}
    let hashId='';try{hashId=decodeURIComponent(window.location.hash.slice(1));}catch{}
    await loadBlueprint(models.find(model=>model.id===hashId)||models.find(model=>model.id===state.lastModel)||models[0]);
});
