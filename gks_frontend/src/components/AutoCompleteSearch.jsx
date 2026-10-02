import { useId, useState } from 'react';
function AutocompleteSearch({label,placeholder,value,onChange,suggestions=[],onSelect,disabled=false,required=false}) {
  const id=useId();const [focused,setFocused]=useState(false);const [active,setActive]=useState(-1);
  const open=focused&&suggestions.length>0;
  const choose=item=>{onSelect(item);setFocused(false);setActive(-1);};
  return <div className="relative w-full">
    {label&&<label htmlFor={id} className="block text-xs font-bold text-slate-600 mb-1">{label}</label>}
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'} aria-activedescendant={open&&active>=0?id+'-'+active:undefined} type="text" placeholder={placeholder} value={value}
      onChange={e=>{setFocused(true);setActive(-1);onChange(e);}} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} disabled={disabled} required={required}
      onKeyDown={e=>{if(e.key==='Escape')setFocused(false);if(e.key==='ArrowDown'&&suggestions.length){e.preventDefault();setActive(i=>Math.min(i+1,suggestions.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1));}if(e.key==='Enter'&&open&&active>=0){e.preventDefault();choose(suggestions[active]);}}}
      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-200" />
    {open&&<ul id={id+'-list'} role="listbox" className="absolute z-50 w-full bg-white border border-slate-200 shadow-xl rounded-lg mt-1 max-h-60 overflow-y-auto">
      {suggestions.map((item,i)=><li id={id+'-'+i} key={item.value??i} role="option" aria-selected={active===i} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)} className={'px-4 py-3 cursor-pointer hover:bg-blue-50 '+(active===i?'bg-blue-50':'')}><span className="block font-bold text-sm">{item.label}</span>{item.subLabel&&<span className="text-slate-500 text-xs">{item.subLabel}</span>}</li>)}
    </ul>}
  </div>;
}
export default AutocompleteSearch;
