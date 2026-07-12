// Renders a searchable country calling-code selector with Saudi Arabia first.

import { useMemo, useState } from "react";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";

const names = new Intl.DisplayNames(["ar"], { type: "region" });
const countries = getCountries().map((code) => ({
  code,
  dial: `+${getCountryCallingCode(code)}`,
  name: names.of(code) || code,
})).sort((a, b) => a.code === "SA" ? -1 : b.code === "SA" ? 1 : a.name.localeCompare(b.name, "ar"));

export function CountrySelect({ value = "SA", onChange, id }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = countries.find((country) => country.code === value) || countries[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return countries.filter((country) => !needle || `${country.name} ${country.code} ${country.dial}`.toLowerCase().includes(needle)).slice(0, 40);
  }, [query]);

  return <div className="country-select">
    <button id={id} type="button" className="country-trigger" onClick={() => setOpen((state) => !state)} aria-expanded={open}>
      <span dir="ltr">{selected.dial}</span><small>{selected.code}</small>
    </button>
    {open && <div className="country-popover">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالدولة أو الرمز" autoFocus />
      <div role="listbox">{filtered.map((country) => <button type="button" key={country.code} onClick={() => {
        onChange(country.code); setOpen(false); setQuery("");
      }}><span>{country.name}</span><b dir="ltr">{country.dial}</b></button>)}</div>
    </div>}
  </div>;
}
