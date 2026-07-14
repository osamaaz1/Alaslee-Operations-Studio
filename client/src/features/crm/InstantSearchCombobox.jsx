// Accessible server-backed combobox used for large customer and Daftra lists.

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";

export function InstantSearchCombobox({
  label, placeholder, selected, onSelect, search, getKey, optionLabel, optionMeta, emptyMessage,
}) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);

  useEffect(() => {
    if (selected) setQuery(optionLabel(selected));
  }, [selected, optionLabel]);

  useEffect(() => {
    if (!open) return undefined;
    const requestId = ++requestRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const rows = await search(query.trim(), controller.signal);
        if (requestRef.current === requestId) {
          setResults(rows); setActiveIndex(rows.length ? 0 : -1);
        }
      } catch (nextError) {
        if (nextError.name !== "AbortError" && requestRef.current === requestId) {
          setResults([]); setError(nextError.message || "تعذر تحميل النتائج.");
        }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, search]);

  const choose = (item) => {
    setQuery(optionLabel(item)); onSelect(item); setOpen(false); setError("");
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault(); choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault(); setOpen(false);
    }
  };

  return <div className="crm-field instant-combobox" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={inputId}>{label}</label>
    <div className="combobox-input-wrap">
      <Search size={17} aria-hidden="true" />
      <input id={inputId} type="search" value={query} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onFocus={(event) => { setOpen(true); if (selected) event.currentTarget.select(); }}
        onChange={(event) => { setQuery(event.target.value); onSelect(null); setOpen(true); }}
        onKeyDown={onKeyDown} />
      {loading && <LoaderCircle className="spin" size={17} aria-label="جارٍ البحث" />}
    </div>
    {open && <div className="combobox-results" id={listId} role="listbox">
      {error ? <p className="combobox-message error">{error}</p> : !loading && !results.length
        ? <p className="combobox-message">{emptyMessage}</p>
        : results.map((item, index) => <button id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
          className={index === activeIndex ? "active" : ""} type="button" key={getKey(item)}
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}>
          <span><strong>{optionLabel(item)}</strong><small>{optionMeta(item)}</small></span>
          {selected && getKey(selected) === getKey(item) && <Check size={17} aria-hidden="true" />}
        </button>)}
    </div>}
  </div>;
}
