// Restore instance identity only when the packed source's physical traversal
// exactly matches the installed model. No transforms or render IDs are changed.
export function restoreAssemblies(model, packed) {
    if(model.submodels?.length!==1)return false;
    const sections=new Map();let section,root;
    for(const line of packed.split(/\r?\n/)){
        const file=line.match(/^0 FILE (.+)$/i);
        if(file){const id=file[1].toLowerCase().replaceAll('\\','/');root||=id;section=[];sections.set(id,section);}
        else if(section)section.push(line);
    }
    const submodels=['main'],leaves=[];
    function visit(id,sub,ancestors=[]){
        if(ancestors.includes(id)||ancestors.length>30)throw new Error('Cyclic source assembly');
        const lines=sections.get(id)||[];
        if(lines.some(line=>/^0 !LDRAW_ORG (?:Unofficial_)?Part\b/.test(line))){leaves.push({id:id.replace(/\.dat$/,''),sub});return;}
        if(lines.some(line=>/^[34]\s/.test(line)))leaves.push({id:id,sub});
        for(const line of lines){
            if(!/^1\s/.test(line))continue;
            const ref=line.trim().split(/\s+/).slice(14).join(' ').toLowerCase().replaceAll('\\','/');
            const child=sections.get(ref);
            if(!child)throw new Error('Missing assembly reference');
            let next=sub;
            if(child.some(line=>/^0 !LDRAW_ORG (?:Unofficial_)?Model\b/.test(line))){next=submodels.length;submodels.push(`${submodels[sub]} - ${ref} #${next}`);}
            visit(ref,next,[...ancestors,id]);
        }
    }
    try{visit(root,0);}catch{return false;}
    if(leaves.length!==model.bricks.length||leaves.some((p,i)=>p.id!==model.parts[model.bricks[i][0]][0]))return false;
    if(submodels.length===1)return false;
    model.submodels=submodels;model.bricks.forEach((b,i)=>b[15]=leaves[i].sub);
    return true;
}
